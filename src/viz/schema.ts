import * as R from "ramda";

export class Schema {
  attrs: string[];
  types: string[];
  a2t;

  constructor(attrs=[], types=[]) {
    this.attrs = attrs;
    this.types = types;
  }

  has(attr) {
    return R.includes(attr, this.attrs)
  }

  push(attr, type) {
    this.attrs.push(attr)
    this.types.push(type)
    return this;
  }

  pick(attrs) {
    let typs = this.types.filter((typ, i) => R.includes(this.attrs[i], attrs), this.types)
    return new Schema(attrs, typs)
  }

  except(attrs) {
    return this.pick(R.without(attrs, this.attrs))
  }

  type(attr)  {
    let i = 0;
    for (const a of this.attrs) {
      if (a == attr) return this.types[i];
      i++;
    }
    return null;
  }

  asObject() {
    return R.fromPairs(R.zip(this.attrs, this.attrs))
  }
}
