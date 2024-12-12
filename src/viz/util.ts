import { writable, get } from "svelte/store"
import * as Plot from "@observablehq/plot";
import * as R from "ramda"


const isArray = Array.isArray;

export function coercetype(duckdbtype) {
  switch(duckdbtype) {
    case 'BIGINT':
    case 'INT8':
    case 'LONG':
    case 'DECIMAL':
    case 'NUMERIC':
    case 'DOUBLE':
    case 'FLOAT8':
    case 'HUGEINT':
    case 'INTEGER':
    case 'INT4':
    case 'INT':
    case 'SIGNED':
    case 'REAL':
    case 'FLOAT4':
    case 'FLOAT':
    case 'SMALLINT':
    case 'INT2':
    case 'SHORT':
    case 'TINYINT':
    case 'INT1':
    case 'UBIGINT':
    case 'UHUGEINT':
    case 'UINTEGER':
    case 'USMALLINT':
    case 'UTINYINT':
    case 'UUID':
    case 'BOOLEAN':
    case 'BOOL':
    case 'LOGICAL':
    case 'BIT':
      return "num"

    case 'VARCHAR':
    case 'CHAR':
    case 'BPCHAR':
    case 'TEXT':
    case 'STRING':
      return "str"

    case 'DATE':
    case 'TIME':
    case 'TIMESTAMP':
    case 'TIMESTAMPTZ':
    case 'TIMESTAMP':
    case 'DATETIME':
      //throw new Error(`Dont support ${duckdbtype} type`);
      return 'datetime'

    case 'BITSTRING':
    case 'BLOB':
    case 'BYTEA':
    case 'BINARY':
    case 'VARBINARY':
    case 'INTERVAL':
      throw new Error(`Dont support ${duckdbtype} type`);

  }
}







export function unorderedEquals (a:any[],b:any[]) {
  return (a.length == b.length && 
    R.intersection(a,b).length == a.length)
}



export const PLOTCLASS = "_theplot_"
export const DEFAULTMARGIN = { top: 30, right: 20, bottom: 50, left: 40 };

// @param options Plot options
// @param el DOM element to render into
export function plotRender(options, el) {
  options.className = options.className || PLOTCLASS;
  const hasWidth = !R.isNil(options.width);

  let theplot = Plot.plot(options)
  let svg = null;

  if (theplot.tagName == "svg" && theplot.classList.contains(options.className)) 
    svg = theplot;
  else 
    svg = theplot.querySelector(`svg.${options.className}`)
  svg.classList.add(PLOTCLASS)

  if (!options.width) 
    svg.setAttribute("width", "100%")

  el.innerHTML = "";
  el.appendChild(theplot)
  return theplot;
}

export class EventEmitter {
  static _id = 0;
  listeners = {};

  on(name, cb) {
    let key = EventEmitter._id++;
    this.listeners[name] = this.listeners[name] || {};
    this.listeners[name][key] = cb
    // unsubscribe
    return () => {
      delete this.listeners[name][key]
    }
  }

  emit(name, ...args) {
    let cbs = R.values(this.listeners[name]) ?? [];
    cbs.forEach((cb) => { cb(...args) })
  }
}


export { }
