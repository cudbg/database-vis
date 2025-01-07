import * as R from "ramda";
import { Query, sql, agg, and, eq, column, literal } from "@uwdata/mosaic-sql";
import { Cardinality } from "./constraint";
import { Table, IDNAME } from "./table"

export interface Nest {
  parentsrcdata();
  parentmarkdata();
  addtoquery(q:Query, containername);
}

export class RootNest implements Nest {
  c;
  width;
  height;
  constructor(c, options) {
    this.c = c;
    const { width, height } = options;
    this.width = width;
    this.height = height;
  }

  parentsrcdata() {}

  parentmarkdata() {
    return {
      width: [this.width],
      height: [this.height],
      x: [this.c.options.x],
      y: [this.c.options.y],
      [IDNAME]: [0]
    }
  }

  toPredicate() {
    return R.curry((lrow, rrow) => true)
  }

  async addtoquery(q:Query, containername) {
    let container = await Table.fromRows(
      this.c.db, 
      [{width:this.width, height:this.height}])
    q.from({ 
      [containername]: container.internalname
    })
  }
}

export class MarkNest implements Nest {
  c;
  fk;
  innerMark;
  outerMark;
  constructor(c, fk, innerMark, outerMark) {
    console.log(fk)
    if (fk.card != Cardinality.ONEMANY && fk.card != Cardinality.ONEONE)
      throw new Error(`Trying to nest for fk ${fk.card}`)
    this.c = c;
    this.fk = fk;
    this.innerMark = innerMark;
    this.outerMark = outerMark;
  }

  async parentsrcdata() {
    return await this.c.markof(this.fk.t1)?.src.data("cols")
  }

  // return columnar
  parentmarkdata() {
    return this.c.markof(this.fk.t1)
      ?.markdata(["width", "height", "x", "y", ...this.fk.X]);
  }

  // @returns curried function
  toPredicate(X, Y) {
    const jks = R.zip(this.fk.X, this.fk.Y) as string[][];
    return R.curry((lrow, rrow) => {
      //return lrow[X] == rrow[Y]
      for (const [l,r] of jks) 
        if (!R.equals(lrow[l],rrow[r])) return false;
      return true;
    })
  }

  addtoquery(q: Query, containername) {
    const fk = this.fk;
    const basename = fk.t1.internalname;
    let m = this.c.markof(fk.t1)

    let joinpred = and(R.zip(fk.X, fk.Y).map((x,y) => eq(
      column(containername, x), column(basename, y))))

    q.from({[containername]: m.markTable.internalname})
      .where(joinpred)
  }
}
