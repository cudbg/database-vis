import * as R from "ramda";
import { get, writable, derived } from "svelte/store";
import { Query, sql, agg, and, eq, column, literal } from "@uwdata/mosaic-sql";
import { idexpr } from "./id";
import { unorderedEquals } from "./util";
import type { Schema } from "./schema";



export const IDNAME = "_rav_id"

export class TName {
  tablename;
  attrs:string[];
  constructor(tablename, attrs=null) {
    this.tablename = tablename;
    this.attrs = attrs;

  }
  toString() {
    let attrs = (this.attrs && this.attrs.length)
      ? `(${this.attrs.join(",")})`
      : '';
    return `${this.tablename}${attrs}`;
  }
}
export function maybetname(name) {
  if (name instanceof TName) return name;
  return new TName(name);
}


export async function createView(db, viewname, q:Query|String) {
  return await db.createView(viewname, q)
}


// table is either a base table or a query result.
// all tables have name and schema

// Tables are immutable.
// all operations create new tables
export class Table {
  static id = 0;
  db;
  displayname: string;
  internalname: string;  // name of table in duckdb
  schema:Schema;
  _keys: string[][];

  /**
   * @param name alias of table
   * @param q Query object
   **/
  constructor(db, { displayname=null, internalname, schema=null, keys=[] }) {
    this.db = db;
    this.internalname = internalname ?? Table.newname();
    this.displayname = displayname ?? internalname;
    this.schema = schema;
    this._keys = keys
  }

  static newname(prefix="table") {
    return `${prefix}_${Table.id++}`;
  }

  static async fromRows(db, rows, internalname=null) {
    return await db.fromRows(rows, internalname);
  }

  static async fromSql(db, q, internalname=null)  {
    return await db.fromSql(q, internalname)
  }

  async data(format="row") {
    return this.db.data(this.internalname, format)
  }

  pkey() {
    // TODO: guarantee that this is always an id() if this is not 
    // a base table!!
    return this._keys[0];
  }

  keys(key) {
    if (!key) {
      return this._keys;
    }
    key = [key].flat();
    this._keys.push(R.uniq(key));
    return this._keys;
  }

  isKey(key) {
    return R.any((_key) => R.without(key??[], _key).length == 0, this._keys)
  }

  public copy(newname) {
    return new Table(newname, { 
      displayname: this.displayname,
      internalname: this.internalname,
      schema: this.schema,
      keys: this._keys })
  }

  isEmpty(obj: Object): boolean {
    return Object.keys(obj).length === 0;
  }

  async join(o:Table, on:any|string[], select=null, displayname=null) {
    let where = (Array.isArray(on)? 
      and(on.map((a) => eq(column('l',a),column('r',a)))):
      on);
    let q = Query
      .from({l:this.internalname, r:o.internalname})
      .where(where);
    
    if (select == null) {
      select = {}
      this.schema.attrs.forEach((a) => {
        if (a == IDNAME)
          select[`${this.internalname}_${a}`] = column('l', a)
        else
          select[a] = column('l', a)
      })
      o.schema.attrs.forEach((a) => {
        if (a == IDNAME)
          select[`${o.internalname}_${a}`] = column('r', a)
        else
          select[a] = column('r', a)
      })
    }
    //let id = new Id()
    //select[IDNAME] ??= `${id}`;
    select[IDNAME] ??= idexpr;
    q.select(select);
    let t = (await Table.fromSql(
      this.db, 
      q, //id.wrap(q), 
      displayname ??  `${this.internalname}_${o.internalname}`))
    t.name(displayname)
    t.keys(IDNAME);
    return t;
  }

  // expr is anything that can toString into a valid SQL expression
  async filter(expr, displayname=null) {
    let q = Query.from(this.internalname).where(expr)
    let t = await Table.fromSql(this.db, q, displayname)
    t.name(displayname)
    return t;
  }

  async groupby(o, displayname=null) {
    o[IDNAME] ??= idexpr;
    let keys = R.keys(o).filter((key) => o[key].aggregate == true)
    let q = Query.from(this.internalname).select(o)
    let t = await Table.fromSql(this.db, q, displayname);
    t.keys(keys)
    t.name(displayname)
    return t;
  }

  async distinctproject(o, displayname=null) {
    let subq = Query.from(this.internalname).select(o).distinct(true)
    let q = Query.with({ tmp: subq })
      .from("tmp")
      .select("*")
      .select({[IDNAME]:idexpr})
      .toString()
    let t = await Table.fromSql(this.db, q, displayname);
    let keptAttrs = this.schema.pick(R.values(o)).attrs
    t.keys(keptAttrs);
    t.name(displayname)
    return t;
  }

  // { alias: expr, ... }   // '*' not allowed
  async project(o, displayname=null) {
    o[IDNAME] ??= idexpr;
    displayname ??= Table.newname()
    let q = Query.from(this.internalname).select(o).toString()
    let t = await Table.fromSql(this.db, q, displayname);
    let keptAttrs = this.schema.pick(R.values(o)).attrs
    let newKeys = this._keys.filter((key) => unorderedEquals(keptAttrs, key))
    t.keys(newKeys);
    t.name(displayname)

    // TODO: propogate FK a.X->b.Y from this to new table if:
    // * Y is still in t and b==t   or
    // * X is still in t and a==t
    return t;
  }

  async fold(attrs, keyname='key', valname='val', displayname=null) {
    if (attrs.length == 0) return this;
    const rest = R.without(attrs, this.schema.attrs)
    let subqs = attrs.map((a) => {
      return Query.from(this.internalname)
        .select(rest)
        .select({ 
          [keyname]: literal(a),
          [valname]: column(a)
        })
    })
    const q = Query.union(subqs).toString()
    let t = await Table.fromSql(this.db, q, displayname)
    let newKeys = this._keys.filter((key) => R.isEmpty(R.without(rest, key)))
    t.keys(newKeys);
    t.name(displayname)
    return t;
  }

  public name(newName) {
    if (!newName) return this.displayname;
    this.displayname = newName;
    return this.displayname;
  }
}


