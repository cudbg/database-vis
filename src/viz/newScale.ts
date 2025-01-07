export class Scale {
    domain;
    range;
    type;
    col;

    constructor(col) {
        this.domain = null;
        this.range = null;
        this.type = null;
        this.col = col;
    }

    getCol(){
        return this.col;
    }

    getDomain() {
        return this.domain;
    }

    setDomain(newDomain) {
        this.domain = newDomain;
        return this.domain;
    }

    getRange() {
        return this.range;
    }

    setRange(newRange) {
        this.range = newRange;
        return this.range;
    }

    getType() {
        return this.type;
    }

    setType(newType) {
        this.type = newType;
        return this.type;
    }
}