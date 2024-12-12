import * as R from "ramda";
import { Canvas } from "../canvas";
import { marksbytype  } from "../mark";
import { Identity, Sqrt, Linear, Ordinal } from "../scale"
import { Cardinality } from "../constraint";
import { IDNAME } from "../table";

export class mgg {
    static canvas;
    static id = IDNAME;
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
}