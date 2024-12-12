import * as R from "ramda";
import { Query, sql, agg, and, eq, column } from "@uwdata/mosaic-sql";
import type { Table } from "./table"


export enum Cardinality {
  ONE,
  MANY,
  ONEONE,
  ONEMANY,
  MANYMANY
}

const repk = /PRIMARY KEY\(([^)]+)\)/;
const refk = /FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s*([^(]+)\(([^)]+)\)/;
const reuniq = /UNIQUE\(([^)]+)\)/;
 
/*
 * Extract unique or fk constraint from duckdb's constraint text
 * see regular expressions repk, refk, reuniq above
*/
export function constraintFromText(text) {
  let match = text.match(repk);
  if (match) {
    return { pk: match[1].split(',').map(item => item.trim()) };
  }
  match = text.match(refk);
  if (match) {
    return { fk: {
      fkattrs: match[1].split(',').map(item => item.trim()),
      ref: match[2].trim(),
      refattrs: match[3].split(',').map(item => item.trim())
    }}
  }
  match = text.match(reuniq);
  if (match) {
    return { uniq: match[1].split(',').map(item => item.trim()) }
  }
  return {}
}



export class Constraint {
  static id = 0;

  id;
  name: string;

  constructor() {
    this.id = Constraint.id++;
    this.name = `c-${this.id++}`;
  }

}

export class PKConstraint extends Constraint {
  attrs:string[];
  constructor(attrs) {
    super();
    this.attrs = attrs;
  }
}


export class FKConstraint extends Constraint {
  t1:Table;
  t2:Table;
  X:string[];
  Y:string[];
  card:Cardinality;

  // t1.X -> t2.Y
  constructor({t1, X, t2, Y}) {
    super()

    let xkey = t1.isKey(X)
    let ykey = t2.isKey(Y)
    if (!xkey && ykey) {
      [xkey, t1, X, ykey, t2, Y] = [ykey, t2, Y, xkey, t1, X];
    } 

    this.t1 = t1;
    this.t2 = t2;
    this.X = X;
    this.Y = Y;

    if (xkey && !ykey) {
      this.card = Cardinality.ONEMANY;
    } else if (xkey && ykey) {
      this.card = Cardinality.ONEONE;
    } else if (!xkey && !ykey) {
      this.card = Cardinality.MANYMANY;
    }
  }

  follow(t) {
    if (t == this.t1) 
      return { src:t, dst:this.t2, srcKey:this.X, dstKey:this.Y };
    return { src: t, dst:this.t1, srcKey: this.Y, dstKey: this.X };
  }

  x() {
    return this.X.map((x)=>{return column(this.t1.internalname, x)});
  }

  y() {
    return this.Y.map((y)=>{return column(this.t2.internalname, y)});
  }

  toPredicate(alias1=null, alias2=null) {
    alias1 ??= this.t1.internalname;
    alias2 ??= this.t2.internalname;
    return and(R.zip(this.X, this.Y).map((x,y) => {
      return eq( column(alias1, x), column(alias2, y))
    }))
  }

  // as a SQL expression
  toString() {
    return this.toPredicate().toString()
  }
}


