import * as R from "ramda";
import { Canvas } from "../canvas";
import { marksbytype  } from "../mark";
import { Identity, Sqrt, Linear, Ordinal } from "../scale"
import { Cardinality } from "../constraint";
import { IDNAME } from "../table";

export class mgg {
    static canvas;
    //static id = IDNAME;
    static plot(db, {width, height}, plotConfig?) {
        mgg.canvas = new Canvas(db, {width, height}, plotConfig)
        return mgg.canvas
    }

    static linear(tablename: string) {
        let tableObj = this.canvas.db.tables.get(tablename)
        tableObj.schema.attrs.forEach((attr) => {
            return new Linear(attr, null)
        })
    }

    static async createTable(tname, attrs, newname, dimname?) { //returns a table object
        return await this.canvas.db.normalize(tname, attrs, newname, dimname)
    }

    static FilterOperators = {
        EQUAL: "=",
        NOT_EQUALS: "!=",
        LESS_THAN: "<",
        GREATER_THAN: ">",
        LESS_EQUAL: "<=",
        GREATER_EQUAL: ">=",
    }

    static AggregateOperators = ["count", "max", "min", "median"]

    static count() {
        return {aggregateFuncion: "count"}
    }

    static max(colname) {
        return {aggregateFunction: "max", col: colname}
    }

    static min(colname) {
        return {aggregateFunction: "min", col: colname}
    }

    static median(colname) {
        return {aggregateFunction: "median", col: colname}
    }

    static mappings = {"w2c":{"4":["i","j","l","I"],"5":["f"],"6":["r","t"],"7":["1"],"8":["k","s","v","x","y","z","J"],"9":["2","7","a","c","e","g","h","n","o","p","q","u","E","F","L"],"10":["3","4","5","6","8","9","0","b","d","A","B","K","P","R","S","T","V","Y","Z"],"11":["C","D","U","X"],"12":["w","G","H","N","O","Q"],"14":["m","M"],"15":["W"]},"c2w":{"0":10,"1":7,"2":9,"3":10,"4":10,"5":10,"6":10,"7":9,"8":10,"9":10,"a":9,"b":10,"c":9,"d":10,"e":9,"f":5,"g":9,"h":9,"i":4,"j":4,"k":8,"l":4,"m":14,"n":9,"o":9,"p":9,"q":9,"r":6,"s":8,"t":6,"u":9,"v":8,"w":12,"x":8,"y":8,"z":8,"A":10,"B":10,"C":11,"D":11,"E":9,"F":9,"G":12,"H":12,"I":4,"J":8,"K":10,"L":9,"M":14,"N":12,"O":12,"P":10,"Q":12,"R":10,"S":10,"T":10,"U":11,"V":10,"W":15,"X":11,"Y":10,"Z":10}}

    static getWidth(str: string) {
        let ans = 0
        for (let i = 0; i < str.length; i++) {
            ans += mgg.mappings["c2w"][str[i]]
        }
        return ans
    }
}