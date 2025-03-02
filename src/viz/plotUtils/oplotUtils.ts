import * as R from "ramda";
import * as OPlot from "@observablehq/plot";
import { IDNAME } from "../table";

export class oplotUtils {
    static config = {
        bar: {
          klass: OPlot.barX,
          domprops: ['x', 'y', 'width', 'height']
        },
        barX: {
          klass: OPlot.barX,
          aria: "bar",
          domprops: ['x', 'y', 'width', 'height']
        },
        barY: {
          klass: OPlot.barY,
          aria: "bar",
          domprops: ['x', 'y', 'width', 'height']
        },
        cell: {
          klass: OPlot.cell,
          domprops: ['x', 'y', 'width', 'height']
        },
        dot: {
          klass: OPlot.dot,
          x: ['cx'],
          y: ['cy'],
          domprops: ['cx', 'cy']
        },
        frame: {
          klass: OPlot.frame,
        },
        line: {
          klass: OPlot.lineY,

          x: ['x1', 'x2'],
          y: ['y1', 'y2'],
          shortcuts: {
            start: ['x1', 'y1'],
            end: ['x2', 'y2']
          }
        },
        link: {
          klass: OPlot.link,
          x: ['x1', 'x2'],
          y: ['y1', 'y2'],
          shortcuts: {
            start: ['x1', 'y1'],
            end: ['x2', 'y2']
          }
        },
        point: {
          klass: OPlot.dot,
          x: ['cx'],
          y: ['cy'],
          domprops: ['cx', 'cy']
        },
        square: {
          klass: OPlot.rect,
          x: ['x1', 'x2'],
          y: ['y1', 'y2'],
          domprops: ['x', 'y', 'width', 'height']
        },
        rect: {
          klass: OPlot.rect,
          x: ['x1', 'x2'],
          y: ['y1', 'y2'],
          domprops: ['x', 'y', 'width', 'height']
        },
        rectX: {
          klass: OPlot.rectX,
          aria: "rect",
          x: ['x1', 'x2'],
          y: ['y1', 'y2'],
          domprops: ['x', 'y', 'width', 'height']
        },
        rectY: {
          klass: OPlot.rectY,
          aria: "rect",
          x: ['x1', 'x2'],
          y: ['y1', 'y2'],
          domprops: ['x', 'y', 'width', 'height']
        },
        text: {
          klass: OPlot.text,
          x: ['x'],
          y: ['y'],
          domprops: ['x', 'y', 'width', 'height']
        },
        arrow: {
          klass: OPlot.arrow,
          x: ['x1', 'x2'],
          y: ['y1', 'y2'],
          shortcuts: {
            start: ['x1', 'y1'],
            end: ['x2', 'y2']
          }
      
        },
        axisX: {
          klass: OPlot.axisX,
          domprops: ['x', 'y', 'width', 'height']
        },
        axisY: {
          klass: OPlot.axisY,
          domprops: ['x', 'y', 'width', 'height']
        }
    };

    static plot(mark, data, crow, scales) {
        return OPlot.plot({
        //...R.pick(["axis", "margin"],this.options), 
        ...mark._scales, 
        ...(scales??{}),
        ...mark.options,
        ...R.pick(['width', 'height'], crow),
        marks: [ 
            mark.klass(data[IDNAME], data)
        ] })
    }
}