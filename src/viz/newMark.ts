import * as R from "ramda";
import { creator, select } from "d3";
import * as d3 from "d3";
import { Query, sql, agg, and, eq, column, literal, loadObjects } from "@uwdata/mosaic-sql";
import * as OPlot from "@observablehq/plot";

import { IDNAME, Table, createView } from "./table";
import { idexpr } from "./id";
import { Cardinality, FKConstraint } from "./constraint";
import type {  Canvas } from "./canvas";
import type {Schema} from "./schema";
import { MarkNest, RootNest, type Nest } from "./nest";
import { markof, RefColumn, RefLayout, RefMark } from "./ref";
import { inferScale, Linear, Ordinal, Sqrt } from "./scale"
import { oplotUtils } from "./plotUtils/oplotUtils";
import { rowof, markdata, applycolfilter, markels, filtercoldata, maybeselection } from "./markUtils"
import { Scale, ScaleObject } from "./newScale";
import { HOOK_PLACE } from "./task_graph/task_graph";

/**
 * Used in QueryItem
 * dataAttr represents the column in a table
 * renameAs represents the name we want to select dataAttr as
 * ie. SELECT "a" as "x1", where a is dataAttr and x1 is renameAs
 */
interface ColumnObj {
  dataAttr: string
  renameAs: string
}

function eqColumnObjs(columnObj1: ColumnObj, columnObj2: ColumnObj) {
  if (columnObj1.dataAttr != columnObj2.dataAttr)
    return false
  if (columnObj1.renameAs != columnObj2.renameAs)
    return false
  return true
}


/**
 * An object in the this.channels array
 */
interface RawChannelItem {
  mark: Mark
  src: Table
  visualAttr: string
  constraint: FKConstraint /* will be null if there are no clauses ie. normal mapping like x: "a" */
  /**
   * Underlying data attribute for visualAttribute
   * The type is an array because the user could do x: va.get(null, ["x", "width"], someCallback)
   * In above case, dataAttr is ["x", "width"]
   * Each element has type any because we also numbers in mappings eg. x: 0
   * In such cases, dataAttr is [0]
   * Proper handling of each individual case occurs in constructQuery
   */
  dataAttr: any[]
  isGet: boolean
  refLayout: RefLayout
  callback: Function
}

/**
 * Used in constructQuery and also to decouple this.channels from query
 * One QueryItem per RawChannelItem. We need to keep track of the data source, the column
 */
interface QueryItem {
  srcmark: Mark
  source: Table
  /**
   * Each ColumnObj has dataAttr to represent the column in the table and renameAs for what to select that column as
   * Used to construct the select statement
   */
  columns: ColumnObj[]

  constraint: FKConstraint
}

/**
 * Called in constructQuery to convert this.channels into an array of QueryItems
 * We need this to decouple this.channels from constructQuery
 * @param item RawChannelItem that gets converted into a QueryItem
 * @returns QueryItem
 */
function toQueryItem(item: RawChannelItem): QueryItem {
  let source
  let columns:ColumnObj[] = []

  //setting source to select from
  if (item.isGet) {
    source = item.mark.marktable //If this is a get method, we select from the marktable instead of src
  } else {
    source = item.mark.src
  }

  //setting columns to select from source
  if (item.refLayout) { //If it is a reflayout, select all columns as they are
    for (let i = 0; i < item.dataAttr.length; i++) {
      columns.push({dataAttr: item.dataAttr[i], renameAs: item.dataAttr[i]})
    }
  }
  else if (item.isGet) {
    item.dataAttr.forEach((attr) => {
      columns.push({dataAttr: attr, renameAs: `${source.internalname}_${attr}`})
    })
  } else {
     //dataAttr is an array that contains one element and because this is not a get, we do not rename it to the visualAttr
     item.dataAttr.forEach(dattr => {
      columns.push({dataAttr: dattr, renameAs: dattr})
     })
  }
  return {srcmark: item.mark, source: source, columns: columns, constraint: item.constraint}

}

function eqPath(constraintArr1: FKConstraint[], constraintArr2: FKConstraint[]){
  if (constraintArr1.length != constraintArr2.length)
    return false

  /**
   * We assume that ordering does not matter in this case
   */
  for (let i = 0; i < constraintArr1.length; i++) {
    if (constraintArr1[i] != constraintArr2[i])
      return false
  }
  return true
}


export const marksbytype = (libraryConfig=oplotUtils.config) => {
    return R.mapObjIndexed((o:any, marktype:string) => {
      o.x ??= ['x'];
      o.y ??= ['y'];
      o.shortcuts ??= {};
      o.marktype = marktype;
      o.aria ??= marktype
      o.domprops ??= [...o.x, ...o.y]
    
      // e.g., x1 -> x, cx -> x
      o.alias2scale = {
        x: 'x',
        y: 'y',
        ...Object.fromEntries(o.x.map((alias) => [alias, 'x'])),
        ...Object.fromEntries(o.y.map((alias) => [alias, 'y'])),
      }
    
      o.propToSupply = (markinfo, neededattr) => {
        if (o.domprops.includes(neededattr)) 
          return [neededattr]
        let otherscale = markinfo.alias2scale[neededattr]
        let cands = o.domprops.filter((p) => o.alias2scale[p] == otherscale)

        return cands;
      }
      return o
    }, libraryConfig);
}

export interface IMark {
    init(): any;
    render(context): Promise<any>;
}

export class Mark {
    static id = 0;
    id;
    c: Canvas;
    src;
    marktable;
    marktype;
    mark;
    channels: RawChannelItem[];
    mappings;
    options;
    refmarks;
    layouts;
    scaling_fns: {va, scale: Scale}[]
    markInfoCache: Map<number, {}>;
    outermark: Mark;
    innerToOuter: Map<number, number>;
    level: number;
    idVisualAttrMap: Map<number, Set<string>>; /* for handling level differences between marks */

    /**
     * Other mark + visual attr of this mark + other id -> bag of ids for this mark
     */
    referencedMarks: Map<number, {}>;

    
    /**
     * Every mark has a pointer to its outermark
     * Every mark has a inner id to outer id map
     * 
     * Every mark will have a id to x,y, width, height, data_xoffset, data_yoffset map. 
     *  width and height are only for marks that have a width and height eg. rect
     * 
     * After you draw a mark
     * - create the id to x,y,width, height map
     * 
     * To draw a nested mark
     * - Look up the outer mark's id to x,y,width,height map to get the corresponding offsets
     * 
     * To draw a mark that has a foreign key reference
     * 1. Look up the level of the mark you are getting a reference from
     * 2. If the level you found is different, than 
     */

    _scales;
    _markelsidx;  // IDNAME -> HTML mark element
    node;  // filled in render()
    markdata;

    constructor(canvas, marktype, source:Table, mappings, options, plotConfig) {
        this.id = Mark.id++;
        this.c = canvas;
        this.marktype = marktype;
        let allMarks = marksbytype(plotConfig)
        this.mark = (allMarks[marktype] ?? marktype['dot']);
        this.src = source;
        this.mappings = mappings;
        this.options = options;
        this.layouts = {};
        this.channels = [];
        this.refmarks = []
        this._scales = {}
        this.scaling_fns = []
        this.outermark = null
        this.markInfoCache = new Map<number, {}>()
        this.innerToOuter = null
        this.idVisualAttrMap = new Map<number, Set<string>>()
        this.referencedMarks = new Map<number, {}>()

        this.c.taskGraph.addMark(this)
        this.init()
    }

    init() {
      for (const [va,dattr] of Object.entries(this.mappings)) {
          let mark = this
          let visualAttr = va
          let constraint = null
          let dataAttr = [dattr]
          let isGet = false
          let refLayout = null
          let callback = null
          let src = this.src

          let rawChannelItem: RawChannelItem = {mark, src, visualAttr, constraint, dataAttr, isGet, refLayout, callback}

          if (dattr instanceof RefLayout) {
              dattr.add(va);
              this.addLayout(dattr);
              rawChannelItem.dataAttr = dattr.dattrs
              rawChannelItem.refLayout = dattr
          }
          else if (dattr instanceof Object && 'othermark' in dattr) { //there's a call to get
            let {othermark, constraint, othervattr, callback} = this.processGet(dattr)
            rawChannelItem.mark = othermark
            //rawChannelItem.src = othermark.marktable //very suspect line
            rawChannelItem.constraint = constraint
            rawChannelItem.dataAttr = othervattr
            rawChannelItem.callback = callback
            rawChannelItem.isGet = true

            /**
             * Currently hard coding scales, need to fix!!!!!!
             */
            if (va == "x1" || va == "x2" || va == "x")
              this._scales.x =  {type: "identity"}
            else if (va == "y1" || va == "y2" || va == "y")
              this._scales.y = {type: "identity"}
            
            this.c.registerRefMark(othermark, this)
            this.c.taskGraph.addDependency(this, othermark, true)
          }
          else if (dattr instanceof ScaleObject) {
              this.setScaleForVA(va, dattr)

              rawChannelItem.dataAttr = [dattr.col] // we scale a single column at a time, so this is ok

              if (dattr.scale.callback)
                rawChannelItem.callback = dattr.scale.callback
          } else if (dattr instanceof Object && "cols" in dattr) {
            if (!("func" in dattr))
              throw new Error("Error in initialization: Give me a callback function!")

            if (!(dattr.func instanceof Function))
              throw new Error("Error initialization: This has to be a callback function!")

            let {cols, func} = dattr

            rawChannelItem.dataAttr = cols instanceof Array ? cols : [cols]
            rawChannelItem.callback = func
          }
          this.channels.push(rawChannelItem)
      }
    }
    /**
     * For getting cols that have a valid fk path. valid fk paths are checked during render
     * @param usrSearchkeys
     *                Data attributes in the referring table.
     *                ie. For example VB = c.dot(vb_src, {x: VA.get("aid", ["x"]) ...})
     *                aid is an attribute in vb_src.
     *                Checking if aid is a N-1 foreign key from vb_src to va_src occurs only in processGet 
     * @param usrVattr 
     *                The desired visual attribute to get from this mark
     * @param callback 
     *                A callback function that is run over usrVattr during render
     * @returns 
     *                object with format {mark: this, filter: ..., vattr: ...}
     */
    get(usrSearchkeys: String | String[], usrVattr: String | String[], callback?): {othermark, searchkeys, othervattr, callback} {
      let searchkeys = null

      if (usrSearchkeys)
        searchkeys = Array.isArray(usrSearchkeys) ? usrSearchkeys : [usrSearchkeys]

      let othervattr = Array.isArray(usrVattr) ? usrVattr : [usrVattr]
  
      for (let attr of othervattr) {
        if (!R.includes(attr, Object.keys(this.mappings))) { //othervattr must be present to this.mappings
          throw new Error(`${attr} is not mapped in ${this.src.displayname}`)
        }
      }

      let obj = {othermark: this, searchkeys: searchkeys, othervattr: othervattr, callback: callback}
      return obj
    }

    eqSearchKey(searchKey1: string[], searchKey2: string[]) {
      if (searchKey1.length != searchKey2.length)
        return false

      let tmp1 = [...searchKey1].sort()
      let tmp2 = [...searchKey2].sort()

      return tmp1.every((value, index) => value === tmp2[index])
    }


    checkValidFkConstraint(c: FKConstraint, othermark: Mark, currSearchkey: string[]) {
      if ((c.card != Cardinality.ONEMANY) && (c.card != Cardinality.ONEONE))
        return false

      if (c.t1 == this.src && this.eqSearchKey(currSearchkey, c.X))
        return true
      else if (c.t2 == this.src && this.eqSearchKey(currSearchkey, c.Y))
        return true

      return false
    }

    /**
     * Called in the init method for handling a call to get method
     * @param getObj the object that was created from a get method 
     */

    processGet(getObj) {
      let othermark = getObj.othermark
      let searchkeys = getObj.searchkeys
      let othervattr = getObj.othervattr
      let callback = getObj.callback

      /**
       * If both marks share the same source table, then skip checking and create a new FKConstraint
       */
      if (othermark.src == this.src) {
        /**
         * Search currently available constraints so that we don't add redundant constraints
         */
        for (let constraint of Object.values(this.c.db.constraints)) {
          if (!(constraint instanceof FKConstraint))
            continue

          if ((constraint.t1 != this.src) || (constraint.t2 != this.src))
            continue
          
          if ((constraint.X.length != searchkeys.length) || (constraint.Y.length != searchkeys.length))
            continue

          if (!(constraint.X.every((value, index) => value == searchkeys[index])))
            continue

          if (!(constraint.Y.every((value, index) => value == searchkeys[index])))
            continue

          return {othermark, constraint, othervattr, callback}
        }

        let constraint = new FKConstraint({t1: this.src, X: searchkeys, t2: this.src, Y: searchkeys})

        this.c.db.addConstraint(constraint)
        
        return {othermark, constraint, othervattr, callback}
      }

      for (const [constraintName, constraint] of Object.entries(this.c.db.constraints)) {
        if (!(constraint instanceof FKConstraint))
          continue
        /**
         * Check if there is a valid foreign key reference from this.src to othermark.src for the given searchkey
         * In this current state, it must be a direct N-1 foreign key reference ie. from table A to table B.
         * Indirect foreign key references such as from A to C, given a valid foreign key path A to B to C, would throw an error!
         */
        let validFkConstraint = this.checkValidFkConstraint(constraint, othermark, searchkeys)

        if (validFkConstraint) {
          /**
           * We only check if there is a valid path from this.src to othermark.src but we don't append the path at this point
           * because we are missing the final edge from othermark.src to othermark.marktable because rendering has not occurred at this stage
           * 
           * We theoretically could create the path right here but I feel it would become messy
           * As such, We only create the path in constructQuery
           */
          let path = this.c.db.getFKPath(this.src, othermark.src, constraint)
          if (!path)
            throw new Error("No possible path!")
          
          for (let i = 1; i < path.length; i++) {
            if (path[i].card != Cardinality.ONEONE)
              throw new Error("No possible path!")
          }

          return {othermark, constraint, othervattr, callback}
        }
      }

      throw new Error("No possible path")
    }

    /**
     * Called in the init method handle scaling
     * @param va  
     *            The visual attribute to scale
     * @param scaleObj
     *            Has type Scale (need to come up with better name). 
     *            Contains information about domain, range, col
     *            See dynamicScale.ts. 
     */
    setScaleForVA(va, scaleObj: ScaleObject) {
      let {col, scale} = scaleObj
      if (!this.src.schema.attrs.includes(col))
        throw new Error(`Trying to scale invalid column: ${col}`)

      let range = scale.range
      let type = scale.type

      this._scales[va] = {}
      if (type) {
        this._scales[va] = {type: type}
      }
      if (range) {
        this._scales[va] = {...this._scales[va], range: range}
      }

      
      this.scaling_fns.push({va: va, scale: scaleObj})
    }

    /**
     * 
     * @param context 
     * @returns 
     */
    async render(context) {
        let root = this.node = select(
            creator("svg:g").call(document.documentElement))
            .classed(`${this.marktype}-${this.id}`, true);
        let nest = this.c.nestof(this)

        /*
        mark was really appended to the root after doRootNest and doMarkNest
        But we return mark for error checking purposes
        */
        if (nest instanceof RootNest) {
          let crow = nest.parentmarkdata()
          let fixedCrow = this.handleCrow(crow)
          await this.doWorkFlow(root, fixedCrow, false)
        } else {
          this.outermark = nest.outerMark
          this.innerToOuter = new Map<number, number>()
          await this.doWorkFlow(root, nest, true)
        }
        return root.node()
    }

    /**
     * Keep track of reflayouts to run for applychannels
     * @param rl a RefLayout
     */
    addLayout(rl:RefLayout) {
        this.layouts[rl.id] ??= rl;
        this.layouts[rl.id].add(rl.vattrs)
    }

    async runQueryTask(outer, isNested) {
      let query
      if (isNested)
        query = this.constructQuery(outer)
      else
        query = this.constructQuery()
      return query
    }

    runLayoutTask(rows, outer, dummyroot, isNested) {
      /**
       * The data from query has format [{}, {}, {}] where each object represents
       * a single data point ie. each object looks like {x: ..., y: ...}
       * We convert from rowsToCols so that the data looks like { x: [], y: []}
       * The idea is to collect each visual attribute into an array
       * This is to allow applychannels to work properly
       * 
       */
      if (isNested) {
        let channelObj = {}
        for (let [outermarkID, outermarkInfo] of this.outermark.markInfoCache) {  
          let children = rows.filter(row => row[`${IDNAME}_parent`] == outermarkID)

          this.pickupReferences(children)

          let cols = this.rowsToCols(children)
          let channels = this.applychannels(cols)
  
          for (let i = 0; i < channels[IDNAME].length; i++)
            this.innerToOuter.set(channels[IDNAME][i], outermarkInfo[IDNAME])
          
          channels = this.doLayout(channels, outermarkInfo, dummyroot)
          channelObj[outermarkID] = channels 
        }
        return channelObj

      } else {
        this.pickupReferences(rows)

        let cols = this.rowsToCols(rows)
        let channels = this.applychannels(cols)
  
        channels = this.doLayout(channels, outer, dummyroot)
  
        return channels
      }
    }

    runRenderTask(root, channels, crow, isNested) {
      if (isNested) {
        let markInfoArr = []

        for (let [outermarkID, currChannels] of Object.entries(channels)) {
          let outerMarkRow = this.outermark.markInfoCache.get(parseInt(outermarkID))
          // render final marks
          let {mark, markInfo} = this.makemark(currChannels, outerMarkRow)
        
          let tmpOuterMark = this.outermark
          let outerID = outerMarkRow[IDNAME]
          let xoffset = outerMarkRow.x
          let yoffset = outerMarkRow.y

          /**
           * Walk upwards until you hit a non-nested mark
           * Add to xoffset and yoffset as you walk upwards
           */

          while (tmpOuterMark && tmpOuterMark.innerToOuter) {
            outerID = tmpOuterMark.innerToOuter.get(outerID)
            tmpOuterMark = tmpOuterMark.outermark

            let tmpCrow = tmpOuterMark.markInfoCache.get(outerID)
            xoffset += tmpCrow.x
            yoffset += tmpCrow.y
          }

          root
            .append("g")
            .attr("transform", `translate(${xoffset}, ${yoffset})`)
            .node().appendChild(mark);

          markInfoArr.push(...markInfo)
          
        }
        return markInfoArr

      } else {    
        let {mark, markInfo} = this.makemark(channels, crow)

        select(root)
  
        root
          .append("g")
          .attr("transform", `translate(${crow.x}, ${crow.y})`)
          .node().appendChild(mark);

        return markInfo
      }        
    }

    async runCleanupTask(root, dummyroot, markInfo) {
      this.prepareMarkInfo(markInfo)
      await this.createMarkTable(markInfo)
      this._markelsidx = markels(root, this.marktype);
      document.documentElement.removeChild(dummyroot.node());
    }

    async doWorkFlow(root, outer, isNested) {
      let dummyroot = this.makeDummyRoot()

      let queryTask = await this.c.taskGraph.addTask(
        HOOK_PLACE.QUERY, 
        this, 
        async () => {return await this.runQueryTask(outer, isNested)}, 
        false)

      let layoutTask = await this.c.taskGraph.addTask(
        HOOK_PLACE.LAYOUT, 
        this, 
        async () => {
          let query = queryTask.getOutput()
          let rows = await this.c.db.conn.exec(query)
          console.log("rows", rows)
          let channels = this.runLayoutTask(rows, outer, dummyroot, isNested)
          return channels
        }, false)
      
      this.c.taskGraph.addDependency(layoutTask, queryTask, false)

      let renderTask = await this.c.taskGraph.addTask(
        HOOK_PLACE.RENDER, 
        this, 
        async () => {
          let channels = layoutTask.getOutput()
          let markInfo = this.runRenderTask(root, channels, outer, isNested)
          return markInfo
        }, false)
      
      this.c.taskGraph.addDependency(renderTask, layoutTask, false)

      let cleanupTask = await this.c.taskGraph.addTask(
          HOOK_PLACE.CREATE_MARKTABLE, 
          this, 
          async () => {
            let markInfo = renderTask.getOutput()
            await this.runCleanupTask(root, dummyroot, markInfo)
          }, false)
      
      this.c.taskGraph.addDependency(cleanupTask, renderTask, false)
    }

    constructQuery(nest?) {
      let idCounter = 0
      let pathQueryItemMap = new Map<FKConstraint[] ,Set<QueryItem>>()
      let pathIDMap = new Map<FKConstraint[], number>()
      let noConstraintColumnObjSet = new Set<ColumnObj>() /* this is for dattrs from this.src */
      let queryItems = this.channels.map((rawChannelItem) => toQueryItem(rawChannelItem))


      /**
      * An array of possible aliases for this.src
      * Usually contains a single alias
      * Can contain more aliases if multiple marks have this.src as their source table
      * and some mark has a foreign key reference to another mark,
      * In this case, we need to rename this.src in the query 
      */
      let possibleSrcTableAliases = []


      /**
       * If some table != this.src and it appears in different foreign key references, then we need to rename it
       * 
       * An example from the airport nodelink diagram:
       * SELECT "am1"."x" as "x1", "am1"."y" as "y1", "am2"."x" as "x2", "am2"."y" as "y2"
       * FROM "airport_marktable0" as "am1", "airport_marktable0" as "am2", "airport" as "a1", "airport" as "a2", routes
       * WHERE "a1"."airport" = "routes"."ORIGIN"
       *       AND "a1"."_rav_id" = "am1"."_rav_id" 
       *       AND "a2"."airport" = "routes"."DEST"
       *       AND "a2"."_rav_id" = "am2"."_rav_id"
       * 
       * Note how every table along the foreign key path also has to be renamed
       */

      /**
       * 1. Iterate over all query items and group their dattrs by path or source in a Map mp.
       *    dattrs that are derived from a table that is not this.src will have a path as the key
       *    dattrs that are derived from this.src have this.src as the key
       * 
       * 2. Iterate over key,value pairs of mp. 
       *    All tables in the FKPath besides this.src will need to be renamed. 
       *    Each dattr in the value is added to the select part of query
       * 
       * 3. Handle nesting if needed
       * 
       */

      for (let i = 0; i < queryItems.length; i++) {
        let {source, columns, constraint} = queryItems[i]

        /**
        * Check if column is a numeric value. the user could have entered x: 5 
        * and we wouldnt want to query for column 5
        */
        if (!columns.some(column => source.schema.attrs.includes(column.dataAttr)))
          continue
        /**
         * This is a foreign key reference
         */
        if (constraint) {
          let possibleNewPath = this.c.db.getFKPath(this.src, source, constraint)
            let pathInMap = null

            if (!possibleNewPath)
              throw new Error("No possible path")

            for (let path of pathQueryItemMap.keys()) {
              if (eqPath(possibleNewPath, path)) {
                pathInMap = path
                break
              }
            }

            if (!pathInMap) {
              queryItems[i].columns.push({dataAttr: IDNAME, renameAs: `idcounter_${idCounter}`})
              pathIDMap.set(possibleNewPath, idCounter)
              this.idVisualAttrMap.set(idCounter, new Set(queryItems[i].columns.map(columnObj => columnObj.renameAs)))
              idCounter++

              pathQueryItemMap.set(possibleNewPath, new Set([queryItems[i]]))

              /**
               * Create a path for each constraint and check if this new path is already present
               */
              if ((constraint.t1 == constraint.t2) && (constraint.t1 == this.src)) {
                let currlen = possibleSrcTableAliases.length
                possibleSrcTableAliases.push(`${this.src.internalname}_${currlen}`)
              }

            } else {
              let queryItemSet = pathQueryItemMap.get(pathInMap)
              let id = pathIDMap.get(pathInMap)
              queryItems[i].columns.forEach(columnObj => this.idVisualAttrMap.get(id).add(columnObj.renameAs))
  
              queryItemSet.add(queryItems[i])

            }
        } else {
          for (let i = 0; i < columns.length; i++) {
            let foundColumn = false

            for (const columnObj of noConstraintColumnObjSet) {
              if (eqColumnObjs(columnObj, columns[i]))
                foundColumn = true
            }
            if (!foundColumn)
              noConstraintColumnObjSet.add(columns[i])
          }
        }
      }

      /**
       * This handles nesting
       * Create a new path
       * Append a FKConstraint for the outermark
       *  For example if outermark VRECT is a bunch of 3 rectangles with ids 0, 1, 2
       *  We would need a FKConstraint where VRECT.id = 0 (could be any of the 3 ids above)
       *  See how nesting works in doMarkNest for complete picture
       * 
       * Check if that new path is already present
       * If present, remove the path that is currently present in the map and replace it with new path
       * If not, we can just add new path to the map
       * 
       * Note: We do not support re-referencing this.src in nesting ie. the following is not possible
       * let va = c.rect("A", ...)
       * let vb = c.dot("A", ...)
       * 
       * nest(va, vb, <some_key>)
       */
      if (nest) {
        let possibleNewPath = this.c.db.getFKPath(this.src, nest.outerMark.src, nest.fk)
        let pathInMap = null

        if (!possibleNewPath)
          throw new Error("No possible path")

        for (let path of pathQueryItemMap.keys()) {
          if (eqPath(possibleNewPath, path)) {
            pathInMap = path
            break
          }
        }

        //possibleNewPath.push(new FKConstraint({t1: nest.outerMark.marktable, X: [IDNAME], t2: nest.outerMark.marktable, Y: [crow[IDNAME]]}))
        let nestQueryItem: QueryItem = {srcmark: nest.outerMark, source: nest.outerMark.src, columns: [{dataAttr: IDNAME, renameAs: `${IDNAME}_parent`}], constraint: nest.fk}

        if (!pathInMap) {
          pathQueryItemMap.set(possibleNewPath, new Set([nestQueryItem])) /* empty set because this is a nest, no attributes are being selected */
        } else {
          let queryItemSet = pathQueryItemMap.get(pathInMap)
          queryItemSet.add(nestQueryItem)
        }
      }

      /**
       * Actual construction of query
       */

      let query = new Query()

      query = query.distinct()

      for (let columnObj of noConstraintColumnObjSet.values()) {
        let {dataAttr, renameAs} = columnObj

        query = query.select({[renameAs]: column(this.src.internalname, dataAttr)})
      }

      query = query.select(column(this.src.internalname, IDNAME))

      query = query.from(this.src.internalname)

      let pathCounter = 1
      let srcTableAliasIndex = 0

      for (let [path, queryItemSet] of pathQueryItemMap.entries()){
        /**
         * tableRenameMap is a mapping from internal table names to in-query aliases
         */
        let tableRenameMap = new Map<string, string>()
        let srcTableAlias = null
        let startPathIterIndex = 0

        if ((path[0].t1 == path[0].t2) && (path[0].t1 == this.src)) {
          let {X, Y} = path[0]

          srcTableAlias = possibleSrcTableAliases[srcTableAliasIndex]
          srcTableAliasIndex++
          startPathIterIndex = 1
          query = query.from({[srcTableAlias]: this.src.internalname})

          for (let i = 0; i < X.length; i++)
            query = query.where(eq(column(this.src.internalname, X[i]), column(srcTableAlias, Y[i])))
        }

        for (let i = startPathIterIndex; i < path.length; i++) {
          let constraint = path[i]
          let {t1, t2, X, Y} = constraint
          let renameT1 = null
          let renameT2 = null

          if (t1.internalname != this.src.internalname) {
            if (!tableRenameMap.has(t1.internalname)) {
              renameT1 = `${t1.internalname}_${pathCounter}`
              query = query.from({[renameT1]: t1.internalname})
              tableRenameMap.set(t1.internalname, renameT1)
            } else {
              renameT1 = tableRenameMap.get(t1.internalname)
            }
          } else if (srcTableAlias)
            renameT1 = srcTableAlias
          else {
            renameT1 = this.src.internalname
          }

          if (t2.internalname != this.src.internalname) {
            if (!tableRenameMap.has(t2.internalname)) {
              renameT2 = `${t2.internalname}_${pathCounter}`
              query = query.from({[renameT2]: t2.internalname})
              tableRenameMap.set(t2.internalname, renameT2)
            } else {
              renameT2 = tableRenameMap.get(t2.internalname)
            }
          } else if (srcTableAlias) {
            renameT2 = srcTableAlias
          }
          else {
            renameT2 = this.src.internalname
          }
          for (let i = 0; i < X.length; i++)
            query = query.where(eq(column(renameT1, X[i]), column(renameT2, Y[i])))
        }

        for (let queryItem of queryItemSet) {
          let {source, columns} = queryItem

          for (let columnObj of columns) {
            let {dataAttr, renameAs} = columnObj
            let tableName = tableRenameMap.get(source.internalname)
            query = query.select({[renameAs]: column(tableName, dataAttr)})

            /**
             * Experimental feature
             */
            query = query.select({[`${renameAs}_ref`]: column(tableName, IDNAME)})
          }
        }
        pathCounter++
      }
      return query
    }
 
    /**
     * Create a dummy root so that layout works on dummy root
     * @returns 
     */
    makeDummyRoot() {
      let dummyroot = select(creator("div").call(document.documentElement))
        .style("position", "absolute")
        .style("x", "-100000")
        .style("y", "-100000")
      document.documentElement.appendChild(dummyroot.node())
      return dummyroot
    }

    /**
     * Evaluates the results of the SQL query by associating each column with a visual attribute
     * @param data 
     *             the results of the SQL query that has been transposed via transpose()
     *             Has format {a: [...], b: [...], ...}
     * @returns channels, where each data attribute is associated with visual attribute
     *          If the visual attribute is not associated with data from SQL query, then the user
     *          has specified the value of that visual channel/attribute. This function also
     *          handles that situation
     *          Has format {x: [...], y: [...], ...}
     */
    applychannels(data) {
      if (Object.keys(data).length == 0) {
        return []
      }

      let channels: {[key: string]: any[]} = {
        [IDNAME]: [...data[IDNAME]]
      };

      for (let i = 0; i < this.channels.length; i++) {
        let currItem = this.channels[i]
        let {mark, visualAttr, dataAttr, refLayout, callback} = currItem
        let queryItem = toQueryItem(currItem)


        if (currItem.isGet) {
          let arr = data[queryItem.columns[0].renameAs]
          /**
           * If callback exists, then we run the callback function and assign the resulting array
           * from handlecallback to channels[visualAttr]
           */
          if (callback)
            arr = this.handleCallback(currItem, queryItem, data)

          /**
           * BUGGY
           */
          if (mark.level != this.level){
            if (visualAttr == "x1" 
              || visualAttr == "x2" 
              || visualAttr == "x"
              || visualAttr == "y1"
              || visualAttr == "y2"
              || visualAttr == "y") {
                let idcounter


                for (let [id, visualAttrSet] of this.idVisualAttrMap.entries()) {
                  if (visualAttrSet.has(visualAttr))
                    idcounter = id
                }

                let idcounterArr = data[`idcounter_${idcounter}`]

                for (let j = 0; j < idcounterArr.length; j++) {
                  let currOtherId = idcounterArr[j]
                  let othermark = mark
                  let othermarkInfoCache = mark.markInfoCache
                  let otherlevel = mark.level

                  while (othermark && (otherlevel > this.level)) {
                    let obj = othermarkInfoCache.get(currOtherId)

                    if (visualAttr == "x1" 
                      || visualAttr == "x2" 
                      || visualAttr == "x") {
                        arr = arr.map(elem => elem + obj.data_xoffset)
                      }
                    else if (visualAttr == "y1" 
                      || visualAttr == "y2" 
                      || visualAttr == "y") {
                        arr = arr.map(elem => elem + obj.data_yoffset)
                      }
                      othermark = othermark.outermark
                      othermarkInfoCache = othermark.markInfoCache
                    otherlevel--
                  }

                }
            }
          }

          channels[visualAttr] = arr
        }
        else if (refLayout) {
          /**
           * copy over from original version of mark.ts
           */
          for (const da of refLayout.dattrs) {
            channels[da] = data[da]
          }
          channels[visualAttr] = Array(data[IDNAME].length).fill(0); // dummy value
        } else {
          /**
           * If we fall to this else block, this is a normal mapping.
           * As such, dataAttr is an array of length 1 and we just get element at index 0
           * We check to see if the element in dataAttr is present in the data that was returned from the query
           * This is necessary because of numeric mappings like x: 0. Numeric mappings will not be included in the data
           * If the first element in dataAttr is present in the data, then we just assign it directly
           */
          if (Object.keys(data).includes(dataAttr[0])) {
            if (callback)
              channels[visualAttr] = this.handleCallback(currItem,queryItem, data)
            else
              channels[visualAttr] = data[dataAttr[0]]
          } else {
            /**
             * This runs in cases like x: 0, width: "5em"
             * As such we fill up channels[visualAttr] with that fixed value
             */
            channels[visualAttr] = Array(data[IDNAME].length).fill(dataAttr[0])
          }
        }
      }

      if ("strokeWidth" in channels) {
        let strokeWidths = channels["strokeWidth"]
        let minimumWidth = Math.min(...strokeWidths)
        let result = strokeWidths.map((width) => (width/minimumWidth) * 10)

        channels["strokeWidth"] = result
      }
      return channels;
    }

    /**
     * assume that all callback fns are mathematical
     * Called from applychannels
     * @param channelItem 
     *                has type RawChannelItem. This function uses callback and dataAttr in channelItem
     *                to run callback
     * @param data
     *                data refers to ALL results of the SQL query. 
     *                As such, this function must filter for the required data attributes to run callback on
     * @returns 
     */
    handleCallback(channelItem: RawChannelItem, queryItem: QueryItem, data) {
      let resArr = []
      let {mark, callback, dataAttr} = channelItem
      let {columns} = queryItem
      let src = mark == this ? this.src : mark.marktable
      let datalen = data[columns[0].renameAs].length

      /**
       * For the number of datapoints available
       *    pick the relevant data points from each inner array in args. 
       *    store these in currArgs.
       *    convert all arguments to floats because we assume the function is mathematical
       *    run the callback function on currArgs
       *    store the result of the callback function in res
       */
      for (let i = 0; i < datalen; i++) {
        let obj = {}
        columns.forEach((column) => {
          let attrIndex = src.schema.attrs.indexOf(column.dataAttr)

          if (attrIndex == -1)
            throw new Error(`Error in handleCallback: Could not find attribute ${column.dataAttr} in ${src.internalname}`)
  
          let attrType = src.schema.types[attrIndex]
  
          if (attrType == "num") {
            obj[column.dataAttr] = parseFloat(data[column.renameAs][i])
          } else {
            obj[column.dataAttr] = data[column.renameAs][i]
          }
        })
        console.log("obj", obj)
        resArr.push(callback(obj))
      }
      return resArr
    }

    /**
     * 
     * @param channels mapping from visual attributes to values. ie. {x: [...], y: [...], ...}
     * @param crow information about the bounding box for this mark
     * @param dummyroot dom element to attach nodes to while running layout algorithms
     * @returns updated channels after layout algorithms are complete
     * 
     * Is it possible to avoid calling observable in doLayout?
     * 
     * Look into mosaic and see how they do scales
     */
    doLayout(channels, crow, dummyroot) {
      if (Object.keys(this.layouts).length == 0) {
        return channels
      }

      const rls = R.values(this.layouts);
      console.log("rls", rls)
      let required = R.uniq(R.pluck("required", rls).flat())
      let res = this.makemark(channels, crow)
      let tmpMark = res.mark

      dummyroot.node().append(tmpMark)

      // run layouts
      let markrows = markdata(required, tmpMark, this.mark, channels);
      console.log("markrows", markrows)

      if (!R.all((a) => a in markrows, required)) {
        console.log("Missing required attr in markrows", required, R.keys(markrows))
      }
      for (const rl of rls) {
        const layout = rl.layout(markrows, crow)
        for (const va of rl.vattrs)  {
          channels[va] = { value: layout[va] }
          //this._scales[this.mark.alias2scale[va]] = { type: "identity" }
        }
      }
      return channels
    }

    /**
     * The actual function that creates marks using observable plot
     * @param data object with format {x: [...], y: [...], ...}
     * @param crow information about the bounding box
     * @param scales 
     * @returns
     * 
     * 
     */
    makemark(data, crow, scales?) {
      let mark = OPlot.plot( {
        ...R.pick(['width', 'height'], crow),
        ...(this.options),
        marks: [ 
          this.mark.klass(data[IDNAME], data)
        ],
        ...(this._scales)})
      
      if (this.marktype == "text" && ("textAnchor" in this.options)) {
        /**
         * check if this is a text mark and if the user specified textAnchor
         * If neither, this if block will not run
         */
        this.handleTextAnchor(mark, crow);
      } else if (this.marktype == "text") {
        /**
         * Check if this is a text mark and if x or y are created from get methods
         */
        for (let i = 0; i < this.channels.length; i++) {
          let currChannel = this.channels[i]
          if (currChannel.visualAttr == 'x' && currChannel.isGet) {
            this.setXTranslate(mark, data)
          } else if (currChannel.visualAttr == 'y' && currChannel.isGet) {
            this.setYTranslate(mark, data)
          }
        }
      } else if (this.marktype == "link" && ("curve" in this.options)) {
        this.setCurve(mark)
      } else if (this.marktype == "square") {
        this.setEqualWidthAndHeight(mark, data)
      }
      
      let markInfo = this.getMarkInfo(mark, data, crow)

       /**
        * we hide axes because each mark gets its own axis. 
        * we don't want overlapping axes because that makes it hard to read
        */
      this.hideAxes(mark)


      this.updateScales(mark)

      return {mark, markInfo};
    }

    setXTranslate(mark, data) {
      let thisref = this

      maybeselection(mark)
        .selectAll(`g[aria-label='${this.mark.aria}']`)
        .selectAll("*")
        .attr(`data_${IDNAME}`, (d,i) => data[IDNAME][i] )
        .each(function (d, i) {
          let el = d3.select(this);
          let elAttrs = el.node().attributes;

          /**
           * Get value of data__rav_id
           */
          let data_id;
          for (let j = 0; j < elAttrs.length; j++) {
            let attrName = elAttrs[j].name
            if (attrName == `data_${IDNAME}`) {
              data_id = parseInt(elAttrs[j].value)
              break
            }
          }

          /**
           * Get the corresponding xcoord for that data__rav_id
           */
          let idx = data[IDNAME].indexOf(data_id)
          let xcoord = data['x'][idx]

          for (let j = 0; j < elAttrs.length; j++) {
              let attrName = elAttrs[j].name;

              if (attrName == "transform") {
                let {x,y} = thisref.getTransformInfo(el)
                el.attr("transform", `translate(${xcoord}, ${y})`)
                break
              }
          }
      })
    }

     setYTranslate(mark, data) {

      let thisref = this

      maybeselection(mark)
        .selectAll(`g[aria-label='${this.mark.aria}']`)
        .selectAll("*")
        .attr(`data_${IDNAME}`, (d,i) => data[IDNAME][i] )
        .each(function (d, i) {
          let el = d3.select(this);
          let elAttrs = el.node().attributes;

          /**
           * Get value of data__rav_id
           */
          let data_id;
          for (let j = 0; j < elAttrs.length; j++) {
            let attrName = elAttrs[j].name
            if (attrName == `data_${IDNAME}`) {
              data_id = parseInt(elAttrs[j].value)
              break
            }
          }

          /**
           * Get the corresponding xcoord for that data__rav_id
           */
          let idx = data[IDNAME].indexOf(data_id)
          let ycoord = data['y'][idx]

          for (let j = 0; j < elAttrs.length; j++) {
              let attrName = elAttrs[j].name;
              
              if (attrName == "transform") {
                let {x,y} = thisref.getTransformInfo(el)
                el.attr("transform", `translate(${x}, ${ycoord})`)
                break
              }
          }
      })
    }

    setCurve(mark) {
      maybeselection(mark)
        .selectAll(`g[aria-label='${this.mark.aria}']`)
        .selectAll("*")
        .each(function (d, i) {
          let el = d3.select(this);
          let elAttrs = el.node().attributes;

          for (let j = 0; j < elAttrs.length; j++) {
              let attrName = elAttrs[j].name;
              let attrValue = elAttrs[j].value;

              if (attrName == "d") {
                const regex = /M([\d.]+),([\d.]+)L([\d.]+),([\d.]+)/
                const match = attrValue.match(regex)

                if (match) {
                  let x1 = parseFloat(match[1])
                  let y1 = parseFloat(match[2])
                  let x2 = parseFloat(match[3])
                  let y2 = parseFloat(match[4])

                  //let {p1x, p1y} = calculateQuadraticBezierControlPoint(x1, y1, x2, y2)
                  //let {p1x, p1y, p2x, p2y} = calculateCubicBezierControlPoints(x1, y1, x2, y2)
                  let {p1x, p1y, p2x, p2y} = curveFunction(x1, y1, x2, y2)


                  let curvedPath = `M${x1},${y1} C ${p1x},${p1y}, ${p2x},${p2y}, ${x2},${y2}`

                  el.attr("d", `${curvedPath}`)
                } else {
                  /**
                   * Should never end up here
                   */
                  throw new Error("Couldn't parse x1, y1, x2, y2 from a link?")
                }
              }
          }
      })
    }

    /**
     * Assumes thar you want to make a square mark
     * @param mark svg element
     * @param data {x: [...], y: [...]} <- data was passed to observable
     */
    setEqualWidthAndHeight(mark, data) {
      let width = null
      let height = null
      let x = null /**probably need to shift this somewhere else */
      let y = null /**probably need to shift this somewhere else */
      let defaultLen = 100

      if ("width" in data) {
        width = data.width[0]
      } else {
        width = defaultLen
      }

      if ("height" in data) {
        height = data.height[0]
      } else {
        height = defaultLen
      }

      if (("x" in this.mappings) && (typeof this.mappings.x === "number")) {
        x = this.mappings.x
      }

      if (("y" in this.mappings) && (typeof this.mappings.y === "number")) {
        y = this.mappings.y
      }

      if (width != height) {
        width = defaultLen
        height = defaultLen
      }


      let selection = maybeselection(mark)
        .selectAll(`g[aria-label="rect"]`)
        .selectAll("*")

      selection
        .attr("width", width)
        .attr("height", height)
      
      if (x !== null) {
        selection.attr("x", x)
      }

      if (y !== null) {
        selection.attr("y", y)
      }
    }

    /**
     * 
     * @param mark mark that was created in makemark
     * @param data has format {x: [...], y: [...], ...}
     * @param crow information about bounding box for mark
     * @returns an array of objects. each object has information about a single datapoint
     */
    getMarkInfo(mark, data, crow) {
      if (this.mark.marktype == "text") {
        return this.getMarkInfoFromText(mark, data, crow)
      } else {
        return this.getMarkInfoNormal(mark, data, crow)
      }      
    }

    /**
     * @param mark mark that was created in makemark
     * @param data has format {x: [...], y: [...], ...}
     * @param crow information about bounding box for mark
     * @returns an array of objects. each object has information about a single datapoint
     */
    getMarkInfoFromText(mark, data, crow) {
      let markInfo = []
      let thisref = this
      maybeselection(mark)
        .selectAll(`g[aria-label='${this.mark.aria}']`)
        .selectAll("*")
        .attr(`data_${IDNAME}`, (d,i) => data[IDNAME][i] )
        .attr(`data_xoffset`, crow.x)  // TODO: this will not work for recursively nested data
        .attr(`data_yoffset`, crow.y)
        .each(function (d, i) {
          let el = d3.select(this);
          let elAttrs = el.node().attributes;
          let markAttributes = {};
          let value = el.text()
          markAttributes["text"] = value

          for (let j = 0; j < elAttrs.length; j++) {
              let attrName = elAttrs[j].name;
              let attrValue = elAttrs[j].value;

              if (attrName == "y") {
                markAttributes["width"] = attrValue
              } else if (attrName == "transform") {
                let {x,y} = thisref.getTransformInfo(el)
                markAttributes["x"] = x
                markAttributes["y"] = y
              } else if (attrName == `data_${IDNAME}`) {
                markAttributes[IDNAME] = parseInt(attrValue);
              } else if (attrName == "font-size") {
                markAttributes["fontSize"] = attrValue
              } else
                markAttributes[attrName] = attrValue
          }
          markInfo.push(markAttributes)
      })
      return markInfo
    }

    /**
     * 
     * @param mark mark that was created in makemark
     * @param data has format {x: [...], y: [...], ...}
     * @param crow information about bounding box for mark
     * @returns an array of objects. each object has information about a single datapoint
     */
    getMarkInfoNormal(mark, data, crow) {
      let markInfo = []
      let marktype = this.marktype
      let thisref = this
      let ariaLabel = this.mark.aria == "square" ? "rect" : this.mark.aria
      
      maybeselection(mark)
        .selectAll(`g[aria-label='${ariaLabel}']`)
        .selectAll("*")
        .attr(`data_${IDNAME}`, (d,i) => data[IDNAME][i] )
        .attr(`data_xoffset`, crow.x)  // TODO: this will not work for recursively nested data
        .attr(`data_yoffset`, crow.y)
        .each(function (d, i) {
          let el = d3.select(this);
          let elAttrs = el.node().attributes;
          let markAttributes = {};

          for (let j = 0; j < elAttrs.length; j++) {
              let attrName = elAttrs[j].name;
              let attrValue = elAttrs[j].value;

              if (attrName == "transform")
                continue
              else if (attrName == `data_${IDNAME}`)
                markAttributes[IDNAME] = parseInt(attrValue);
              else if (attrName == "d" && marktype == "link") {
                let regex
                if ("curve" in thisref.options) {
                  regex = /M([-\d.]+),([-\d.]+)\s+C\s+([-\d.]+),([-\d.]+),\s+([-\d.]+),([-\d.]+),\s+([-\d.]+),([-\d.]+)/
                  //regex = /M([-\d.]+),([-\d.]+)\s+Q([-\d.]+),([-\d.]+)\s+([-\d.]+),([-\d.]+)/
                } else {
                  regex = /M([\d.]+),([\d.]+)L([\d.]+),([\d.]+)/
                }
                const match = attrValue.match(regex)

                if (match) {
                  let x1 = parseFloat(match[1])
                  let y1 = parseFloat(match[2])
                  let x2 = parseFloat(match[3])
                  let y2 = parseFloat(match[4])

                  markAttributes["x1"] = x1
                  markAttributes["x2"] = x2
                  markAttributes["y1"] = y1
                  markAttributes["y2"] = y2
                } else {
                  /**
                   * Should never end up here
                   */
                  throw new Error("Couldn't parse x1, y1, x2, y2 from a link?")
                }
              } else {
                attrName = attrName.replace(/-/g, "_")
                markAttributes[attrName] = attrValue;
              }
          }
          markInfo.push(markAttributes)
      })
      return markInfo
    }

    /**
     * This function hides axes by default because 
     * we make separate calls to observable plot, resulting in overlapping axes
     * @param mark 
     */
    hideAxes(mark) {
      let ytick = maybeselection(mark)
        .selectAll(`g[aria-label='y-axis tick']`)
        .style("visibility", "hidden");

      let ylabel = maybeselection(mark)
        .selectAll(`g[aria-label='y-axis tick label']`)
        .style("visibility", "hidden");

      let xtick = maybeselection(mark)
        .selectAll(`g[aria-label='x-axis tick']`)
        .style("visibility", "hidden");
      
      let xlabel = maybeselection(mark)
        .selectAll(`g[aria-label='x-axis tick label']`)
        .style("visibility", "hidden");
    }

    /**
     * This function parses the transform attribute.
     * transform attribute looks like translate(x,y) where x and y are floats
     * We need this for text mark
     * 
     * @param element Created from d3.select(...)
     * @returns 
     */
    getTransformInfo(element) {
      let elementTransform = element.attr("transform")
      let coords = elementTransform
                  .replace("translate(", "")
                  .replace(")","")
                  .split(",")
      let x = parseFloat(coords[0].trim())
      let y = parseFloat(coords[1].trim())

      return {x,y}
    }

    /**
     * 
     * @param child Created from d3.select(...)
     * @param parentX starting x coord for parent node
     * @param parentY starting y coord for parent node
     * @param parentWidth
     * @param parentHeight 
     * @param childX starting x coord for child node
     * @param childY starting y coord for child node
     */
    setTransform(child, parentX, parentY, parentWidth, parentHeight, childX, childY) {
      if (this.options.textAnchor == "left") {
        child.attr("transform", `translate(${parentX + 15}, ${childY})`)
      } else if (this.options.textAnchor == "right") {
        child.attr("transform", `translate(${parentX + parentWidth - 15}, ${childY})`) //should be parentX + width
      } else if (this.options.textAnchor == "bottom") {
        child.attr("transform", `translate(${childX}, ${parentY + parentHeight - 10})`)
      } else if (this.options.textAnchor == "top") {
        child.attr("transform", `translate(${childX}, ${parentY + 10})`)
      }
    }

    /**
     * This function is EXTREMELY SUSPECT. but its only used for text marks WITH textAnchor.
     * For some reason observable doesnt work when we specify textAnchor normally
     * so this function does manual adjustments to the x,y position of text marks
     * Currently very restricted use as it will only work for "left", "right", "top", "bottom" for textAnchor
     * @param mark the current mark that was created
     * @param crow the parent row, can be canvas or an outermark
     * @returns 
     */
    handleTextAnchor(mark, crow) {
      let thisref = this
      let parentX = crow.x;
      let parentY = crow.y; //keep in mind that (0,0) is top left!
      let parentWidth = crow.width;
      let parentHeight = crow.height;

      maybeselection(mark)
        .selectAll(`g[aria-label='${this.mark.aria}']`)
        .selectAll("*")
        .each(function (d, i) {
          let el = d3.select(this);
          let elAttrs = el.node().attributes;
          let foundTransformAttr = false

          for (let i  = 0; i < elAttrs.length; i++) {
            let attrName = elAttrs[i].name
            if (attrName == "transform") {
              foundTransformAttr = true
              break
            }
          }
          if (!foundTransformAttr)
            return

          let childInfo = thisref.getTransformInfo(el)
          let childX = childInfo.x
          let childY = childInfo.y
          thisref.setTransform(el, parentX, parentY, parentWidth, parentHeight, childX, childY)
        })
    }

    /**
     * This function runs if the user runs any scaling functions. If there are no scaling functions,
     * this.scalings_fns is empty and this function does nothing
     * @param mark the mark that was created in makemark
     * 
     * WHy are we copying the scale to some new object to use for rendering?
     * Why not just use the scale directly?
     */
    updateScales(mark) {
      for (let i = 0; i < this.scaling_fns.length; i++) {
        let curr_scaling_fn = this.scaling_fns[i]
        let va = curr_scaling_fn.va
        let scale = curr_scaling_fn.scale

        if (!scale.type) {
          let va_type = mark.scale(va)?.type
          scale.type = va_type
        }

        // this is the update we actually care about because range affects the position on screen
        if (!scale.range) {
          let va_range = mark.scale(va)?.range
          scale.range = va_range
        }
      }
    }

    prepareMarkInfo(markInfo) {
      for (let i = 0; i < markInfo.length; i++) {
        for (let [key,value] of Object.entries(markInfo[i])) {
          /**
           * Turn cx, x1 into x, cy, y1 into y etc.
           * We don't want to insert a cx column into the marktable
           * Eg.
           * because some other mark may want to get x attribute from this mark
           * and we want that other mark to find x attribute
           */
          if (key == "cx") {
            markInfo[i]["x"] = value
            key = "x"
            delete markInfo[i]["cx"]
          }

          if (key == "cy") {
            markInfo[i]["y"] = value
            key = "y"
            delete markInfo[i]["y"]
          }

          if (parseFloat(value) || key == "x" || key == "y" || key == "data_xoffset" || key == "data_yoffset") {
            let numValue = parseFloat(value)
            markInfo[i][key] = numValue
          }
        }
         /**
         * Populate markInfoCache here so that other marks can reference it if needed
         */

        let obj = {}
        let data_xoffset = markInfo[i]["data_xoffset"]
        let data_yoffset = markInfo[i]["data_yoffset"]

        if (this.marktype == "link") {
          let x1 = markInfo[i]["x1"]
          let x2 = markInfo[i]["x2"]
          let y1 = markInfo[i]["y1"]
          let y2 = markInfo[i]["y2"]

          obj = {x1, y1, x2, y2}
        } else {
          let x = markInfo[i]["x"]
          let y = markInfo[i]["y"]
          obj = {x,y}
        }

        if (this.marktype == "text") {
          obj["text"] = markInfo[i]["text"]
        }
        obj["data_xoffset"] = data_xoffset
        obj["data_yoffset"] = data_yoffset

        if (markInfo[i]["width"])
          obj["width"] = markInfo[i]["width"]

        if (markInfo[i]["height"])
          obj["height"] = markInfo[i]["height"]

        obj[IDNAME] = markInfo[i][IDNAME]
        this.markInfoCache.set(markInfo[i][IDNAME], obj)

        /**
         * Delete data_xoffset and data_yoffset as they do not need to be stored in database
         */
        delete markInfo[i]["data_xoffset"]
        delete markInfo[i]["data_yoffset"]
      }
    }

    /**
     * 
     * @param markInfo array of objects. each object describes a single datapoint 
     *                 and corresponds to a single row to insert into the marktable
     * @returns 
     */
    async createMarkTable(markInfo) {
      const tname = this.src.internalname + "_marktable" + this.id;

      await this.createNewMarkTable(markInfo, tname)

      let tuples = this.valuesFromMarkInfo(markInfo).map((row) => `(${row.join(", ")})`).join(", ")

      await this.c.db.conn.exec(`INSERT INTO ${tname} VALUES ${tuples}`)
    }

    /**
     * 
     * @param markInfo 
     * @param tname 
     */
    async createNewMarkTable(markInfo, tname) {
      let columnNames = []

      for (let [k,v] of Object.entries(markInfo[0])) {
        if (k == IDNAME) {
          columnNames.push(`${k} int primary key`)
        } else {

          if (isNaN(Number(v))) {
            columnNames.push(`${k} string`)
          } else {
            columnNames.push(`${k} float`)
          }
        }
      }
      let q = `(${columnNames.join(", ")})`
      let marktable = await this.c.db.createTable(q, tname)

      marktable.keys(IDNAME)
      let fkConstraint = new FKConstraint({t1: marktable, X: [IDNAME], t2: this.src, Y: [IDNAME]})
      this.c.db.addConstraint(fkConstraint)
      this.marktable = marktable
    }

    /**
     * Preparing markinfo to put inside marktable
     * @param markInfo 
     * @returns 2D array, where each array corresponds to a row in marktable
     */
    valuesFromMarkInfo(markInfo) {
      let values = []
      for (const obj of markInfo) {
        let rowValues = []
        for (const [k,v] of Object.entries(obj)) {
            if (k == IDNAME) {
              rowValues.push(parseInt(obj[k]));
            } else {
              if (isNaN(Number(v))) { //ie string
                rowValues.push(`'${v}'`)
              } else {
                rowValues.push(parseFloat(obj[k]));
              }
            }
        }
        values.push(rowValues);
      }
      return values
    }

    pickupReferences(rows) {
      for (let i = 0; i < this.channels.length; i++) {
        let {mark, visualAttr, isGet} = this.channels[i]

        if (isGet) {
          let ref = `${visualAttr}_ref`
          /**
           * Currently operate under assumption that x1,y1,x2,y2 always involve a call to get
           */
          for (let i = 0; i < rows.length; i++) {
            if (this.referencedMarks.has(rows[i][IDNAME])) {
              let obj = this.referencedMarks.get(rows[i][IDNAME])
              obj[ref] = rows[i][ref]
            } else {
              this.referencedMarks.set(rows[i][IDNAME], {[ref]: rows[i][ref]})
            }
          }
        }
      }
    }


    /**
     * data has format [{}, {}, {}], where each object represents attributes for a single row.
     * we need to transpose it before giving it to applychannels
     * @param data 
     * @returns 
     */
    rowsToCols(data) {
      if (data.length == 0) { //check if no data has been returned and set up an empty res object to return. This is for applychannels to work properly
        let res = {}

        for (let i = 0; i < data.columns.length; i++) {
          res[data.columns[i]] = []
        }
        return res
      }

      let res = {}
      let obj = data[0]

      for (let [k,v] of Object.entries(data[0])) {
        res[k] = []
      }

      //put values in respective arrays
      for (let i = 0; i < data.length; i++) {
        for (let [k,v] of Object.entries(data[i])) {
          res[k].push(v)
        }
      }
      return res
    }

    /**
     * crow returns an {width, height, x, y} as arrays so we just pull them out
     * @param crow 
     * @returns 
     */
    handleCrow(crow) {
      let res = {}
      for (let [k,v] of Object.entries(crow)) {
        if (Array.isArray(v)) {
          res[k] = v[0] //can assume is just one value because crow is {width, height, x, y}
        } else {
          res[k] = v
        }
      }
      return res
    }
}

function curveFunction(
  x1: number, y1: number, 
  x2: number, y2: number, 
) {
  let p1x = x1+(x2-x1)/2
  let p2x = p1x
  let p1y = y1
  let p2y = y2

  return {p1x, p1y, p2x, p2y}
}

function calculateCubicBezierControlPoints(
  x1: number, y1: number, 
  x2: number, y2: number, 
  offsetFactor: number = 1
): { p1x: number, p1y: number, p2x: number, p2y: number } {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const dx = x2 - x1;
  const dy = y2 - y1;

  const perpendicularDx = -dy;
  const perpendicularDy = dx;

  const length = Math.sqrt(perpendicularDx * perpendicularDx + perpendicularDy * perpendicularDy);
  const normalizedPerpendicularDx = perpendicularDx / length;
  const normalizedPerpendicularDy = perpendicularDy / length;

  const p1x = midX + offsetFactor * 2 * normalizedPerpendicularDx;
  const p1y = midY + offsetFactor * 2 * normalizedPerpendicularDy;


  const p2x = midX + offsetFactor * 2 * -normalizedPerpendicularDx;
  const p2y = midY + offsetFactor * 2 * -normalizedPerpendicularDy;

  return { p1x, p1y, p2x, p2y };
}

function calculateQuadraticBezierControlPoint(
  x1: number, y1: number, 
  x2: number, y2: number, 
  offsetFactor: number = 0.7
): { p1x: number, p1y: number } {
  // Calculate the midpoint between x1, y1 and x2, y2
  const dx = x2 - x1;
  const dy = y2 - y1;

  // Calculate a perpendicular direction (rotate by 90 degrees)
  const perpendicularDx = -dy;
  const perpendicularDy = dx;

  // Normalize this perpendicular vector
  const length = Math.sqrt(perpendicularDx * perpendicularDx + perpendicularDy * perpendicularDy);
  const normPerpendicularDx = perpendicularDx / length;
  const normPerpendicularDy = perpendicularDy / length;

  // Place the control point off-center by offsetFactor
  const midpointX = (x1 + x2) / 2;
  const midpointY = (y1 + y2) / 2;

  // Apply the perpendicular offset
  const p1x = midpointX + offsetFactor * normPerpendicularDx;
  const p1y = midpointY + offsetFactor * normPerpendicularDy;

  return { p1x, p1y };
}
