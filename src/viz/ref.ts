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

function makelayoutspecs(klass, dattrs?, options?) {
  return (...vas) => {
    vas = vas.flat()
    vas = (vas.length==0)? klass.fills : vas;

    if (klass == RLFD) {
      let getResult = dattrs
      //hardcode key for RLFD as left, right. These will correspond to ids of nodes that have an edge between them
      //Also guaranteed that left and right are not used by observable
      //so if we see left or right, we know there is a call to fdlayout
      vas = ["left", "right"]
      const rl = new klass(dattrs, getResult, options)
      return Object.fromEntries(vas.map((va) => [va, rl]))
    }

    const rl = new klass(dattrs, options)
    return Object.fromEntries(vas.map((va)=>[va, rl])) 
  }
}
export function auto() {}
export function eqX() { return makelayoutspecs(RLX) }
export function propX(attr) { return makelayoutspecs(RLX, attr) }
export function eqY() { return makelayoutspecs(RLY) }
export function propY(attr) { return makelayoutspecs(RLY, attr) }
export function sq(attr) { return makelayoutspecs(RLSQ, attr) }
export function grid(attr, numCols) { return makelayoutspecs(RLGRID, [attr,numCols]) }
export function fdlayout(getResult, options?) { return makelayoutspecs(RLFD, getResult, options) }

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
  genericBag: {} //Need this specifically for RLFD

  fills: string[];
  required: string[];

  _computed;

  constructor(dattrs=[], vattrs=[], genericBag={}) {
    dattrs = Array.isArray(dattrs) ? dattrs : [dattrs];
    vattrs = Array.isArray(vattrs) ? vattrs : [vattrs];
    this.id = `reflayout-${RefLayout.id++}`;
    this.dattrs = dattrs;
    this.vattrs = vattrs;
    this.fills = this.constructor.fills; //[locname, sizename, `${locname}1`, `${locname}2`];
    this._computed = null;
    this.genericBag = genericBag
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
    console.log("data sq", data)

    let hierarchyData = { children: data[this.dattrs[0]].map((elem) => ({"name": elem, "value": typeof elem !== "number" ? 1 : elem})) }
    console.log("hierarchy data", hierarchyData)

    let root = d3.hierarchy(hierarchyData)

    root.sum((d)=>d.value)
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

export class RLGRID extends RLSpaceFilling {
  static fills = ["x", "y", "width", "height", 'x1', 'x2', 'y1', 'y2'];
  numCols: number

  constructor(dattrs, vattrs?) {
    if (Array.isArray(dattrs) && dattrs.length > 2) 
      throw new Error("Expects 1 data attribute");
    if (typeof dattrs[1] != "number") {
      throw new Error("Needs a number for number of columns");
    }
    super(dattrs[0], vattrs);
    this.numCols = dattrs[1]
    this.required = [dattrs[0]] //dattrs has 2 elements. the first is a data column and the second specifies number of columns
  }

  layout(data, {width, height, minx=0, miny=0}) {
    /**
     * Need null guard
     */
    let length = data["x"].length
    let baseWidth = width/this.numCols
    let baseHeight = height / Math.ceil(length/this.numCols)
    let res = {}
    for (let i = 0; i < length; i++) {
      let col = i % this.numCols
      let row = Math.floor(i / this.numCols)
      data["x"][i] = col * baseWidth
      data["y"][i] = row * baseHeight
    }
    return data
  }
}

export class RLFD extends RefLayout {
  strength //repulsion force between nodes
  steps //number of steps to simulate
  foreignKeyColumns: string[]
  getResult: {othertable: string, searchkeys: string[], otherAttr: string[], callback: Function | null, isVisualChannel: boolean}
  links: number[][]
  nodetype: string

  constructor(getResult: {othertable: string, searchkeys: string[], otherAttr: string[], callback: Function | null, isVisualChannel: boolean}, options?) {
    super(null, ["x", "y"], getResult);
    if (getResult.otherAttr.length != 2)
      throw new Error("Pass only 2 foreign attributes into fdlayout!")
    this.required = ["x", "y"]
    this.getResult = getResult
    this.links = []
    this.foreignKeyColumns = [getResult.otherAttr[0], getResult.otherAttr[1]]
    this.strength = (options && options?.strength && (typeof(options.strength) == "number")) ? options.strength : -750
    this.steps = (options && options?.steps && (typeof(options.steps) == "number")) ? options.steps : 300
  }

  setNodeType(nodetype: string) {
    this.nodetype = nodetype

    if (this.nodetype == "rect") {
      this.vattrs = ["x1", "x2", "y1", "y2"]
    }
  }

  layout(data, { width, height }) {
    //We will populate store with information about nodes and links
    //Node data can found in data
    //Link data can be found in this.links

    let nodes = []
    let links = []

    /**
     * Create nodes first
     */
    let datalen = data[IDNAME].length
    for (let i = 0; i < datalen; i++) {
      let nodeObj = {id: data[IDNAME][i]}
      //TODO: use an algorithm to estimate good width and height for rectangles that do not have user specified height
      //The algorithm should not be a space filling algorithm!
      if ("width" in data) {
        nodeObj["width"] = data["width"][i]
        nodeObj["height"] = data["height"][i]
      }
      nodes.push(nodeObj)
    }

    this.links.forEach(link => {
      links.push({source: link[0], target: link[1]})
    })

    //link force and charge force are always present in the force layout algorithm
    //link force specifies a minimum distance for links
    //charge force specifies the amount of repulsion bewteen nodes

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(this.strength))

    if (nodes[0].width != null) {
      simulation.force("collide", d3.forceCollide().radius(d => Math.sqrt(d.width * d.width + d.height * d.height) / 2 + 50))
    } else {
      simulation.force("collide", d3.forceCollide())
    }

    //this force makes sure all marks remain within the canvas
    simulation.force("boundingBox", function() {
      nodes.forEach(function(node) {
        //for differentiating between rectangles/squares and dots
        let leftBound = 0
        let rightBound = width
        let topBound = 0
        let bottomBound = height

        if (node.width != null) {
          leftBound = node.width/2
          rightBound = width - node.width/2
          topBound = node.height/2
          bottomBound = height - node.height/2

        }

        if (node.x < leftBound) {
          node.vx = Math.abs(node.vx);  // Push right if out of bounds on the left
        }
        if (node.x > rightBound) {
          node.vx = -Math.abs(node.vx);  // Push left if out of bounds on the right
        }
        // Constrain y position
        if (node.y < topBound) {
          node.vy = Math.abs(node.vy);  // Push down if out of bounds on the top
        }
        if (node.y > bottomBound) {
          node.vy = -Math.abs(node.vy);  // Push up if out of bounds on the bottom
        }
      })
    })
    .stop()
    .tick(this.steps)


    if (this.nodetype == "rect") {
      const x1 = nodes.map(node => node.x);
      const x2 = nodes.map(node => node.x + node.width);
      const y1 = nodes.map(node => node.y);
      const y2 = nodes.map(node => node.y + node.height);
      const width = nodes.map(node => node.width);
      const height = nodes.map(node => node.height);

      return {x1, y1, x2, y2}
    }
    const x = nodes.map(node => node.x);
    const y = nodes.map(node => node.y);
   
    return {x, y}
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

