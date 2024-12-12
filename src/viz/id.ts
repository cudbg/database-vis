import * as R from "ramda";
import { type Query, sql } from "@uwdata/mosaic-sql";

export const idexpr = sql`((row_number() OVER ())::int-1)`


//export class Id {
//  static id = 0;
//  _id = 0;
//  prefix:string;
//  constructor(prefix='seq') {
//    this._id = Id.id++;
//    this.prefix = prefix;
//  }
//  id() {
//    return `${this.prefix}_${this._id}`;
//  }
//
//  // @param sql one or more sql strings
//  // @returns list of SQL queries
//  wrap(sql:Query|string|string[])  {
//    return [sql];
//    sql = Array.isArray(sql)? sql : [`${sql}`];
//    let id = this.id()
//    let qs = [
//      `DROP SEQUENCE IF EXISTS ${id}`,
//      `CREATE SEQUENCE ${id} START 0`,
//      ...sql,
//      `DROP SEQUENCE ${id}`
//    ]
//  }
//
//  toString() {
//    return sql`row_number() OVER ()`
//    return `nextval('${this.id()}')`
//  }
//}
//