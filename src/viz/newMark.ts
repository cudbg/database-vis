import * as R from "ramda";
import { creator, select } from "d3";
import * as d3 from "d3";
import { Query, sql, agg, and, eq, neq, lt, gt, lte, gte, column, literal, count, median, min, max } from "@uwdata/mosaic-sql";
import * as OPlot from "@observablehq/plot";

import { IDNAME, Table, createView } from "./table";
import { idexpr } from "./id";
import { Cardinality, FKConstraint } from "./constraint";
import type {  Canvas } from "./canvas";
import type {Schema} from "./schema";
import { MarkNest, RootNest, type Nest } from "./nest";
import { markof, RefColumn, RefLayout, RefMark, RLFD } from "./ref";
import { inferScale, Linear, Ordinal, Sqrt } from "./scale"
import { oplotUtils } from "./plotUtils/oplotUtils";
import { rowof, markdata, applycolfilter, markels, filtercoldata, maybeselection } from "./markUtils"
import { Scale, ScaleObject } from "./newScale";
import { HOOK_PLACE } from "./task_graph/task_graph";
import { mgg } from "./uapi/mgg";


/**
 * Used in QueryItem
 * dataAttr represents the column in a table
 * renameAs represents the name we want to select dataAttr as
 * ie. SELECT "a" as "x1", where a is dataAttr and x1 is renameAs
 */
interface ColumnObj {
  dataAttr: string
  renameAs: string
  table: Table
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
  constraint: FKConstraint | FKConstraint[] /* will be null if there are no clauses ie. normal mapping like x: "a" */
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
  isVisualChannel: boolean
  isConstant: boolean
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

  constraint: FKConstraint | FKConstraint[]
  isConstant: boolean
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
  if (item.isGet && item.isVisualChannel) {
      source = item.mark.marktable //If this is a get method, we select from the marktable instead of src
  } else if (item.isGet) {
    source = item.src
  } else {
    source = item.mark.src
  }
  if (item.isGet && item.refLayout) {
    item.dataAttr.forEach((attr) => {
      columns.push({dataAttr: attr, renameAs: `${attr}`, table: source})
    })
  } else if (item.isGet) {
    if (item.dataAttr.length > 1) {
      item.dataAttr.forEach((attr) => {
        //renameAs is this really long string because we need to differentiate between attributes with the same name in the query
        //Example: x1: [x, width], x2: [x, height]. We need to differentiate between the x used for x1 and x used for x2
        columns.push({dataAttr: attr, renameAs: `${attr}_${item.visualAttr}`, table: source})
      })
    } else {
      //Check if this is an aggregate column
      if (!source.schema.attrs.includes(item.dataAttr[0])) {
        let aggregateIndex = mgg.AggregateOperators.indexOf(item.dataAttr[0])
        if (aggregateIndex == -1)
          throw new Error(`${item.dataAttr} does not exist in table ${source.internalname}`)
        columns.push({dataAttr: String(item.dataAttr[0]), renameAs: item.dataAttr[0], table: source})
      } else if (!item.callback) {
        columns.push({dataAttr: String(item.dataAttr[0]), renameAs: `${item.visualAttr}`, table: source})
      } else {
        //that string in renameAs is there because we need to differentiate between different columns. See comment above
        columns.push({dataAttr: String(item.dataAttr[0]), renameAs: `${item.dataAttr[0]}_${item.visualAttr}`, table: source})
      }
    }
  } else {
    source.schema.attrs.forEach((attr) => {
      columns.push({dataAttr: attr, renameAs: attr, table: source})
    })
  }
  return {srcmark: item.mark, source: source, columns: columns, constraint: item.constraint, isConstant: item.isConstant}

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

    /**
     * row id of this mark to {x1: id of some other mark, x2: id of some other mark, etc.}
     * You can replace x1, y1, (ie. visual attributes) with foreign data attributes
     * yes, we are eating a lot of memory here
     */
    referencedMarks: Map<number, {}>;
    pathAttrMap: Map<number, string[]>;

    /**
     * Some filters to append onto the end of the SQL query when trying to get data
     */
    filters: any[]
    ordering: string[]
    orderByDesc: boolean

    
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
        this.marktable = null
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
        this.referencedMarks = new Map<number, {}>()
        this.pathAttrMap = new Map<number, string[]>()
        this.filters = []
        this.ordering = []
        this.orderByDesc = false

        this.c.taskGraph.addMark(this)
        this.init()
    }

    init() {
      /**
       * Loop through all the key value pairs in this.mappings.
       * All keys are visual channels (eg. x, y, fill etc.)
       * For any key, the value can be any of the following cases:
       *    1. A string to represent a data attribute (eg. x: "a")
       *    2. A foreign attribute. For this case, the value is an object returned by the get method
       *    3. A scale object. Take for example x: sa("a"), where sa is a scaling function.
       *       sa("a") indicates we want to scale the data attribute "a" and it returns a scale object.
       *    4. Some layout algorithm. ...grid("a", 2) indicates we want to create a grid based 
       *       on the data attribute "a" with 2 columns. ...grid("a",2) returns an object
       *    5. An object that looks like this: {cols: "a", func: <some typescript function>}. This object indicates that
       *       we want to run some function over "a"data attribute.
       * 
       * We need to handle all these different cases and convert each key,value mapping into a RawChannelItem so that
       * there is a common interface to all of them
       */
      for (const [va,dattr] of Object.entries(this.mappings)) {
          let mark = this
          let visualAttr = va
          let constraint = null
          let dataAttr = [dattr]
          let isGet = false
          let refLayout = null
          let callback = null
          let src = this.src
          let isVisualChannel = false
          let isConstant = false

          let rawChannelItem: RawChannelItem = {mark, src, visualAttr, constraint, dataAttr, isGet, refLayout, callback, isVisualChannel, isConstant}

          if (dattr instanceof RefLayout) {
              //Need to handle special case of RLFD where we need to get a foreign key path
              //For RLFD, dattr is the output of a get function called on another table
              if (dattr instanceof RLFD) {
                //Cast it to the type of object returned by get()
                let getResult = dattr.genericBag as {othertable: Table, searchkeys: string[], otherAttr: string[], callback: Function | null, isVisualChannel: boolean}
                let edgetable = getResult.othertable
                let filter = getResult.searchkeys
                dattr.setNodeType(this.mark.aria)

                //Find 2 paths
                for (const [constraintName, constraint] of Object.entries(this.c.db.constraints)) {
                  if (!(constraint instanceof FKConstraint))
                    continue
                  let validFkConstraint = this.checkValidFkConstraint(constraint, filter)

                  if (validFkConstraint) {
                    let paths = this.c.db.getTwoPaths(this.src, edgetable, constraint)

                    if (!paths)
                      throw new Error("Can't find two paths!")

                    if (va == "left") {
                      rawChannelItem.dataAttr = getResult.otherAttr
                      rawChannelItem.constraint = paths[0]
                    } else {
                      rawChannelItem.dataAttr = getResult.otherAttr
                      rawChannelItem.constraint = paths[1]
                    }
                    //Need to update data in rawChannelItem
                    rawChannelItem.isGet == true
                    rawChannelItem.refLayout = dattr
                    rawChannelItem.src = edgetable
                    //Found path, break out of for loop
                    break
                  }
                }
                rawChannelItem.isGet = true
                rawChannelItem.src = edgetable
                this.addLayout(dattr)

              } else {
                dattr.add(va);
                this.addLayout(dattr);
  
                rawChannelItem.dataAttr = dattr.dattrs
                rawChannelItem.refLayout = dattr
              }
          }
          else if (dattr instanceof Object && (('othermark' in dattr) || ('othertable' in dattr))) { //there's a call to get
            let {othermark, othertable, constraint, otherattr, callback, isVisualChannel} = this.processGet(dattr)

            if ('othermark' in dattr) {
              this.c.registerRefMark(othermark, this)
              this.c.taskGraph.addDependency(this, othermark, true)
              rawChannelItem.mark = othermark
            }
            else
              rawChannelItem.src = othertable

            rawChannelItem.constraint = constraint
            rawChannelItem.dataAttr = otherattr
            rawChannelItem.callback = callback
            rawChannelItem.isGet = true
            rawChannelItem.isVisualChannel = isVisualChannel

            if (isVisualChannel
                && (this.mark.aria == "dot"
                || this.mark.aria == "point"
                || this.mark.aria == "line"
                || this.mark.aria == "link"
                || this.mark.aria == "text"
                || this.mark.aria == "arrow")
            ) {
              /**
               * Currently hard coding scales, need to fix!!!!!!
               */
              if (va == "x1" || va == "x2" || va == "x")
                this._scales.x =  {type: "identity"}
              else if (va == "y1" || va == "y2" || va == "y")
                this._scales.y = {type: "identity"}
            }
          }
          else if (dattr instanceof ScaleObject) {
              this.setScaleForVA(va, dattr)

              rawChannelItem.dataAttr = [dattr.col] // we scale a single column at a time, so this is ok

              if (dattr.scale.callback)
                rawChannelItem.callback = dattr.scale.callback
          } else if (typeof dattr === "function") {
            rawChannelItem.callback = dattr
          } else {
            if (dattr instanceof Object && "constant" in dattr) {
              rawChannelItem.dataAttr = [dattr.constant]
            }
            rawChannelItem.isConstant = true
          }
          this.channels.push(rawChannelItem)
      }
    }

    filter(sqlExpr: string);
    filter(simpleExpr: {operator: string; col: string, value: string|number});
    filter(arg1: {operator: string; col: string, value: string|number} | string) {
      if (typeof(arg1) == "string") {
        this.filters.push(arg1)
      } else {
        this.filterSimpleExpr(arg1)
      }
    }
    /**
     * Use this function to filter over a column in the source table of this mark
     * This function will append a WHERE clause to the query constructed in constructQuery()
     * @param
     */
    filterSimpleExpr({operator, col, value}: {operator: string; col: string, value: string|number}) {
      if (!(Object.values(mgg.FilterOperators).includes(operator))) {
        throw new Error(`Unsupported operator: ${operator}`)
      }

      if (!this.src.schema.attrs.includes(col)) {
        throw new Error(`Cannot filter on ${col} as it is not in ${this.src.internalname}`)
      }

      switch (operator) {
        case mgg.FilterOperators.EQUAL:
          this.filters.push(eq(column(this.src.internalname, col), literal(value)))
          break
        case mgg.FilterOperators.GREATER_EQUAL:
          this.filters.push(gte(column(this.src.internalname, col), literal(value)))
          break
        case mgg.FilterOperators.GREATER_THAN:
          this.filters.push(gt(column(this.src.internalname, col), literal(value)))
          break
        case mgg.FilterOperators.LESS_EQUAL:
          this.filters.push(lte(column(this.src.internalname, col), literal(value)))
          break
        case mgg.FilterOperators.LESS_THAN:
          this.filters.push(lt(column(this.src.internalname, col), literal(value)))
          break
        case mgg.FilterOperators.NOT_EQUALS:
          this.filters.push(neq(column(this.src.internalname, col), literal(value)))
          break
      }
    }

    /**
     * Use this function to order output rows according to some data attribute
     * This function will append an ORDER BY clause to the query constructed in constructQuery()
     * @param
     */
    orderBy(cols: string | string[], desc: boolean = false) {
      cols = Array.isArray(cols) ? cols : [cols]
      cols.forEach((col) => this.ordering.push(col))

      if (desc) this.orderByDesc = true
    }

    getHelper(filter: string | string[] | null = null, props: string | string[], callback?): {othermark, searchkeys, otherAttr, callback, isVisualChannel} {
      if (filter)
        filter = Array.isArray(filter) ? filter : [filter]

      props = Array.isArray(props) ? props : [props]
  

      if (props.every(attr => Object.keys(this.mappings).includes(attr)))
        return {othermark: this, searchkeys: filter, otherAttr: props, callback: callback, isVisualChannel: true}
      

      if (props.every((attr) => this.src.schema.attrs.includes(attr)))
        return {othermark: this, searchkeys: filter, otherAttr: props, callback: callback, isVisualChannel: true}

      if (props.every(attr => this.mark.domprops.includes(attr)))
        return {othermark: this, searchkeys: filter, otherAttr: props, callback: callback, isVisualChannel: true}

      //props is not mapped, not a column in this.src, and not a domprop, throw an Error
      throw new Error(`Give me valid columns to get!`)

    }

    get(filter: string | string[] | null, sugar: Record<string, string>): {[key: string]: {othermark, searchkeys, otherAttr, callback, isVisualChannel}};
    get(filter: string | string[] | null, props: string | string[], callback?): {othermark, searchkeys, otherAttr, callback, isVisualChannel};
    /**
     * For getting cols that have a valid fk path. valid fk paths are checked during render
     * @param arg1
     *                Attributes to filter by, or your foreign key reference
     *                Data attributes in the referring table.
     *                ie. For example VB = c.dot(vb_src, {x: VA.get("aid", ["x"]) ...})
     *                aid is an attribute in vb_src.
     *                Checking if aid is a N-1 foreign key from vb_src to va_src occurs only in processGet 
     * @param arg2
     *                Properties to get from this mark you are referring to.
     *                Can be either visual attributes and data attributes
     * @param callback 
     *                A callback function that is run over usrVattr during render
     */
    get(
      arg1: string | string[] | null = null,
      arg2: Record<string, string> | string | string[], 
      arg3?: any): {othermark, searchkeys, otherAttr, callback, isVisualChannel} | {[key: string] : {othermark, searchkeys, otherAttr, callback, isVisualChannel}} {
      
        if (Array.isArray(arg2) || typeof(arg2) == "string") {
          return this.getHelper(arg1, arg2, arg3)
        } else {
          let res: {[key: string] : {othermark, searchkeys, otherAttr, callback, isVisualChannel}} = {}
          for (const [vattr, prop] of Object.entries(arg2)) {
            res[vattr] = this.getHelper(arg1, prop)
          }
          return res
        }
    }

    nest(innermark: Mark, predicate?) {
      this.c.nest(innermark, this, predicate)
    }

    eqSearchKey(searchKey1: string[], searchKey2: string[]) {
      if (searchKey1.length != searchKey2.length)
        return false

      let tmp1 = [...searchKey1].sort()
      let tmp2 = [...searchKey2].sort()

      return tmp1.every((value, index) => value === tmp2[index])
    }


    checkValidFkConstraint(c: FKConstraint, currSearchkey: string[] | null = null) {
      if ((c.card != Cardinality.ONEMANY) && (c.card != Cardinality.ONEONE))
        return false

      if (c.t1 == this.src) {
        return !currSearchkey || R.intersection(c.X, currSearchkey).length == currSearchkey.length
      } else if (c.t2 == this.src) {
        return !currSearchkey || R.intersection(c.Y, currSearchkey).length == currSearchkey.length
      }
      return false
    }

    /**
     * Called in the init method for handling a call to get method
     * @param getObj the object that was created from a get method 
     */

    processGet(getObj): {othermark, othertable, constraint, otherattr, callback, isVisualChannel}{
      let othermark = getObj.othermark
      let othertable = getObj.othertable
      let othersrc = !othermark ? othertable : othermark.src
      let searchkeys = getObj.searchkeys
      let otherattr = getObj.otherAttr
      let callback = getObj.callback
      let isVisualChannel = getObj.isVisualChannel

      /**
       * If both marks share the same source table, then skip checking and create a new FKConstraint
       */
      if (othersrc == this.src) {
        if (searchkeys) {
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

            if (!R.intersection(constraint.X, searchkeys).length == searchkeys.length)
              continue

            if (!R.intersection(constraint.Y, searchkeys).length == searchkeys.length)
              continue

            return {othermark, othertable, constraint, otherattr, callback, isVisualChannel}
          }
        }

        searchkeys ??= [IDNAME]
        for (let c of Object.values(this.c.db.constraints)) {
          if (!(c instanceof FKConstraint))
            continue

          if ((c.t1 != this.src) || (c.t2 != this.src))
            continue
          
          if ((c.X.length != 1) || (c.Y.length != 1))
            continue

          if (c.X[0] != IDNAME)
            continue
          if (c.Y[0] != IDNAME)
            continue

          return {othermark, othertable, constraint: c, otherattr, callback, isVisualChannel}
        }

        let constraint = new FKConstraint({t1: this.src, X: searchkeys, t2: this.src, Y: searchkeys})

        this.c.db.addConstraint(constraint)
        
        return {othermark, othertable, constraint, otherattr, callback, isVisualChannel}
      }

      for (const [constraintName, constraint] of Object.entries(this.c.db.constraints)) {
        if (!(constraint instanceof FKConstraint))
          continue
        /**
         * Check if there is a valid foreign key reference from this.src to othermark.src for the given searchkey
         * In this current state, it must be a direct N-1 foreign key reference ie. from table A to table B.
         * Indirect foreign key references such as from A to C, given a valid foreign key path A to B to C, would throw an error!
         */
        let validFkConstraint = this.checkValidFkConstraint(constraint, searchkeys)


        if (validFkConstraint) {
          /**
           * We only check if there is a valid path from this.src to othermark.src but we don't append the path at this point
           * because we are missing the final edge from othermark.src to othermark.marktable because rendering has not occurred at this stage
           * 
           * We theoretically could create the path right here but I feel it would become messy
           * As such, We only create the path in constructQuery
           */
          let path = this.c.db.getFKPath(this.src, othersrc, constraint)
          if (!path)
            continue

          path.forEach(edge => {
            this.c.tablesUsed.add(edge.t1.internalname)
            this.c.tablesUsed.add(edge.t2.internalname)
          })

          return {othermark, othertable, constraint, otherattr, callback, isVisualChannel}
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
      let domainType = scale.domainType
      let attrIndex = this.src.schema.attrs.indexOf(scaleObj.col)
      let attrType = this.src.schema.types[attrIndex]

      if (domainType) {


        if (attrType != domainType) {
          throw new Error(`Type of ${scaleObj.col} is ${attrType}, does not match scale domain type of ${domainType}`)
        }
      } else {
        scale.domainType = attrType
      }

      this._scales[va] = {}
      if (type) {
        this._scales[va] = {type: type}
      }
      if (range) {
        this._scales[va] = {...this._scales[va], range: range}
      }

      

      
      this.scaling_fns.push({va: va, scale: scaleObj.scale})
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
      /**
       * If this mark is nested within some other mark, outer is a MarkNest object
       * Pass outer to constructQuery so that we can get data about the outermark 
       * such as the id of the outermark for each row in the source table of this mark
       */
      let query
      if (isNested)
        query = this.constructQuery(outer)
      else
        query = this.constructQuery()
      return query
    }

    runLayoutTask(rows, outer, dummyroot, isNested) {
      /**
       * If this mark is nested, then we need to partition the output of the query
       * according to the corresponding id of the outermark
       * 
       * Eg. Given 3 outer rectangles with ids 0, 1, 2 and that this mark is a dot mark,
       * we want to nest the dots within the rectangles. We need loop from i = 0 to i = 2,
       * for each iteration, pick out the rows that outermark.id = i
       * 
       * We then call applychannels and doLayout for each iteration
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

        //Need to extract link information in case of fdlayout call
        rows = this.handleFdLayoutData(rows)
        let cols = this.rowsToCols(rows)
        let channels = this.applychannels(cols)
  
        channels = this.doLayout(channels, outer, dummyroot)
  
        return channels
      }
    }

    runRenderTask(root, channels, crow, isNested) {
      /**
       * This is where we render the marks and get information from them
       * This function appends the newly created mark onto the HTML display and returns information about mark as markInfo
      */
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

          
          if (this.mark.aria == "text") {
            //Only after appending the text element can we get the BBox
            maybeselection(mark)
            .selectAll(`g[aria-label='${this.mark.aria}']`)
            .selectAll("*")
            .each(function (d, i) {
              let el = d3.select(this);
              let bbox = el.node().getBBox()
              let id = el.attr(`data_${IDNAME}`)
              
              let row = markInfo.find(info => info[IDNAME] == id)
              row["width"] = bbox.width
              row["height"] = bbox.height
            })
          }

          markInfoArr.push(...markInfo)
          
        }
        return markInfoArr

      } else {    
        let {mark, markInfo} = this.makemark(channels, crow)
        // select(root)

        root
          .append("g")
          .attr("transform", `translate(${crow.x}, ${crow.y})`)
          .node().appendChild(mark);

          if (this.mark.aria == "text") {
            //Only after appending the text element can we get the BBox
            maybeselection(mark)
            .selectAll(`g[aria-label='${this.mark.aria}']`)
            .selectAll("*")
            .each(function (d, i) {
              let el = d3.select(this);
              let bbox = el.node().getBBox()
              let id = el.attr(`data_${IDNAME}`)
              markInfo[id]["width"] = bbox.width
              markInfo[id]["height"] = bbox.height
            })
          }

        return markInfo
      }        
    }

    async runCleanupTask(root, dummyroot, markInfo) {
      /**
       * This function takes the markInfo from runRenderTask.
       * It prepares markInfo for insertion into the database (and then creates a marktable and isnerts it)
       */
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
      /**
       * Construct all foreign key paths and for each path, store a set of ColumnObjs
       * Each foreign key path and its set of columnObjs will be used to create a subquery
       * Each subquery must select the _rav_id column of this.src
       * Join all subqueries together on the _rav_id column
       */
      let foreignkeyPaths = new Map<FKConstraint[], Set<ColumnObj>>()
      let queryItems = this.channels.map((rawChannelItem) => toQueryItem(rawChannelItem))
      let fdlayoutPaths: FKConstraint[][] = []

      //Loop to create foreign key paths
      for (let i = 0; i < queryItems.length; i++) {
        let {source, columns, constraint, isConstant} = queryItems[i]

        // We are not concerned with query items that are not foreign attributes
        // Only query items with a constraint are foreign attributes
        if (!constraint)
          continue

        let possibleNewPath = null

        if (!Array.isArray(constraint))
          possibleNewPath = this.c.db.getFKPath(this.src, source, constraint, true)
        else {
          possibleNewPath = constraint
          fdlayoutPaths.push(constraint)
        }

        if (!possibleNewPath)
          throw new Error("No possible path")

        let path = null

        //Check if possibleNewPath is already in foreignkeyPaths
        for (let p of foreignkeyPaths.keys()) {
          if (eqPath(possibleNewPath, p)) {
            path = p
            break
          }
        }

        //Store columns in foreign key paths
        if (!path) {
          path = possibleNewPath
          foreignkeyPaths.set(path, new Set(columns))
        }
        columns.forEach((column) => foreignkeyPaths.get(path).add(column))          
      }


      if (nest) {
        let possibleNewPath = this.c.db.getFKPath(this.src, nest.outerMark.marktable, nest.fk)

        if (!possibleNewPath)
          throw new Error("No possible path")

        let path = null

        for (let p of foreignkeyPaths.keys()) {
          if (eqPath(possibleNewPath, p)) {
            path = p
            break
          }
        }

        if (!path) {
          path = possibleNewPath
          foreignkeyPaths.set(path, new Set())
        }
        //For the nesting path, we select only the id of this.src, and id of outermark
        foreignkeyPaths.get(path).add({dataAttr: IDNAME, renameAs: IDNAME, table: this.src})
        foreignkeyPaths.get(path).add({dataAttr: IDNAME, renameAs: `${IDNAME}_parent`, table: nest.outerMark.marktable})
      }

      /**
       * Actually construct the query here
       * For each foreign key path, create a new subquery and select the relevant columns
       * Create an additional base subquery that selects all columns in this.src
       */

      let resultQuery = new Query()
      let pathCounter = 0 //to differentiate WITH subqueries 

      for (let [path, columns] of foreignkeyPaths.entries()) {
        if (fdlayoutPaths.includes(path))
          continue

        let subquery = new Query()
        subquery = subquery.distinct()
        this.pathAttrMap.set(pathCounter, [])
        let addedTables = new Set()
        let srcTableAlias = null
        let isAggregate = false
        
        for (let p of path) {
          let {t1, t2, X, Y} = p
          //Need to handle multiple copies of this.src in the query
          //For now assume, that there is at most 2 copies in a single subquery
          //Also assume that the constraint with multiple copies is the very first constraint along the path
          if (t1.internalname == t2.internalname) {
            subquery = subquery.from(t1.internalname)
            subquery = subquery.from({[`${t1.internalname}_1`]: t1.internalname})
            addedTables.add(t1.internalname)
            addedTables.add(`${t1.internalname}_1`)
            srcTableAlias = `${t1.internalname}_1`

            //This creates the where clauses to join on
            for (let i = 0; i < X.length; i++) {
              subquery = subquery.where(eq(column(t1.internalname, X[i]), column(srcTableAlias, Y[i])))
            }

          } else if (srcTableAlias && (t1.internalname == this.src.internalname || t2.internalname == this.src.internalname)) {
            //check if t1 and t2 have been added to the subquery
            //This is guranteed to be the second edge, where the copy of this.src could be used
            let leftName = t1.internalname == this.src.internalname ? srcTableAlias : t1.internalname
            let  rightName = t2.internalname == this.src.internalname ? srcTableAlias : t2.internalname

            if (!addedTables.has(leftName)) {
              subquery = subquery.from(leftName)
              addedTables.add(leftName)
            }
            if (!addedTables.has(rightName)) {
              subquery = subquery.from(rightName)
              addedTables.add(rightName)
            }

            for (let i = 0; i < X.length; i++) {
              subquery = subquery.where(eq(column(leftName, X[i]), column(rightName, Y[i])))
            }

          } else {
            if (!addedTables.has(t1.internalname)) {
              subquery = subquery.from(t1.internalname)
              addedTables.add(t1.internalname)
            }
            if (!addedTables.has(t2.internalname)) {
              subquery = subquery.from(t2.internalname)
              addedTables.add(t2.internalname)
            }

            for (let i = 0; i < X.length; i++) {
              subquery = subquery.where(eq(column(t1.internalname, X[i]), column(t2.internalname, Y[i])))
            }
          }
        }
        
        let selectedCols = new Set<string>()
        columns.forEach(c => {
          //Need to double check if we are selecting from the copy of this.src
          let tname = c.table.internalname == this.src.internalname && srcTableAlias ? srcTableAlias : c.table.internalname
          //Check if this data attr is an aggregate
          if (c.table.schema.attrs.indexOf(c.dataAttr) == -1) {
            let aggregateIndex = mgg.AggregateOperators.indexOf(c.dataAttr)

            //If we can't find this column anywhere, we stop immediately
            if (aggregateIndex == -1)
            throw new Error(`Column ${c.dataAttr} does not exist in ${c.table.internalname}!`)
            
            isAggregate = true

            //We should add more aggregates in the future
            //Only count has been tested
            switch (c.dataAttr) {
              case "count": subquery.select({"count": count()})
                            selectedCols.add("count")
                            this.pathAttrMap.get(pathCounter).push("count")
                            break
              case "max": subquery.select({"max": max()})
                            selectedCols.add("max")
                            this.pathAttrMap.get(pathCounter).push("max")
                            break
              case "min": subquery.select({"min": min()})
                            selectedCols.add("min")
                            this.pathAttrMap.get(pathCounter).push("min")
                            break
              case "median": subquery.select({"median": median()})
                            selectedCols.add("median")
                            this.pathAttrMap.get(pathCounter).push("median")
                            break
            }

          } else {
            subquery = subquery.select({[c.renameAs]: column(tname, c.dataAttr)})
            selectedCols.add(c.dataAttr)
            this.pathAttrMap.get(pathCounter).push(c.renameAs)
          }
        })
        

        let lastTable = path[path.length - 1].t1

        //Last table might be the copy of this.src
        if (lastTable.internalname == this.src.internalname) {

            //This is a corner case where there is only one edge in the path
            // and the last table is the N side of the foreign key constraint
            //We hit this corner case when we want to run aggregates over another table
            //This must mean that the edge is 1-N and last table is the N side
            lastTable = path[path.length - 1].t2
        }

        // let lastIDColumnObj: ColumnObj = {dataAttr: IDNAME, renameAs: , table: lastTable}
        let foundSrcID = selectedCols.has(IDNAME)

        
        //We need to select the the id for this.src in each subquery so that we can join all of them together later
        //We do not add IDNAME to pathAttrMap because it doesn't come from another table (duh)
        if (!foundSrcID){
          subquery = subquery.select({[IDNAME]: column(this.src.internalname, IDNAME)})
        }

        //If this is an aggregate, we do not select pathCounter_id because these are unique values that can affect aggregation
        if (!isAggregate) {
          subquery = subquery.select({[`path${pathCounter}_id`]: column(lastTable.internalname, IDNAME)})
          this.pathAttrMap.get(pathCounter).push(`path${pathCounter}_id`)
        }

        

        //This is where we create the groupby clause if this is an aggregate subquery
        if (isAggregate) {
          let attrsExceptAggregates = this.pathAttrMap.get(pathCounter).filter(attr => !mgg.AggregateOperators.includes(attr))
          attrsExceptAggregates = [...attrsExceptAggregates, column(this.src.internalname, IDNAME)]

          subquery.groupby(attrsExceptAggregates)
        }
        //Thank god we made it here
        resultQuery.with({[`path${pathCounter}`]: subquery})
        pathCounter += 1
      }


      //Handle fdlayout union query
      let leftFdquery = null
      let rightFdquery = null
      fdlayoutPaths.forEach((path, idx) => {
        let columns = foreignkeyPaths.get(path)
        let subquery = new Query()
        subquery = subquery.distinct()
        this.pathAttrMap.set(pathCounter, [])
        let addedTables = new Set()
        
        for (let p of path) {
          let {t1, t2, X, Y} = p
          if (!addedTables.has(t1.internalname)) {
            subquery = subquery.from(t1.internalname)
            addedTables.add(t1.internalname)
          }
          if (!addedTables.has(t2.internalname)) {
            subquery = subquery.from(t2.internalname)
            addedTables.add(t2.internalname)
          }

          for (let i = 0; i < X.length; i++) {
            subquery = subquery.where(eq(column(t1.internalname, X[i]), column(t2.internalname, Y[i])))
          }
        }

        columns.forEach(c => {
          subquery = subquery.select({[c.renameAs]: column(c.table.internalname, c.dataAttr)})
          if (!this.pathAttrMap.get(pathCounter).includes(c.renameAs))
            this.pathAttrMap.get(pathCounter).push(c.renameAs)
        })

        subquery = subquery.select({[IDNAME]: column(this.src.internalname, IDNAME)})
        subquery = subquery.select({[`path${pathCounter}_id`]: literal(pathCounter)})

        //Now we need to set the left or right query accordingly
        if (idx == 0)
          leftFdquery = subquery
        else
          rightFdquery = subquery
      })

      let fdUnionQuery = null
      if (leftFdquery && rightFdquery) {
        fdUnionQuery = Query.union([leftFdquery, rightFdquery])
        resultQuery = resultQuery.with({[`path${pathCounter}`]: fdUnionQuery})
        this.pathAttrMap.get(pathCounter).push(`path${pathCounter}_id`)
      }


      //Now create the additional base query. It's basically a dummy WITH statement to join other WITH subqueries
      let baseQuery = new Query()
      baseQuery = baseQuery.distinct()
      //Selecting columns from this.src in base...
      this.src.schema.attrs.forEach(attr => {
        baseQuery = baseQuery.select(column(this.src.internalname, attr))
      })
      baseQuery = baseQuery.from(this.src.internalname)
      this.filters.forEach((filter) => {
        baseQuery = baseQuery.where(filter)
      })


      resultQuery = resultQuery.with({base: baseQuery})
      this.src.schema.attrs.forEach(attr => {
        resultQuery = resultQuery.select({[attr]: column("base", attr)})
      })
      resultQuery = resultQuery.from("base")

      //Now pull everything together
      //Select the columns in each path
      let counter = 0
      for (let [pathID, columns] of this.pathAttrMap.entries()) {
        columns.forEach(c => {
          resultQuery = resultQuery.select({[c]: column(`path${pathID}`, c)})
        })
        resultQuery = resultQuery.from(`path${pathID}`)
        resultQuery = resultQuery.where(eq(column(`path${counter}`, IDNAME), column("base", IDNAME)))
        counter += 1
      }

      if (this.ordering.length > 0)
        resultQuery = resultQuery.orderby(this.ordering)

      /**
       * This part feels extremely hacky and unsafe
       * But I am pretty sure we can gurantee that order by is the last thing in the sql query 
       */
      resultQuery = resultQuery.toString()

      if (this.orderByDesc) {
        resultQuery += " DESC"
      }
      return resultQuery
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
      console.log("data applychannels", data)
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
          //If isGet and reflayout skip this because this is fdlayout
          if (currItem.refLayout != null) {
            continue
          }
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
          // if (mark.level != this.level){
          //   if (visualAttr == "x1" 
          //     || visualAttr == "x2" 
          //     || visualAttr == "x"
          //     || visualAttr == "y1"
          //     || visualAttr == "y2"
          //     || visualAttr == "y") {
          //       let idcounter = null

          //       for (let [id, visualAttrSet] of this.idVisualAttrMap.entries()) {
          //         visualAttrSet.forEach((attr) => {
          //           if (attr == queryItem.columns[0].renameAs) {
          //             idcounter = id
          //           }
          //         })
          //         if (idcounter != null) {
          //           break
          //         }
          //       }

          //       if (idcounter == null) {
          //         throw new Error("Cannot find visualAttr in applychannels")
          //       }

          //       let idcounterArr = data[`idcounter_${idcounter}`]

          //       for (let j = 0; j < idcounterArr.length; j++) {
          //         let currOtherId = idcounterArr[j]
          //         let othermark = mark
          //         let othermarkInfoCache = mark.markInfoCache
          //         let otherlevel = mark.level

          //         while (othermark && (otherlevel > this.level)) {
          //           let obj = othermarkInfoCache.get(currOtherId)

          //           if (visualAttr == "x1" 
          //             || visualAttr == "x2" 
          //             || visualAttr == "x") {
          //               arr = arr.map(elem => elem + obj.data_xoffset)
          //             }
          //           else if (visualAttr == "y1" 
          //             || visualAttr == "y2" 
          //             || visualAttr == "y") {
          //               arr = arr.map(elem => elem + obj.data_yoffset)
          //             }
          //             othermark = othermark.outermark
          //             othermarkInfoCache = othermark.markInfoCache
          //           otherlevel--
          //         }
          //       }
          //   }
          // }

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
          if (callback) {
            channels[visualAttr] = this.handleCallback(currItem, queryItem, data)
          }
          else if (Object.keys(data).includes(dataAttr[0])) {
            channels[visualAttr] = data[dataAttr[0]]
          }
          else
            channels[visualAttr] = Array(data[IDNAME].length).fill(dataAttr[0])
          
        }
      }

      if ("strokeWidth" in channels) {
        let strokeWidths = channels["strokeWidth"]
        let minimumWidth = Math.min(...strokeWidths)
        let result = strokeWidths.map((width) => (width/minimumWidth) * 10)

        channels["strokeWidth"] = result
      }

      console.log("channels post apply", channels)
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
      let {mark, callback} = channelItem
      let src = mark == this ? this.src : mark.marktable
      let firstKey = Object.keys(data)[0]
      let datalen = data[firstKey].length
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
        if (channelItem.isGet) {
          queryItem.columns.forEach((column) => {
            if (parseFloat(data[column.renameAs][i])) {
              obj[column.dataAttr] = parseFloat(data[column.renameAs][i])
            } else {
              obj[column.dataAttr] = data[column.renameAs][i]
            }

          })
        } else {
          Object.keys(data).forEach(attr => {
            if (Number(data[attr][i]) || data[attr][i] == 0n) {
              obj[attr] = parseFloat(data[attr][i])
            } else {
              obj[attr] =  data[attr][i]
            }
          })
        }
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
      //if this is a rect, we need both width and height
      //if the user specified a width or height, we need to use those values
      if (rls[0] instanceof RLFD && this.mark.aria == "rect") {
        let heightChannel = this.channels.find(channel => channel.visualAttr == "height" && (channel.isConstant || channel.isGet))
        let widthChannel = this.channels.find(channel => channel.visualAttr == "width" && (channel.isConstant || channel.isGet))

        if (heightChannel)
          markrows["height"] = channels["height"]

        if (widthChannel)
          markrows["width"] = channels["width"]
      }

      if (!R.all((a) => a in markrows, required)) {
        console.log("Missing required attr in markrows", required, R.keys(markrows))
      }
      for (const rl of rls) {
        const layout = rl.layout(markrows, crow)
        console.log("layout", layout)
        for (const va of rl.vattrs)  {
          console.log("va", va)
          channels[va] = layout[va]
          //this._scales[this.mark.alias2scale[va]] = { type: "identity" }
        }
      }
      console.log("channels post layout", channels)
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

      this.overrideObservable(mark, data, crow)
        
      let markInfo = this.getMarkInfo(mark, data, crow)

       /**
        * we hide axes because each mark gets its own axis. 
        * we don't want overlapping axes because that makes it hard to read
        */
      this.hideAxes(mark)


      this.updateScales(mark)
      return {mark, markInfo};
    }

    /**
     * Observable does some strange things to our marks and sometimes we are better off
     * modifying the svg elements returned by observable
     */
    overrideObservable(mark, data, crow) {
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
        if (!("lineAnchor" in this.options)) {
          mark.removeAttribute("text-anchor")
        }

        if ('textDecoration' in this.mappings) {
          this.setTextDecoration(mark, data)
        }

        if (!("strokeWidth" in this.mappings)) {
          maybeselection(mark).selectAll(`g[aria-label='${this.mark.aria}']`).attr("stroke-width", null)
        }

      } else if (this.marktype == "link" && ("curve" in this.options)) {
        this.setCurve(mark)
      } else if (this.marktype == "square") {
        this.setEqualWidthAndHeight(mark, data)
      }

      if (this.marktype == "text" && 'rotate' in this.mappings) {
        this.setRotate(mark)
      }

      if (this.marktype != "text" && this.marktype != "dot") {
        this.setXY(mark, data, crow)
      }

      if (this.marktype == "text" && this.ordering.length != 0) {
        this.sortCoordinates(mark, data)
      }
    }

    /**
     * This function handles rotation
     */
    setRotate(mark) {
      let rotateVal = this.mappings['rotate']

      maybeselection(mark)
        .selectAll(`g[aria-label='${this.mark.aria}']`)
        .selectAll("*")
        .each(function (d, i) {
          let el = d3.select(this);
          let val = el.attr('transform')
          el.attr('transform', `${val} rotate(${rotateVal})`)
      })
    }
    /**
     * This function is used for sorting text svgs because observable doesn't maintain
     * order even when we use an orderby clause
     */
    sortCoordinates(mark, data) {
      let thisref = this

      let coordinates = []
      maybeselection(mark)
        .selectAll(`g[aria-label='${this.mark.aria}']`)
        .selectAll("*")
        .attr(`data_${IDNAME}`, (d,i) => data[IDNAME][i] )
        .each(function (d, i) {
          let el = d3.select(this);
          let elAttrs = el.node().attributes;
          let {x,y} = thisref.getTransformInfo(el)
          coordinates.push({x,y})
      })

      coordinates.sort((a,b) => {
        if (a.x !== b.x) {
          return a.x - b.x;
        }
        return a.y - b.y;
      })

      maybeselection(mark)
      .selectAll(`g[aria-label='${this.mark.aria}']`)
      .selectAll("*")
      .each(function (d, i) {
        let el = d3.select(this);
        let newTransform = `translate(${coordinates[i].x}, ${coordinates[i].y})`

        el.attr("transform", newTransform)
    })

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
          let data_id = parseInt(el.attr(`data_${IDNAME}`))

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

    /**
     * Observable does not support text-decoration
     * @param mark 
     * @param data 
     */
    setTextDecoration(mark, data) {
      let channelItem: RawChannelItem = this.channels.find((item) => item.visualAttr == 'textDecoration')
      let queryItem: QueryItem = toQueryItem(channelItem)
      let dataAttr = channelItem.dataAttr
      let callback = channelItem.callback
      let thisref = this

      maybeselection(mark)
      .selectAll(`g[aria-label='${this.mark.aria}']`)
      .selectAll("*")
      .attr(`data_${IDNAME}`, (d,i) => data[IDNAME][i] )
      .each(function (d, i) {
        let el = d3.select(this)
        let id = parseInt(el.attr("data__rav_id"))
        let idIdx = data[IDNAME].indexOf(id)

        el.attr("text-decoration", data["textDecoration"][idIdx])

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
    }

    /**
     * This function takes care of setting x and y if the user has defined a constant for them
     * This function also sets x and y only if the mark has not been passed through layout
     * @param mark 
     * @param data 
     */
    setXY(mark, data, crow) {
      /**
       * If this mark is going through some layout algorithm, we do not want to touch it
       */
      if (Object.keys(this.layouts).length > 0) {
        return
      }

      if (!("x" in this.mappings) && !("y" in this.mappings))
        return

      let x = null
      let y = null

      if (("x" in this.mappings) && (typeof this.mappings.x === "number")) {
        x = this.mappings.x
      }

      if (("y" in this.mappings) && (typeof this.mappings.y === "number")) {
        y = this.mappings.y
      }

      let marktype = this.marktype == "square" ? "rect"  : this.marktype
      let selection = maybeselection(mark)
        .selectAll(`g[aria-label="${marktype}"]`) //hardcoded to deal only with rects for now. will need to make it generic later
        .selectAll("*")
      
      if (x !== null) {
        selection.attr("x", x)
      }

      if (y !== null) {
        selection.attr("y", y)
      }


      if (x !== null && y !== null)
        return

      /**
       * TODO: Center along x-axis
       */

      /**
       * Center along y-axis
       */
      let coords = []
      selection
      .each(function (d, i) {
        let el = d3.select(this)
        let markAttributes = {id: 0, x: 0, y: 0, width: null, height: null }

        markAttributes.id = data[IDNAME][i]
        markAttributes.x = parseFloat(el.attr("x"))
        markAttributes.y = parseFloat(el.attr("y"))

        if (el.attr("width"))
          markAttributes.width = parseFloat(el.attr("width"))

        if (el.attr("height"))
          markAttributes.height = parseFloat(el.attr("height"))

        coords.push(markAttributes)
      })

      let grouped = new Map<number, any[]>()

      coords.forEach(coord => {
        if (!grouped.has(coord.x)) {
          grouped.set(coord.x, [])
        }
        grouped.get(coord.x).push(coord)
      })



      let centeredPoints = []
      grouped.forEach((group, x) => {
        let minY = -1
        let maxY = -1

        group.forEach(coord => {
          if (minY == -1) {
            minY = coord.y
          } else {
            minY = Math.min(minY, coord.y)
          }
          maxY = Math.max(maxY, coord.y + (coord.height ? coord.height : 0))
          
        })

        let paddingTop = (crow.height - (maxY - minY))/2
        let offset = ((paddingTop - minY) > 0) ? (paddingTop - minY) : 0
        group.forEach(coord => {
          centeredPoints.push({id: coord.id, x: coord.x, y: coord.y + offset})
        })
      })

      selection
      .each(function (d, i) {
        let el = d3.select(this)
        let newPoint = centeredPoints.find(p => p.id == data[IDNAME][i])
        el.attr("y", newPoint.y)
      })
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

              if (attrName == "transform") {
                let {x,y} = thisref.getTransformInfo(el)
                markAttributes["x"] = x
                markAttributes["y"] = y
              } else if (attrName == `data_${IDNAME}`) {
                markAttributes[IDNAME] = parseInt(attrValue);
              } else if (attrName == "font-size") {
                markAttributes["fontSize"] = attrValue
              } else if (attrName == "text-decoration") {
                markAttributes["textDecoration"] = attrValue
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
              } else if (attrName) {
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
            delete markInfo[i]["cy"]
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

          if ("textDecoration" in markInfo[i]) {
            obj["textDecoration"] = markInfo[i]["textDecoration"]
          }
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

      if (!this.marktable) {
        await this.createNewMarkTable(markInfo, tname)
      } else {
        /**
         * This is specifically for ER diagram where we rerender and get fresh markinfo, so we drop all the old information
         */
        await this.c.db.conn.exec(`TRUNCATE ${tname}`)
      }

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
      await this.c.db.updateFkeysMetadata(fkConstraint.t1.internalname, fkConstraint.t2.internalname, fkConstraint.X, fkConstraint.Y)
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

    //This function gets the ids of foreign rows that are referenced for each row
    pickupReferences(rows) {
      //Now populate referencedMarks. 
      // key is row id of this.src
      // value is an object with key: <visual_attr>_ref, value: pathID
      for (let [pathID, attrs] of this.pathAttrMap.entries()) {
        rows.forEach(row => {
          let rowID = row[IDNAME]

          if (!this.referencedMarks.has(rowID))
            this.referencedMarks.set(rowID, {})

          attrs.forEach(attr => {
            this.referencedMarks.get(rowID)[`${attr}_ref`] = row[`path${pathID}_id`]
          })
        })
      }
    }

    //This function retrieves all the link information for fdlayout
    //Marks that do not use fdlayout will return immediately
    handleFdLayoutData(rows) {
      if (!this.channels.some(channel => channel.refLayout && channel.refLayout instanceof RLFD))
        return rows

      //Get the channel with RLFD so that we have access to the layout object
      let rlfdChannel = this.channels.find(channel => channel.refLayout && channel.refLayout instanceof RLFD)
      let rlfdObj = rlfdChannel.refLayout as RLFD

      //These are the columns we need to remove from rows
      let linkColumns = rlfdObj.foreignKeyColumns

      //Store rows after removing linkColumns from each row.
      //Should only insert unique rows
      let filteredRows = []

      //We might pick up on links that do not connect between nodes we want to run fdlayout on
      //We need to filter those out
      let desiredIDs = new Set<number>()
      rows.forEach(row => { desiredIDs.add(row[IDNAME]) })

      //Keep track of which rows have been added by stringifying rows
      let visitedRows = new Set<string>()
      for (let i = 0; i < rows.length; i++) {
        let row = rows[i]
        let left = row[linkColumns[0]]
        let right = row[linkColumns[1]]

        if (!desiredIDs.has(left) || !desiredIDs.has(right))
          continue

        rlfdObj.links.push([left, right])

        //yep modify in place
        delete row[linkColumns[0]]
        delete row[linkColumns[1]]
        let rowString = JSON.stringify(row)
        if (!visitedRows.has(rowString)) {
          visitedRows.add(rowString)
          filteredRows.push(row)
        }
      }
      return filteredRows
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
        console.log("data.length", data.length)
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
