Updates to table API:

groupby function to create a new table with an aggregate column
Eg. let t2 = await t.groupby(["a","b"], mgg.count({renameAs: "n"}))

The above code calculates the count of each unique combination of "a" and "b" in table t. The count is stored in a column "n". t2 is the new table containing columns "a","b", "n"

Other supported aggregate functions include
mgg.avg({renameAs: "avg", col: "a"})
mgg.max({renameAs: "max", col: "a"})
mgg.median({renameAs: "median", col: "a"})
mgg.min({renameAs: "min", col: "a"})

renameAs is a user specified string for the new column of aggregate
col specifies which column to run the aggregate function on.

select function to run a predicate over a table and store the result in a new column
Eg. let t3 = await t.select({attrs: "*", sel: "chol > 230"})

attrs specifies which attributes to select from table t. sel specifies the predicate to run over the table.
sel is always the name of the column that stores the results of running the predicate.
t3 is the new table created from select.

Updates to layout

fdlayout for force directed layout
Eg. ...fdlayout(edges.get("id", ["foreignID1", "foreignID2"]), {strength: -200, steps: 350})()

fdlayout should be passed to the node mark. Given that id uniquely identifies each node, foreignID1 and foreignID2 are foreign key references to node.id. If foreignID1 and foreignID2 appear in the same row in the edges table, then node x with id = foreignID1 and y = foreignID2 are connected to each other. strength specifies the repulsion force between nodes. steps specifies how long to run the layout algorithm for.

Dynamic font size and rotate
Eg. ...pickFontSizeAndRotate(, false)()

This algorithm is for text marks and it chooses the biggest font size possible given the width and height of the bounding box of each text. The text to render is specified by the attr column. The second argument is a boolean to indicate whether to split the text or not when picking a font size. false is the default and specifies do not split.

Other updates:

Dropped support for the following options for textAnchor to make library closer to observable
"center", "left", "right", "top", "bottom"
New supported options for textAnchor
*"start","middle","end"
*"middle" is default option per observable if not specified

Users no longer need to specify domain or range for x,y.
Eg. To plot parallel coordinates of dots using the previous version of the library, we would do
c.dot("table", {x: 50, ...}, {x: {domain: [0,1000]}) //1000 is an arbitrary canvas width and 50 is in pixel space

For this version, the user can simply do
c.dot("table", {x: 50, ...}) //Pixel space values are automatically inferred.