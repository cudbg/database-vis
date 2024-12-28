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
import { Scale } from "./newScale";

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
  visualAttr: string
  constraints: FKConstraint[] //will be null if there are no clauses ie. normal mapping like x: "a"
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
  /**
   * Each ConditionObj has leftTable, leftAttr, rightTable. rightAttr
   * Used to construct where clauses: WHERE leftTable.leftAttr = rightTable.rightAttr
   */
  constraints: FKConstraint[]
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
    if (item.dataAttr.length > 1) {
       /**
        * more than 1 means we must select each column in dataAttr without any renaming
        */
      for (let i = 0; i < item.dataAttr.length; i++) {
        columns.push({dataAttr: item.dataAttr[i], renameAs: item.dataAttr[i]})
      }
    } else {
      /**
       * Equal to 1 means we can and must rename each column when selecting
       * We rename because the user may want to create a link ie.
       * x1: va.get(null, ["x"]), y1: va.get(null, ["y"]), x2: vb.get(null, ["x"]), y2: vb.get(null, ["y"])
       * However, the marktables for va and vy will have x and y columns, 
       * we cannot select two different columns with the same name
       */
      columns = [{dataAttr: item.dataAttr[0], renameAs: item.visualAttr}]
    }
  } else {
     //dataAttr is an array that contains one element and because this is not a get, we do not rename it to the visualAttr
    columns = [{dataAttr: item.dataAttr[0], renameAs: item.dataAttr[0]}]
  }
  return {srcmark: item.mark, source: source, columns: columns, constraints: item.constraints}

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
    scaling_fns;

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

        this.init()
    }

    init() {
      for (const [va,dattr] of Object.entries(this.mappings)) {
          let mark = this
          let visualAttr = va
          let constraints = null
          let dataAttr = [dattr]
          let isGet = false
          let refLayout = null
          let callback = null
          let rawChannelItem: RawChannelItem = {mark, visualAttr, constraints, dataAttr, isGet, refLayout, callback}

          if (dattr instanceof RefLayout) {
              dattr.add(va);
              this.addLayout(dattr);
              /**
               * For a reflayout, we select all columns from the table except for IDNAME
               * The user should never select IDNAME!
               */
              dataAttr = this.src.schema.except([IDNAME]).attrs;
              rawChannelItem.dataAttr = dataAttr
              rawChannelItem.refLayout = dattr
          }
          else if (dattr instanceof Object && 'othermark' in dattr) { //there's a call to get
              let {othermark, constraints, othervattr, callback} = this.processGet(dattr)
              rawChannelItem.mark = othermark
              rawChannelItem.constraints = constraints
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

          }
          else if (dattr instanceof Scale) {
              this.setScaleForVA(va, dattr)
              rawChannelItem.dataAttr = [dattr.getCol()] // we scale a single column at a time, so this is ok
          }
          this.channels.push(rawChannelItem)
      }
    }
    /**
     * For getting cols that have a valid fk path. valid fk paths are checked during render
     * @param usrDattr
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

    /**
     * Called in the init method for handling a call to get method
     * @param getObj the object that was created from a get method 
     */

    checkValidFkConstraint(c: FKConstraint, othermark, currSearchkey) {
      if (c.t1 == othermark.src && c.t2 == this.src && c.Y == currSearchkey && (c.card == Cardinality.ONEMANY || c.card == Cardinality.ONEONE))
        return true
      else if (c.t2 == othermark.src && c.t1 == this.src && c.X == currSearchkey && (c.card == Cardinality.ONEMANY || c.card == Cardinality.ONEONE))
        return true
      return false
    }

    processGet(getObj) {
      let othermark = getObj.othermark
      let searchkeys = getObj.searchkeys
      let othervattr = getObj.othervattr
      let constraints = []
      let callback = getObj.callback

      if (searchkeys) {
        for (let i = 0; i < searchkeys.length; i++) {
          let constraint = null

          for (const [constraintName, c] of Object.entries(this.c.db.constraints)) {
            if (!(c instanceof FKConstraint))
              continue
            /**
             * Check if there is a valid foreign key reference from this.src to othermark.src for the given searchkey
             * In this current state, it must be a direct N-1 foreign key reference ie. from table A to table B.
             * Indirect foreign key references such as from A to C, given a valid foreign key path A to B to C, would throw an error!
             */
            let validFkConstraint = this.checkValidFkConstraint(c, othermark, searchkeys[i])

            if (validFkConstraint)
              constraint = c
          }
          if (!constraint)
            throw new Error("No such foreign key reference!")

          constraints.push(constraint)
        }
      }

      return {othermark, constraints, othervattr, callback}
    }

    /**
     * Called in the init method handle scaling
     * @param va  The visual attribute to scale
     * @param v   Has type Scale (need to come up with better name). 
     *            Contains information about domain, range, col
     *            See dynamicScale.ts. 
     */
    setScaleForVA(va, scaleObj) {
      let range = scaleObj.getRange()
      let type = scaleObj.getType()

      this._scales[va] = {}
      if (range) {
        this._scales[va] = {range: range}
      }
      if (type) {
        this._scales[va] = {...this._scales[va], type: type}
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
        let nest = this.c.nestof(this)[0]
        let mark = null;

        /*
        mark was really appended to the root after doRootNest and doMarkNest
        But we return mark for error checking purposes
        */
        if (nest instanceof RootNest) {
          let crow = nest.parentmarkdata()
          let fixedCrow = this.handleCrow(crow)
          mark = await this.doRootNest(root, fixedCrow)
        } else {
          mark = await this.doMarkNest(root, nest)
        }

        if (!mark)
          throw new Error("Uh oh! Couldn't make mark")
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

    /**
     * 
     * @param root 
     * @param crow An object of format {width: ..., height: ..., x: ..., y: ....}
     * @returns 
     */
    async doRootNest(root, crow) {
      let query = this.constructQuery()
      let dummyroot = this.makeDummyRoot()
      let rows = await this.c.db.conn.exec(query)

      /**
       * The data from query has format [{}, {}, {}] where each object represents
       * a single data point ie. each object looks like {x: ..., y: ...}
       * We convert from rowsToCols so that the data looks like { x: [], y: []}
       * The idea is to collect each visual attribute into an array
       * This is to allow applychannels to work properly
       * 
       */
      let cols = this.rowsToCols(rows)

      /**
       * channels has format {x: [], y: [], ...}
       * applychannels prepares the data for rendering
       */
      let channels = this.applychannels(cols)

      channels = await this.doLayout(channels, crow, dummyroot)

      // render final marks
      let {mark, markInfo} = this.makemark(channels, crow)

      root
        .append("g")
        .attr("transform", `translate(${crow.x}, ${crow.y})`)
        .node().appendChild(mark);
      
      await this.createMarkTable(markInfo)

      document.documentElement.removeChild(dummyroot.node());
      this._markelsidx = markels(root, this.marktype);
      return mark
    }

    /**
     * 
     * @param root domain element to append mark to
     * @param nest an instance of MarkNest
     * @returns 1 on success
     */
    async doMarkNest(root, nest) {
      let dummyroot = this.makeDummyRoot()
      let outermark = nest.outerMark
      let outermarkData = await outermark.src.data("col")
      let outermarkVizData = await outermark.marktable.data()

      /**
       * Query for child marks in a nest is a simple
       * Need a loop to run through later
       * 
       * Could we call doRootNest in here?
       */
      for (let i = 0; i < outermarkData[IDNAME].length; i++) {
        let crow = outermarkVizData[i]
        let query = this.constructQuery(nest, crow)
        let rows = await this.c.db.conn.exec(query)
        let cols = this.rowsToCols(rows)
        let channels = this.applychannels(cols)

        channels = await this.doLayout(channels, crow, dummyroot)

        // render final marks
        let {mark, markInfo} = this.makemark(channels, crow)
        root
          .append("g")
          .attr("transform", `translate(${crow.x}, ${crow.y})`)
          .node().appendChild(mark);

        await this.createMarkTable(markInfo)
        
        this._markelsidx = markels(root, this.marktype);
      }
      document.documentElement.removeChild(dummyroot.node());
      return 1
    }

    constructQuery(nest?, crow?) {
      let pathQueryItemMap = new Map<FKConstraint[] ,Set<QueryItem>>()
      let currColumnObjSet = new Set<ColumnObj>() /* this is for dattrs from this.src */
      let nestingPath = new Map<FKConstraint[], Boolean>()
      let queryItems = this.channels.map((rawChannelItem) => toQueryItem(rawChannelItem))


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
        let {source, columns, constraints} = queryItems[i]

        /**
        * Check if column is a numeric value. the user could have entered x: 5 
        * and we wouldnt want to query for column 5
        */
        if (!columns.some(column => source.schema.attrs.includes(column.dataAttr)))
          continue
        /**
         * This is a get method
         */
        if (constraints) {
          for (let constraint of constraints) {
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
              pathQueryItemMap.set(possibleNewPath, new Set([queryItems[i]]))
              nestingPath.set(possibleNewPath, false)
            } else {
              let queryItemSet = pathQueryItemMap.get(pathInMap)
  
              queryItemSet.add(queryItems[i])
            }
            
          }

        } else {
          for (let i = 0; i < columns.length; i++) {
            let foundColumn = false
            for (const columnObj of currColumnObjSet){
              if (eqColumnObjs(columnObj, columns[i])) {
                foundColumn = true
              }
            }
            if (!foundColumn){
              currColumnObjSet.add(columns[i])
            }
          }
        }
      }

      if (nest && crow) {
        let possibleNewPath = this.c.db.getFKPath(this.src, nest.outerMark.marktable, nest.fk)
        let pathInMap = null

        if (!possibleNewPath)
          throw new Error("No possible path")

        for (let path of pathQueryItemMap.keys()) {
          if (eqPath(possibleNewPath, path)) {
            pathInMap = path
            break
          }
        }

        possibleNewPath.push(new FKConstraint({t1: nest.outerMark.marktable, X: [IDNAME], t2: nest.outerMark.marktable, Y: [crow[IDNAME]]}))

        if (!pathInMap) {
          pathQueryItemMap.set(possibleNewPath, new Set()) /* empty set because this is a nest, no attributes are being selected */
          nestingPath.set(possibleNewPath, true)
        } else {
          let queryItemSet = pathQueryItemMap.get(pathInMap)

          pathQueryItemMap.delete(pathInMap)
          nestingPath.delete(pathInMap)

          pathQueryItemMap.set(possibleNewPath, queryItemSet)
          nestingPath.set(possibleNewPath, true)
        }
      }

      let query = new Query()

      query = query.distinct()

      for (let columnObj of currColumnObjSet.values()) {
        let {dataAttr, renameAs} = columnObj

        query = query.select({[renameAs]: column(this.src.internalname, dataAttr)})
      }

      query = query.from(this.src.internalname)

      let pathCounter = 1;

      for (let [path, queryItemSet] of pathQueryItemMap.entries()){
        let tableRenameMap = new Map<string, string>()

        tableRenameMap.set(this.src.internalname, this.src.internalname) /* never rename the src table for this mark */

        for (let i = 0; i < path.length; i++) {
          let constraint = path[i]
          let {t1, t2, X, Y} = constraint
          let renameT1 = null
          let renameT2 = null

          if (t1 != this.src) {
            if (!tableRenameMap.has(t1.internalname)) {
              renameT1 = `${t1.internalname}_${pathCounter}`
              query = query.from({[renameT1]: t1.internalname})
              tableRenameMap.set(t1.internalname, renameT1)
            } else {
              renameT1 = tableRenameMap.get(t1.internalname)
            }
          } else {
            renameT1 = this.src.internalname
          }

          if (t2 != this.src) {
            if (!tableRenameMap.has(t2.internalname)) {
              renameT2 = `${t2.internalname}_${pathCounter}`
              query = query.from({[renameT2]: t2.internalname})
              tableRenameMap.set(t2.internalname, renameT2)
            } else {
              renameT2 = tableRenameMap.get(t2.internalname)
            }
          } else {
            renameT2 = this.src.internalname
          }

          if (nestingPath.get(path) && i == path.length - 1) {

            query = query.where(eq(column(renameT1, X[0]), literal(Y[0])))
          } else {
            query = query.where(eq(column(renameT1, X[0]), column(renameT2, Y[0])))
          }

        }

        for (let queryItem of queryItemSet) {
          let {source, columns} = queryItem

          for (let columnObj of columns) {
            let {dataAttr, renameAs} = columnObj
            let tableName = tableRenameMap.get(source.internalname)
            query = query.select({[renameAs]: column(tableName, dataAttr)})
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

      let valueArr = Object.values(data)[0]
      let numDatapoints = valueArr.length;

      data[IDNAME] = [...Array(numDatapoints).keys()]

      let channels = {
        [IDNAME]: [...data[IDNAME]]
      };

      for (let i = 0; i < this.channels.length; i++) {
        let currItem = this.channels[i]
        let {visualAttr, dataAttr, refLayout, callback} = currItem
        if (currItem.isGet) {
          let arr = data[visualAttr]
          /**
           * If callback exists, then we run the callback function and assign the resulting array
           * from handlecallback to channels[visualAttr]
           */
          if (callback)
            arr = this.handleCallback(currItem, data)

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
    handleCallback(channelItem: RawChannelItem, data) {
      let foundStr = false
      let resArr = []
      let {callback, dataAttr} = channelItem

      let datalen = data[dataAttr[0]].length

      /**
       * args is a 2D array. Each array within args corresponds to a visual attribute
       * ie. if the callback is over ["x", "w"], then args has 2 arrays, one for x and one for w
       */
      let args = dataAttr.map(attr => data[attr])

      /**
       * For the number of datapoints available
       *    pick the relevant data points from each inner array in args. 
       *    store these in currArgs.
       *    convert all arguments to floats because we assume the function is mathematical
       *    run the callback function on currArgs
       *    store the result of the callback function in res
       */
      for (let i = 0; i < datalen; i++) {
        let currArgs = args.map(arr => arr[i])
        for (let j = 0; j < currArgs.length; j++) {
          if (typeof currArgs[j] == "string") { //em or px case
            foundStr = true
          }
        }
        currArgs = currArgs.map(elem => parseFloat(elem))
        resArr.push(callback(...currArgs))
      }
      if (foundStr) {
        resArr = resArr.map(elem => elem + "em") //hardcoded. need to handle both em and px case
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
    async doLayout(channels, crow, dummyroot) {
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
          this._scales[this.mark.alias2scale[va]] = { type: "identity" }
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
      console.log("setXTranslate")
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
      console.log("setYTranslate")
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

          for (let j = 0; j < elAttrs.length; j++) {
              let attrName = elAttrs[j].name;
              let attrValue = elAttrs[j].value;

              if (attrName == "y") {
                markAttributes["width"] = attrValue
              } else if (attrName == "transform") {
                let {x,y} = thisref.getTransformInfo(el)
                markAttributes["x"] = x
                markAttributes["y"] = y
              } else {
                markAttributes[attrName] = attrValue;
              }
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
      
      maybeselection(mark)
        .selectAll(`g[aria-label='${this.mark.aria}']`)
        .selectAll("*")
        .attr(`data_${IDNAME}`, (d,i) => {data[IDNAME][i];})
        .attr(`data_xoffset`, crow.x)  // TODO: this will not work for recursively nested data
        .attr(`data_yoffset`, crow.y)
        .each(function (d, i) {

          let el = d3.select(this);


          let elAttrs = el.node().attributes;
          let markAttributes = {};

          for (let j = 0; j < elAttrs.length; j++) {
              let attrName = elAttrs[j].name;
              if (attrName == "transform") {
                continue
              }

              let attrValue = elAttrs[j].value;

              markAttributes[attrName] = attrValue;
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

        //bookkeeping purposes?
        if (!scale.getDomain()) {
          let va_domain = mark.scale(va)?.domain
          scale.setDomain(va_domain)
        }

        if (!scale.getType()) {
          let va_type = mark.scale(va)?.type
          scale.setType(va_type)
        }

        // this is the update we actually care about because range affects the position on screen
        if (!scale.getRange()) {
          let va_range = mark.scale(va)?.range
          scale.setRange(va_range)
        }
      }
    }

    /**
     * 
     * @param markInfo array of objects. each object describes a single datapoint 
     *                 and corresponds to a single row to insert into the marktable
     * @returns 
     */
    async createMarkTable(markInfo) {
      if (markInfo.length == 0)
        return

      /**
       * values is a 2d array. each inner array represents a row to insert into the marktable
       */
      let values = this.valuesFromMarkInfo(markInfo)

      /**
       * This fills up the rav_id column
       */
      for (let i = 0; i < values.length; i++) {
        values[i].push(i)
      }

      /**
       * tuples is now in sql query format (...), (...), (...)
       */
      let tuples = values.map((row) => `(${row.join(", ")})`).join(", ")
      let q = `${tuples}`
      const tname = this.src.internalname + "_marktable" + this.id++;

      if (!this.c.db.tables.has(tname)) { //create non existent table
        await this.createNewMarkTable(markInfo, tname)
      } else { //check if schema has changed. If yes, recreate the marktable
        let table = this.c.db.tables.get(tname)

        if (table.schema.attrs.length != values[0].length) {
          await this.c.db.conn.exec(`DROP TABLE ${tname}`)
          await this.createNewMarkTable(markInfo, tname)
        }
      }
      await this.c.db.insertIntoTable(q, tname)
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

          /*
          turns cx, x1 into x, cy, y1 into y etc.
          We don't want to insert a cx column into the marktable
          Eg.
          because some other mark way want to get x attribute from this mark
          and we want that other mark to find x attribute
          */
          let aliasObj = this.mark.alias2scale
          if (Object.keys(aliasObj).includes(k)) {
            k = aliasObj[k] 
          }

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