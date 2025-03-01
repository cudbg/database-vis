import * as R from "ramda";
import { Canvas } from "../canvas";
import { marksbytype  } from "../mark";
import { Identity, Sqrt, Linear, Ordinal } from "../scale"
import { Cardinality } from "../constraint";
import { IDNAME } from "../table";
import {Query, count, max, min, median, avg} from "@uwdata/mosaic-sql"
import { type AggFn } from "../types";

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

    static AggregateOperators = ["count", "max", "min", "median", "avg"]

    static count({renameAs}): AggFn {
        if (typeof renameAs !== "string")
            throw new Error("Column name must be a string")
        return {renameAs: renameAs, fn: "count", col: null}
    }

    static max({renameAs, col}): AggFn {
        if (typeof renameAs !== "string" || typeof col !== "string")
            throw new Error("Column name must be a string")
        return {renameAs: renameAs, fn: "max", col: col}
    }

    static min({renameAs, col}): AggFn {
        if (typeof renameAs !== "string" || typeof col !== "string")
            throw new Error("Column name must be a string")
        return {renameAs: renameAs, fn: "min", col: col}
    }

    static median({renameAs, col}): AggFn {
        if (typeof renameAs !== "string" || typeof col !== "string")
            throw new Error("Column name must be a string")
        return {renameAs: renameAs, fn: "min", col: col}
    }

    static avg({renameAs, col}): AggFn {
        if (typeof renameAs !== "string" || typeof col !== "string")
            throw new Error("Column name must be a string")
        return {renameAs: renameAs, fn: "avg", col: col}
    }

    static appendAggFn(query, aggFn: AggFn) {
        console.log("aggFn", aggFn)
        console.log("query", query)
        let fn = aggFn.fn
        switch (fn) {
            case "count":
                        query = query.select({[aggFn.renameAs]: count()})
                        return query
            case "max": 
                        query = query.select({[aggFn.renameAs]: max([aggFn.col])})
                        return query
            case "min": 
                        query = query.select({[aggFn.renameAs]: min([aggFn.col])})
                        return query
            case "median":
                        query = query.select({[aggFn.renameAs]: median([aggFn.col])})
                        return query
            case "avg":
                        query = query.select({[aggFn.renameAs]: avg([aggFn.col])})
                        return query
            default:
                throw new Error(`Unsupported aggregate function: ${fn}`)
        }

    }
}