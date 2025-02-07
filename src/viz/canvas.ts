import * as R from "ramda";
import { creator, select } from "d3";
import { Query, sql, agg, and, eq, column, count } from "@uwdata/mosaic-sql";
import type { Database } from "./db";
import { createView, IDNAME, Table } from "./table";
import * as d3 from "d3";
import { Cardinality, FKConstraint } from "./constraint";
import { Mark, type IMark, marksbytype } from "./newMark"
//import { Mark, type IMark, marksbytype  } from "./mark";
import {type Nest, RootNest, MarkNest } from "./nest";
import * as Plot from "@observablehq/plot";
import { oplotUtils } from "./plotUtils/oplotUtils";
import { RefMark } from "./ref";
import { Scale, ScaleObject } from "./newScale";
import { TaskGraph, HOOK_PLACE } from "./task_graph/task_graph";
import { idexpr } from "./id";
import dagre from "@dagrejs/dagre"
import { ERMarkers, insertMarkers }from "./erMarkers"



function maybesource(db, source:string|Table|FKConstraint): Table|FKConstraint {
  if (typeof source === "string")
    return db.table(source) ?? db.constraint(source) 
  if (source instanceof Table || source instanceof FKConstraint)
    return source;
  return maybeconstraint(db, source)
}

/*
    constraint can be:
      "name"
      { t1, X, t2, Y }
      FKConstraint object
 */
function maybeconstraint(db, c) {
  if (typeof c == "string") 
    c = db.constraint(c)
  if (c instanceof FKConstraint)
    return c;
  if (c.t1 && c.t2) { // && (c.on || (c.X && c.Y))) {
    c.X ??= c.on;
    c.Y ??= c.on;
    c.t1 = db.table(c.t1)
    c.t2 = db.table(c.t2)
    return new FKConstraint(c)
  }
  return null;
}

function findcanvas(canvas, src) {
  if (src instanceof Table) return canvas;
  if (canvas._parent == null) return canvas;
  return findcanvas(canvas._parent, src);
}


export class Canvas implements IMark {
  static plotConfig;
  db: Database;
  options;
  marks:IMark[];        // all table and constraint marks
  nests:Nest[];   // all fkconstraint nestings
  table:Table;  // contains canvas dimensions
  refmarks:{rm:Mark,m:Mark}[];
  plotConfig;
  available_scales;

  node;
  private _parent;
  taskGraph: TaskGraph


  constructor(db, options?, plotConfig?) {
    this.db = db;
    this.marks = [];
    this.nests = [];
    this.refmarks = [];
    this.available_scales = new Map<string, Scale>()

    options ??= {};

    if (plotConfig == null) {
      Canvas.plotConfig = oplotUtils.config;
    }

    const {
      x = 0,
      y = 0,
      width = 400,
      height = 600
    } = options;
    this.options = { ...options, x, y, width, height }

    this.taskGraph = new TaskGraph(true)
  }

  async init() { 
    return null;
  }

  parent(p) {
    if (p) this._parent = p;
    return this._parent;
  }

  plot(options:any={}):Canvas {
    throw new Error("Don't support nested Canvas yet.  Need to figure out layout story")
    let { scales, marks } = options;
    let c = new Canvas(this.db, options)
    c.parent(this)
    this.marks.push(c);
    c.marks.concat(marks??[])
    return c;
  }

  linear(scalename) {
    //skip error checking to see if attr in table
    let c = this;
    //col is going to be used in initScaling method of mark!
    return function(col) {
      let scale = null

      if (c.available_scales.has(scalename))
        scale = c.available_scales.get(scalename)
      else {
        scale =  new Scale(null)
        c.available_scales.set(scalename, scale)
      }
      return new ScaleObject(col, scale)
    }
  }

  log(scalename) {
    let c = this;
    //col is going to be used in initScaling method of mark!
    return function(col) {
      let scale = null

      if (c.available_scales.has(scalename))
        scale = c.available_scales.get(scalename)
      else {
        scale =  new Scale(Math.log)
        c.available_scales.set(scalename, scale)
      }
      return new ScaleObject(col, scale)
    }
  }

  hl(){};

  vl(){};

  addmark(marktype, source, mapping, plotoptions?) {
    plotoptions ??= {}
    let srcTable = this.db.table(source)
    let canvas = findcanvas(this, srcTable);
    if (marktype == "square") {
      if (("width" in mapping ) && !("height" in mapping)) {
        mapping.height = mapping.width
      } else if (!("width" in mapping ) && ("height" in mapping)) {
        mapping.width = mapping.height
      }
    }
    let mark = new Mark(canvas, marktype, srcTable, mapping, plotoptions, Canvas.plotConfig)
    this.marks.push(mark);
    return mark;
  }

  invalidPredicate(t1, t2, predicate) {
    if (!t1.schema.attrs.includes(predicate) || !t2.schema.attrs.includes(predicate))
      return false
    let tmpFkConstraint = new FKConstraint({t1: t1, X:predicate, t2:t2, Y:predicate})
    if (tmpFkConstraint.card != Cardinality.ONEMANY)
      return true
    return false
  }

  nest(innerMark: Mark, outerMark: Mark, predicate?) { //TODO: need to get a fk constraint from db if user passes no predicate
    if (predicate) {
      predicate = Array.isArray(predicate) ? predicate : [predicate]
      this.nestWithPredicate(innerMark, outerMark, predicate)
    }
    else
      this.nestWithoutPredicate(innerMark, outerMark)
    this.taskGraph.addDependency(innerMark, outerMark, true)
  }

  nestWithoutPredicate(innerMark: Mark, outerMark: Mark) {
    let innerTable = innerMark.src
    let outerTable = outerMark.src

    console.log("all constraints", this.db.constraints)
    let path = this.db.getFkPath(innerTable, outerTable)

    if (!path)
      throw new Error("No possible path!")

    this.nests.push(new MarkNest(this, path[0],innerMark, outerMark))
    innerMark.outermark = outerMark
  }

  nestWithPredicate(innerMark: Mark, outerMark: Mark, predicate: string[]) {
    let innerTable = innerMark.src
    let outerTable = outerMark.src

    for (const [cname, constraint] of Object.entries(this.db.constraints)) {
      if (!(constraint instanceof FKConstraint))
        continue

      if (constraint.card != Cardinality.ONEONE && constraint.card != Cardinality.ONEMANY)
        continue

      if (constraint.t1 == innerTable) {
        if ((constraint.X.length != predicate.length))
          continue
  
        if (!(constraint.X.every((value, index) => value == predicate[index])))
          continue

        let path = this.db.getFKPath(innerTable, outerTable, constraint)

        if (!path)
          continue

        this.nests.push(new MarkNest(this, constraint, innerMark, outerMark))
        innerMark.outermark = outerMark
        return
      }

      if (constraint.t2 == innerTable) {
        if (constraint.Y.length != predicate.length)
          continue

        if (!(constraint.Y.every((value, index) => value == predicate[index])))
          continue

        let path = this.db.getFKPath(innerTable, outerTable, constraint)

        if (!path)
          continue
  
        this.nests.push(new MarkNest(this, constraint, innerMark, outerMark))
        innerMark.outermark = outerMark
        return
      }
    }

    throw new Error("Cannot find foreign key reference to nest using predicate!")  
  }

  /*
  nest(...constraints) {
    for (let constraint of constraints.flat()) {
      constraint = maybeconstraint(this.db, constraint);
      this.nests.push(new MarkNest(this, constraint))
    }
  }
    */

  // @returns first Mark object whose source is table
  marksof(table):Mark[] {
    if (table instanceof RefMark) {}
    table = maybesource(this.db, table);
    return this.marks
      .filter((m) => m instanceof Mark && table == m.src) as Mark[]
  }

  markof(table):Mark {
    return this.marksof(table)[0] ?? null;
  }

  markby(id){
    for (const m of this.marks)
      if (m instanceof Mark && m.id == id) 
        return m;
    return null;
  }

  /*
   * if there is a fk t1 -1-n- mark.table that is mapped to a Nest
   * then return the nesting, otherwise return root
   */
  nestof(o:Mark) {
    // TODO
    // filter fk constraints for those where
    // 1) mark.table is fk.t2 and
    // 2) constraint maps to container

    if (!o.outermark)
      return new RootNest(this, this.options)

    for (const n of this.nests) {
      if (n instanceof MarkNest) {
          if (n.innerMark == o && n.outerMark == o.outermark)
            return n
      } 
    }
    /**
     * We technically should not end up here because the nest call should succeed and create a new MarkNest
     */
    throw new Error("No such nest!")
  }


  /*
   * @param Mark m mark whose channels reference RefMark
   * @param RefMark rm encoding that references the mark of another table
   * 
   * Remembers which Marks rely on a RefMark
  */
  registerRefMark(rm:Mark, m:Mark) {
    for (let i = 0; i < this.refmarks.length; i++) {
      let currReference = this.refmarks[i]
      if ((currReference.rm == rm) && (currReference.m == rm)) {
        return
      }
    }
    this.refmarks.push({ rm, m })
  }

  scaleconstraints() {
    // TODO: find (mark, channel) pairs that should share their scales
    // they should ideally be aligned as well
  }

  setMarkLevels() {
    let edges = new Map()
    let incoming = new Map()
    for (let i = 0; i < this.marks.length; i++) {
      this.marks[i].level = 0
      edges.set(this.marks[i], [])
      incoming.set(this.marks[i], 0)
    }

    for (const n of this.nests) {
      if (n instanceof MarkNest) {
        let {outerMark, innerMark} = n

        edges.get(outerMark).push(innerMark)
        incoming.set(innerMark, incoming.get(innerMark) + 1)
      }
    }

    let queue = []
    for (let [mark, incomingCount] of incoming.entries()){
      if (incomingCount == 0)
        queue.push(mark)
    }

    /**
     * We are guranteed that each child has a single parent as a mark can only be nested inside one other mark (duh)
     */

    while(queue.length != 0) {
      let curr = queue.shift()
      let children = edges.get(curr)
      for (let i = 0; i < children.length; i++) {
        let child = children[i]
        child.level = curr.level + 1
        queue.push(child)
      }
    }
  }
  /**
   * Topologically sort marks by nest and foreign key references
   */
  sortedmarks() {
    this.setMarkLevels()
    let referenceCounts = new Map<number, number>() /* mapping from mark id to number of other marks it is dependent on */
    let graph = new Map<number, number[]>() /* mapping from mark id to array of other marks that are dependent on it */

    for (let i = 0; i < this.marks.length; i++) {
      let currmark = this.marks[i]
      referenceCounts.set(currmark.id, 0)
      graph.set(currmark.id, [])
    }

    for (const n of this.nests) {
      if (n instanceof MarkNest) {
        let {outerMark, innerMark} = n
        let outerMarkID = outerMark.id
        let innerMarkID = innerMark.id

        graph.get(outerMarkID).push(innerMarkID)
        referenceCounts.set(innerMarkID, referenceCounts.get(innerMarkID) + 1)
      }
    }

    for (let i = 0; i < this.refmarks.length; i++) {
      let currReference = this.refmarks[i]
      let {rm, m} = currReference
      let dstID = rm.id
      let srcID = m.id

      if (!graph.get(dstID).includes(srcID)) {
        graph.get(dstID).push(srcID)
        referenceCounts.set(srcID, referenceCounts.get(srcID) + 1)
      }
    }

    let queue = []
  
    for (let [markID, count] of referenceCounts.entries()) {
      if (count == 0)
        queue.push(markID)
    }

    if (queue.length == 0)
      throw new Error("Marks cross reference each other, plotting not possible")

    let arr = queue.slice()

    while (queue.length != 0) {
      let currID = queue.shift()
      let destMarks = graph.get(currID)
      
      for (let i = 0; i < destMarks.length; i++) {
        referenceCounts.set(destMarks[i], referenceCounts.get(destMarks[i] - 1))

        if (referenceCounts.get(destMarks[i]) == 0) {
          queue.push(destMarks[i])
          arr.push(destMarks[i])
        }
      }
    }

    let marks = this.marks.slice().sort((mark1, mark2) => {
      return arr.indexOf(mark1.id) - arr.indexOf(mark2.id)
    })
    return marks
  }

  // topologically sort marks by the Nest relationships and markof references
  // sortedmarks() {
  //   // compute mark dependency graph
  //   let edges = {};   // markid --dependson--> markid[]
  //   let dsts = {};    // dst markid -> true
  //   for (const n of this.nests) {
  //     if (n instanceof MarkNest) {
  //       for (const Nm of this.marksof(n.fk.t2)) {
  //         for (const ONEm of this.marksof(n.fk.t1)) {
  //           (edges[ONEm.id] ??= []).push(Nm.id);
  //           dsts[Nm.id] = true;
  //         }
  //       }
  //     }
  //   }
  //   for (const {rm,m:srcm} of this.refmarks) {
  //     for (const dstm of this.marksof(rm.src)) {
  //       (edges[dstm.id] ??= []).push(srcm.id);
  //       dsts[srcm.id] = true;
  //     }
  //   }

  //   let queue = this.marks
  //     .filter((m) => m instanceof Mark && !dsts[m.id])
  //     .map((m:Mark) => m.id)
  //   // markid -> distance from root
  //   let distances = Object.fromEntries(queue.map((markid)=>[markid, 0]));

  //   while (queue.length) {
  //     let mid = queue.pop();
  //     let d = distances[mid];
  //     let added = false;
  //     if (d > 50) throw new Error("Loop");

  //     for (const dstid of (edges[mid] ?? [])) {
  //       if (d+1 > (distances[dstid]??0)) {
  //         distances[dstid] = d+1;
  //         queue.push(dstid)
  //       }
  //     }
  //   }

  //   let marks = R.sortBy((m) => (m instanceof Mark)
  //     ? distances[m.id]??this.marks.length 
  //     : 0, this.marks)
  //   return marks;
  // }

  async render(context) {
    context.document ??= document;
    let svg = context.svg;
    this.node = svg? select(svg) : null;
    let g = null;
    if (svg == null && this._parent == null) {
      this.node = select(
        creator("svg").call(document.documentElement))
    }

    if (this._parent == null) {
      this.node
        .style("width", `${this.options.width}px`)
        .style("height", `${this.options.height}px`);

      g = this.node.append("svg:g")
        .classed("canvas", true);
    } else {
      g = this.node = select(
        creator("svg:g").call(document.documentElement))
        .classed("canvas", true);
    }

    let container = Plot.frame().plot(this.options);
    (g.node() as HTMLElement).appendChild(container);

    for (const m of this.sortedmarks()){
      let node = await m.render(context);
     (g.node() as HTMLElement).appendChild(node);
    }
    
    await this.taskGraph.execute()
    this.taskGraph.visualize(context.graphSvg)
    return this.node.node();
  }

  async hier(tablename: string, attrHierarchy: string[]) {
    let newTableNames = attrHierarchy.slice()
    let currTable = this.db.table(tablename)
    let prevTable = null
    let prevKeys = null
    let rest = currTable.schema.except([...attrHierarchy, IDNAME]).attrs
    console.log("rest hier", rest)

    for (let i = 0; i < attrHierarchy.length; i++) {
      let currAttrs = attrHierarchy.slice(0, i + 1)
      if (i == attrHierarchy.length - 1) {
        currAttrs = currAttrs.concat(rest)
      }
      
      let select = currTable.schema.pick(currAttrs).asObject()
      let newTable = await currTable.distinctproject(select, newTableNames[i])
      newTable.keys(IDNAME)

      if (prevTable) {
        let c = new FKConstraint({t1: prevTable, X: prevKeys, t2: newTable, Y: prevKeys})
        this.db.addConstraint(c)
      }
      prevTable = newTable
      prevKeys = currAttrs
    }
    console.log("all constraints", this.db.constraints)
    return newTableNames
  }

  async createCountTable(tablename: string, groupBy: string|string[], newTableName?) {
    let t = this.db.table(tablename)

    if (!t)
      throw new Error(`No such table ${tablename}`)

    groupBy = groupBy instanceof Array ? groupBy : [groupBy]
    let groupByObj = {}
    newTableName ??= groupBy.forEach((col) => {
      newTableName += `${col}_`
    }) + "count"

    groupBy.forEach((col) => {
      groupByObj[col] = col
    }) + "count"

    // groupBy.forEach((col) => {
    //   groupByObj[col] = col
    //   newTableName += `${col}_`
    // })

    // newTableName += "count"

    let query = new Query()
    query = query.select({
      count: count(),
      [IDNAME]: idexpr,
      ...groupByObj
    })
    
    query = query.groupby(groupBy)
    query = query.from(tablename)

    let newTable = await this.db.fromSql(query, newTableName)

    newTable.name(newTableName)
    newTable.keys(IDNAME)
    newTable.keys(groupBy)

    for (const [cname, constraint] of Object.entries(this.db.constraints)) {
      if (constraint.t2.internalname == tablename) {
        if (constraint.Y.every(col => groupBy.includes(col))) {
          let c = new FKConstraint({t1: constraint.t1, X: constraint.X, t2: newTable, Y: constraint.Y})
          this.db.addConstraint(c)
        }
      } else if (constraint.t1.internalname == tablename) {
        if (constraint.X.every(col => groupBy.includes(col))) {
          let c = new FKConstraint({t1: newTable, X: constraint.X, t2: constraint.t2, Y: constraint.Y})
          this.db.addConstraint(c)
        }
      }
    }

    let c = new FKConstraint({t1: newTable, X: groupBy, t2: t, Y: groupBy})
    this.db.addConstraint(c)

    return newTableName
  }

  async erDiagram(tablesMark: Mark, attributesMark: Mark, fkeysMark: Mark) {
    let placeholder = "COMPOSITE_erdiagram"
    this.taskGraph.addMark(placeholder)
    this.taskGraph.addDependency(placeholder, tablesMark, true)
    this.taskGraph.addDependency(placeholder, attributesMark, true)
    this.taskGraph.addDependency(placeholder, fkeysMark, true)

    let erDiagram = await this.taskGraph.addTask(
        HOOK_PLACE.COMPOSITE, 
        placeholder, 
        async () => {return await this.runERDiagramTask(tablesMark, attributesMark, fkeysMark)}, 
        false)
  }

  async runERDiagramTask(tablesMark: Mark, attributesMark: Mark, fkeysMark: Mark) {
    let tablesMarkInfo = tablesMark.markInfoCache
    let attributesMarkInfo = attributesMark.markInfoCache
    let g = new dagre.graphlib.Graph({compound: true})
    
    g.setGraph({rankdir: "LR"})

    //g.setDefaultEdgeLabel(function() { return {}; });

    /**
     * First get number of attrbutes per table
     */
    let countMap = new Map<number, number>()

    for (let [id, markInfo] of attributesMarkInfo.entries()) {
      let parentId = attributesMark.innerToOuter.get(id)
      
      if (!countMap.has(parentId)) {
        countMap.set(parentId, 0)
      }

      countMap.set(parentId, countMap.get(parentId) + 1)
    }

    /**
     * Create dagre rectangle nodes for each table
     */
    let baseTableWidth = 200
    let baseTableHeight = 40
    let attributeHeight = 20

    for (let [id, markInfo] of tablesMarkInfo.entries()) {
      let attributeCount = 0
      if (countMap.has(id))
        attributeCount = countMap.get(id)


      let height = attributeCount * attributeHeight + baseTableHeight
      let label = `${tablesMark.marktype}_${id}`
    
      g.setNode(label, {label: label, width: baseTableWidth, height: height, shape: "rect"})
    }



    /**
     * Currently operate under assumption that x1,x2,y1,y2 always involve call to get
     * AND
     * x1 == y1 AND x2 == y2. MASSIVE ASSUMPTION MADE HERE
     * x1_ref, x2_ref, etc. are mark ids (numbers)
     */
    for (let [key, value] of fkeysMark.referencedMarks) {
      let {x1_ref, x2_ref, y1_ref, y2_ref} = value
      let leftAttributeId = x1_ref
      let rightAttributeId = x2_ref
      let leftEntityId = attributesMark.innerToOuter.get(leftAttributeId)
      let rightEntityId = attributesMark.innerToOuter.get(rightAttributeId)

      g.setEdge(`${tablesMark.marktype}_${leftEntityId.toString()}`, `${tablesMark.marktype}_${rightEntityId.toString()}`, {label: `${x1_ref}#${x2_ref}#${key}`})
    }

    dagre.layout(g)


    let tableRows = []

    g.nodes().forEach(id => {
      const rect = g.node(id);
        let match = id.match(/^rect_(\d+)$/)
        if (!match) {
          //Should never end up here
          throw new Error("Error in erDiagram: Could not parse id of texts!")
        }

        let parsedId = parseInt(match[1], 10)
        tableRows.push({ [IDNAME]: parsedId, x: rect.x, y: rect.y, width: baseTableWidth, height: rect.height, stroke: "black", fill: "none"})
    });
  
    let rowCounts = new Map<number, number>()

    let attributesGroups = new Map<number, {}[]>()
    let attributesRows = []

    attributesMarkInfo.forEach((info, id) => {
      let parentId = attributesMark.innerToOuter.get(id)
      let parentInfo = tableRows.find((entity) => entity[IDNAME] == parentId)
      let currRowCount = 0
      if (!rowCounts.has(parentId)) {
        rowCounts.set(parentId, 1)
      } else {
        currRowCount = rowCounts.get(parentId)
        rowCounts.set(parentId, rowCounts.get(parentId) + 1)
      }
      
      let obj = {[IDNAME]: id, x: parentInfo.x, y: parentInfo.y + (currRowCount + 1)  * 20}

      for (let key of Object.keys(info)) {
        if (!(key in obj)) {
          obj[key] = info[key]
        }
      }
      if (attributesGroups.has(parentId)) {
        attributesGroups.get(parentId).push(obj)
      } else {
        attributesGroups.set(parentId, [obj])
      }
      attributesRows.push(obj)
    })

    let edges = g.edges().map(edge => {
      let label: string = g.edge(edge).label
      let ids = label.split("#",3)
      let leftId = parseInt(ids[0])
      let rightId = parseInt(ids[1])
      let edgeId = parseInt(ids[2])

      let leftAttrInfo = attributesRows.find((attribute) => attribute[IDNAME] == leftId)
      let rightAttrInfo = attributesRows.find((attribute) => attribute[IDNAME] == rightId)

      const source = g.node(edge.v);
      const target = g.node(edge.w);

      let leftEntityId = parseFloat(source.label.split("_",2)[1])
      let rightEntityId = parseFloat(target.label.split("_",2)[1])

      let leftEntityInfo = tableRows.find((table) => table[IDNAME] == leftEntityId)
      let rightEntityInfo = tableRows.find((table) => table[IDNAME] == rightEntityId)


      let x1 = leftAttrInfo.x
      let y1 = leftAttrInfo.y
      let x2 = rightAttrInfo.x
      let y2 = rightAttrInfo.y

      if (x1 < x2) {
        x1 += leftEntityInfo.width
      } else if (x2 < x1) {
        x2 += rightEntityInfo.width
      }
      

      return {
        [IDNAME]: edgeId,
        x1: x1, y1: y1,
        x2: x2, y2: y2
        };
    });

    /**
     * Time to make calls to functions in newMark to create new svg stuff
     */
    /**
     * Sequence:
     * Remove all elements
     * Render tables, then attributes, then fkey edges
     * For each mark, call makemark, fixup the markInfo if needed and then recreate its marktable
     */

    tablesMark.node.selectAll("*").remove()
    attributesMark.node.selectAll("*").remove()
    fkeysMark.node.selectAll("*").remove()

    let tableCols = tablesMark.rowsToCols(tableRows)
    let fkeysCols = fkeysMark.rowsToCols(edges)


    attributesMark._scales.x = {type: "identity"}
    attributesMark._scales.y = {type: "identity"}

    let canvasInfo = {width: this.options.width, height: this.options.height}
    let newTablesMark = tablesMark.makemark(tableCols, canvasInfo)

    select(newTablesMark.mark)
      .selectAll(`g[aria-label='${tablesMark.mark.aria}']`)
      .selectAll("*")
      .each(function (d, i) {
        let el = d3.select(this);
        let id = parseInt(el.attr("data__rav_id"))
        let tableRow = tableRows.find((table) => table[IDNAME] == id)
        el.attr("x", tableRow.x)
        el.attr("y", tableRow.y)
        el.attr("width", tableRow.width)
        el.attr("height", tableRow.height)

        let row = newTablesMark.markInfo.find((info) => info[IDNAME] == id)
        row.x = tableRow.x
        row.y = tableRow.y
        row.width = tableRow.width
        row.height = tableRow.height
      })
    tablesMark.node
      .append("g")
      .node().appendChild(newTablesMark.mark);

    tablesMark.prepareMarkInfo(newTablesMark.markInfo)
    await tablesMark.createMarkTable(newTablesMark.markInfo)

    /**
     * End tablesMark recreation, start attributes
     */
    
    let newAttributesMarkInfo = []
    for (let [parentId, rows] of attributesGroups.entries()) {
      let parentInfo = tableRows.find((table) => table[IDNAME] == parentId)
      let cols = attributesMark.rowsToCols(rows)
      let newAttributesMark = attributesMark.makemark(cols, parentInfo)

      select(newAttributesMark.mark)
        .attr("width", this.options.width)
        .attr("height", this.options.height)
        .attr("viewBox", `0 0 ${this.options.width} ${this.options.height}`)

      newAttributesMarkInfo.push(...newAttributesMark.markInfo)

      attributesMark.node
        .append("g")
        .node().appendChild(newAttributesMark.mark);
    }

    attributesMark.prepareMarkInfo(newAttributesMarkInfo)
    await attributesMark.createMarkTable(newAttributesMarkInfo)

    /**
     * End attributeMarks recreation, start fkey edges
     */

    let newFkeysMark = fkeysMark.makemark(fkeysCols, canvasInfo)

    const config = {stroke: "black"}
    let fkeySvg = select(newFkeysMark.mark)
    insertMarkers(fkeySvg, config)

    fkeySvg
    .selectAll(`g[aria-label='${fkeysMark.mark.aria}']`)
    .selectAll("*")
    .each(function (d, i) {
      let el = d3.select(this);
      let id = parseInt(el.attr("data__rav_id"))
      let {x1_ref, x2_ref} = fkeysMark.referencedMarks.get(id)
      let leftInfo = attributesMark.markInfoCache.get(x1_ref)
      let rightInfo = attributesMark.markInfoCache.get(x2_ref)

      if (leftInfo["textDecoration"] == "underline") { //left side is a key
        el.attr("marker-start", `url(#${ERMarkers.ONE})`)
      } else {
        el.attr("marker-start", `url(#${ERMarkers.MANY})`)
      }

      if (rightInfo["textDecoration"] == "underline") { //left side is a key
        el.attr("marker-end", `url(#${ERMarkers.ONE})`)
      } else {
        el.attr("marker-end", `url(#${ERMarkers.MANY})`)
      }
    })

    fkeysMark.node
    .append("g")
    .node().appendChild(newFkeysMark.mark);

    fkeysMark.prepareMarkInfo(newFkeysMark.markInfo)
    await fkeysMark.createMarkTable(newFkeysMark.markInfo)

    return Promise.resolve()
  }

  async bucket({table, col, bucketSize}: {table: string, col: string, bucketSize: number}) {
    let t = this.db.table(table)

    if (!t)
      throw new Error(`No such table ${table}`)

    let newTableName = `bucketed_${table}`

    let query = new Query()

    let bucketLabelExpr = `CONCAT(FLOOR(${col} / ${bucketSize}) * ${bucketSize}, '-', 
         FLOOR(${col} / ${bucketSize}) * ${bucketSize} + (${bucketSize} - 1))`

    let minBucketExpr = `FLOOR(${col} / ${bucketSize}) * ${bucketSize}`
    let maxBucketExpr = `FLOOR(${col} / ${bucketSize}) * ${bucketSize} + (${bucketSize} - 1)`

    query = query.select({
      // count: count(),
      [IDNAME]: idexpr,
      [`${col}_bucket`]: sql`${bucketLabelExpr}`,
      [`min_${col}`]: sql`${minBucketExpr}`,
      [`max_${col}`]: sql`${maxBucketExpr}`,
    })
    
    query = query.groupby(sql`FLOOR(${col}/${bucketSize})`)
    query = query.from(table)

    let newTable = await this.db.fromSql(query, newTableName)

    newTable.name(newTableName)
    newTable.keys(IDNAME)
    newTable.keys(`${col}_bucket`)

    await this.db.conn.exec(`ALTER TABLE ${table} ADD COLUMN ${col}_bucket_id INTEGER;`)
    await this.db.conn.exec(`UPDATE ${table}
                            SET ${col}_bucket_id = ${newTableName}.${IDNAME}
                            FROM ${newTableName}
                            WHERE
                            ${table}.${col} >= ${newTableName}.min_${col} AND
                            ${table}.${col} <= ${newTableName}.max_${col};`)

    let c = new FKConstraint({t1: newTable, X: [IDNAME], t2: t, Y: [`${col}_bucket_id`]})
    this.db.addConstraint(c)

    return newTableName

  }

  foreignAttribute(otherTable: string | Table, otherAttr: string | string[], searchKeys: string | string[], callback?) {
    let table : Table
    if (typeof otherTable == "string") {
        let t = this.db.table(otherTable)
        if (!t)
            throw new Error(`No such table ${otherTable}`)
        table = t
    } else {
        table = otherTable
    }
    otherAttr = Array.isArray(otherAttr) ? otherAttr : [otherAttr]
    if (!otherAttr.every((attr) => table.schema.attrs.includes(attr))) {
        throw new Error (`${otherAttr} not found in ${table.internalname}`)
    }
    searchKeys = Array.isArray(searchKeys) ? searchKeys : [searchKeys]
    return {otherTable: table, searchKeys: searchKeys, otherAttr, callback: callback, isVisualChannel: false}
  }

}

for (const mtype of R.keys(marksbytype(Canvas.plotConfig))) {
  Canvas.prototype[mtype] = function () {
    return this.addmark(mtype, ...arguments);
  }
}



