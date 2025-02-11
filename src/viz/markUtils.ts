// Computes equijoin over left.X = right.Y
// If both tables contain the same attribute, only keep the copy from right

import * as d3 from "d3";
import { creator, select } from "d3";
import * as R from "ramda";
import { IDNAME } from "./table";

// @param X list of attributes in left
// @param Y list of attributes in right
// @param left columnar table
// @param right columnar table
// @return columnar join result.  
function equijoin(X, Y, left, right) {
    X = Array.isArray(X)? X : [X];
    Y = Array.isArray(Y)? Y : [Y];
    let XY = R.zip(X, Y)
    let matches = []
    let ret = {};
    for (const lid of left[IDNAME]) {
        for (const rid of right[IDNAME]) {
        if (R.all(([x,y]) => left[x as string][lid]==right[y as string][rid], XY))
            matches.push([lid,rid])
        }
    }

    const populate = (table, which:number) => {
        for (const key in table) {
        if (key == IDNAME) continue
        ret[key] ??= []
        for (const pair of matches) {
            ret[key].push(table[key][pair[which]])
        }
        }
    }

    populate(left, 0)
    populate(right, 1)
    ret[IDNAME] = R.range(0, matches.length);
    return ret;
}

// TODO: should use whatever d3 is using
function inferdomain(domain) { 
    return [d3.min(domain), d3.max(domain)]
}

export function maybeselection(e) {
    if (e.node) return e;
    return select(e)
}

export function applycolfilter(cols, ids) {
    const keys = R.keys(cols) as string[];
    let ret = {};
    for (const key of keys) 
        ret[key] = cols[key].value? {value:[]} : []
    keys.forEach((a) => {
        cols[a].value 
        ? ids.forEach((i) => ret[a].value.push(cols[a].value[i]))
        : ids.forEach((i) => ret[a].push(cols[a][i]))
    })
    keys[IDNAME] = R.range(0, cols[IDNAME].length);
    return ret;
}

function applyfilter(cols, ids) {
    const keys = R.keys(cols) as string[];
    return ids.map((i) => rowof(cols, i, keys))
}

function rowsof(cols, idxs, keys=null) {
    keys ??= R.keys(cols);
    return idxs.map((i) => rowof(cols, i, keys))
}

export function rowof(cols, i, keys=null) {
    keys ??= R.keys(cols);
    return Object.fromEntries(keys.map((a) => [
        a, 
        cols[a].value? cols[a].value[i] : cols[a][i]
    ]))
}

export function filtercoldata(cols, crow, where) {
    const keys = R.keys(cols) as string[];
    let ret = cols[IDNAME].filter((i) => {
        let ans = where(crow, rowof(cols, i, keys))
        return ans
    })
    return ret
}

/*
* Construct a primary key index over HTML elements that correspond 
* to each input row. 
* We assume the invariant that the element's data() is the
* IDNAME of the underlying data row
* 
* @param d3.Selection root the SVG g object that Plot created
* @param string nodetype the element type for the SVG objects that 
*        correspond to each data row
* @return cols Columnar representation of the mark data. 
*         The attribute `cols.n` contains the cardinality.
*/
export function markels(root, nodetype) {
    let idx = {}; 
    let g = maybeselection(root)
        .select(`g[aria-label='${nodetype}']`)
        .selectAll("*").each(function() {
        let el = this as HTMLElement;
        let sel = select(el);
        let i = sel.datum() as number;
        idx[i] = el;
    })
    return idx;
}

/*
* Retrieve the HTML elements that correspond to each input row
* and extract attrs from the elements.  The precedence for 
* looking up attribute values is:
* 
*    bounding box > data row > attribute > style, 
* 
* We assume the invariant that the element's data() is the
* IDNAME of the underlying data row
* 
* @param string[] attrs list of HTML attributes to extract
* @param d3.Selection root the SVG g object that Plot created
* @param string nodetype the element type for the SVG objects that 
*        correspond to each data row
* @param object[] data the columnar input data to the marks
* @return cols Columnar representation of the mark data. 
*         The attribute `cols.n` contains the cardinality.
*/
export function markdata(attrs, root, markinfo, data={}) {
    const spatialAttrs = markinfo.domprops;
    attrs ??= [];
    attrs = R.uniq(attrs.concat(spatialAttrs))
    let cols = Object.fromEntries(attrs.map((a)=>[a,[]]));
    cols[IDNAME] = [];
    cols['data_xoffset'] = []
    cols['data_yoffset'] = []

    let ariaLabel = markinfo.aria == "square" ? "rect" : markinfo.aria

    let g = maybeselection(root)
        .selectAll(`g[aria-label='${ariaLabel}']`)
        .selectAll("*").each(function() {
        let sel = select(this);
        let i = sel.datum() as number;
        const box = R.pick(["width", "height"], this.getBoundingClientRect());
        cols[IDNAME].push(+sel.attr(`data_${IDNAME}`));
        cols['data_xoffset'].push(+sel.attr('data_xoffset'))
        cols['data_yoffset'].push(+sel.attr('data_yoffset'))
        attrs.forEach((a) => 
            cols[a].push(
            maybenumber(
                box[a] ?? 
                (data && data[a] && data[a][i]) ?? 
                sel.attr(a) ?? 
                (sel.style(a)!=''?sel.style(a):null))))
    })

    // spatial attributes should be rounded to ints
    spatialAttrs.forEach((a) => {
        if (!cols[a]) return;
        let offset = (markinfo.alias2scale[a]=='x'
        ? cols['data_xoffset']
        : markinfo.alias2scale[a]=='y'
        ? cols['data_yoffset']
        : null);

        cols[a] = cols[a].map((v,i) => (offset? +offset[i]:0) + (v? Math.round(v) : v))        
    })
    delete cols['data_xoffset']
    delete cols['data_yoffset']

    return cols;
}

function maybenumber(v) {
if (typeof v == "bigint")
    return Number(v)
return (v == null || Number.isNaN(+v))? v : +v;
}