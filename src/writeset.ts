import * as R from 'ramda';
// each transaction manages the old and new versions of the interactions they modify.
// this is called the "write set" in database transaction management
export default class WriteSet {
  add(oldVal, newVal, iact) {
    let key = `${iact.view.id}::${iact.eventname}`
    if (R.isNil(this[key])) 
      this[key] = { iact, oldVal, newVal }
    else
      this[key].newVal = newVal
    console.log("WriteSet.add", key, this[key])
    return this;
  }

  forEach(f) {
    R.values(this).forEach(f)
  }

  merge(other) {
    if (R.isNil(other)) return this;
    other.forEach(({iact, oldVal, newVal}) => {
      this.add(oldVal, newVal, iact)
    })
  }
}


