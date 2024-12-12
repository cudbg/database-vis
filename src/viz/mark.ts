import * as R from "ramda";
import { creator, select } from "d3";
import * as d3 from "d3";
import { Query, sql, agg, and, eq, column, literal, loadObjects } from "@uwdata/mosaic-sql";
import * as OPlot from "@observablehq/plot";

import { IDNAME, Table, createView } from "./table";
import { idexpr } from "./id";
import { FKConstraint } from "./constraint";
import type {  Canvas } from "./canvas";
import type {Schema} from "./schema";
import { MarkNest, RootNest, type Nest } from "./nest";
import { markof, RefColumn, RefLayout, RefMark } from "./ref";
import { inferScale, Linear, Ordinal, Sqrt } from "./scale"
import { oplotUtils } from "./plotUtils/oplotUtils.ts";
import { rowof, markdata, applycolfilter, markels, filtercoldata, maybeselection } from "./markUtils"
import { Scale } from "./newScale";

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


export class Mark implements IMark {
  static id = 0;
  id;
  c: Canvas;
  src;
  marktable;
  marktype;
  mark;
  channels;
  mappings;
  options;
  refmarks:Map<string,Map<string, string>>;
  layouts;
  usr_callbacks;
  scaling_fns;

  _scales;
  _data;   // cache of the data
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
    this.channels = {};
    this.refmarks = new Map()
    this._scales = {}
    this.usr_callbacks = []
    this.scaling_fns = []

    this.init()
  }

  init() {
    for (const [vattr, e] of Object.entries(this.mappings)) {
      if (e instanceof RefLayout) {
        e.add(vattr)
        this.addLayout(e)
        this.channels[vattr] = e;
      } else if (e instanceof Object && 'mark' in e) {
        this.c.registerRefMark(e.mark, this)

        const tname = e.mark.src.internalname

        if (!this.refmarks.has(tname)) {
          this.refmarks.set(tname, new Map())
        }
        //this.refmarks[tname] ??= {}
        let found = false

        for (const va in this.mark.shortcuts) {
          if (vattr != va) continue
          found = true;
          // is it possible to extract a DOM attribute to fill in resolveda (e.g., x1)?
          for (const resolveda of this.mark.shortcuts[va]){
            console.log("resolveda", resolveda)
            // TODO: table may have multiple marks
            const omark = e.mark
            console.log("omark", omark)
            let altattrs = omark.mark.propToSupply(this.mark, resolveda)
            console.log("altattrs", altattrs)
            if (altattrs.length > 1)
              console.error(`markof(${tname}).${resolveda} is ambiguous: ${altattrs}.  Defaulting to ${altattrs[0]}`)
            if (R.isNil(altattrs[0]))
              throw new Error(`markof(${e.mark.src.internalname}) doesn't provide ${resolveda}`)

            let innerMap = this.refmarks.get(tname)
            innerMap.set(resolveda, altattrs[0])
            //this.refmarks[tname][resolveda] ??= altattrs[0];
            this.channels[resolveda] ??= resolveda;
            console.log("refmarks rda",this.refmarks.get(tname).get(resolveda))
          }
        }
        if (!found) {
          let innerMap = this.refmarks.get(e.mark.src.internalname)
          innerMap.set(vattr, e.vattr)
        }
          //this.refmarks[e.mark.src.internalname][vattr] = e.vattr;
      } else if (e instanceof Object && 'scaling' in e) { //for scaling
        this.channels[vattr] = e;
      } else {
        this.channels[vattr] = e;
      }
    }
    console.log(this.refmarks)
    console.log("this.channels init", this.channels)
  }

  async createMarkTableWithRef(paths) {
    console.log("paths", paths)
    let tables = []
    let ons = []
    for (const path of paths as FKConstraint[][]) {
      let cur = null
      for (const edge of path as FKConstraint[]) {
        if (edge.t1 == this.src) {
          cur = edge.t1
        } else if (edge.t2 == this.src) {
          cur = edge.t2
        }
  
        let { src, dst, srcKey, dstKey } = edge.follow(cur);
        tables.push(dst)
        let src_key = null;
        let dst_key = null;

        if (srcKey instanceof Array){
          src_key = srcKey[0]
        }
        if (dstKey instanceof Array) {
          dst_key = dstKey[0]
        }

        ons.push({left: src_key == null ? srcKey : src_key, right: dst_key == null ? dstKey : dst_key, leftname: src.internalname, rightname: dst.internalname})
        cur = dst;
      }
    }
    console.log("tables", tables)
    console.log("ons", ons)
    //this.renameOperation(tables) /* rename relevant x and y columns to x1 and y1 etc if needed */
    let tname = this.src.internalname + "_marktable" + Mark.id++

    let reversedRefMarks = new Map()

    for (const [key, value] of [...this.refmarks.entries()]) {
      let marktable = this.c.markof(key).marktable
      if (!reversedRefMarks.has(marktable.internalname))
        reversedRefMarks.set(marktable.internalname, new Map())

      let innerMap = this.refmarks.get(key)
      for (const [vattr, attr] of [...innerMap.entries()]) {
        reversedRefMarks.get(marktable.internalname).set(attr, vattr)
      }
    }

    console.log("reversedRefMarks", reversedRefMarks)

    let resultTable = await this.src.chainjoin(tables, ons, null, tname, reversedRefMarks)

    this.marktable = resultTable

    let fkConstraint = new FKConstraint({t1: resultTable, X: IDNAME, t2: this.src, Y: IDNAME})
    this.c.db.addConstraint(fkConstraint)

    return resultTable
  }

  get(user_fattr: String | String[], user_vattr: String | String[], callback?): {mark: Mark, fattr: String[], vattr: String[]} {
    let fattr = Array.isArray(user_fattr) ? user_fattr : [user_fattr]
    let vattr = Array.isArray(user_vattr) ? user_vattr : [user_vattr]

    for (let attr of vattr) {
      if (!R.includes(attr, Object.keys(this.mappings))) {
        throw new Error(`${attr} is not mapped in ${this.src.displayname}`)
      }
    }

    for (let attr of fattr) {
      if (attr && !R.includes(attr, this.src.schema.attrs)) {
        throw new Error(`${attr} is not present in ${this.src.displayname}`)
      }
    }

    let obj = {mark: this, fattr: fattr, vattr: vattr}

    console.log("callback", callback)

    if (callback)
      this.usr_callbacks.push({fattr: fattr, fn: callback})

    return obj
  }

  addLayout(rl:RefLayout) {
    this.layouts[rl.id] ??= rl;
    this.layouts[rl.id].add(rl.vattrs)
  }

  // @param data columnar dataset to render as marks
  // @param crow a row containing spatial information about containing box
  makemark(data, crow, scales?) {
    //let p = oplotUtils.plot(this, data, crow, scales)
    console.log("makemark data", data)
    console.log("crow", crow)
    console.log("scales", scales)
    console.log("this.options", this.options)
    
    let p = OPlot.plot({
      //...R.pick(["axis", "margin"],this.options), 
      ...this._scales, 
      ...(scales??{}),
      ...this.options,
      ...R.pick(['width', 'height'], crow),
      marks: [ 
        this.mark.klass(data[IDNAME], data)
      ] })

      console.log("made mark", p)
  
    let markInfo = []
    // Observable throws away information
    maybeselection(p)
      .selectAll(`g[aria-label='${this.mark.aria}']`)
      .selectAll("*")
      .attr(`data_${IDNAME}`, (d,i) => data[IDNAME][i] )
      .attr(`data_xoffset`, crow.x)  // TODO: this will not work for recursively nested data
      .attr(`data_yoffset`, crow.y)
      .each(function (d, i) {

        let el = d3.select(this);
        let elAttrs = el.node().attributes;

        let markAttributes = {
          _rav_id: el.attr(`data_${IDNAME}`)
        };

        for (let j = 0; j < elAttrs.length; j++) {
            let attrName = elAttrs[j].name;
            if (attrName == "transform") continue

            let attrValue = elAttrs[j].value;

            markAttributes[attrName] = attrValue;
        }
        markInfo.push(markAttributes)
    })

    for (let i = 0; i < this.scaling_fns.length; i++) {
      let curr_scaling_fn = this.scaling_fns[i]
      console.log("curr_fn", curr_scaling_fn)
      let va = curr_scaling_fn.va
      let scale = curr_scaling_fn.scale

      let va_domain = p.scale(va)?.domain

      console.log("va_domain", va_domain)

      let va_range = p.scale(va)?.range

      console.log("va_range", va_range)

      let va_type = p.scale(va)?.type

      console.log("va_type", va_type)
      
      scale.setRange(va_range)

      scale.setType(va_type)

      this._scales[va].type = va_type

      this._scales[va].range = va_range
    }
    
    return {p: p, markInfo: markInfo};
  }

  // given a dataset, apply the channels as specified in the visual encodings
  // @return columnar dataset of the visual channel values
  applychannels(data) {
    console.log("data applychannels", data)
    let channels = {
      [IDNAME]: [...data[IDNAME]]
    };
    console.log("this.channels", this.channels)
    for (let [va,e] of Object.entries(this.channels)) {
      if (typeof e == "string") {
        
        channels[va] = data[e]
        console.log("va", va)
        console.log("channels[va]", channels[va])
      } else if (typeof e == "function") {
        channels[va] = R.times((idx)=>e(rowof(data,idx)), data[IDNAME].length);
      } else if (e instanceof Scale) {
        console.log("hello from scale")
        console.log("e", e)

        let usr_col = e.getCol()

        console.log("usr_col", usr_col)

        let arr = data[usr_col]

        console.log("arr",arr)

        channels[va] = arr

        //skip error checking for now

        e.setDomain(arr)

        let domain = e.getDomain()

        let range = e.getRange()

        let type = e.getType()

        this._scales[va] ??= {}

        if (domain)
          this._scales[va].domain = domain
        if (range) {
          console.log("found existing range")
          this._scales[va].range = range
        }

        if (type) {
          console.log("found existing type")
          this._scales[va].type = type
        }
  
        console.log("this._scales", this._scales)
        this.scaling_fns.push({va: va, scale: e})

      } else if (e instanceof RefLayout) {
        for (const da of e.dattrs) {
          channels[da] = data[da]
        }
        channels[va] = Array(data[IDNAME].length).fill(0); // dummy value
      } 
      channels[va] ??= Array(data[IDNAME].length).fill(e);
    }
    return channels;
  }

  async render(context):Promise<any> {
    let root = this.node = select(
      creator("svg:g").call(document.documentElement))
      .classed(`${this.marktype}-${this.id}`, true);
        
    let hasReference = false
    for (const [vattr, e] of Object.entries(this.mappings)) {
        if (e instanceof Object && 'mark' in e) {
          hasReference = true;
        }
    }
    if (hasReference) {
      await this.renderFk({...context, root})
    } else {
      await this.renderTable({...context, root})
    }
    return root.node()
  }

  async generateNewMarkTable(markInfo, tname) {
    console.log("markInfo generate", markInfo)
    let firstRow = markInfo[0]
      let columnNames = Object.entries(firstRow).map(([k,v]) => {
        if (k == "data_" + IDNAME) {
          return k + " int primary key"
        } else {
          if (isNaN(Number(v))) {
            return k + " string"
          } else {
            return k + " float"
          }
        }
      })
      let q = `(${columnNames.join(", ")})`
      let marktable = await this.c.db.createTable(q, tname)

      let markKeys = "data_" + IDNAME
      marktable.keys(markKeys)
      let fkConstraint = new FKConstraint({t1: marktable, X: markKeys, t2: this.src, Y: IDNAME})
      this.c.db.addConstraint(fkConstraint)
      this.marktable = marktable
      console.log("this", this)
  }

  async extractMarkInfo(markInfo) {
    let values = []
    for (const obj of markInfo) {
      let rowValues = []
      for (const [k,v] of Object.entries(obj)) {
          if (k == "data__rav_id") {
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
 
  async createMarkTable(markInfo) {
    console.log(markInfo)
    const tname = this.src.internalname + "_marktable" + this.id;

    if (!this.c.db.tables.has(tname)) { //create non existent table
      console.log("create new mark table")
      await this.generateNewMarkTable(markInfo, tname)
    }

    let values = await this.extractMarkInfo(markInfo)
    
    console.log("values", values)

    let tuples = values.map((row) => `(${row.join(", ")})`).join(", ")
    
    let q = `${tuples}`
    await this.c.db.insertIntoTable(q, tname)
  }


  createDummyRoot(document) {
    return select(creator("div").call(document.documentElement))
      .style("position", "absolute")
      .style("x", "-100000")
      .style("y", "-100000")
  }

  async lastMakeMark(root, channels, crow) {
    console.log("crow", crow)
    let {p, markInfo} = this.makemark(channels, crow)

    root
      .append("g")
      //.attr("transform", `translate(${crow.x}, ${crow.y})`)
      .node().append(p)
    console.log("markInfo lastMakeMark", markInfo)
    await this.createMarkTable(markInfo)
  }

  transposeData(data) {
    let res = {}
    for (let i = 0; i < data.columns.length; i++) {
      res[data.columns[i]] = []
    }

    for (let i = 0; i < data.length; i++) {
      if (data[i] == "columns")
        break
      for (const k in data[i]) {
        res[k].push(data[i][k])
      }
    }
    console.log(res)
    return res
  }

  async doRootNest(root, dummyroot, n) {

    console.log("is root nest")
    console.log(n)
    let data = await this.src.data("col")
    let channels = this.applychannels(data)
    

    if (!R.isEmpty(this.layouts)) {
      this.doLayout(dummyroot, channels, n) 
    }
    await this.lastMakeMark(root, channels, n)
    console.log("finish doRootNest")
  }

  async doMarkNest(root, dummyroot, n) {
    console.log("is marknest")
    console.log(n)
    console.log(n.outerMark.markdata)
    console.log("this.channels", this.channels)



    console.log("n.fk.X", n.fk.X)
    console.log("n.fk.Y", n.fk.Y)

    console.log("n outermark", n.outerMark)

    let thisSrc = this.src
    let outerSrc = n.fk.t1
    let outerMarktable = n.outerMark.marktable


    //FOR CLARITY 
    let innerSrcData = await thisSrc.data("col")
    console.log("innerSrcData", innerSrcData)
    let parentSrcData = await outerSrc.data("col")
    console.log("parentSrcData", parentSrcData)
    let parentData = await outerMarktable.data("col")
    console.log("parentData", parentData)
    

    //console.log("id column", parentData["data__rav_id"])

    console.log(outerMarktable)

    let allMarkInfo = []

    for (let i = 0; i < parentData["data__rav_id"].length; i++) {
      let currID = parentData["data__rav_id"][i]
      let q = Query
            .from({a:thisSrc.internalname, b:outerSrc.internalname, c:outerMarktable.internalname})
            .where(eq(column('a',n.fk.Y),column('b',n.fk.X)))
      
      if (outerSrc.schema.attrs.includes(IDNAME))
        q = q.where(eq(column('b',IDNAME),column('c',"data__rav_id")))
      else
        q = q.where(eq(column('b',outerSrc.pkey()[0]),column('c',"data__rav_id")))
  

      q = q.where(eq(column('c',"data__rav_id"), literal(currID)))

      this.src.schema.attrs.forEach((attr) => q.select(column("a",attr)))

      let res = await this.c.db.conn.exec(q)
      //console.log("res", res)
      
      let transposedRes = this.transposeData(res)

      console.log("transposedRes", transposedRes)

      let channels = this.applychannels(transposedRes)

      //console.log("channels", channels)

      let crow = {x:parentData["x"][i], y: parentData["y"][i], width: parentData["width"][i], height: parentData["height"][i] }
      //console.log("crow", crow)

      if (!R.isEmpty(this.layouts)) {
        this.doLayout(dummyroot, channels, crow)
      }
      let {p, markInfo} = this.makemark(channels, crow)

      root
        .append("g")
        .attr("transform", `translate(${crow.x}, ${crow.y})`)
        .node().append(p)
      console.log("markInfo", markInfo)
      
      markInfo.forEach((elem) => allMarkInfo.push(elem))
    }
  }

  doLayout(dummyroot, channels, crow) {
    const rls = R.values(this.layouts);
    let required = R.uniq(R.pluck("required", rls).flat())
    let {markInfo, p} = this.makemark(channels, crow)
    dummyroot.node().append(p)
    console.log("markInfo", markInfo)
    // run layouts
    let markrows = markdata(required, p, this.mark, channels);
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
  }

  async renderTable({document, root}) {
    let dummyroot = this.createDummyRoot(document)

    document.documentElement.appendChild(dummyroot.node())

    let n = this.c.nestof(this)[0]

    console.log("n", n)

    if (n instanceof RootNest) {
      await this.doRootNest(root, dummyroot, n)
    } else {
      await this.doMarkNest(root, dummyroot, n)
    }

    document.documentElement.removeChild(dummyroot.node());
    this._markelsidx = markels(root, this.marktype);

    return this.node;

  }

  async renderFk({document, root}) {
    let paths = []
    let callback = null
    for (const [vattr, e] of Object.entries(this.mappings)) {
      if (e instanceof Object && 'mark' in e) {
        let path = this.c.db.getFkPath(this.src, e.mark.marktable)
        paths.push(path)
      }
    }

    await this.createMarkTableWithRef(paths)



    let channels = await this.marktable.data("cols")

    console.log("channels", channels)

    

    let filtered_channels = {}

    /*
    assume user callback has form
    function usr_callback(x, y, ...) { varying number of arguments
      res = do some work on x
      return res
    }

    We assume the attribute x to run this callback on is the underlying data attribute of the visual attribute the user is using get for ie.
    x: VA.get("b", ['x'], usr_callback)
    will run on the b data attribute of VA because of the "b" the user specifies
    */
   console.log("usr_callbacks", this.usr_callbacks)
    for (const callback of this.usr_callbacks) {
      //look for corresponding attr
      let fattr = callback.fattr;
      let fn = callback.fn
      let fattr_arr = channels.fattr;

      for (const [attr, attr_arr] of Object.entries(channels)) {
        fattr_arr.forEach((elem, idx) => {
          if (fn(elem)) {
            if (!(attr in filtered_channels)) {
              filtered_channels[attr] = []
            }
            filtered_channels[attr].push(attr_arr[idx])            
          }
        })
      }
      channels = filtered_channels
    }

    console.log("channels renderFk", channels)

    channels = this.applychannels(channels)

    console.log("post appy channels", channels)

    this._scales.x = {type: "identity"}
    this._scales.y = {type: "identity"}


    let {p, markInfo} = this.makemark(channels, this.c.options)
    console.log("markInfo", markInfo)
    let mark = p
      root.append("g")
        .node().appendChild(mark)
    this._markelsidx = markels(root, this.marktype);
    return this.node;
  }











  //START OF OLD STUFF ===================================================
  /*
   * @param string[] props list of DOM properties, styles, or data attributes 
   * to extract from the SVG elements.  Any translation (e.g., cx -> x) should happen
   * outside this function
   * @return columnar table
   */


  // markdata(props) {
  //   if (!this.node) {
  //     console.error(this);
  //     throw new Error("Trying to retrieve mark data before rendering")
  //   }
  //   let marks = markdata(props, this.node, this.mark, this._data)
  //   return marks;
  // }

  // async olddoLayout(root, dummyroot, partitions, channels) {
  //   const rls = R.values(this.layouts);
  //   let required = R.uniq(R.pluck("required", rls).flat())

  //   for (const { crow, ids } of partitions) {
  //     // create initial marks
  //     let _channels = applycolfilter(channels, ids);
  //     let mark = this.makemark(_channels, crow)
  //     dummyroot.node().append(mark)

  //     // run layouts
  //     let markrows = markdata(required, mark.p, this.mark, _channels);
  //     console.log("markrows", markrows)
  //     if (!R.all((a) => a in markrows, required)) {
  //       console.log("Missing required attr in markrows", required, R.keys(markrows))
  //     }
  //     for (const rl of rls) {
  //       const layout = rl.layout(markrows, crow) 
  //       for (const va of rl.vattrs)  {
  //         _channels[va] = { value: layout[va] }
  //         this._scales[this.mark.alias2scale[va]] = { type: "identity" }
  //       }
  //     }
  //     await this.lastMakeMark(root, _channels, crow)
  //   }
  // }

  // async concatMarkProps(t:Table) {
  //   if (this.refmarks.has(t.internalname)) {
  //     const tname = t.internalname;
  //     let o = this.refmarks.get(tname) as Map<string, string>
  //     //let o = this.refmarks[tname] as {vattr:string,attr:string};
  //     let data = await t.data("col")
  //     let markdata = this.c.markof(tname)?.markdata(R.values(R.fromPairs(o)))
  //     //for (const [vattr, attr] of Object.entries(o)) {
  //     for (const [vattr, attr] of [...o.entries()]) {
  //       data[vattr] = markdata[attr];
  //     }
  //     let marktable = await this.c.db.fromCols(markdata);
  //     return await marktable.join(t, [IDNAME])
  //   } 
  //   return t;
  // }

  // async getColsAndWhere(n: RootNest | MarkNest) {
  //   let parentData = n.parentmarkdata();
  //   if (n instanceof RootNest) {
  //     let where = n.toPredicate();
  //     return {parentData, where}
  //   } else if (n instanceof MarkNest) {
  //     console.log("n.fk.X", n.fk.X)
  //     console.log("n.fk.Y", n.fk.Y)
  //     let where = n.toPredicate(n.fk.X, n.fk.Y)
  //     parentData = await n.parentsrcdata()
  //     return {parentData, where}
  //   }
  // }

  // initialPartitions(cols, data, where) {
  //   let partitions = cols[IDNAME].map((i,idx) => {
  //     let crow = rowof(cols, idx, R.keys(cols));
  //     return { crow, ids: filtercoldata(data, crow, where) }
  //   })
  //   console.log("partitions from initialPartitions", partitions)
  //   return partitions
  // }

  // transformPartitions(n: MarkNest, partitions) {
  //   let cols = n.parentmarkdata()
  //   let markcrows = cols[IDNAME].map((i, idx) => {
  //     return rowof(cols, idx, R.keys(cols))
  //   })
  //   let markdataPartitions = partitions.map(({crow, ids}) => {
  //     let markcrow = markcrows.find((row) => {
  //       if (row[IDNAME] == crow[IDNAME]) {
  //         return true
  //       }
  //       return false
  //     })
  //     return {crow:markcrow, ids}
  //   })
  //   return markdataPartitions
  // }

  // async oldrenderTable({document, root}) {
  //   //await this.renderTable({document, root})
  //   const t = this.src as Table;

  //   let data = this._data = await (await this.concatMarkProps(t)).data("col")

  //   let dummyroot = this.createDummyRoot(document)

  //   document.documentElement.appendChild(dummyroot.node())

  //   let channels = this.applychannels(data)

  //   const {p, markInfo} = this.makemark(channels, this.c.options)
  //   let fullmarks = p
  //   for (const va of R.keys(channels)) {
  //     let sa = this.mark.alias2scale[va];
  //     if (sa)
  //       this._scales[sa] = {
  //         domain: fullmarks.scale(sa).domain,
  //         type: fullmarks.scale(sa).type
  //     }
  //   }

  //   let n = this.c.nestof(this)[0]

  //   let {parentData, where} = await this.getColsAndWhere(n)

  //   let partitions = this.initialPartitions(parentData, data, where)

  //   partitions = this.transformPartitions(n, partitions)

  //   if (R.isEmpty(this.layouts)) {
  //     for (const { crow, ids } of partitions) {
  //       await this.lastMakeMark(root, applycolfilter(channels, ids), crow)
  //     }
  //   } else {
  //     await this.olddoLayout(root, dummyroot, partitions, channels)
  //   }
    
  //   document.documentElement.removeChild(dummyroot.node());
  //   this._markelsidx = markels(root, this.marktype);

  //   return this.node;
  // }
}

