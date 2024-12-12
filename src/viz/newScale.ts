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
        console.log("getting col")
        return this.col;
    }

    getDomain() {
        console.log("getting domain")
        return this.domain;
    }

    setDomain(newDomain) {
        console.log("setting domain")
        this.domain = newDomain;
        return this.domain;
    }

    getRange() {
        console.log("getting range")
        return this.range;
    }

    setRange(newRange) {
        console.log("setting range")
        this.range = newRange;
        return this.range;
    }

    getType() {
        console.log("getting type")
        return this.type;
    }

    setType(newType) {
        console.log("setting type")
        this.type = newType;
        return this.type;
    }
}