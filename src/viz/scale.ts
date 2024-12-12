import * as R from "ramda";
import { Query, sql, agg, and, eq, column, literal } from "@uwdata/mosaic-sql";
import { IDNAME, TName, Table, createView } from "./table";
import { idexpr } from "./id"


const STAT_EXPRS = {
  "min" : (attr) => sql`min(${attr})`,
  "max" : (attr) => sql`max(${attr})`,
  "rng" : (attr) => sql`max(${attr})-min(${attr})`,
  "cnt" : (attr) => sql`count()`,
  "dcnt" : (attr) => sql`count(distinct ${attr})`
}


  /*
  CREATE TABLE sys.marks_T AS
  select (a-a_min)/(a_rng)*x_rng+x_min) as x,  -- scale(stats_T,container_T).toString()
          (b-b_min)/(b_rng)*y_rng+y_min) as y,
          null as w,
          null as h
  from T, sys.container_T, sys.stats_T
  where container_S.pkey = T.fkey 
  */

class Scale {
  static id = 0;

  id:number;
  statstable:Table;
  attr:string;
  range;

  // @param String attr name of attribute to scale
  // @param Any[] range is an array of expressions or automatically derived from
  //        the mark's container table
  constructor(attr, range) {
    this.id = Scale.id++;
    this.attr = attr;
    this.range = range;
  }

  async apply(db, basetable){ 
    return { from: [], where: [], select: {}}
  };
}

export class Identity extends Scale {
  async apply(db, basetable) {
    return {
      from: [],
      where: [],
      select: { [`${this.attr}`]: sql`${this.attr}` }
    }
  }
}

export class Sqrt extends Scale {
  constructor(attr) {
    super(attr, [])
  }

  async apply(db, basetable) {
    const a:string = this.attr;
    return {
      from: [],
      where: [],
      select: {
        [a]: sql`(${column(basetable.internalname, this.attr)}**0.5)::float`
      }
    }
  }
}

export class Linear extends Scale {
  constructor(attr, range) {
    // guaranteed a single container table
    range ??= [0, column('container', 'width')];
    super(attr, range)
  }

  // TODO: if scale is in a nested mark, and the scales should be free,
  // we should compute per fk statistics
  // SELECT container.pk, ...stats... FROM basetable, container 
  // WHERE basetable.fk = container.pk
  // GROUP BY container.pk

  async apply(db, basetable) {
    const tname = basetable.internalname;
    const a = this.attr;
    const [amin, arng, r] = [`${a}_min`, `${a}_rng`, this.range];

    this.statstable = await basetable.project({
        [amin]: agg`min(${a})`,
        [arng]: agg`max(${a})-min(${a})`
      }, `stats_${basetable.displayname}`)
    const sname = this.statstable.internalname;

    return {
      from: [this.statstable],
      where: [],
      select: {
        [`${a}`]: sql`((${r[1]}-${r[0]}) * 
          (${column(tname,a)}-${column(sname, amin)})/${column(sname, arng)} + 
          ${r[0]})`
      }
    }
  }
}

export class Ordinal extends Scale {
  constructor(attr, range) {
    super(attr, range);

  }

  // VALUES (...) AS NAME(rowid, val), basetable
  //
  async apply(db, basetable:Table) {
    // inline discrete values in the range as a table
    // or if it doesn't exist, use the identity table 
    // TODO: avoid materializing identity table
    let range = this.range;
    if (range != null) {
      range = range
        .map((s,i) => `(${i},${literal(s)})`)
        .join(","); 
      range = sql`VALUES ${range}`
    } else {
      range = `(SELECT ${idexpr} AS id,
                      ${this.attr} AS val 
               FROM ${basetable.internalname})`
    }


    const a:String = this.attr;
    const rngname = `${a}_range`

    this.statstable = await basetable.project({ 
      [`${a}`]: a, 
      [IDNAME]: idexpr }, `stats_${basetable.displayname}`)
    const rangeTable = await createView(db, 
      new TName(rngname, ['id', 'val']),
      range
    );

    return {
      from: [this.statstable, rangeTable],
      where: [
        eq(column(basetable.internalname, a), column(this.statstable.internalname, a)),
        eq(column(this.statstable.internalname, IDNAME), column(rangeTable.internalname, 'id')) ],
      select: { [`${a}`]: column(rangeTable.internalname, 'val') }
    }
  }
}


class Color extends Ordinal {
}




export function identity(attr) {
   return new Identity(attr, [])
};

export function inferScale(attr, type) {
  switch (type) {
    case "num":
      if (attr == "r") return new Sqrt(attr);
      return new Linear(attr, null);
    case "str":
      return new Ordinal(attr, null);
    default:
      throw new Error(`Don't recognize type ${type}`)
  }
}