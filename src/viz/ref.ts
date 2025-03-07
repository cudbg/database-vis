import * as R from "ramda";
import * as d3 from "d3";
import { Query, sql, agg, and, eq, column } from "@uwdata/mosaic-sql";
import { Database } from "./db";
import { Table, IDNAME } from "./table";
import { Constraint, FKConstraint } from "./constraint";
import {Mark} from "./newMark"

export function markof(source, attr?) {
  if (typeof source == "string") {}  // tablename
  else if (source instanceof Table) {
    source = source.internalname;
  } else if (source instanceof Mark) {
    source = source.src.internalname;
  }
  return new RefMark(source, attr);
}

function makelayoutspecs(klass, dattrs?) {
  return (...vas) => {
    vas = vas.flat()
    vas = (vas.length==0)? klass.fills : vas;
    const rl = new klass(dattrs)
    return Object.fromEntries(vas.map((va)=>[va, rl])) 
  }
}
export function auto() {}
export function eqX() { return makelayoutspecs(RLX) }
export function propX(attr) { return makelayoutspecs(RLX, attr) }
export function eqY() { return makelayoutspecs(RLY) }
export function propY(attr) { return makelayoutspecs(RLY, attr) }
export function sq(attr) { return makelayoutspecs(RLSQ, attr) }

class RefBase {
  t: Table;
  attr: string;

  constructor(t, attr?) {
    this.t = t;
    this.attr = attr;
  }
}
export class RefColumn extends RefBase { }
export class RefMark extends RefBase { }




export class RefLayout {
  static id = 0;
  id:string;
  dattrs: string[];
  vattrs: string[];
  containerTable: string;

  fills: string[];
  required: string[];

  _computed;

  constructor(dattrs=[], vattrs=[]) {
    dattrs = Array.isArray(dattrs) ? dattrs : [dattrs];
    vattrs = Array.isArray(vattrs) ? vattrs : [vattrs];
    this.id = `reflayout-${RefLayout.id++}`;
    this.dattrs = dattrs;
    this.vattrs = vattrs;
    this.fills = this.constructor.fills; //[locname, sizename, `${locname}1`, `${locname}2`];
    this._computed = null;
  }

  container(name) {
    if (name == null) return this.containerTable;
    this.containerTable = name;
    return this.containerTable;
  }

  add(...vattrs:string[]) {
    for (const vattr of vattrs.flat()) {
      if (typeof vattr != "string")
        throw new Error(`wtf: ${vattr} ${typeof vattr}`)
      if (!this.vattrs.includes(vattr))
        this.vattrs.push(vattr)
    }
  }

  get(vattr) {
    if (!R.includes(vattr, this.vattrs) ) 
      throw new Error(`${vattr} was not found in ${this.vattrs}`);
  }

  toSql(marktablename) {
    return [];
  }
}

class RLSpaceFilling extends RefLayout {
  padding;

  constructor(dattrs, vattrs?) {
    super(dattrs, vattrs)
    this.padding = 5;
  }

}

export class RL1D extends RLSpaceFilling {
  constructor(dattrs=[], vattrs?, options={}) {
    if (Array.isArray(dattrs) && dattrs.length > 1) 
      throw new Error("Expects <=1 data attribute");
    super(dattrs, vattrs);
    this.required = dattrs;
  }

  layout(data, { rangemin, rangemax }) { }
}

export class RLX extends RL1D {
  static fills = ['x', 'x1', 'x2', 'width']

  layout(data, options) {
    const treemap = d3.treemap()
    treemap.tile(d3.treemapDice);
    treemap.size([options.width ?? 100, 10])
    treemap.padding(this.padding)

    const children = (this.dattrs.length==0)
      ? R.repeat(1, data[IDNAME].length)
      : data[this.dattrs[0]];
    let root = d3.hierarchy({ children })
    root.sum((d)=>+d)
    treemap(root)

    let x1 = R.pluck("x0", root.children as any[])
    let x2 = R.pluck("x1", root.children as any[])
    let widths = R.zip(x2,x1).map(([e,s])=>e-s)
    return R.pick(this.vattrs, {
      [IDNAME]: [...data[IDNAME]],
      x: x1, x1, x2, width:widths
    })
  }
}

export class RLY extends RL1D {
  static fills = ['y', 'y1', 'y2', 'height']

  layout(data, options) {
    if (!data || Object.keys(data).length === 0) {
      console.warn("No data provided for layout. Returning empty result.");
      return { [IDNAME]: [], y: [], y1: [], y2: [], height: [] }; // Return empty structure
  }

  // Check if all values in data are empty arrays
  const allEmpty = Object.values(data).every(arr => Array.isArray(arr) && arr.length === 0);
  if (allEmpty) {
      console.warn("Data contains empty arrays. Returning empty result.");
      return { [IDNAME]: [], y: [], y1: [], y2: [], height: [] }; // Return empty structure
  }
    console.log("data", data)
    console.log("options", options)
    options.height ??= 100;
    const treemap = d3.treemap()
    treemap.tile(d3.treemapSlice);
    treemap.size([10, options.height ?? 100])
    treemap.padding(this.padding)

    const children = (this.dattrs.length==0)
      ? R.repeat(1, data[IDNAME].length)
      : data[this.dattrs[0]];
    let root = d3.hierarchy({ children })
    root.sum((d)=>+d)
    treemap(root)

    console.log("root", root)
    console.log("root.children", root.children)
    let y1 = R.pluck("y0", root.children as any[])
    let y2 = R.pluck("y1", root.children as any[])
    let heights = R.zip(y2,y1).map(([e,s])=>e-s)
    return R.pick(this.vattrs, {
      [IDNAME]: [...data[IDNAME]],
      y: y1, y1, y2, height:heights
    })
  }

}

export class RLSQ extends RLSpaceFilling {
  static fills = ["x", "y", "width", "height", 'x1', 'x2', 'y1', 'y2'];
  tiling;

  constructor(dattrs, vattrs?, tiling?) {
    if (Array.isArray(dattrs) && dattrs.length != 1) 
      throw new Error("Expects 1 data attribute");
    super(dattrs, vattrs);
    this.required = dattrs;
    this.tiling = tiling ?? d3.treemapSquarify;
  }
  layout(data, {width, height, minx=0, miny=0}) {
    const treemap = d3.treemap()
    treemap.tile(this.tiling);
    treemap.size([width, height])
    treemap.padding(this.padding)

    let root = d3.hierarchy({ children: data[this.dattrs[0]] })
    root.sum((d)=>+d)
    treemap(root)

    let x1 = R.pluck("x0", root.children as any[])
    let x2 = R.pluck("x1", root.children as any[])
    let y1 = R.pluck("y0", root.children as any[])
    let y2 = R.pluck("y1", root.children as any[])
    let widths = R.zip(x2,x1).map(([e,s])=>e-s)
    let heights = R.zip(y2,y1).map(([e,s])=>e-s)
    return R.pick(this.vattrs, {
      [IDNAME]: data[IDNAME],
      x:x1, x1, x2, y:y1, y1, y2, width:widths, height:heights
    })
  }
}

class RLPhysics extends RefLayout {
  constructor(dattrs, vattrs) {
    if (dattrs.length != 2) 
      throw new Error("Expects 2 data attributes");
    super(dattrs, vattrs);
    this.fills = ["x", "y"];
    this.required = [];
  }
  layout(data, {width, height}) {
    return {
      [IDNAME]: [],
      x:[],
      y:[]
    }
  }

}

