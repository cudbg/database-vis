import * as R from "ramda";
import { creator, select } from "d3";
import { Query, sql, agg, and, eq, column } from "@uwdata/mosaic-sql";
import type { Database } from "./db";
import { createView, IDNAME, Table } from "./table";
import { Cardinality, FKConstraint } from "./constraint";
import { Mark, type IMark, marksbytype } from "./newMark"
//import { Mark, type IMark, marksbytype  } from "./mark";
import {type Nest, RootNest, MarkNest } from "./nest";
import * as Plot from "@observablehq/plot";
import { oplotUtils } from "./plotUtils/oplotUtils";
import { RefMark } from "./ref";
import { Scale } from "./newScale";

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

  linear(scalename, table?, attr?) {
    //skip error checking to see if attr in table
    let c = this;
    //col is going to be used in initScaling method of mark!
    return function(col) {
      if (c.available_scales.has(scalename))
        return c.available_scales.get(scalename)

      let scale =  new Scale(col)
      c.available_scales.set(scalename, scale)
      return scale
    }
  }

  hl(){};

  vl(){};

  addmark(marktype, source, mapping, plotoptions?) {
    plotoptions ??= {}
    let srcTable = this.db.table(source)
    let canvas = findcanvas(this, srcTable);
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
    let innerTable = innerMark.src
    let outerTable = outerMark.src

    if (predicate != null && this.invalidPredicate(innerTable, outerTable, predicate))
      throw new Error("Predicate must be a column present in both tables and must have N-1 cardinality!")
    
    let fkConstraint = null
    if (predicate == null) {
      for (const [key, value] of Object.entries(this.db.constraints)) {
        if (value.t2 == innerTable && value.t1 == outerTable) {
          fkConstraint = value
        }
      }
    }
    if (fkConstraint == null) {
      fkConstraint = new FKConstraint({t1: innerTable, X:[predicate], t2:outerTable, Y:[predicate]})
    }
    this.nests.push(new MarkNest(this, fkConstraint, innerMark, outerMark))
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
  nestof(o:Mark|FKConstraint) {
    // TODO
    // filter fk constraints for those where
    // 1) mark.table is fk.t2 and
    // 2) constraint maps to container
    let ret = [];
    for (const n of this.nests) {
      if (n instanceof MarkNest) {
        if (o instanceof Mark && o.src instanceof Table) {
          const mark = o;
          if (n.fk.t2 == mark.src) {
            for (const m2 of this.marksof(n.fk.t1)) {
              if (m2 && m2 instanceof Mark && m2.src == n.fk.t1){
                ret.push(n)
                break;
              }
            }
          }
        } else if (n.fk == o) {
          ret.push(n)
        }
      } 
    }
    if (ret.length == 0)
      ret.push(new RootNest(this, this.options))
    return ret;
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

  /**
   * Topologically sort marks by nest and foreign key references
   */
  sortedmarks() {
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
    this.node = svg? select(svg) : null;;
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
    return this.node.node();
  }

  async hier(tablename: string, attrHierarchy: string []) {
    let newTableNames = attrHierarchy.slice()
    let currTable = this.db.table(tablename)
    let prevTable = null
    let prevKeys = null

    for (let i = 0; i < attrHierarchy.length; i++) {
      let currAttrs = attrHierarchy.slice(0, i + 1)
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

}

for (const mtype of R.keys(marksbytype(Canvas.plotConfig))) {
  Canvas.prototype[mtype] = function () {
    return this.addmark(mtype, ...arguments);
  }
}



