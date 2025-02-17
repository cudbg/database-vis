# Developer Documentation for MGG

NOTE: THIS DOCUMENT IS NOT COMPREHENSIVE. IT SERVES AS AN INTRODUCTION TO THE CODE. READ THE CODE AFTER THIS

## Table of Contents

- [Introduction](#introduction)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Adding Marks](#adding-marks)
- [Nesting](#nesting)
- [Rendering Marks](#rendering-marks)
- [Key Functions and Modules](#key-functions-and-modules)
  - [Function List](#function-list)

---

## Introduction

MGG is a visualization engine built for relational databases.

<!-- ### Features
- Feature 1
- Feature 2
- Feature 3 -->

---

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/your-project.git

# Install dependencies
npm install

# To run MGG
npm run dev
```
## Project structure

The project is organized into the following main directories and files:

```plaintext
root/
├── src/                            # Source code directory
│   ├── assets/                     # Static assets like images, fonts, etc.
│   ├── components/                 # UI components
│   ├── routes/                     # Application routes (UI-related)
│   ├── viz/                        # CORE functionality
│   │   ├── plotUtils/              # APIs for other visualization libraries
│   │   │   └── oplotUtils.ts       # Visualization utility file
│   │   ├── task_graph/             # Task graph logic
│   │   │   └── task_graph.ts       # Task graph core functionality
│   │   ├── uapi/                   # Unified API-related functionality
│   │   │   └── mgg.ts              # Unified API core file
│   │   ├── canvas.ts               # Canvas rendering logic
│   │   ├── constraint.ts           # PK and FK constraint management logic
│   │   ├── db.ts                   # Database interaction utilities
│   │   ├── duckdb.ts               # DuckDB-specific logic
│   │   ├── eventemitter.ts         # Event emitter implementation
│   │   ├── id.ts                   # Contains sql expr to generate ids
│   │   ├── mark.ts                 # previous version of Mark
│   │   ├── markUtils.ts            # old versions of mark utility functions
│   │   ├── nest.ts                 # contains RootNest and MarkNest logic
│   │   ├── newMark.ts              # The actual implementation of Mark class (CORE)
│   │   ├── newScale.ts             # New scale definitions for visualizations
│   │   ├── ref.ts                  # Layout algorithms
│   │   ├── scale.ts                # previous versions of scales
│   │   ├── schema.ts               # Contains schema class, which is used inside Table objects
│   │   ├── table.ts                # Contains functions that generate sql queries
│   │   └── util.ts                 # General-purpose utility functions
│   ├── static/                     # Static files (e.g., CSV data and .py files)
│   └── index.js                    # Entry point of the application
├── package.json                    # NPM configuration file
└── .gitignore                      # Specifies files ignored by Git
```

The most important file in all this is newMark.ts because that contains the main workflow for rendering Marks

## Adding Marks

MGG currently supports the following mark types:
- bar
- dot
- link
- cell
- rect
- text

To add a mark (eg. dot):
```code
# c is a Canvas object

c.dot(<table_name>, {x: ..., y: ..., r: ..., fill: ...})
```

In the above example, table_name is a string and it is the name of the table where the data is stored. MGG uses table_name to construct a SQL query and gets the relevant data.

The second argument is a JavaScript object. It is a mapping from visual channels to columns in the table. Expanding the above line of code using an example table T(a,b,c,d)

```code
c.dot("T", {x: "a" y: "b" r: "c"})
```

The line above maps T.a to x, T.b to y and T.c to r(which is the radius or size of the dot)

The above function for creating a dot can be generalized to other mark types:

```code
c.<marktype>(<table_name>, {<visual channels and their data sources>})
```


c.dot(...), c.link(...) etc. are implemented using JavaScript prototypes. A quick guide to JavaScript function prototypes: https://www.programiz.com/javascript/prototype

The exact code snippet where the function prototypes are added in canvas.ts is shown below:
```code
for (const mtype of R.keys(marksbytype(Canvas.plotConfig))) {
  Canvas.prototype[mtype] = function () {
    return this.addmark(mtype, ...arguments);
  }
}
```

c.dot(...) will call the addmark function of the Canvas object:
```code
  addmark(marktype, source, mapping, plotoptions?) {
    plotoptions ??= {}
    let srcTable = this.db.table(source)
    let canvas = findcanvas(this, srcTable);
    let mark = new Mark(canvas, marktype, srcTable, mapping, plotoptions, Canvas.plotConfig)
    this.marks.push(mark);
    return mark;
  }
```

Take for example the line below:
```code
c.dot("T", {x: "a" y: "b" r: "c"})
```
It would result in a call to addmark with the following arguments
```code
addmark("dot", "T", {x: "a" y: "b" r: "c"})
```

Hence, source refers to "T" and mapping refers to {x: "a" y: "b" r: "c"}

addmark creates a new Mark object. The constructor function for Mark is called. The constructor first instantiates all the member variables for a Mark object before calling the init function. 

The init function is CRUCIAL. It is going to create a bunch of rawChannelItems:
```code
/**
 * An object in the this.channels array
 */
interface RawChannelItem {
  mark: Mark
  src: Table
  visualAttr: string
  constraint: FKConstraint /* will be null if there are no clauses ie. normal mapping like x: "a" */
  /**
   * Underlying data attribute for visualAttribute
   * The type is an array because the user could do x: va.get(null, ["x", "width"], someCallback)
   * In above case, dataAttr is ["x", "width"]
   * Each element has type any because we also numbers in mappings eg. x: 0
   * In such cases, dataAttr is [0]
   * Proper handling of each individual case occurs in constructQuery
   */
  dataAttr: any[]
  isGet: boolean
  refLayout: RefLayout
  callback: Function
}
```
Each rawChannelItem is a bag of information for each visual channel in mapping.

For example if mapping is {x: "a" y: "b" r: "c"}, we would get three rawChannelItems, corresponding to x,y and r respectively. Each rawChannelItem is then appended to this.channels (see bottom of for loop in init function).

### Supporting foreign key references

However, a visualization is only useful if the marks rendered can be positioned relative to each other. As such, MGG also supports references between marks. This is implemented as a simple get function as shown below:

```code
# Schemas: A(id,a), B(id, b), T(aid,bid)
# A.id is the primary key for A
# B.id is the primary key for B
# T.aid is a foreign key reference to A.id
# T.bid is a foreign key reference to B.id

# creating a left column of dots
let leftDots = c.dot("A", {x: 10 y: "a"})

# creating a right column of dots
let rightDots = c.dot("B", {x: 20 y: "b"})

# creating a link between leftDots and rightDots
c.link("T" 
        {
            x1: leftDots.get("aid", "x"),
            y1: leftDots.get("aid", "y"), 
            x2: rightDots.get("bid", "x"), 
            y2: rightDots.get("aid", "y"), 
        })
```

x1: leftDots.get("aid", "x") tells MGG that we need the x position of the dots in leftDots which have A.id == T.aid. That x position is now the x coordinate of the start point of each link. 

Note that the first argument to the get function is a column in "T".

The same (intuitive?) logic applies to the other three mappings (ie. y1, x2, y2).

The get function is defined in newMark.ts.

```code
    get(usrSearchkeys: String | String[], usrVattr: String | String[], callback?): {othermark, searchkeys, othervattr, callback} {
      let searchkeys = null

      if (usrSearchkeys)
        searchkeys = Array.isArray(usrSearchkeys) ? usrSearchkeys : [usrSearchkeys]

      let othervattr = Array.isArray(usrVattr) ? usrVattr : [usrVattr]
  
      for (let attr of othervattr) {
        if (!R.includes(attr, Object.keys(this.mappings))) { //othervattr must be present to this.mappings
          throw new Error(`${attr} is not mapped in ${this.src.displayname}`)
        }
      }

      let obj = {othermark: this, searchkeys: searchkeys, othervattr: othervattr, callback: callback}
      return obj
    }
```

The get function simply checks if the desired visual channel (x and y in the link example above) is mapped. If the visual channel is not mapped, it would throw an error. 

NOTE: WE SHOULD REALLY SUPPORT UNMAPPED VISUAL CHANNELS AND ALSO DATA COLUMNS. THE CURRENT IMPLEMENTATION ONLY SUPPORTS VISUAL CHANNELS.

As shown above, the get function returns a JavaScript object, which we would need to parse in the init function. The relevant code snippet within the init function is shown below:

```code
else if (dattr instanceof Object && 'othermark' in dattr) { //there's a call to get
let {othermark, constraint, othervattr, callback} = this.processGet(dattr)
rawChannelItem.mark = othermark
//rawChannelItem.src = othermark.marktable //very suspect line
rawChannelItem.constraint = constraint
rawChannelItem.dataAttr = othervattr
rawChannelItem.callback = callback
rawChannelItem.isGet = true

/**
    * Currently hard coding scales, need to fix!!!!!!
    */
if (va == "x1" || va == "x2" || va == "x")
    this._scales.x =  {type: "identity"}
else if (va == "y1" || va == "y2" || va == "y")
    this._scales.y = {type: "identity"}

this.c.registerRefMark(othermark, this)
taskGraph.addDependency(this, othermark, true)
}
```

We need to parse the object returned by the get function. This parsing is handled in processGet.

There are other else if statements in the init function. Those are for handling layout, scaling and running callback functions over data columns. The init function should seem somewhat clearer now...

## Nesting
Another way we allow marks to reference other marks is nesting. 

Given a dot mark and a rect mark, and that we want to nest the dot within the rect, we would do something like this:

```code
# Schemas: T(tid, ...), A(tid, aid, ...)
# T.tid is the primary key for T
# A.aid is the primary key for A
# A.tid is a foreign key reference to T.tid

let rects = c.rect("T",{...})
let dots = c.dot("A",{...})
c.nest(dots, rects)
```

c.nest(dots, rects) tells MGG that we want to nest dots within rects. Note that MGG will automatically infer we want to nest dots within rects using A.tid = T.tid

As such, we don't need to specify a predicate like a get function in the previous section.

The nest function is defined in canvas.ts:
```code
  nest(innerMark: Mark, outerMark: Mark, predicate?) { //TODO: need to get a fk constraint from db if user passes no predicate
    if (predicate) {
      predicate = Array.isArray(predicate) ? predicate : [predicate]
      this.nestWithPredicate(innerMark, outerMark, predicate)
    }
    else
      this.nestWithoutPredicate(innerMark, outerMark)
    taskGraph.addDependency(innerMark, outerMark, true)
  }
```

Where the user passes no predicate, we call this.nestWithoutPredicate(...)

```code
nestWithoutPredicate(innerMark: Mark, outerMark: Mark) {
    let innerTable = innerMark.src
    let outerTable = outerMark.src

    console.log("innerTable", innerTable)
    console.log("outerTable", outerTable)

    console.log("all constraints", this.db.constraints)
    let path = this.db.getFkPath(innerTable, outerTable)

    if (!path)
        throw new Error("No possible path!")

    console.log("path", path)

    this.nests.push(new MarkNest(this, path[0],innerMark, outerMark))
    innerMark.outermark = outerMark
}
```

nestWithoutPredicate tries to get a foreign key path from the data table of the inner mark to the data table of the outer mark. If no path exists, we throw an Error and execution stops. Else, we create a MarkNest (second last line above). The constructor for a MarkNest is shown below:

```code
constructor(c, fk, innerMark, outerMark) {
    if (fk.card != Cardinality.ONEMANY && fk.card != Cardinality.ONEONE)
        throw new Error(`Trying to nest for fk ${fk.card}`)
    this.c = c;
    this.fk = fk;
    this.innerMark = innerMark;
    this.outerMark = outerMark;
}
```
Note that we pass the first edge for the foreign key path because that is necessary for constructing the SQL query.
We allow nesting for 1-1 and 1-N.

## Rendering Marks
You made it to the exciting stuff!!!!

To render all marks, we call

```code
await canvas.render({ document, svg });
```

The render function is defined in canvas.ts. The truly interesting stuff happens at the bottom of the render function

```code
for (const m of this.sortedmarks()){
    let node = await m.render(context);
    (g.node() as HTMLElement).appendChild(node);
}
```
We first sort the marks using this.sortedmarks(). This is important because marks can reference other marks, creating dependencies between marks. this.sortedmarks uses topological sort based on nesting and foreign key references.

Once the order has been decided, we can render each mark using m.render(...)

The render function for each mark is defined in newMark.ts

```code
async render(context) {
    let root = this.node = select(
        creator("svg:g").call(document.documentElement))
        .classed(`${this.marktype}-${this.id}`, true);
    let nest = this.c.nestof(this)

    /*
    mark was really appended to the root after doRootNest and doMarkNest
    But we return mark for error checking purposes
    */
    if (nest instanceof RootNest) {
        let crow = nest.parentmarkdata()
        let fixedCrow = this.handleCrow(crow)
        await this.doWorkFlow(root, fixedCrow, false)
    } else {
        this.outermark = nest.outerMark
        this.innerToOuter = new Map<number, number>()
        await this.doWorkFlow(root, nest, true)
    }
    return root.node()
}
```
The render function first checks if the mark we are rendering is a nested mark.
This check is done by first calling the nestof function in canvas as shown below:

```code
nestof(o:Mark) {
    if (!o.outermark)
        return new RootNest(this, this.options)

    for (const n of this.nests) {
        if (n instanceof MarkNest) {
            if (n.innerMark == o && n.outerMark == o.outermark)
            return n
        } 
    }
    /**
        * We technically should not end up here because the nest call should succeed and create a new MarkNest
        */
    throw new Error("No such nest!")
}
```
nestof returns either a RootNest or a MarkNest.

The arguments we pass to doWorkFlow are slightly different depending on what nestof returns. (I merged doMarkNest and doRootNest if you remember me talking about that awhile back)

Rendering a single mark can be thought of as 4 tasks:
1. Query: Creating a SQL query to get the relevant data and executing it
2. Layout: Doing layout algorithms over the data we got from the database
3. Render: Actually rendering the mark through observable
4. Cleanup: Creating a marktable for the mark we just rendered

doWorkFlow is separated into these 4 stages/functions. Each stage has its own function:
- Query: runQueryTask
- Layout: runLayoutTask
- Render: runRenderTask
- Cleanup: runCleanupTask

### Query/runQueryTask
This stage is in charge of constructing the SQL query and/or executing it. I haven't actually decided whether to put the query execution in this stage but it is not a problem.

```code
async runQueryTask(root, outer, isNested) {
    let query
    if (isNested)
    query = this.constructQuery(outer)
    else
    query = this.constructQuery()
    let rows = await this.c.db.conn.exec(query)
    console.log("query output", rows)
    return rows
}
```

Query construction is done in constructQuery. Remember those rawChannelItems we stored in this.channels back in init? We generate a QueryItem for every rawChannelItem in constructQuery

```code
let queryItems = this.channels.map((rawChannelItem) => toQueryItem(rawChannelItem))
```

A QueryItem looks like this:

```code
interface QueryItem {
  srcmark: Mark
  source: Table
  /**
   * Each ColumnObj has dataAttr to represent the column in the table and renameAs for what to select that column as
   * Used to construct the select statement
   */
  columns: ColumnObj[]

  constraint: FKConstraint
}
```
The contents of each QueryItem vary depending on whether each rawChannelItem is a foreign key reference (ie. there was a call to the get function), layout 

- srcmark: Either this (ie. current mark we are rendering or mark we have a foreign key reference to)

- source: Either this.src (underlying table for this) or a marktable for another other mark (foreign key reference ie. get function)

- columns: The data columns we want. Note that this is of type ColumnObj. A ColumnObj looks like this:
```code
{renameAs: ..., dataAttr: ...}
```
dataAttr is always set to the underlying column in the table. If this is foreign key reference, renameAs is set to the visual channel, else it is the same as dataAttr.
It is essentially a mapping from the actual column name in the table and the alias in the SQL query.

- constraint: This will be null if the rawChannelItem is not a foreign key reference and vice versa

Now onto constructing the SQL query...
Note: This was probably the hardest part to implement in this entire project

A high level algorithm of what this function does

```code
map = new Map() # map is a mapping from foreign key paths to sets of QueryItems

For each query item:
    If constraint is null,
        We know that this query item contains columns that belong to this.src. 
        Group them together in a set
    Else
        This query item contains columns that belong to a marktable of some other mark. Find the foreign key path from this.src to other.marktable
        If we have already seen that path, 
            Put the current query item with the other query items that use the same path
        Else
            Create a new mapping from this new path to a set containing the curr query item

If this is a nested mark:
    Construct foreign key path for nest
    Check if we have seen that path (then do the same stuff as above)

query = new Query()

for path, queryItemSet in map:
    Append a where clause to query for each edge in the path
    Append a column to the select portion of query for each column in each query item in queryItemSet
```

The key idea is that foreign key paths decide the table aliases required. For example, if we wanted to render a node link diagram for airport locations and flights as shown below:

```code
Schemas: airports(latitude, longitude, name), flights(id, origin, dest)
airports.name is the primary key for airports
flights.origin is a foreign key reference to airports.name
flights.dest is a foreign key reference to airports.name

let airports = c.dot("airports",{x: "latitude", y: "longitude"})
let flights = c.link("flights",
                    {
                        x1: airports.get("origin","x"),
                        y1: airports.get("origin","y"),
                        x2: airports.get("dest","x"),
                        y2: airports.get("dest","y"),
                    })
```
To render the flights link mark, note how the foreign key path for x1 and y1 is different from the foreign key path for x2 and y2.

For x1 and y1, we have:
```code
airports.name   -->   flights.origin  -->  flights_marktable.id
```

For x2 and y2, we have:
```code
airports.name   -->   flights.dest  -->  flights_marktable.id
```

The SQL query to generate requires two aliases for the airports, flights and flights_marktable respectively

```code
SELECT <ignore the select columns for now>


FROM airports AS airports1, airports AS airports2, flights AS flight1, flights AS flights2, flights_marktable AS flights_marktable1, flights_marktable2


WHERE airports1.name = flights1.origin AND flights1.id = flights_marktable1.id AND airports2.name = flights2.dest AND flights2.id = flights_marktable2.id 
```

Grouping the query items based on the foreign key paths needed (or not needed) allows us to create a unique alias for each table in the path even if some tables appear in different paths

This issue becomes even more obvious if we want to label each airport by their name

```code
c.text("airports", {x: airports.get("name","x"), y: airports.get("name","y")})
```

In this case, the required SQL query would be:

```code
SELECT <ignore for now>

FROM airports, airports AS airports1, airports_marktable

WHERE
airports.name = airports1.name AND airports_marktable1.id = airports1.id
```

The table aliases then affect how we select the columns...

TBD: constructing the select portion of the SQL query. BUT the where clauses are the most important part.


### Layout/runLayoutTask

This stage can take two possible paths, depending on whether the mark is nested. If the mark is not nested, we take the easy path:

```code
 else {
    let cols = this.rowsToCols(rows)
    let channels = this.applychannels(cols)

    channels = this.doLayout(channels, outer, dummyroot)

    return channels
}
```

The query output is an array of objects:
```code
[
    {a: 1, b: 2, c: 3} //example output,
    {a: 4, b: 5, c: 6} //example output,
]
```
We need to convert that array into:
```code
{
    a: [1,4],
    b: [2,5],
    c: [3,6]
}
```
That is why we call rowsToCols.

We take the output of rowsToCols and hand it to applychannels.

A high level overview of what happens in applychannels

```code
let channels = [] //this is a new array, different from this.channels

For each rawChannelItem in this.channels:
    Take the visualAttr and dataAttr of rawChannelItem
    If data attribute exists in the query output,
        channels[visualAttr] = query_output[dataAttr]
    Else:
        channels[visualAttr] = [dataAttr] * (however many data points we have)
```

There's also a bunch some stuff that has to do with handling callback functions and nesting but those aren't as important as the stuff in this document.

Once the channels have been computed, we call doLayout, which runs layout algorithms over channels. If no layout algorithm is specified by the user, doLayout does nothing and returns (channels will not be modified in this case)

In the case that the mark is nested, we group the data by their parent mark. Then we repeat the same process as above for unnested marks (rowsToCols, applychannels, doLayout)

### Render/runRenderTask

We have the channels after the Layout task.

Similar to the Layout task, there are two possible paths depending on whether the mark is nested.

For unnested marks, we run the else statement
```code
else {    
    let {mark, markInfo} = this.makemark(channels, crow)

    root
        .append("g")
        .attr("transform", `translate(${crow.x}, ${crow.y})`)
        .node().appendChild(mark);

    return markInfo
}
```

We call makemark, which is where the actual call to observable occurs:

```code
let mark = OPlot.plot( {
    ...R.pick(['width', 'height'], crow),
    ...(this.options),
    marks: [ 
        this.mark.klass(data[IDNAME], data)
    ],
    ...(this._scales)})
```

The next portion after that is for overriding observable so that we can impose our own properties on the mark
```code
if (this.marktype == "text" && ("textAnchor" in this.options)) {
    /**
    * check if this is a text mark and if the user specified textAnchor
    * If neither, this if block will not run
    */
    this.handleTextAnchor(mark, crow);
} else if (this.marktype == "text") {
/**
    * Check if this is a text mark and if x or y are created from get methods
    */
    for (let i = 0; i < this.channels.length; i++) {
        let currChannel = this.channels[i]
        if (currChannel.visualAttr == 'x' && currChannel.isGet) {
            this.setXTranslate(mark, data)
        } else if (currChannel.visualAttr == 'y' && currChannel.isGet) {
            this.setYTranslate(mark, data)
        }
    }
} else if (this.marktype == "link" && ("curve" in this.options)) {
    this.setCurve(mark)
}
```

The text mark for observable will not render in the correct x and y position if x and y happen to be get calls. As such, we call setXTranslate and setYTranslate if needed.

The bottom else if clause is for setting curves on link marks.

```code
let markInfo = this.getMarkInfo(mark, data, crow)

/**
* we hide axes because each mark gets its own axis. 
* we don't want overlapping axes because that makes it hard to read
*/
this.hideAxes(mark)


this.updateScales(mark)

return {mark, markInfo};
```

The last portion of makemark gets the information of each mark (ie. its final x,y position and other visual attributes) using the getMarkInfo function.

Once the mark has been created using observable, we append it onto the canvas

```code
root
    .append("g")
    .attr("transform", `translate(${crow.x}, ${crow.y})`)
    .node().appendChild(mark);
```
Note the .attr("transform",...)

That line sets the offset of the mark. If crow.x happens to be 20, think of it as translating 20 pixels to the right. If crow.y happens to be 20, think of it as translating 20 pixels downward.

### Cleanup/runCleanupTask

The cleanupTask is mainly about creating a new marktable using the markInfo we got and storing it as a new table in the database. Take a look at createMarkTable if you are interested.

## Key Functions and Modules
TBD

### Function List
TBD

### Execution
- Run the following command
```code
src/routes/+page.svelte
```

