export class ScaleObject {
    col: string
    scale: Scale
    constructor(col, scale) {
        this.col = col
        this.scale = scale
    }
}

export class Scale {
    domain;
    range;
    type;
    callback;

    constructor(callback) {
        this.domain = null;
        this.range = null;
        this.type = null;
        this.callback = callback

    }

    apply(data) {
        if (this.callback)
            return this.callback(data)
    }
}