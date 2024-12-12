

# ICDT

Data Modeling, Constraints, and Visualization Design

* Visualizations as data and constraint mapping
* Visualization design as data modeling and normalization
  * 3NF, BCNF, 6NF, 4NF, 5NF
  * where and how they manifest in visualization design
* ER diagrams as special case
* Open questions
  * deriving/preserving constraints in xform results


# Cal Talk

Title: mgg: a multi-table graphical grammar 

Abstract: I would like to present the current progress and solicit feedback on my side project this summer. mgg seeks to establish some formalisms of graphical grammars to visualize multi-table databases.   Existing visualization libraries are largely based on the grammar of graphics, which defines a mapping from data attributes in a single input table to mark properties.  The assumption of a single table is limiting -- as we all know, data is modeled as multi-table databases. As a consequence of this choice, simple visualization features like small multiples plots require custom support by the visualization library, while simple visualizations like node-link diagrams are simply not supported.     mgg is designed under the theory that a visualization consists of two distinct mappings. The first maps data constraints to the structure of the visualization, while the second maps rows and data values to marks and their visual properties.  This will likely be a whiteboard talk. 

Bio: Eugene Wu is faculty at Columbia University and has been visiting Berkeley for the year (ending this August :sob:).   He works on a broad range of problems at the intersection of data management and users.     Eugene Wu received his Ph.D. from MIT, B.S. from Cal.    He has received the VLDB 2018 10-year test of time award, the coveted CIDR gong show award, and a few other awards.


## Feedack from the talk

* what's the continuum between
  * database without data
  * database with some data
  * database with lots of data?
* can ER diagrams be thought of as a degenerate vis, where metadata/catalog is the input?
* in orgs, it's about all the analysts not a single person or query.
* view selection across all dashboards
* encoding/layout affects what the appropriate data transform should be
* given a vis, inverting the mark properties to reconstruct the base data
* incremental vis maintenance
* where does aggregation play in all this?
* input is relations, but mgg output is actually hierarchical!   
  * yes, that is interpreting N-1 as nesting and making that explicit
* how do database statistics/contents play a role in the costing?
* tiemo: seaborn uses data flows under the covers



    
### So What?

Data Science

* data trasnforms have implicit constraints between input and output datasets
* can propogate visualization mappings to transformed datasets?
* can compare datasets?
* can visualize input and output datasets by simply mapping between the two visualizations?

Databases

* how do constraints propogate through a data flow?
* ER to vis
* visualization update on transformations

Visualization

* transformation-oriented model of visualization
* baseline: query over vis as analysis
* leverage provenance and lineage


# Layout ILP Formulation

We have established that

* layout algorithms map nothing to mark properties
* views are marks that other table are nested within
* there is a root rectangle (the canvas) for which all other views are nested within
* mark types have required properties
* all data attributes must be mapped
  * existing recs deal with this case: choose channel for data attrs
* all non-specified required channels can be filled in such that
  * preserves data constraints
  * preserves hard "good design" constraints
  * maximizes soft "good design" objectives

Questions

* if T is mapped to two sets of marks, 
  * both sets must not be inconsistent (no false information)
  * but only one set needs to preserve constraints (don't lose information)
  * ==> faithful


how to implement ilp()/auto()

    V1 = T->point, a->x, 
    V2 = S->rect, c->x, d->y
    V3 = S->rect,

open variables and their constraints

    (v1,v2,v3).bbox
    v1.y
    v2.w,h
    V3.xywh
    
    V1.r > epsilon
    V2.wh, V3.wh > epsilon
    V3.x,y in V3.bbox
    Vi.bbox in Canvas.bbox

Stuff that auto() may care about

    mark properties (x, y, w, h)
    * mark
    * view
    * labels 
    * ticks
    * guide/guide elements
      * guide is a normalized table of the attribute/channel pairs
      * guide is rect view
      * elements are rows in the table 

    between mark properties
    * alignment
    * scale equivalence
      * type/function
      * domain
      * range

    constraints
    * no overlap
    * minimum sizes
    * shared provenance/partitions of same table/union compatible
    * same data attribute mapped to same channel (in different views)

        if fkey is rendered as S.X = T.Y string, 
        then S.X and T.Y should be labels in some other views

    Soft constraints
    * multiple-encodings/alignment
    * perception/cost



# Layout


Scales are a type of layout algorithm that applies a 1-1 mapping from an attribute A's values to a visual channel

* it trains on values of A
* it applies to values of A to a visual channel at a time. 
* it produces one output scalar for each input scalar

    Scale S:
    S.train(T.A)
    S.apply(T.A) -> visual range



Layout is a generalization of scales, but restricted to spatial positioning and sizing.
Here, let's strictly limit its scope to boxes (x,y,w,h) and points (w,h=0)

 * decouple train from apply inputs
 * rename train to init
 * init is over a set of tables 

    Nodes(), Edges()
    S.init(Edges)
    S.apply(Nodes)

 * apply returns a table, and its attributes can be assigned to visual channels

    Scalar Layout S:

    * scope of algorithm is the immediate mark and bbox


    Local Layout L: 

    * scope of algorithm is its immediate bbox.   
      independent of mark positions in other bboxes (siblings, parents, descendents)
    1. render with dummy scalars for auto() channels
    2. extract spatial properties of marks and canonicalize attr names
    3. extract any data attributes from underlying tables
    4. extract referenced marks and theical spatial properties (lazily)
    5. call algorithm

    L.init(f(T.A)), L.apply(T.B) -> visual ranges

    Global Layout G:

    * scope of algorithm depends on positions/sizes of all other marks

    G.init(f(T1.A1),...), G.apply(f(T1.A1),...) -> visual ranges




But unclear: relationship between trained on tables, applied on tables, and how it really works


Examples of desired layout usage


* scales
    
    T(id, a,b)
    M = { T->point, linear(a)->x, linear(b)->y }

    linear([M, M.(), a, x])
        bbox = root.bbox

* tree diagrams
    Nodes(id, a, pid)
    M1 = { Nodes -> point, 10->w, 10->h, tree(pid)->x,y }
    M2 = { Nodes -> link, markof(id)->start, markof(Nodes[pid]) ->  end }

    tree([M1, M1.(w,h), [pid], [x,y]])
      referencedby = M2.(x1,y1,x2,y2)
      bbox = root.bbox

      route-to-tree-layout-alg

* node-link

    Nodes(id) Edges(s,e)
    M1 = { Nodes -> point, 10->w,h, physics(Edges.s, Edges.e)->x,y }
    M2 = { Edges -> link, M1[s]->start, M1[e]->end }


    physics([M1, M1.(w,h), [sid, eid], [x,y]])
        referencedby = M2.(x1,y1,x2,y2)
        bbox = root.bbox

        route-to-physics-layout-alg

* nested space filling

    // partially fixed position
    P(id) C(id, b, pid)   C.pid -> P.id
    M1 = { P -> rect,  b->x,y, auto()->w,h }
    M2 = { C -> rect, squarify(b)->x,y,w,h }
    nest(M2 in M1)

    // mark table, mark's assigned spatial attrs, relevant data attrs, which attrs to fill
    auto([M1, M1.(x,y), [], [w,h]])
        referencedby = []
        bbox = root.bbox

        route-to-box-sizer

    squarify([M2, M2.(), [b], [x,y,w,h]])
        referencedby = []
        bbox = M1[pid].bbox  // due to nest()


    // free positions
    M1 = { P -> rect, auto()->x,y,w,h }
    M2 = { C -> rect, squarify(b)->x,y,w,h }
    nest(M2 in M1)

    auto([M1, M1.(), [], [x,y,w,h]])
        referencedby = []
        bbox = root.bbox


    // free positions, but initialize x,y
    M1 = { P-> rect, auto([b,b])->x,y,w,h }

    auto([M1, M1.(), [b,b], [x,y,w,h]])
        ...


* label collision detection

    T(a,b,text)
    M1 = { T->point, a->x, b->y }
    c = collision(M1.(x,y))
    M2 = { T->label, c->(x,y,alignment), text->text }

    // initialize x,y positions, but then overwrite them
    collision([M2, M2.(x,y,w,h), [x,y], [x,y,alignment]] )

    

* faceting

    T(g, a, b)

    T1(gid, g) T2(gid, a, b)  T2.gid -> T1.gid 
    M1 = { T1 -> rect, gid->x,y, equi()->w,h }
    M2 = { T2 -> point, a->x, b->y }
    nest(M2 in M1)
    for all V in M1, V.scaley same, V.scalex same


    s = M2.scalex([M2,M2.(),a,x], root.bbox)
    s.train(T1[gid].a) or s.train(T1.a)
    s.apply(T1[gid].a) -> { x: .. }


* alignment constraints 

    Vi.channeli.domain = Vj.channelj.domain

    1. shared domain
    2. same channel
    3. shared range
    4. spatially aligned

    Should be able to reproduce faceting, but more costly


    M1 and M2 not explictly positioned -- their containers are auto() instead of a concrete root
    M1 = { a->y, .. }
    M2 = { a->y, .. }
    nest(M1 in R1)
    nest(M2 in R2)
    nest(R1 in root)
    nest(R2 in root)

    R1 = { null -> rect, auto()->x,y,w,h }
    R2 = { null -> rect, auto()->x,y,w,h }

    auto([ [R1, R1.(), [], [x,y,w,h]],
           [R2, R2.(), [], [x,y,w,h]] ])
        constraints = [ M1.y.domain = M2.y.domain, ... ]
        bboxes = R1: root, R2: root

        ILP??



Syntactic Sugar for specifying layout algorithms?

    // point
    treelayout
      inputs: [ id,  // always there
                pid, // required
                x,y // initialization
                w,h // optional ]
      expects: [ pid ]
      output: [x, y]

    
    // point
    physics
      inputs: [ id,    // always there
                sid, eid,  // required
                x, y, w, h]
      expects: [ sid, eid ]
      output: [x, y]

    // box
    squarify
      inputs: [ id, attr // required]
      expects: [ attr ]
      output: [x, y, w, h]

    // box
    equi // finds equi sized boxev s.t. no overlap
      inputs: [ id, 
                x,y,w,h // optional ]
      
      output: [x, y, w, h]


    label
      inputs: [ id,
                x, y, w, h // required ]
      outputs: [ id, x, y, alignment ]


    scale
      inputs: [ id, attr ]
      state: domain
      outputs: [ val ]




# Constraint mappings

Principles:

* database is prepared to hold exactly the desired tables and constraints to be visualized
* every table is mapped to one view
* all constraints are preserved
* a view is a table with 1-1 relationship with its base table


Attribute domain  (nothing changes from single-table gg)

    scale: attr domain -s-> visual range
    s rendered as axes/legend

Key constraint

    Formally, if $X$ is a key, then it guarantees that

    key(X): not exist r1, r2 s.t. r1.X = r2.X ^ r1 != r2
            not exist m1, m2 s.t. m1.X = m2.X ^ m1 != m2

    not sufficient because the visualization is a set.
    whereas marks are spatialy positioned with x/y ordering.

    the mark's spatial properties are an implicit key

            not exists m1, m2 s.t. indistinguishible(m1,m2) ^ m1 != m2

            e.g., m1.spatialextent != m2.spatialextent ^ m1 != m2

Foreign Key reference

    T.X - S.Y

    Codd: We shall call a domain (or domain combination) of relation R 
    a foreign key if it is not the primary key of R but its elements 
    are values of the primary key of some relation S (the possibility 
    that S and R are identical is not excluded).

    Too restrictive for how relationships and keys are used in practice.


    Baseline:

    * one directional: for all T.X exists S.Y s.t. T.X = S.Y
    * bidirectional: X and Y's active domains are the same.


Foreign Attribute

    f(X) = W, where there exists a directed path X ~> W composed of N-1 fkey relationships

Explicit: There is a visual symbol that denotes the relationship between T.X and S.Y

    One Mark:

        mark = { C -> marktype, f1(X) -> A1, f2(Y) -> A2 }

Implicit: There is a spatial organization that implies the relationship between X and Y


    Nesting: mark(X) nested in mark(Y).  X is child.  Y is parent.

        Y defines W and/or H extents (either defined by data, or auto layout via resizing)
        X is drawn inside Y's extents

    Alignment: 

        markT = { T -> ...., f1(X) -s1-> A1 }
        markS = { S -> ...., f2(Y) -s2-> A2 }
        
        s1.domain = s2.domain   (weakest form: by definition of fkey, equivalent domain)
        + s1.range = s2.range  (relatively aligned)
        + markT and markS's extents are aligned along A1/A2 (absolutely aligned)



Challenge: sizing of parent is determined by child and/or vice versa.

* this is a layout problem.
* how to incorporate layout in to specification?



# What can you do with mgg?


Data Science

* data trasnforms have implicit constraints between input and output datasets
* can propogate visualization mappings to transformed datasets?
* can compare datasets?
* can visualize input and output datasets by simply mapping between the two visualizations?

Databases

* how do constraints propogate through a data flow?
* ER to vis
* visualization update on transformations

Visualization

* transformation-oriented model of visualization
* baseline: query over vis as analysis
* leverage provenance and lineage


# Grammar

Two dimensions 

* Layouts: local and global
* Relationships: explicit and implicit

# Local Layouts

Local layouts only consider two levels, and thus flatten the data..

## Local Layout, Implicit (nested) relationships

T(id, a, f)

l = SQ("T.f")
Mr = canvas(w,h,x,y)
M1 = rect(T, {...l('x','y',..), color: a})
nest(M1 in Mr)

SQ(attr):
  // local batched across containers
  (data:{[attr]:int[]}, containers, constraints) ->
    return this(data, rowof(containers,0))
    
  // local for single container
  (data, {w,h}, constraints) ->



## Global Layout, Implicit Relationship

Global layout have access to the entire nesting tree (must be tree)

c = canvas()
l = auto()
M1 = c.rect(T1, l->...)
M2 = c.rect(T2, l->...)
M3 = c.rect(T3, l->...)
c.nest(M1 in M2)
c.nest(M3 in M2)
c.align(M1.x, M3.x)
c.align(M2.Y, M3.y)


ILP(opts):
  (tables, constraints(fks, scales)) ->
    turn into ILP.
    return a (x,y,w,h) table for each table in tables.  they have 1-1 relationship

    
## Explicit relationship is always local 

Local to the table with the FKs being rendered, but can affect the targets of the FKs

Edges(a1, a2, ...)   Edges.a1 -> .., Edges.a2 -> .., ...

l = FD({src: "edges.src", dst: "edges.dst"}, opts)
Mn = dot(Nodes, l->x,y)
Ml = link(Edges, markof("node", 'src')->start, markof("node", 'dst')->end)

FD({src,dst}, opts):
  (data:{src:..., dst:...}, container, constraints) ->
    return { id, x, y }




# Using Plot


Canvas -> Canvas -> Mark 

RefLayout 
Mark --containment--> Mark

Topologically sort Mark based on Nest edges

Allocate shared scales based on FK constraints that are not mapped to Nest

Each Mark object:

* is given 
  * SVGs g of its container, and each SVG's join key value
  * its own join key attrs
  * each svg object has pk of its source table 
    * it has the data row from source table
    * source table schema has pk attributes
  * get SVG objects and their visual properties from select("g").selectall("<mark node type>")
* Plot object 
  * render without auto layout attributes
  * pass mark attributes to layout function
  * layout function returns arrays for X, Y, etc attributes.  Each array contains values for every source table row
    basically columnar
  * assign using custom function

        Plot.mark({length: N}, {
          ...originalmappings,
          x: layoutX,  // pixel space
          y: layoutY   // pixel space
        })
        .plot({
          x: { type: "identity"}, 
          y: { type: "identity"}, 
        })


Canvas is like a plot

    c = new Canvas(db, {})
    p1 = c.plot("t1", { ... })
    p2 = c.plot("t2", { ... })

    p3 = c.plot(constraint, { ... }) 
    * join tables in constraint
    * resolve references in mapping, resolve markof
    * call render

    c.nest(constraint) 

    constraint can be singular or array of:
      "name"
      FKConstraint object
      { outer: tablename, inner: tablename, on: { ??} }
      
    track:
    t1 -> p1
    t2 -> p2


Parallel Coords

    db.fromSql("select attr_name as attr from information_schema.columns where ... ")
    labels = c.text('attrs', { x: "attr" })
    x = labels.scale("x")
    A = c.point("A", { y: "a", x: x("A") })
    B = c.point("B", { y: "b", x: x("A") })
    c.link(constraint, { 
        x1: markof(constraint.t1)('x'), 
        y1, 
        x2, 
        y2  })   // default is markof for the spatial attributes




# Example


T(tid, rid, a, b)
R(rid, c, d)
C: T.rid -n-1-> R.rid

Container(C)
Rect(R, { x: rid % k, y: ceil(rid / k), color: c, width: auto(), height: auto() }, { scales: { x: {}} })
Point(T, { x: a, y: b })

R:
    -- x, y depend on rid, so need to group on them 
    WITH tmp1 as (
      select rid as id, rid % k as x, ceil(rid / k) as y, c as color
      from R
    ), tmp2 as (  -- auto() requires statistics.   width -> x, height -> y
      select count(distinct x) as nx, count(distinct y) as ny, count(distinct color) as ncolor
      from tmp1
    ), tmp3 as (  -- calculate auto() given statistics
      select tmp.*, cr.width / tmp2.nx as width, cr.height / tmp2.ny as height
      from tmp, container_root as cr, tmp2
    )
    select scalesx(x) as x, scalesy(y) as y, scalescolor(color) as color, scalesx(width) as width, scalesy(height) as height 
    from tmp3
    -> marks_R

-- rules for auto()
* equi() max such that there's no overlapping containers.  
  * if grid, just need counts along x and y
* propx() needs # rows, container width
* propy() needs # rows, container height


T:
    -- include rid because of contraint T.rid -> R.rid
    WITH tmp1 as (
      select tid, rid, a as x, b as y
      from T
    ), 
    -- no auto() so don't need stats
    tmp2 as (
      select tid,
             tmp1.x + cr.x as x,   -- tmp1.x + ${MarkR.x()}
             tmp1.y + cr.y as y    -- tmp1.y + ${MarkR.y()}
      from tmp1, marks_R as cr
      where tmp1.rid = cr.id
    )
    SELECT tid,
           scalesx2(x) as x,   -- `${scales.toExpr(x)} as x`
           scalesy2(y) as y
    from tmp2
      

##

T:
    WITH tmp1 as (
      select tid, rid, a as x, b as y
      from T
    )
    SELECT tid,
           scalesx2(x) as x,   -- `${scales.toExpr(x)} as x`
           scalesy2(y) as y
    from tmp2
    -> marks_T



Line(C, { start: C.T.mark, end: C.R.mark, color: C.R.d })

    WITH tmp1 as (
      select ${marks_T.centroid.x} as sx,
             ${marks_T.centroid.y} as sy,
             ${marks_R.centroid.x} as ex,
             ${marks_R.centroid.y} as ey,
             R.d as color
      from marks_T, marks_R, R
      WHERE marks_T.rid = marks_R.id and R.rid = marks_R.id
    )
    select sx, sy, ex, ey -- already in pixel space, no scaling needed
           ${scalecolor(color)} as color
    from tmp1


## 

SharedScales(C)




# parallel coords

T(tid, a,b,c)
=>
T1(tid,a)
T2(tid,b)
T3(tid,c)
C1: T1.tid = T2.tid
C2: T2.tid = T3.tid
implies T1.tid = T3.tid

P1 = point(T1, { y: a })
P2 = point(T2, { y: b })
P3 = point(T3, { y: c })
line(C1, { start: C1.left.mark, end: C1.right.mark })
line(C2, { start: C2.left.mark, end: C2.right.mark })


# legend

T(a, b, c)
=>
T(a, c, bid)
B(bid, b)
T.bid -n-1-> B.bid

MarkB = Cell(B, { color: bid, y: bid })
MarkT = Point(T, { x: a, y: b, color: bid })
MarkT.scale('color') = MarkB.scale('color') 




Edges(eid, parid, childid, a)
Nodes(nid, b, c)
Edges.parid -> nodes.id
Edges.childid -> nodes.id
childid -> parid





T(pkey, a, b, c)
container_root(pkey (empty), canvas size)

SELECT ...
FROM T, container_root
WHERE true

T -N--1- S

T(pkey,fkey,a,b,c)
container_S(pkey, bbox info: x_min, x_max, x_rng, y_min, y_max, y_rng)
stats_T(count, a_min, a_max, a_rng, a_count, y_min, y_max, y_rng, y_count)
marks_T('square', pkey, x, y, w, h)

square
x: a   s: [a_min, a_max] -> [x_min, x_max]
y: b   s: [y_min, y_max] -> [y_min, y_max]
w: equi()
h: equi()
c:c    1) normalized c into (cid, c), 2) s: [cid_min, cid_max] -> ...


CREATE TABLE sys.marks_T AS
select (a-a_min)/(a_rng)*x_rng+x_min) as x,  -- scale(stats_T,container_T).toString()
       (b-b_min)/(b_rng)*y_rng+y_min) as y,
       null as w,
       null as h
from T, sys.container_T, sys.stats_T
where container_S.pkey = T.fkey 

select equi_stats(x,y) as state
from sys.marks_T, sys.container_S

update marks_T set w = equi_apply(equi_state.statte, 'w')
FROM equi_state

update marks_T set w = ???


layout(schema, container_X) -> outschema
physics((src_id, dst_id, weight), containerTable) -> (nodeid, x, y)
sf2d((attr), containerTable) -> (x, y, w, h)
sfx((attr), containerTable) -> (x, w)
sfy((attr), containerTable) -> (y, h)


{
  x: sf2d('supply', 'x'),
  y: sf2d('supply', 'y')
}
