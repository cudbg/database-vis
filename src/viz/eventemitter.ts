import * as R from "ramda"

let _id = 0;

export class EventEmitter {
  listeners = {};

  on(name, cb) {
    let key = _id++;
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


