<script lang="ts">
    import { watchResize } from "svelte-watch-resize";
	import { tick, onMount, afterUpdate, getContext, setContext } from "svelte";
	import { Database } from "../viz/db";
    import { DuckDB } from "../viz/duckdb";
    import { Canvas }  from "../viz/canvas";
    import { markof, RLX, RLY, propX, propY, eqX, eqY, sq, grid, fdlayout } from "../viz/ref"

    import Debug from "../components/Debug.svelte";
    import TableInspector from "../components/TableInspector.svelte";
    import TopNav from "../components/TopNav.svelte";
    import { mgg } from "../viz/uapi/mgg";
    import { IDNAME } from "../viz/table";
    import { attr } from "svelte/internal";
    import { symbol } from "d3";
    import { FKConstraint } from "../viz/constraint";


    let innerWidth = 10000;
    let debug = null;
    let db_up = null;
    let rootelement = null;
    let svg = null;
    let erDiagramSvg = null


    let graphSvg = null;
    let erDiagramGraphSvg = null

    let inspector = null;

    onMount(async () => {
        const duckdb = new DuckDB({
            sources: [
            {
                name: "penguins",
                url: "/penguins.csv"
            },
            { 
                name: "housing",
                url:  "/clean_melb_data.csv"
            },
            { 
                name: "small_housing",
                url:  "/small_housing.csv"
            },
            {
                name: "airports_csv",
                url: "/airports.csv"
            },
            {
                name: "routes_csv",
                url: "/routes.csv"
            },
            {
                name: "species",
                url: "/clean_species.csv"
            },
            {
                name: "TimeProvince",
                url: "Filtered_TimeProvince_Data_Without_Sejong.csv"
            },
            {
                name: "Weather",
                url: "Filtered_Weather_Data_3.csv"
            },
            {
                name: "hrdata",
                url: "/HRDataset_v14.csv"
            },
            {
                name: "heart_disease_csv",
                url: "/clean_heart_disease_NAMED.csv"
            },
            {
                name: "heart_csv",
                url: "/heart.csv"
            }
        ]
        });
        db_up = await (async function dbGoLive(duckdb) {
        await duckdb.init()
        duckdb.on("data", debug.render)

        await duckdb.exec(
            `CREATE TABLE airports (airport text PRIMARY KEY, latitude REAL, longitude REAL)`
        )

        await duckdb.exec(
            `CREATE TABLE routes (
                ORIGIN TEXT,
                DEST TEXT,
                FOREIGN KEY (ORIGIN) REFERENCES airports(airport),
                FOREIGN KEY (DEST) REFERENCES airports(airport)
            )`
        )

        await duckdb.exec(
            `
            INSERT INTO airports (airport, latitude, longitude)
            SELECT airport, latitude, longitude FROM airports_csv;
            `
        )
        
        await duckdb.exec(
            `
            INSERT INTO routes (ORIGIN, DEST)
            SELECT ORIGIN, DEST FROM routes_csv;
            `
        )

        await duckdb.exec( //creating new table with primary key
            `CREATE TABLE TimeProvince2 (date DATE, province TEXT, confirmed INT, PRIMARY KEY (date,province))`
        )
        await duckdb.exec(
            `CREATE TABLE Weather2 (date DATE, province TEXT, avgtemp REAL, PRIMARY KEY (date,province), FOREIGN KEY (date,province) references TimeProvince2(date,province))`
        )

        await duckdb.exec( 
            `
            INSERT INTO TimeProvince2 (date, province, confirmed)
            SELECT date, province, confirmed FROM TimeProvince;
            `
        )
        await duckdb.exec(
            `
            INSERT INTO Weather2 (date, province, avgtemp)
            SELECT date, province, avg_temp FROM Weather;
            `
        )

        
        await duckdb.exec(
             `CREATE TABLE heart_disease as
             SELECT Gender, Family_Heart_Disease, Alcohol_Consumption, Exercise_Habits, Stress_Level, Age, Smoking, Gender, High_Blood_Pressure,Status, BMI, Sleep_Hours, Sugar_Consumption,CRP_Level,Blood_Pressure
             FROM heart_disease_csv
             WHERE Status = false;`
         )
         await duckdb.exec( //sql query here
             `CREATE TABLE heart as 
             Select exang, thalach, cp, target,sex,fbs,slope,ca,thal,age,oldpeak,trestbps,chol
             FROM heart_csv
             WHERE target = 0;`
         )
             

        })(duckdb);


        await db_up;

        inspector.conn = duckdb;

        let db = new Database(duckdb);
        await db.init();
        await db.loadFromConnection();
        let canvas
        let erDiagramCanvas

        /**START OF ANALYSIS */

        /**
         * GOAL:
         * Concretely use thr dataset you have to showcase an analysis that goes through 
         * each of the example types in the main normalization vis example figure in the paper 
         * along with data transform, filter, and highlight
         * 
         * PLAN:
         * We present a data analysis over the heart dataset, where we try to find which variables
         * have the highest correlation with target (ie. a person having heart disease)
         * 
         * Assume that we begin with a single table: heart(target, cp, thalach, age, sex)
         * 
         * target: Whether a person has heart disease (0 or 1)
         * cp: Chest pain type (0,1,2,3)
         * thalach: Maximum heart rate achieved, discrete value (71 - 202)
         * age: age in years, discrete value (29 - 77)
         * sex: male or female (1 = Male, 0 = Female)
         * 
        */

        /* SCATTER PLOT FIG 5A PART 1 */
        /**
         * NOTE: Might make life way easier if we had a color legend automatically set up
        */
        if (0) {
            /**
             * SCATTERPLOT:
             * We first begin with a scatterplot where x: "age", y: "thalach", symbol: "sex", fill: "target", r: "cp"
             * The scatterplot does not tell us a lot about the data. It only indicates a negative correlation between age and thalach
             * There is no distinction separation between black and brown dots in the scatterplot, indicating that heart disease status
             * is not strongly dependent on age or maximum heart rate
             */

            await db.loadFromConnection()

            let c = new Canvas(db, {width: 1000, height: 800}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalize("heart_csv", ["target", "cp", "thalach", "age", "sex"], "heart_reduced")
            let dots = c.dot("heart_reduced", {x: "age", y: "thalach", symbol: "sex", fill: "target", r: ({cp}) => cp + 1}, {x: {range: [10, 990]}})
        }

        /* TIMECARD / PUNCHCARD DESIGN FIG 5B PART 1 */
        if (0) {
            /**
             * TIMECARD:
             * To see the correlations between the columns in the table, we can use a timecard/ punchcard design
             * DATA TRANSFORMATIONS:
             * Normalize all columns in heart to get:
             * target(id, target)
             * cp(id, cp)
             * thalach(id, thalach)
             * age(id, age)
             * sex(id, sex)
             * combined(target, cp, thalach, age, sex)
             * combined.target is a foreign key reference to target.id, combined.cp to cp.id, and so on and so forth
             * 
             * There appears to be some correlation between cp and thalach because the dots are not evenly distributed.
             * However, the timecard does not say much more. 
             * In addition, the timecard design is limited by the number of variables it can visualize
             * 
             * What we really need is a number...(will demonstrate in FIG 5E via heatmap)
             */
            await db.loadFromConnection()
            let c = new Canvas(db, {width: 1000, height: 1000}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalize("heart_csv", ["target", "cp", "thalach", "age", "sex"], "heart_reduced")
            
            await db.normalizeMany("heart_reduced", ["cp", "thalach"].map(a => [a]),
                {dimnames: ["cp", "thalach"], factname: "combined"})

            // let sa = c.linear("sa")
            // let sb = c.linear("sb")
            // let dots = c.dot("combined", { x: sa('cp'), y: sb('thalach'), fill:'target'})
            // dots.orderBy(["thalach", "cp"])
            // let cpLabel = c.text("cp", {x: sa(IDNAME), y: 0, text: 'cp'}, {textAnchor: "bottom"})
            // let thalachLabel = c.text("thalach", {x: 0, y: sb(IDNAME), text: 'thalach'}, {textAnchor: "left"})

            // let sa = c.linear("sa")
            // let sb = c.linear("sb")
            let cpLabel = c.text("cp", {x: IDNAME, y: 0, text: "cp", fontSize: 20}, {textAnchor: "bottom"})
            cpLabel.orderBy("cp")
            let thalachLabel = c.text("thalach", {x: 0, y: IDNAME, text: "thalach"}, {textAnchor: "left"})
            thalachLabel.orderBy("thalach",true)
            let dots = c.dot("combined", {x: cpLabel.get(null, "x"), y: thalachLabel.get(null, "y"), fill: "target"})
        }

        /* PARALLEL COORDINATES FIG 5C PART 1 */
        if (0) {
            /**
             * DATA TRANSFORMATIONS:
             * Normalize all columns in heart (same as previous example)
             * 
             * We are able to visualize multiple variables as separate dots using parallel coordinates.
             * We are able to infer that cp and thalach have some correlation, which we have already known from the previous example.
             * Nothing new has been revealed to us at this stage.
             * In addition, the diagram is now extremely noisy due to the number of marks present
            */
            await db.loadFromConnection()
            let c = new Canvas(db, {width: 1000, height: 800}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            let attrs = ["sex", "age", "thalach", "cp", "target"]
            await db.normalize("heart_csv", attrs, "heart_reduced")
            
            await db.normalizeMany("heart_reduced", attrs.map(a => [a]),
                {dimnames: attrs, factname: "combined"})

            let dotMarks = []

            attrs.forEach((attr, i) => {
                let mark = c.dot(attr, {x: i * 200, y: attr}, {x:{domain: [10, 990]}})
                let label = c.text(attr, {x: mark.get(null, "x"), y: 0, text: {constant: attr}}, {textAnchor: "bottom"})
                dotMarks.push(mark)
            })

            for (let i = 0; i < attrs.length - 1; i++) {
                let leftMark = dotMarks[i]
                let rightMark = dotMarks[i + 1]
                let leftAttr = attrs[i]
                let rightAttr = attrs[i + 1]

                let linkMark = c.link("combined",
                    {
                        ...leftMark.get(null, {x1: "x", y1: "y"}),
                        ...rightMark.get(null, {x2: "x", y2: "y"})
                    }
                )
            }

        }

        /* PARALLEL COORDINATES FIG 5C PART 2 */
        if (0) {
            /**
             * Continuing from above, it would be helpful if we can aggregate the data
             * Given that cp and thalach have some correlation, 
             * we can count the frequency of each combination of cp and thalach
             * 
             * DATA TRANSFORMATIONS:
             * Normalize all columns in heart (same as previous example)
             * Create a count table of combinations of cp and thalach
             * 
            */
            await db.loadFromConnection()
            let c = new Canvas(db, {width: 1000, height: 800}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            let attrs = ["sex", "age", "thalach", "cp", "target"]
            await db.normalize("heart_csv", attrs, "heart_reduced")
            
            await db.normalizeMany("heart_reduced", attrs.map(a => [a]),
                {dimnames: attrs, factname: "combined"})
            
            await c.createCountTable("combined", ["cp", "thalach"], "cp_thalach_count")

            let dotMarks = []

            attrs.forEach((attr, i) => {
                //NOTE: THIS IS ACTUALLY WRONG AND WE NEED TO FIX THIS AT SOME POINT.
                //THIS CREATES REPLICAS OF TEXT SVGS
                let mark = c.dot(attr, {x: i * 200, y: attr}, {x: {domain: [10, 990]}})
                let label = c.text(attr, {x: mark.get(null, "x"), y: 0, text: {constant: attr}}, {textAnchor: "bottom"})

                dotMarks.push(mark)
            })

            for (let i = 0; i < attrs.length - 1; i++) {
                let leftMark = dotMarks[i]
                let rightMark = dotMarks[i + 1]
                let leftAttr = attrs[i]
                let rightAttr = attrs[i + 1]
                let table = "combined"

                let mappingObj = 
                {
                    x1: leftMark.get(leftAttr, "x"),
                    y1: leftMark.get(leftAttr, "y"),
                    x2: rightMark.get(rightAttr, "x"),
                    y2: rightMark.get(rightAttr, "y"),
                }

                //Use count table instead of combined in this case
                if (leftAttr == "thalach") {
                    table = "cp_thalach_count"
                    mappingObj["stroke"] = "count"
                }

                let linkMark = c.link(table, mappingObj)
            }

        }

        /* PARALLEL COORDINATES FIG 5C PART 3 */
        if (0) {
            /**
             * We managed to color the links based on frequency, but the visualization is still pretty noisy.
             * To resolve this, we can bucket the data to produce fewer dot marks
             * In particular, age and thalach columns can be bucketed due to the number of dot marks they produce
             * We can also turn the dots in squares
             * 
             * DATA TRANSFORMATIONS:
             * Repeat steps from previous example
             * Create bucket tables
             * 
             * 
            */
            await db.loadFromConnection()
            let c = new Canvas(db, {width: 1000, height: 1000}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            let attrs = ["sex", "age", "thalach", "cp", "target"]
            await db.normalize("heart_csv", attrs, "heart_data")
            let edgetable = await c.db.table("heart_data").bucket("age", 8)
            edgetable = await edgetable.bucket("thalach", 10)
            
            await db.normalizeMany(edgetable.internalname, attrs.map(a => [a]),
                {dimnames: attrs, factname: "combined"})
            
            let squareMarks = []

            attrs.forEach((attr, i) => {

                let mark = c.square(attr, {x: i * 200, y: attr, width: 50, fill: "none", stroke: "black"})
                let label = c.text(attr,
                    {
                        x: mark.get(attr, ["x", "width"], (d) => d.x + d.width/2), 
                        y: mark.get(attr, ["y", "height"], (d) => d.y + d.height/2),
                        text: attr

                    }, {lineAnchor: "middle"})
                squareMarks.push(mark)
            })

            for (let i = 0; i < attrs.length - 1; i++) {
                let leftMark = squareMarks[i]
                let rightMark = squareMarks[i + 1]
                let leftAttr = attrs[i]
                let rightAttr = attrs[i + 1]

                let table = await edgetable.groupby([leftAttr, rightAttr], {c: "count"})

                let mappingObj = 
                {
                    x1: leftMark.get(null, ["x", "width"], (d) => d.x + d.width),
                    y1: leftMark.get(null, ["y", "height"], (d) => d.y + d.height/2),
                    x2: rightMark.get(null, "x"),
                    y2: rightMark.get(null, ["y", "height"], (d) => d.y + d.height/2),
                    opacity: "c",
                    stroke: "c",
                    strokeWidth: "c"
                }

                let linkMark = c.link(table, mappingObj, {curve: true})

                if (leftAttr == "sex")
                    linkMark.filter({operator: ">=", col: "c", value: 3})
                else if (leftAttr == "age")
                    linkMark.filter({operator: ">=", col: "c", value: 2})
                else if (leftAttr == "thalach")
                    linkMark.filter({operator: ">=", col: "c", value: 2})
            }

            // let c2 = new Canvas(db, {width: 1500, height: 1500})
            // erDiagramCanvas = c2


            // let vtables = c2.rect("tables", { x: 'tid', y: 0, fill:'white', stroke:'black'})
            // vtables.filter(`table_name IN ${c.getTablesUsed()}`)

            // let vlabels = c2.text("tables", {x: vtables.get(["id"], "x"), y: vtables.get(["id"], "y", (d) => d.y - 10), text: "table_name"})
            // let vattributes= c2.text("columns", {
            //                                 y: 'ord_pos',
            //                                 text: ({colname, type}) => `${colname} ${type}`,
            //                                 textDecoration: ({is_key}) => is_key ? 'underline': 'none',
            //                                 x: 0
            //                 })

            // c2.nest(vattributes, vtables)

            // let vfkeys = c2.link("fkeys", {
            //                         ...vattributes.get(["tid1", "col1"], {x1: "x", y1: "y"}),
            //                         ...vattributes.get(["tid2", "col2"], {x2: "x", y2: "y"})
            //                     })
            // await c2.erDiagram(vtables, vattributes, vfkeys, {strength: -200, steps: 350})

        }

        /* WIP NESTED PARALLEL COORDINATES FIG 5C PART 4 */
        if (0) {
            /**
             * We managed to color the links based on frequency, but the visualization is still pretty noisy.
             * To resolve this, we can bucket the data to produce fewer dot marks
             * In particular, age and thalach columns can be bucketed due to the number of dot marks they produce
             * We can also turn the dots in squares
             * 
             * DATA TRANSFORMATIONS:
             * Repeat steps from previous example
             * Create bucket tables
             * 
             * 
            */

            /**
             * Base table: T(a,b,c,d)
             * 
             * We want T.a to be outer rects
             * 
             * We want parallel coordinates between T.b, T.c and T.d nested within the T.a rectangles
             * 
             * Hence, we need the following tables:
             * 
             * A(id, a) -> for outer rectangles
             * 
             * B(id, aid, b)
             * C(id, aid, c)
             * D(id, aid, d)
             * 
             * 
             * 
             * Data transformation process
             * 1. Normalize out T.a to get A(id, a) T_fact(aid, b, c, d)
             * 2. Normalize out aid and b from T_fact to get B(id, aid, b) T_fact2(...)
             * 
             * 
             * PATH:
             * sex(id, target, sex) -> combined(id, sex_id, ...) via sex.id == combined.sex_id
             * combined(id, sex_id, ...) -> infoTable(id, sex, target, ...) via combined.id == infoTable.id
             * infoTable(id, sex, target, ...) ->  targetTable(id, target) via infoTable.target == targetTable.id
             * 
            */
           /*
           SELECT DISTINCT sex._rav_id, sex.sex, targetTable._rav_id as parent_id
           FROM sex, combined, infoTable, targetTable
           WHERE sex._rav_id == combined.sex_id AND combined._rav_id == infoTable._rav_id AND infoTable.target == targetTable._rav_id

            SELECT DISTINCT sex._rav_id, sex.sex, targetTable._rav_id as parent_id
            FROM sex, combined, infoTable, targetTable
            WHERE sex.target == combined.target AND combined._rav_id == infoTable._rav_id AND infoTable.target == targetTable._rav_id

            SELECT DISTINCT sex._rav_id, sex.sex, targetTable._rav_id as parent_id
            FROM sex, infoTable, targetTable
            WHERE sex.target == infoTable.target AND infoTable.target == targetTable._rav_id
           */

            await db.conn.exec(`
            CREATE TABLE heart_reduced (_rav_id int primary key, sex int, age int, thalach int, cp int, target int)
            `)
            await db.conn.exec(`
            INSERT INTO heart_reduced(_rav_id, sex, age, thalach, cp, target)
            SELECT (ROW_NUMBER() OVER ())::int - 1 AS _rav_id, sex, age, thalach, cp, target
            FROM (SELECT DISTINCT sex, age, thalach, cp, target FROM heart_csv) AS unique_rows;
            `)

            //make target table
            await db.conn.exec(`CREATE TABLE targetTable (_rav_id int primary key, target int)`)

            await db.conn.exec(`
            INSERT INTO targetTable(_rav_id, target)
            SELECT (ROW_NUMBER() OVER ())::int - 1 AS _rav_id, target
            FROM (SELECT DISTINCT target FROM heart_reduced) AS unique_rows;
            `)


            let attrs = ["sex", "age", "thalach", "cp"]
            //let attrs = ["sex", "cp"]

            for (let i = 0; i < attrs.length; i++) {
                            //make age table
                await db.conn.exec(`CREATE TABLE ${attrs[i]}Table (_rav_id int primary key, ${attrs[i]} int, target_id int, FOREIGN KEY (target_id) references targetTable(_rav_id))`)

                await db.conn.exec(`
                INSERT INTO ${attrs[i]}Table (_rav_id, ${attrs[i]}, target_id)
                SELECT
                    (ROW_NUMBER() OVER ())::int - 1 AS _rav_id,
                    unique_${attrs[i]}.${attrs[i]} as ${attrs[i]},
                    targetTable._rav_id as target_id
                FROM (
                    SELECT DISTINCT heart_reduced.${attrs[i]} as ${attrs[i]}, heart_reduced.target as target
                    FROM heart_reduced
                    JOIN targetTable ON heart_reduced.target = targetTable.target
                ) AS unique_${attrs[i]}
                JOIN targetTable on unique_${attrs[i]}.target = targetTable.target
                `)
            }

            for (let i  = 0; i < attrs.length - 1; i++) {
                await db.conn.exec(`CREATE TABLE ${attrs[i]}_${attrs[i + 1]} (_rav_id int primary key, ${attrs[i]}_id int, ${attrs[i + 1]}_id int, FOREIGN KEY (${attrs[i]}_id) references ${attrs[i]}Table(_rav_id), FOREIGN KEY (${attrs[i + 1]}_id) references ${attrs[i + 1]}Table(_rav_id))`)

                await db.conn.exec(`
                INSERT INTO ${attrs[i]}_${attrs[i + 1]} (_rav_id, ${attrs[i]}_id, ${attrs[i + 1]}_id)
                SELECT (ROW_NUMBER() OVER ())::int - 1 AS _rav_id, ${attrs[i]}Table._rav_id as ${attrs[i]}_id, ${attrs[i + 1]}Table._rav_id as ${attrs[i + 1]}_id
                FROM ${attrs[i]}Table, ${attrs[i + 1]}Table
                WHERE ${attrs[i]}Table.target_id = ${attrs[i + 1]}Table.target_id
                `)
            }

            await db.loadFromConnection()
            let c = new Canvas(db, {width: 800, height: 500}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;
            
            let targetRects = c.rect("targetTable", {x: 0, y: "target", fill: "none", stroke: "black"})

            let marks = []
            attrs.forEach((attr, i) => {
                let mark = c.dot(`${attr}Table`, {x: 150 * i, y: attr})
                c.nest(mark, targetRects)
                marks.push(mark)
            })

            for (let i = 0; i < attrs.length - 1; i++) {
                let leftAttr = attrs[i]
                let rightAttr = attrs[i + 1]
                let leftFK = `${leftAttr}_id`
                let rightFK = `${rightAttr}_id`
                let leftMark = marks[i]
                let rightMark = marks[i + 1]

                let tableName = `${leftAttr}_${rightAttr}`

                let link = c.link(tableName,
                {
                    x1: leftMark.get(leftFK, "x"),
                    y1: leftMark.get(leftFK, "y"),
                    x2: rightMark.get(rightFK, "x"),
                    y2: rightMark.get(rightFK, "y"),
                })
                c.nest(link, targetRects)
            }


        }

        /* WIP NESTED PARALLEL COORDINATES FIG 5C PART 4 */
        if (0) {
            await db.conn.exec(`
            CREATE TABLE heart_reduced (_rav_id int primary key, sex int, age int, thalach int, cp int, target int)
            `)
            await db.conn.exec(`
            INSERT INTO heart_reduced(_rav_id, sex, age, thalach, cp, target)
            SELECT (ROW_NUMBER() OVER ())::int - 1 AS _rav_id, sex, age, thalach, cp, target
            FROM (SELECT DISTINCT sex, age, thalach, cp, target FROM heart_csv) AS unique_rows;
            `)

            await db.loadFromConnection()
            let c = new Canvas(db, {width: 800, height: 500}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;
            
            let attrs = ["sex", "age", "thalach", "cp"]

            await db.normalize("heart_reduced", "target", "targetTable", "infoTable")
            await db.normalize("infoTable", ["target", "sex"], "sex", "attr_sex")
            await db.normalize("infoTable", ["target", "age"], "age", "attr_age")
            await db.normalize("infoTable", ["target", "thalach"], "thalach", "attr_thalach")
            await db.normalize("infoTable", ["target", "cp"], "cp", "attr_cp")


            for (let i = 0; i < attrs.length - 1; i++) {
                let leftAttr = attrs[i]
                let rightAttr = attrs[i + 1]
                
                await db.join({t1: leftAttr, t2: rightAttr}, {t1Cols: [{renameAs: `${leftAttr}_id`, col: IDNAME}], t2Cols: [{renameAs: `${rightAttr}_id`, col: IDNAME}]}, [["target", "target"]], `${leftAttr}_${rightAttr}`)
            }



            let targetRects = c.rect("targetTable", {x: 0, y: "target", fill: "none", stroke: "black"})

            let marks = []
            attrs.forEach((attr, i) => {
                let mark = c.dot(attr, {x: 150 * i, y: attr})
                c.nest(mark, targetRects)
                marks.push(mark)
            })

            for (let i = 0; i < attrs.length - 1; i++) {
                let leftAttr = attrs[i]
                let rightAttr = attrs[i + 1]
                let leftFK = `${leftAttr}_id`
                let rightFK = `${rightAttr}_id`
                let leftMark = marks[i]
                let rightMark = marks[i + 1]

                let tableName = `${leftAttr}_${rightAttr}`

                let link = c.link(tableName,
                {
                    x1: leftMark.get(leftFK, "x"),
                    y1: leftMark.get(leftFK, "y"),
                    x2: rightMark.get(rightFK, "x"),
                    y2: rightMark.get(rightFK, "y"),
                })
                c.nest(link, targetRects)
            }

        }

        /* SMALL MULTIPLES FIG 5D */
        if (0) {
            await db.loadFromConnection()
            let c = new Canvas(db, {width: 1000, height: 800}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            let attrs = ["sex", "age", "thalach", "cp", "target"]
            await db.normalize("heart_csv", attrs, "heart_reduced")

            await c.hier("heart_reduced", ["target", "cp", "sex"])

            let targetRects = c.rect("target", {x: "target", y: 0, stroke: "black", fill: "none"})
            let cpRects = c.rect("cp", {...grid("cp", 2)("x","y"), stroke: "black", fill: "none"})
            let dots = c.dot("sex", {x: "thalach", y: "age", symbol: "sex"})

            c.nest(cpRects, targetRects)
            c.nest(dots, cpRects)

            let targetLabel = c.text("target",
                {
                    x: targetRects.get("target", "x"),
                    y: targetRects.get("target", "y", d => d.y - 10),
                    text: "target",
                    fontSize: 20
                }
            )

            let cpLabel = c.text("cp",
                {
                    x: cpRects.get(["target", "cp"], "x"),
                    y: cpRects.get(["target", "cp"], "y", d => d.y - 10),
                    text: "cp",
                    fontSize: 20
                }
            )

            c.nest(cpLabel, targetRects)
        }

        /* CATEGORICAL SCATTERPLOT FIG 5E */
        if (0) {
            // await db.loadFromConnection()
            let c = new Canvas(db, {width: 1000, height: 800}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalize("heart_csv", ["age", "thalach", "target", "cp"], "heart_reduced")
            await db.normalize("heart_reduced", "cp", "cpTable", "infoTable")

            let cpLabel = c.text("infoTable",
            {
                x: "cp",
                y: 0,
                text: "cp",
                fontSize: 20
            }, {textAnchor: "bottom"})

            let infoDots = c.dot("infoTable",
            {
                x: cpLabel.get(IDNAME, "x"),
                y: "thalach",
                fill: "target"

            })
        }

        /* HEATMAP */
        if (0) {
            /**
             * Data transformation process
             * 
             * Create heart_attrs with all the column names eg. heart_attrs(_rav_id, column_name)
             * 
             * CREATE TABLE heart_attrs AS 
             * SELECT "column_name", ((row_number() OVER ())::int-1) AS "_rav_id" 
             * FROM information_schema.columns WHERE table_name = 'heart_reduced'
             * 
             * Create correlation table eg. correlationtable(id, xAxis, yAxis, corrValue)
             * 
             * CREATE TABLE corrtable (_rav_id int primary key, xaxis int, yaxis int, corrvalue float, FOREIGN KEY (xaxis) references heart_attrs(rowid), FOREIGN KEY (yaxis) references heart_attrs(rowid))
             * 
             * INSERT INTO corrtable (_rav_id, xaxis, yaxis, corrvalue)
                SELECT <some expression to generate _rav_id>,
                (SELECT _rav_id FROM heart_attrs WHERE column_name = 'age') as xaxis,
                (SELECT _rav_id FROM heart_attrs WHERE column_name = 'cholesterol') as yaxis,
                CORR(age, cholesterol) as corrvalue
                FROM heart_reduced;
             * UNION
             * 
             * 
            */
            await db.loadFromConnection()
            let c = new Canvas(db, {width: 600, height: 600}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalize("heart_csv", ["target", "cp", "thalach", "age", "sex"], "heart_reduced")
            

            await c.createDescriptionTable("heart_reduced", "heart_attrs")
            await c.createCorrTable("heart_reduced", "heart_attrs", "heart_corr")

            let yAxis = c.text("heart_attrs", {x: 0, y: "column_name", text: "column_name", rotate: 270}, {textAnchor: "left"})
            let xAxis = c.text("heart_attrs", {x: "column_name", y: 0, text: "column_name"}, {textAnchor: "bottom"})
            let rects = c.square("heart_corr", {x: xAxis.get("xaxis", "x"), y: yAxis.get("yaxis", "y"), opacity: ({corrvalue}) => Math.abs(corrvalue), fill: ({corrvalue}) => Math.abs(corrvalue)})
            let values = c.text("heart_corr", {x: xAxis.get("xaxis", "x"), y: yAxis.get("yaxis", "y"), text: "corrvalue"})

            let c2 = new Canvas(db, {width: 800, height: 500})
            erDiagramCanvas = c2

            let vtables = c2.rect("tables",
            { 
                x: 'id', y: 0, fill:'white', stroke:'black', 
                height: c2.db.table("columns").get("id", "count", (d) => d.count * 20),
                ...fdlayout("id", c2.db.table("fkeys"))()
            })
            vtables.filter(`table_name IN ${c.getTablesUsed()}`)

            // let vlabels = c2.text("tables", {x: vtables.get(["id"], "x"), y: vtables.get(["id"], "y", (d) => d.y - 10), text: "table_name"})
            // let vattributes= c2.text("columns", {
            //                                 y: 'ordinal_position',
            //                                 text: {cols: ["colname", "type"], func: (d) => `${d.colname} ${d.type}`},
            //                                 textDecoration: {cols: ["is_key"], func: (d) => d.is_key ? 'underline': 'none'},
            //                                 x: 0
            //                 })

            // c2.nest(vattributes, vtables)

            // let vfkeys = c2.link("fkeys", {
            //                         ...vattributes.get(["tid1", "col1"], {x1: "x", y1: "y"}),
            //                         ...vattributes.get(["tid2", "col2"], {x2: "x", y2: "y"})
            //                     })
            // await c2.erDiagram(vtables, vattributes, vfkeys, {strength: -1000, steps: 40})
        }

        /* TABLE */
        if (0) {
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            let attrs =  ["target", "cp", "thalach", "age", "sex"]
            await db.normalize("heart_csv", attrs, "heart_reduced")

            /**
             * Returns table with name "heart_reduced"
             */
            let table = db.table("heart_reduced")

            /**
             * selecting target, id from heart_reduced and putting this new information in target table
            */
            /**
             * Create table called target with columns target and rowid
             * 
             * rowid is _rav_id in heart_reduced
             */
            let targetTable = await table.project({ 
                target: "target", 
                rowid: IDNAME }, "target", "rowid")

            /**
             * Create all other tables (ie. cp, thalach, age, sex)
             * addConstraint allows us to add a foreign key reference from cp.rowid to target.rowid
             * Why: See figure 6(f) in paper. We need this foreign key reference
            */
            for (let i = 1; i < attrs.length; i++) {
                let attrTable = await table.project({ 
                [`${attrs[i]}`]: attrs[i], 
                rowid: IDNAME }, `${attrs[i]}`, "rowid")

                c.db.addConstraint(new FKConstraint({t1: targetTable, X: ["rowid"], t2: attrTable, Y: ["rowid"]}))
            }

            let s = c.linear("scale1")
            let targetText = c.text("target", {x: 0, y: s("rowid"), text: "target"})
            
            targetText.filter({operator: "<=", col: "rowid", value: 5})
            
            for (let i = 1; i < attrs.length; i++) {
                let textMark = c.text(attrs[i], {y: s("rowid"), text: attrs[i], x: targetText.get("rowid", "x", (d) => d.x + (i * 100))})
            }
            
        }

        /**END OF ANALYSIS*/

        /* EXPERIMENT: VISUALIZING DATA TRANSFORMATION */
        if (0) {
            let c = new Canvas(db, {width: 600, height: 600}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalize("heart_csv", ["target", "cp", "thalach", "age", "sex"], "heart_reduced")
            

            await c.createDescriptionTable("heart_reduced", "heart_attrs")
            await c.createCorrTable("heart_reduced", "heart_attrs", "heart_corr")

            let yAxis = c.text("heart_attrs", {x: 0, y: "column_name", text: "column_name", rotate: 270}, {textAnchor: "left"})
            let xAxis = c.text("heart_attrs", {x: "column_name", y: 0, text: "column_name"}, {textAnchor: "bottom"})
            let rects = c.square("heart_corr", {x: xAxis.get("xaxis", "x"), y: yAxis.get("yaxis", "y"), opacity: ({corrvalue}) => Math.abs(corrvalue), fill: ({corrvalue}) => Math.abs(corrvalue)})
            let values = c.text("heart_corr", {x: xAxis.get("xaxis", "x"), y: yAxis.get("yaxis", "y"), text: "corrvalue"})

            let c2 = new Canvas(db, {width: 800, height: 500})
            erDiagramCanvas = c2

            let vtables = c2.rect("tables", { x: 'tid', y: 0, fill:'white', stroke:'black'})
            vtables.filter(`table_name IN ${c.getTablesUsed()}`)

            let vlabels = c2.text("tables", {x: vtables.get(["id"], "x"), y: vtables.get(["id"], "y", (d) => d.y - 10), text: "table_name"})
            let vattributes= c2.text("columns", {
                                            y: 'ordinal_position',
                                            text: {cols: ["colname", "type"], func: (d) => `${d.colname} ${d.type}`},
                                            textDecoration: {cols: ["is_key"], func: (d) => d.is_key ? 'underline': 'none'},
                                            x: 0
                            })

            c2.nest(vattributes, vtables)

            let vfkeys = c2.link("fkeys", {
                                    ...vattributes.get(["tid1", "col1"], {x1: "x", y1: "y"}),
                                    ...vattributes.get(["tid2", "col2"], {x2: "x", y2: "y"})
                                })
            await c2.erDiagram(vtables, vattributes, vfkeys, {strength: -1000, steps: 40})
        }

        //CASE STUDY: SECTION 7 OF PAPER
        //7.1 NESTED SCATTER PLOTS
        if (0) {
            await db.loadFromConnection()
            let c = new Canvas(db, {width: 800, height: 650}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            let attrs = ["thalach", "age", "cp", "slope", "chol", "target"]
            await db.normalize("heart_csv", attrs, "heart_data")

            //finish data preparation
            //See section 7.1 for equivalent example in paper, i am trying to mimic it as much as possible
            let t = c.db.table("heart_data")

            //This to demonstrate filtering
            let t3 = await t.select({attrs: "*", sel: "chol > 230"})

            //Switch between t and t3 to see the difference before and after projection
            //let vdot = c.dot(t, {x: "age", y: "thalach", symbol: "target"})
            let vdot = c.dot(t3, {x: "age", y: "thalach", symbol: "target", fill: "sel"})

            let t2 = await t.groupby(["cp", "slope"], {n: "count"}, "cp_slope_combinations")

            //I skip normalizing cp and slope here
            let vsquare = c.square(t2, {x: "cp", y: "slope", fill: "n", opacity: "n", stroke: "black", width: 175})

            let vtext = c.text(t2, {x: vsquare.get(null, "x"), y: vsquare.get(null, "y", ({y}) => y - 10), text: ({cp, slope}) => `cp: ${cp} slope: ${slope}`})

            vsquare.nest(vdot)
        }

        //7.2 PARALLEL COORDINATES V2
        if (1) {
            await db.loadFromConnection()
            let c = new Canvas(db, {width: 1200, height: 1000}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            let attrs = ["thalach", "age", "cp", "slope", "chol", "target"]
            await db.normalize("heart_csv", attrs, "heart_data")

            let edgetable = await c.db.table("heart_data").bucket("age", 8)
            edgetable = await edgetable.bucket("thalach", 10)
            edgetable = await edgetable.bucket("chol", 20)


            await db.normalizeMany(edgetable.internalname, attrs.map(attr => [attr]), {dimnames: attrs})


            //finish data preparation
            //See section 7.2 for equivalent example in paper, i am trying to mimic it as much as possible

            //Honestly i have no clue how to link tattrs to each attribute table so i am commenting it out
            // let tattr = await c.createDescriptionTable("heart_data", "attrs")
            // let Vatt = c.rect(tattr, {x: "column_name", y: 0, fill: "none", stroke: "black"})

            let domObj = {x: {domain: [0, 1200]}}
            let views = []
            
            attrs.forEach((attr, i) => {
                let mark = c.text(attr, {x: i * 200 + 100, y: attr, text: attr}, domObj)
                views.push(mark)
            })

            for (let i = 0; i < attrs.length - 1; i++) {
                let leftMark = views[i]
                let rightMark = views[i + 1]
                let grouped = await edgetable.groupby([attrs[i], attrs[i + 1]], {c: "count"})

                let vlink = c.link(grouped,
                    {
                        x1: leftMark.get(null, ["x", "width"], ({x, width}) => x + width),
                        y1: leftMark.get(null, ["y", "height"], ({y, height}) => y + height/2),
                        x2: rightMark.get(null, "x"),
                        y2: rightMark.get(null, ["y", "height"], ({y, height}) => y + height/2),
                        strokeWidth: "c",
                        opacity: "c",
                        fill: "c"
                    }, {curve: true})
            }
        }

        






        if (0) {
            await db.loadFromConnection()
             /*   
            await c.hier("heart_disease2", ["Alcohol_Consumption", "Exercise_Habits", "Gender"])
            //Excercise_Habits("HAB")
            //Gender (HAB, GEN, ...)
            //hierarchy ~= normalization
            //await db.normalize("Gender", ["Gender"], "gender_only", "info")

            let alcohol = c.rect("Alcohol_Consumption", {...sq("Alcohol_Consumption")("x", "y"), fill: "none", stroke: "black"})
            let habits = c.rect("Exercise_Habits", {x: "Exercise_Habits", fill: "none", stroke: "black"})

            let habitsLabel = c.text("Alcohol_Consumption", {x: alcohol.get("Alcohol_Consumption", "x"), y: alcohol.get("Alcohol_Consumption", "y"), text: "Alcohol_Consumption"})
            
            let info = c.dot("Gender", {x: "Blood_Pressure", y: "Age", r: "Status", fill: "Cholesterol_Level"})

            c.nest(habits, alcohol)
            c.nest(info, habits)

            */

            let c = new Canvas(db, {width: 1000, height: 800}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalizeMany("heart_csv", ["target","age","cp"].map((a) => [a]), {dimnames: ["heart_target", "heart_age","heart_cp"], factname: "heart_fact"})

            await c.hier("heart_fact", ["heart_age", "heart_age", "heart_cp"])
            //let cp = c.rect("heart_cp", {...sq("heart_cp")("x", "y"), fill: "none", stroke: "black"})

            const dom = {x: {domain: [0,30]}}
            let bucketedAgeTable = await c.bucket({table: "heart_age", col: "age", bucketSize: 8})

            let age = c.dot(bucketedAgeTable, {x: 10, y: "age_bucket"}, dom)
            let target = c.dot("heart_target", {x: 20, y: "target"}, dom)

            let links = c.link("heart_fact", {
                                        x1: age.get(null, ['x']), 
                                        y1: age.get(null, ['y']), 
                                        x2: target.get(null, ['x']), 
                                        y2: target.get(null, ['y']), 
                                    }, 
                                    {curve: true})
            let ageLabels = c.text(bucketedAgeTable, 
            {
                x: age.get("age_bucket", ["x"]),
                y: age.get("age_bucket", ["y"], (d) => d.y - 10),
                text: "age_bucket",
                fontSize: 20
            })

        }

        if (0) { //parallel coordinates with the new heart dataset

                        
        await db.loadFromConnection()

        let canvasWidth = 1200;
        let canvasHeight = 800;
        let c = new Canvas(db, {width: canvasWidth, height: canvasHeight}) //setting up canvas
        canvas = c
        window.c = c;
        window.db = db;



        await db.normalizeMany("heart_disease", ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Exercise_Habits", "Stress_Level", "Age", "High_Blood_Pressure","Status","Smoking","BMI", "Sleep_Hours", "Sugar_Consumption","CRP_Level","Blood_Pressure"].map((a) => [a]))


        await c.hier("heart", ["sex", "exang", "thalach", "cp", "target","fbs","slope","ca","thal","age","oldpeak","trestbps","chol"])
        //let specificAttributes: String[] = ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Stress_Level", "Smoking", "High_Blood_Pressure", "Age","Exercise_Habits"];
        //let tablename = "heart_disease"

        let specificAttributes: string[] = ["exang", "cp", "target","fbs","slope","ca","thal"];
        let tablename = "heart"

        let bucketingAttribute = [];
        let bucketsizeArray = [];
        let bucketing = true;


        //_-------------------------------------------------------------------------------------------------------------------------

        let bigRect = c.rect("sex", {y: "sex", fill: "none", stroke: "black"})


                    
        let markArray2 = []; //creating the rectagular makrs
        let boxWidth2 = 50

        for(let i = 0; i < specificAttributes.length; i++){
            markArray2.push(c.square(specificAttributes[i], {
                x: (i)* (canvasWidth/specificAttributes.length) + (canvasWidth/specificAttributes.length)/2 - boxWidth2/2, 
                y: specificAttributes[i], 
                fill: "none", 
                stroke: "black", 
                width: boxWidth2}))

                c.nest(markArray2[i], bigRect)
        }

        
        let tableNameArray = []; //Creating an array to reference table names and allow for bucketing
            for(let i = 0; i < specificAttributes.length; i++){
                tableNameArray.push(tablename + "_" + specificAttributes[i])
            }

        

        /*
        let captionArray = []; //creating the captions at the bottom
        for(let i = 0; i < specificAttributes.length; i++){
                captionArray.push(c.text(specificAttributes[i], {
                    x: markArray2[i].get(["sex", ...specificAttributes.slice(0, i)], "x"), 
                    text: specificAttributes[i].toUpperCase(), 
                    fontSize: 20}, 
                    {textAnchor: "bottom"}))
                c.nest(captionArray[i], bigRect, ["sex", ...specificAttributes.slice(0, i)])
        }
                */
        
                    
        


        let workingAttributes = Array.from(specificAttributes); //creating a copy of the specificAttrbute array to allow for bucketing

        /*
        
        let labelArray = []; //creating the labels for each mark
            for(let i = 0; i < specificAttributes.length; i++){
                labelArray.push(c.text(specificAttributes[i], {
                    x: 200, 
                    y: 200, 
                    text: workingAttributes[i], 
                    fontSize: 20})) 
                c.nest(labelArray[i], markArray2[i], workingAttributes[i])
            }
        
        */
        

        

                
        //--------------------------------------------------------------------------------------------------------------------------

        }

        //BUGGY DO NOT RENDER. THIS IS BECAUSE THE BUCKET FUNCTION HAS BEEN MOVED
        if (0) { //parallel coordinates with the new heart dataset

                
            await db.loadFromConnection()


            let canvasWidth = 800;
            let canvasHeight = 600;

            let c = new Canvas(db, {width: canvasWidth, height: canvasHeight}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;



            await db.normalizeMany("heart_disease", ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Exercise_Habits", "Stress_Level", "Age", "High_Blood_Pressure","Status","Smoking","BMI", "Sleep_Hours", "Sugar_Consumption","CRP_Level","Blood_Pressure"].map((a) => [a]))

            await db.normalizeMany("heart", ["exang", "thalach", "cp", "target","sex","fbs","slope","ca","thal","age","oldpeak","trestbps","chol"].map((a) => [a]))

            await c.hier("heart", ["sex", "exang", "thalach", "cp", "target","fbs","slope","ca","thal","age","oldpeak","trestbps","chol"])
            //let specificAttributes: String[] = ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Stress_Level", "Smoking", "High_Blood_Pressure", "Age","Exercise_Habits"];
            //let tablename = "heart_disease"

            let specificAttributes: string[] = ["exang","chol" ,"cp", "target","fbs","slope","age","ca","thal"];
            let tablename = "heart"

            let bucketingAttribute = [1,6];
            let bucketsizeArray = [50,8];
            let bucketing = true;

            let tableArray = []; //Creating all the count tables
            for(let i = 0; i < specificAttributes.length - 1; i++){
                tableArray.push(await c.createCountTable(tablename + "_fact", [specificAttributes[i], specificAttributes[i+1]]))
            }

            let tableNameArray = []; //Creating an array to reference table names and allow for bucketing
            for(let i = 0; i < specificAttributes.length; i++){
                tableNameArray.push(tablename + "_" + specificAttributes[i])
            }

            let workingAttributes = Array.from(specificAttributes); //creating a copy of the specificAttrbute array to allow for bucketing

            let bucketArray = []; //bucketing function
            for(let i = 0; i < bucketingAttribute.length; i++){
                bucketArray.push(await c.bucket({table: tablename + "_" + specificAttributes[bucketingAttribute[i]], col: specificAttributes[bucketingAttribute[i]], bucketSize: bucketsizeArray[i]}))
                tableNameArray[bucketingAttribute[i]] = "bucketed_" + tablename + "_" + specificAttributes[bucketingAttribute[i]];
                workingAttributes[bucketingAttribute[i]] = specificAttributes[bucketingAttribute[i]] + "_bucket";
            }

            let markArray = []; //creating the rectagular makrs
            let boxWidth = 30
            for(let i = 0; i < specificAttributes.length; i++){
                markArray.push(c.square(tableNameArray[i], {
                    x: (i)* (canvasWidth/specificAttributes.length) + (canvasWidth/specificAttributes.length)/2 - boxWidth/2, 
                    y: workingAttributes[i], 
                    fill: "none", 
                    stroke: "black", 
                    width: tableNameArray[i].includes("bucketed") ? 100 : boxWidth}))
                
                if (i == 1) {
                    markArray[i].filter({operator: ">=", col: "min_age", value: 48})
                }
            }

            let captionArray = []; //creating the captions at the bottom
            for(let i = 0; i < specificAttributes.length; i++){
                captionArray.push(c.text(tableNameArray[i], {
                    x: markArray[i].get(workingAttributes[i], ["x","width"], (d) => d.x + (d.width)/2), 

                    text: {constant: specificAttributes[i]}, 
                    fontSize: 20}, 
                    {textAnchor: "bottom"}))
            }

            let labelArray = []; //creating the labels for each mark
            for(let i = 0; i < specificAttributes.length; i++){
                labelArray.push(c.text(tableNameArray[i], {
                    x: markArray[i].get(workingAttributes[i], ["x","width"], (d) => d.x + (d.width)/2), 
                    y: markArray[i].get(workingAttributes[i], ["y","width"], (d) => d.y + (d.width)/2), 
                    text: workingAttributes[i], 
                    fontSize: 20}, {lineAnchor: "middle"})) 

            }

           let linkArray = []; //creating the link between the labels
           for(let i = 0; i < specificAttributes.length - 1; i++){
                linkArray.push(c.link(tableArray[i], {
                                        x1: markArray[i].get(specificAttributes[i], ['x',"width"], (d) => d.x + d.width), 
                                        y1: markArray[i].get(specificAttributes[i], ['y',"height"], (d) => d.y + (d.height)/2), 
                                        x2: markArray[i+1].get(specificAttributes[i+1], ['x']), 
                                        y2: markArray[i+1].get(specificAttributes[i+1], ['y',"height"], (d) => d.y + (d.height)/2), 
                                        stroke: "count",
                                        strokeOpacity: "count"
                                    }, 
                                    {curve: true})
            )
            }
            
        }

        /**
         * ER DIAGRAM BUT BETTER
        */
       if (0) {
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 3000, height: 3000})
            canvas = c
            window.c = c;
            window.db = db;

            await c.createTablesMetadata()
            await c.createColumnsMetadata()
            await c.createForeignKeysMetadata()

            let vtables = c.rect("tables", { x: 'tid', y: 0, fill:'white', stroke:'black'})
            let vlabels = c.text("tables", {x: vtables.get(["id"], "x"), y: vtables.get(["id"], "y", (d) => d.y - 10), text: "table_name"})
            let vattributes= c.text("columns", {
                                            y: 'ordinal_position',
                                            text: {cols: ["colname", "type"], func: (d) => `${d.colname} ${d.type}`},
                                            textDecoration: {cols: ["is_key"], func: (d) => d.is_key ? 'underline': 'none'},
                                            x: 0
                            })

            c.nest(vattributes, vtables)

            let vfkeys = c.link("fkeys", {
                                    ...vattributes.get(["tid1", "col1"], {x1: "x", y1: "y"}),
                                    ...vattributes.get(["tid2", "col2"], {x2: "x", y2: "y"})
                                })
            await c.erDiagram(vtables, vattributes, vfkeys, {strength: -1000, steps: 40})
       }

        if (0) { //Multiple Table Habits Nested in Alcohol 1-1-N
            await db.normalize("heart_disease_csv", ["Gender", "Blood_Pressure", "Cholesterol_Level", "Exercise_Habits", "BMI", "Status", "Age", "Alcohol_Consumption"], "heart_disease2")
            //starting table, attributes to pull out [], name of new table with choosen values, name of table with non choosen values. 

            await db.loadFromConnection()
            //loads all tables and constraints from duck db

            let c = new Canvas(db, {width: 1800, height: 800}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await c.hier("heart_disease2", ["Alcohol_Consumption", "Exercise_Habits", "Gender"])
            //Excercise_Habits("HAB")
            //Gender (HAB, GEN, ...)
            //hierarchy ~= normalization
            //await db.normalize("Gender", ["Gender"], "gender_only", "info")

            let alcohol = c.rect("Alcohol_Consumption", {...sq("Alcohol_Consumption")("x", "y"), fill: "none", stroke: "black"})
            let habits = c.rect("Exercise_Habits", {x: "Exercise_Habits", fill: "none", stroke: "black"})

            let habitsLabel = c.text("Alcohol_Consumption", {x: alcohol.get("Alcohol_Consumption", "x"), y: alcohol.get("Alcohol_Consumption", "y"), text: "Alcohol_Consumption"})
            
            let info = c.dot("Gender", {x: "Blood_Pressure", y: "Age", r: "Status", fill: "Cholesterol_Level"})

            c.nest(habits, alcohol)
            c.nest(info, habits)
        }

        if (0) { //hierarchical nesting on heart disease status and chest pain
            await db.loadFromConnection()

            let canvasWidth = 1200;
            let canvasHeight = 800;
            let c = new Canvas(db, {width: canvasWidth, height: canvasHeight}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;



            //await db.normalizeMany("heart_disease", ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Exercise_Habits", "Stress_Level", "Age", "High_Blood_Pressure","Status","Smoking","BMI", "Sleep_Hours", "Sugar_Consumption","CRP_Level","Blood_Pressure"].map((a) => [a]))

            await db.normalizeMany("heart", ["exang", "thalach", "cp", "target","sex","fbs","slope","ca","thal","age","oldpeak","trestbps","chol"].map((a) => [a]))


            //let specificAttributes: String[] = ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Stress_Level", "Smoking", "High_Blood_Pressure", "Age","Exercise_Habits"];
            //let tablename = "heart_disease"

            /*

            let specificAttributes: string[] = ["exang", "age", "cp", "target","sex","fbs","slope","chol","ca","thal"];
            let tablename = "heart"

            c.nest( smallRect, bigRect)
            */

            await c.hier("heart", ["sex", "cp"], ["sexTable", "cpTable"])


            // let bigRect = c.rect("sex", {y: "sex", fill: "none", stroke: "black"})
            // let smallRect = c.square("cp", {
            //         x: (3)* (canvasWidth/8) + (canvasWidth/8)/2 - 50/2, 
            //         y: "cp", 
            //         fill: "none", 
            //         stroke: "black", 
            //         width: 50})

            
            let sex = c.rect("sexTable", {...sq("sex")("x", "y"), fill: "none", stroke: "black"})

            let cp = c.dot("cpTable", {fill : "cp", y: "exang", x: "thalach"})

            let sexLabel = c.text("sexTable",
            {x: 10, 
            y: 20,
            text: "sex"})
            /*
             * NOTE: setting text to sex.get(null, "sex", (d) => d.sex == 0 ? "Male" : "Female") throws a bug see github issue
             */

            c.nest(cp, sex)
        }
        
        //BUGGY DO NOT RENDER. THIS IS BECAUSE THE BUCKET FUNCTION HAS BEEN MOVED
        if (0) { //parallel coordinates with the new heart dataset (old one with two points)
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 1800, height: 800}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;
            
            await db.normalizeMany("heart_disease", ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Exercise_Habits", "Stress_Level", "Age", "High_Blood_Pressure","Status","Smoking","BMI", "Sleep_Hours", "Sugar_Consumption","CRP_Level","Blood_Pressure"].map((a) => [a]))

            await db.normalizeMany("heart", ["exang", "thalach", "cp", "target","sex","fbs","slope","ca","thal","age","oldpeak","trestbps","chol"].map((a) => [a]))


            //let specificAttributes: String[] = ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Stress_Level", "Smoking", "High_Blood_Pressure", "Age","Exercise_Habits"];
            //let tablename = "heart_disease"
            

            let specificAttributes: String[] = ["age", "fbs", "exang", "thal", "cp","slope","ca","sex"];
            let tablename = "heart"
           
            
            
            
            var width = 10
            let captionsize = 15;
            let labelsize = 15;



            let t1Name = await c.createCountTable(tablename + "_fact", [specificAttributes[0], specificAttributes[1]])
            let t2Name = await c.createCountTable(tablename + "_fact", [specificAttributes[1], specificAttributes[2]])
            let t3Name = await c.createCountTable(tablename + "_fact", [specificAttributes[2], specificAttributes[3]])
            let t4Name = await c.createCountTable(tablename + "_fact", [specificAttributes[3], specificAttributes[4]])
            let t5Name = await c.createCountTable(tablename + "_fact", [specificAttributes[4], specificAttributes[5]])
            let t6Name = await c.createCountTable(tablename + "_fact", [specificAttributes[5], specificAttributes[6]])
            let t7Name = await c.createCountTable(tablename + "_fact", [specificAttributes[6], specificAttributes[7]])


            const o = {x: {domain: [0,80]}, r: {domain: [0,0.00001]}, y: [0,100]}

            let bucketing1 = await c.bucket({table: "heart_" + specificAttributes[0], col: specificAttributes[0], bucketSize: 8})

            






           let exang = c.dot(bucketing1, {y : specificAttributes[0] +"_bucket", x: 10, r: 1},o)
           let cp = c.dot(tablename + "_" + specificAttributes[1], {y : specificAttributes[1], x: 20, r: 10},o)
           let target = c.dot(tablename + "_" + specificAttributes[2], {y : specificAttributes[2], x: 30, r: 10},o)
           let sex = c.dot(tablename + "_" + specificAttributes[3], {y : specificAttributes[3], x: 40, r: 10},o)
           let fbs = c.dot(tablename + "_" + specificAttributes[4], {y : specificAttributes[4], x: 50, r: 10},o)
           let slope = c.dot(tablename + "_" + specificAttributes[5], {y : specificAttributes[5], x: 60, r: 10},o)
           let ca = c.dot(tablename + "_" + specificAttributes[6], {y : specificAttributes[6], x: 70, r: 10},o)
           let thal = c.dot(tablename + "_" + specificAttributes[7], {y : specificAttributes[7], x: 80, r: 10},o)

           var modifyer = 1.6

           let offset = width/7.2


           let exang2 = c.dot(bucketing1, {y : specificAttributes[0] +"_bucket", x: 10 - offset, r: 1},o)
           let cp2 = c.dot(tablename + "_" + specificAttributes[1], {y : specificAttributes[1], x: 20- offset, r: 10},o)
           let target2 = c.dot(tablename + "_" + specificAttributes[2], {y : specificAttributes[2], x: 30- offset, r: 10},o)
           let sex2 = c.dot(tablename + "_" + specificAttributes[3], {y : specificAttributes[3], x: 40- offset, r: 10},o)
           let fbs2 = c.dot(tablename + "_" + specificAttributes[4], {y : specificAttributes[4], x: 50- offset, r: 10},o)
           let slope2 = c.dot(tablename + "_" + specificAttributes[5], {y : specificAttributes[5], x: 60- offset, r: 10},o)
           let ca2 = c.dot(tablename + "_" + specificAttributes[6], {y : specificAttributes[6], x: 70- offset, r: 10},o)
           let thal2 = c.dot(tablename + "_" + specificAttributes[7], {y : specificAttributes[7], x: 80- offset, r: 10},o)



          
           const e = {fontSize: {domain: [0,80]}}


          
           //rect, x + width + height
           /*
           c.rect(“heart_exang”, {x: 10, y: specificAttributes[0]}, o)


           c.link(t1Name, {x1: exang.get(specificAttributes[0], [‘x’]), y1: exang.get(specificAttributes[0], ['y']), x2: cp.get(specificAttributes[1], [‘x’,”width”], (d) => d.x + d.width), y2: cp.get(specificAttributes[1], ['y']), stroke: "count"}, {curve: true})
           - compute two different points one of them is shifted
           -
           */

           let links = c.link("heart_fact", {
                                        x1: age.get("age", ['x']), 
                                        y1: age.get("age", ['y']), 
                                        x2: target.get("target", ['x']), 
                                        y2: target.get("target", ['y']), 
                                    }, 
                                    {curve: true})

            let ageLabels = c.text(bucketedAgeTable, {
                x: age.get("age_bucket", ["x"]),
                y: age.get("age_bucket", ["y"], (d) => d.y - 10),
                text: "age_bucket",
                fontSize: 20
            })


          
           let Caption1 = c.text(tablename + "_" + specificAttributes[0], {x: exang.get(specificAttributes[0], "x", (d) => d.x -= modifyer*width), y: 0, text: specificAttributes[0].toUpperCase(), fontSize: captionsize}, {textAnchor: "bottom"})
           let Caption2 = c.text(tablename + "_" + specificAttributes[1], {x: cp.get(specificAttributes[1], "x", (d) => d.x -= modifyer*width), y: 0, text: specificAttributes[1].toUpperCase(), fontSize:captionsize}, {textAnchor: "bottom"})
           let Caption3 = c.text(tablename + "_" + specificAttributes[2], {x: target.get(specificAttributes[2], "x", (d) => d.x -= modifyer*width), y: 0, text: specificAttributes[2].toUpperCase() , fontSize: captionsize}, {textAnchor: "bottom"})
           let Caption4 = c.text(tablename + "_" + specificAttributes[3], {x: sex.get(specificAttributes[3], "x", (d) => d.x -= modifyer*width), y: 0, text: specificAttributes[3].toUpperCase() , fontSize: captionsize}, {textAnchor: "bottom"})
           let Caption5 = c.text(tablename + "_" + specificAttributes[4], {x: fbs.get(specificAttributes[4], "x", (d) => d.x -= modifyer*width), y: 0, text: specificAttributes[4].toUpperCase() , fontSize: captionsize}, {textAnchor: "bottom"})
           let Caption6 = c.text(tablename + "_" + specificAttributes[5], {x: slope.get(specificAttributes[5], "x", (d) => d.x -= modifyer*width), y: 0, text: specificAttributes[5].toUpperCase(), fontSize: captionsize}, {textAnchor: "bottom"})
           let Caption7 = c.text(tablename + "_" + specificAttributes[6], {x: ca.get(specificAttributes[6], "x", (d) => d.x -= modifyer*width), y: 0, text: specificAttributes[6].toUpperCase(), fontSize: captionsize}, {textAnchor: "bottom"})
           let Caption8 = c.text(tablename + "_" + specificAttributes[7], {x: thal.get(specificAttributes[7], "x", (d) => d.x -= modifyer*width), y: 0, text: specificAttributes[7].toUpperCase(), fontSize: captionsize}, {textAnchor: "bottom"})




           let Label1 = c.text(tablename + "_" + specificAttributes[0], {x: exang.get(specificAttributes[0], "x", (d) => d.x -= modifyer*width), y: exang.get(specificAttributes[0], "y"), text: specificAttributes[0], fontSize: labelsize})
           let Label2 = c.text(tablename + "_" + specificAttributes[1], {x: cp.get(specificAttributes[1], "x", (d) => d.x -= modifyer*width), y: cp.get(specificAttributes[1], "y"), text: specificAttributes[1], fontSize: labelsize})
           let Label3 = c.text(tablename + "_" + specificAttributes[2], {x: target.get(specificAttributes[2], "x", (d) => d.x -= modifyer*width), y: target.get(specificAttributes[2], "y"), text: specificAttributes[2] , fontSize: labelsize})
           let Label4 = c.text(tablename + "_" + specificAttributes[3], {x: sex.get(specificAttributes[3], "x", (d) => d.x -= modifyer*width), y: sex.get(specificAttributes[3], "y"), text: specificAttributes[3] , fontSize: labelsize})
           let Label5 = c.text(tablename + "_" + specificAttributes[4], {x: fbs.get(specificAttributes[4], "x", (d) => d.x -= modifyer*width), y: fbs.get(specificAttributes[4], "y"), text: specificAttributes[4] , fontSize: labelsize})
           let Label6 = c.text(tablename + "_" + specificAttributes[5], {x: slope.get(specificAttributes[5], "x", (d) => d.x -= modifyer*width), y: slope.get(specificAttributes[5], "y"), text: specificAttributes[5], fontSize: labelsize})
           let Label7 = c.text(tablename + "_" + specificAttributes[6], {x: ca.get(specificAttributes[6], "x", (d) => d.x -= modifyer*width), y: ca.get(specificAttributes[6], "y"), text: specificAttributes[6], fontSize: labelsize})
           let Label8 = c.text(tablename + "_" + specificAttributes[7], {x: thal.get(specificAttributes[7], "x", (d) => d.x -= modifyer*width), y: thal.get(specificAttributes[7], "y"), text: specificAttributes[7], fontSize: labelsize})
          


           let VT1 = c.link(t1Name, {x1: exang.get(specificAttributes[0], ['x']), y1: exang.get(specificAttributes[0], ['y']), x2: cp.get(specificAttributes[1], ['x', 'r'], (d) => d.x - width*d.r), y2: cp.get(specificAttributes[1], ['y']), stroke: "count",strokeOpacity: "count"}, {curve: true})
           let VT2 = c.link(t2Name, {x1: cp.get(specificAttributes[1], ['x']), y1: cp.get(specificAttributes[1], ['y']), x2: target.get(specificAttributes[2], ['x', 'r'], (d) => d.x - width*d.r), y2: target.get(specificAttributes[2], ['y']), stroke: "count",strokeOpacity: "count"}, {curve: true})
           let VT3 = c.link(t3Name, {x1: target.get(specificAttributes[2], ['x']), y1: target.get(specificAttributes[2], ['y']), x2: sex.get(specificAttributes[3], ['x', 'r'], (d) => d.x - width*d.r), y2: sex.get(specificAttributes[3], ['y']),stroke: "count",strokeOpacity: "count"}, {curve: true})
           let VT4 = c.link(t4Name, {x1: sex.get(specificAttributes[3], ['x']), y1: sex.get(specificAttributes[3], ['y']), x2: fbs.get(specificAttributes[4], ['x', 'r'], (d) => d.x - width*d.r), y2: fbs.get(specificAttributes[4], ['y']),stroke: "count",strokeOpacity: "count"}, {curve: true})
           let VT5 = c.link(t5Name, {x1: fbs.get(specificAttributes[4], ['x']), y1: fbs.get(specificAttributes[4], ['y']), x2: slope.get(specificAttributes[5], ['x', 'r'], (d) => d.x - width*d.r), y2: slope.get(specificAttributes[5], ['y']),stroke: "count",strokeOpacity: "count"}, {curve: true})
           let VT6 = c.link(t6Name, {x1: slope.get(specificAttributes[5], ['x']), y1: slope.get(specificAttributes[5], ['y']), x2: ca.get(specificAttributes[6], ['x', 'r'], (d) => d.x - width*d.r), y2: ca.get(specificAttributes[6], ['y']),stroke: "count",strokeOpacity: "count"}, {curve: true})
           let VT7 = c.link(t7Name, {x1: ca.get(specificAttributes[6], ['x']), y1: ca.get(specificAttributes[6], ['y']), x2: thal.get(specificAttributes[7], ['x', 'r'], (d) => d.x - width*d.r), y2: thal.get(specificAttributes[7], ['y']),stroke: "count",strokeOpacity: "count"}, {curve: true})
       }

        if (0) { //Single Table 
            await db.normalize("heart_disease_csv", ["Gender", "Blood_Pressure", "Cholesterol_Level", "Exercise_Habits", "BMI", "Status", "Age"], "heart_disease")
            //starting table, attributes to pull out [], name of new table with choosen values, name of table with non choosen values. 

            await db.loadFromConnection()
            //loads all tables and constraints from duck db

            let c = new Canvas(db, {width: 800, height: 500}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await c.hier("heart_disease", ["Exercise_Habits", "Gender"])
            //Excercise_Habits("HAB")
            //Gender (HAB, GEN, ...)
            //hierarchy ~= normalization
            //await db.normalize("Gender", ["Gender"], "gender_only", "info")
            
            let info = c.dot("heart_disease_csv", {x: "Blood_Pressure", y: "Cholesterol_Level", r: "Age", fill: "Status"})
        }
        if (0) { //Multiple Table Execise_Habits 1-N
            await db.normalize("heart_disease_csv", ["Gender", "Blood_Pressure", "Cholesterol_Level", "Exercise_Habits", "BMI", "Status", "Age"], "heart_disease")
            //starting table, attributes to pull out [], name of new table with choosen values, name of table with non choosen values. 

            await db.loadFromConnection()
            //loads all tables and constraints from duck db

            let c = new Canvas(db, {width: 2000, height: 1200}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await c.hier("heart_disease", ["Exercise_Habits", "Gender"])
            //Excercise_Habits("HAB")
            //Gender (HAB, GEN, ...)
            //hierarchy ~= normalization
            //await db.normalize("Gender", ["Gender"], "gender_only", "info")

            let habits = c.rect("Exercise_Habits", {...sq("Exercise_Habits")("x", "y"), fill: "none", stroke: "black"})
            let habitsLabel = c.text("Exercise_Habits", {x: habits.get("Exercise_Habits", "x"), y: habits.get("Exercise_Habits", "y"), text: "Exercise_Habits"})
            
            let info = c.dot("Gender", {x: "Blood_Pressure", y: "Cholesterol_Level", r: "Status", fill: "Age"})

            c.nest(info, habits)
        }

        if (0) { //Catagorical Scatter Plots
            await db.normalize("heart_disease_csv", ["Gender", "Blood_Pressure", "Cholesterol_Level", "Exercise_Habits", "BMI", "Status", "Age", "Alcohol_Consumption"], "heart_disease")
            //starting table, attributes to pull out [], name of new table with choosen values, name of table with non choosen values. 

            await db.loadFromConnection()
            //loads all tables and constraints from duck db

            let c = new Canvas(db, {width: 1800, height: 1000}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await c.hier("heart_disease", ["Alcohol_Consumption", "Exercise_Habits", "Gender"])
            //Excercise_Habits("HAB")
            //Gender (HAB, GEN, ...)
            //hierarchy ~= normalization
            //await db.normalize("Gender", ["Gender"], "gender_only", "info")

            let alcohol = c.rect("Alcohol_Consumption", {...sq("Alcohol_Consumption")("x", "y"), fill: "none", stroke: "black"})
            let habits = c.rect("Exercise_Habits", {x: "Exercise_Habits", y: 0, fill: "none", stroke: "black"})

            let alcoholLabel = c.text("Alcohol_Consumption", {x: alcohol.get("Alcohol_Consumption", "x"), y: alcohol.get("Alcohol_Consumption", "y"), text: "Alcohol_Consumption"})
            let habitsLabel = c.text("Exercise_Habits", {x: habits.get(["Exercise_Habits", "Alcohol_Consumption"], "x"), y: habits.get(["Exercise_Habits", "Alcohol_Consumption"], "y"), text: "Exercise_Habits"})

            
            let info = c.dot("Gender", {x: "Gender", y: "Age", r: "Status", fill: "BMI"})

            c.nest(habits, alcohol)
            c.nest(info, habits)
            c.nest(habitsLabel, alcohol)
        }

        if (0) { //catagorical
            
            await db.loadFromConnection()

                        //loads all tables and constraints from duck db

            let c = new Canvas(db, {width: 2000, height: 1200}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            //await db.normalize("heart_disease_csv1", ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Exercise_Habits", "Stress_Level", "Status", "Age"], "heart_disease")
            //starting table, attributes to pull out [], name of new table with choosen values, name of table with non choosen values. 
            await db.normalizeMany("heart_disease", ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Exercise_Habits", "Stress_Level", "Age"].map((a) => [a]))

            let t1Name = await c.createCountTable("heart_disease_fact", ["Gender", "Family_Heart_Disease"])
            let t2Name = await c.createCountTable("heart_disease_fact", ["Family_Heart_Disease", "Alcohol_Consumption"])
            let t3Name = await c.createCountTable("heart_disease_fact", ["Alcohol_Consumption", "Exercise_Habits"])
            let t4Name = await c.createCountTable("heart_disease_fact", ["Exercise_Habits", "Stress_Level"])
            let t5Name = await c.createCountTable("heart_disease_fact", ["Stress_Level", "Age"])

            console.log("t1Name", t1Name)
            console.log("t2Name", t2Name)
            console.log("t3Name", t3Name)
            console.log("t4Name", t4Name)
            console.log("t5Name", t5Name)

            const o = {x: {domain: [0,60]}}
            let Gender = c.dot("heart_disease_Gender", {y : "Gender", x: 10, fill: "Status"},o)
            let Family_Heart_Disease = c.dot("heart_disease_Family_Heart_Disease", {y : "Family_Heart_Disease", x: 20, fill: "Status"},o)
            let Alcohol_Consumption = c.dot("heart_disease_Alcohol_Consumption", {y : "Alcohol_Consumption", x: 30, fill: "Status"},o)
            let Exercise_Habits = c.dot("heart_disease_Exercise_Habits", {y : "Exercise_Habits", x: 40, fill: "Status"},o)
            let Stress_Level = c.dot("heart_disease_Stress_Level", {y : "Stress_Level", x: 50, fill: "Status"},o)
            let Age = c.dot("heart_disease_Age", {y : "Age", x: 60, fill: "Status"},o)

            let VT1 = c.link(t1Name, {x1: Gender.get("Gender", ['x']), y1: Gender.get("Gender", ['y']), x2: Family_Heart_Disease.get("Family_Heart_Disease", ['x']), y2: Family_Heart_Disease.get("Family_Heart_Disease", ['y']), strokeWidth: "count"})
            let VT2 = c.link(t2Name, {x1: Family_Heart_Disease.get("Family_Heart_Disease", ['x']), y1: Family_Heart_Disease.get("Family_Heart_Disease", ['y']), x2: Alcohol_Consumption.get("Alcohol_Consumption", ['x']), y2: Alcohol_Consumption.get("Alcohol_Consumption", ['y']),strokeWidth: "count"})
            let VT3 = c.link(t3Name, {x1: Alcohol_Consumption.get("Alcohol_Consumption", ['x']), y1: Alcohol_Consumption.get("Alcohol_Consumption", ['y']), x2: Exercise_Habits.get("Exercise_Habits", ['x']), y2: Exercise_Habits.get("Exercise_Habits", ['y']), strokeWidth: "count"})
            let VT4 = c.link(t4Name, {x1: Exercise_Habits.get("Exercise_Habits", ['x']), y1: Exercise_Habits.get("Exercise_Habits", ['y']), x2: Stress_Level.get("Stress_Level", ['x']), y2: Stress_Level.get("Stress_Level", ['y']),  strokeWidth: "count"})
            let VT5 = c.link(t5Name, {x1: Stress_Level.get("Stress_Level", ['x']), y1: Stress_Level.get("Stress_Level", ['y']), x2: Age.get("Age", ['x']), y2: Age.get("Age", ['y']),  strokeWidth: "count"})
        }

        if (0) { //catagorical
            
            await db.loadFromConnection()

                        //loads all tables and constraints from duck db

            let c = new Canvas(db, {width: 2000, height: 1200}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalize("heart_disease_csv", ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Exercise_Habits", "Stress_Level", "Status", "Age"], "heart_disease")
            //starting table, attributes to pull out [], name of new table with choosen values, name of table with non choosen values. 
            await db.normalizeMany("heart_disease", ["Gender", "Family_Heart_Disease", "Alcohol_Consumption", "Exercise_Habits", "Stress_Level", "Status", "Age"].map((a) => [a]))

            const o = {x: {domain: [0,60]}}
            const radius = 1000000000000
            let Gender = c.dot("heart_disease_Gender", {y : "Gender", x: 10, fill: "Status", r: 10000000},o)
            let Family_Heart_Disease = c.dot("heart_disease_Family_Heart_Disease", {y : "Family_Heart_Disease", x: 20, fill: "Status", r: radius},o)
            let Alcohol_Consumption = c.dot("heart_disease_Alcohol_Consumption", {y : "Alcohol_Consumption", x: 30, fill: "Status", r: radius},o)
            let Exercise_Habits = c.dot("heart_disease_Exercise_Habits", {y : "Exercise_Habits", x: 40, fill: "Status", r: radius},o)
            let Stress_Level = c.dot("heart_disease_Stress_Level", {y : "Stress_Level", x: 50, fill: "Status", r: radius},o)
            let Age = c.dot("heart_disease_Age", {y : "Age", x: 60, fill: "Status", r: radius},o)

            let VT1 = c.link("heart_disease_fact", {x1: Gender.get("Gender", ['x']), y1: Gender.get("Gender", ['y']), x2: Family_Heart_Disease.get("Family_Heart_Disease", ['x']), y2: Family_Heart_Disease.get("Family_Heart_Disease", ['y']), stroke: "Status"})
            let VT2 = c.link("heart_disease_fact", {x1: Family_Heart_Disease.get("Family_Heart_Disease", ['x']), y1: Family_Heart_Disease.get("Family_Heart_Disease", ['y']), x2: Alcohol_Consumption.get("Alcohol_Consumption", ['x']), y2: Alcohol_Consumption.get("Alcohol_Consumption", ['y']), stroke: "Status"})
            let VT3 = c.link("heart_disease_fact", {x1: Alcohol_Consumption.get("Alcohol_Consumption", ['x']), y1: Alcohol_Consumption.get("Alcohol_Consumption", ['y']), x2: Exercise_Habits.get("Exercise_Habits", ['x']), y2: Exercise_Habits.get("Exercise_Habits", ['y']), stroke: "Status"})
            let VT4 = c.link("heart_disease_fact", {x1: Exercise_Habits.get("Exercise_Habits", ['x']), y1: Exercise_Habits.get("Exercise_Habits", ['y']), x2: Stress_Level.get("Stress_Level", ['x']), y2: Stress_Level.get("Stress_Level", ['y']),  stroke: "Status"})
            let VT5 = c.link("heart_disease_fact", {x1: Stress_Level.get("Stress_Level", ['x']), y1: Stress_Level.get("Stress_Level", ['y']), x2: Age.get("Age", ['x']), y2: Age.get("Age", ['y']),  stroke: "Status"})
            
        }

        if (0) { //nominal
          
          await db.loadFromConnection()


                      //loads all tables and constraints from duck db


          let c = new Canvas(db, {width: 2000, height: 1200}) //setting up canvas
          canvas = c
          window.c = c;
          window.db = db;


          await db.normalize("heart_disease_csv", ["BMI", "Cholesterol_Level", "Sleep_Hours", "Triglyceride_Level", "Fasting_Blood_Sugar", "Status", "Age"], "heart_disease")
          //starting table, attributes to pull out [], name of new table with choosen values, name of table with non choosen values.
          await db.normalizeMany("heart_disease", ["BMI", "Cholesterol_Level", "Sleep_Hours", "Triglyceride_Level", "Fasting_Blood_Sugar", "Status", "Age"].map((a) => [a]))


          const o = {x: {domain: [0,60]}}
          const radius = 1000000000000
          let BMI = c.dot("heart_disease_BMI", {y : "BMI", x: 10, fill: "Status", r: radius},o)
          let Cholesterol_Level = c.dot("heart_disease_Cholesterol_Level", {y : "Cholesterol_Level", x: 20, fill: "Status", r: radius},o)
          let Sleep_Hours = c.dot("heart_disease_Sleep_Hours", {y : "Sleep_Hours", x: 30, fill: "Status", r: radius},o)
          let Triglyceride_Level = c.dot("heart_disease_Triglyceride_Level", {y : "Triglyceride_Level", x: 40, fill: "Status", r: radius},o)
          let Fasting_Blood_Sugar = c.dot("heart_disease_Fasting_Blood_Sugar", {y : "Fasting_Blood_Sugar", x: 50, fill: "Status", r: radius},o)
          let Age = c.dot("heart_disease_Age", {y : "Age", x: 60, fill: "Status", r: radius},o)


          let VT1 = c.link("heart_disease_fact", {x1: BMI.get("BMI", ['x']), y1: BMI.get("BMI", ['y']), x2: Cholesterol_Level.get("Cholesterol_Level", ['x']), y2: Cholesterol_Level.get("Cholesterol_Level", ['y']), stroke: "Status"})
          let VT2 = c.link("heart_disease_fact", {x1: Cholesterol_Level.get("Cholesterol_Level", ['x']), y1: Cholesterol_Level.get("Cholesterol_Level", ['y']), x2: Sleep_Hours.get("Sleep_Hours", ['x']), y2: Sleep_Hours.get("Sleep_Hours", ['y']), stroke: "Status"})
          let VT3 = c.link("heart_disease_fact", {x1: Sleep_Hours.get("Sleep_Hours", ['x']), y1: Sleep_Hours.get("Sleep_Hours", ['y']), x2: Triglyceride_Level.get("Triglyceride_Level", ['x']), y2: Triglyceride_Level.get("Triglyceride_Level", ['y']), stroke: "Status"})
          let VT4 = c.link("heart_disease_fact", {x1: Triglyceride_Level.get("Triglyceride_Level", ['x']), y1: Triglyceride_Level.get("Triglyceride_Level", ['y']), x2: Fasting_Blood_Sugar.get("Fasting_Blood_Sugar", ['x']), y2: Fasting_Blood_Sugar.get("Fasting_Blood_Sugar", ['y']),  stroke: "Status"})
          let VT5 = c.link("heart_disease_fact", {x1: Fasting_Blood_Sugar.get("Fasting_Blood_Sugar", ['x']), y1: Fasting_Blood_Sugar.get("Fasting_Blood_Sugar", ['y']), x2: Age.get("Age", ['x']), y2: Age.get("Age", ['y']),  stroke: "Status"})
         
      }


        if (0) {
            let tables = {t1: "TimeProvince", t2: "Weather"}
            let selectCols = {TimeProvince: ["date", "province", "confirmed"], Weather: ["avg_temp"]}
            let joinKeys = {date: "date", province: "province"}

            await db.join(tables, selectCols, joinKeys, "info")

            await db.normalize("info", "province", "Provinces")
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 2000, height: 1200}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            let vrect = c.rect("Provinces", { ...sq("province")("x", "y"), fill: "none", stroke: "black"})
            let vdot = c.dot("info", {x: "date", y: "confirmed", fill: "avg_temp", r: 20})
            let vtext = c.text("Provinces", {x: vrect.get(mgg.id, "x"), y: vrect.get(mgg.id, "y"), text: "province"})
            c.nest(vdot, vrect) //(inner objext, outer object, foreign key)  
        }

        if (0) { /* fig a, scatter plot */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500}) //setting up canvas
            canvas = c
            window.c = c;
            window.db = db;

            let logscale = c.log("logscale1")

            let vrect = c.rect("TimeProvince2", {x: "province", y:0, fill: "white", stroke: "black"})
            let vdot = c.dot("Weather2", {x: vrect.get(["date","province"],"x"), y: "date", fill: "avgtemp"})
            //let vdot2 = c.dot("TimeProvince2", {x: "province", y: "date", r: logscale("confirmed")}) //define boundary
            //c.nest(vdot, vrect, ["date","province"]) //(inner objext, outer object, foreign key)
        }


        if (0) { /* fig a, scatter plot */
            await db.conn.exec(`CREATE TABLE T( _rav_id int primary key, a int, b int)`)
            await db.conn.exec(`INSERT INTO T VALUES (0,1,3), (1,2,10), (2, 5, 1), (3, 6, 12), (4, 19, 38), (5, 30, 47), (6, 22, 6), 
                                    (7, 40, 48), (8, 35, 42), (9, 16, 39), (10, 27, 56), (11, 13, 11), (12, 37, 77),
                                    (13, 53, 25), (14, 26, 74), (15, 89, 45), (16, 42, 81), (17, 55, 42), (18, 71, 66), (19, 62, 50)`)
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            const o = { x: {domain: [0,100]}, y: {domain: [0, 100]}};
            let v = c.dot("T", {x: 'a', y: 'b', fill: 'black'}, o);
        }

        if (0) { /* fig b, punchcard plot */

            await db.conn.exec(`CREATE TABLE A (aid int primary key, a int)`)
            await db.conn.exec(`CREATE TABLE B (bid int primary key, b int)`)
            await db.conn.exec(`CREATE TABLE T (_rav_id int primary key, aid int, bid int, FOREIGN KEY (aid) references A(aid), FOREIGN KEY (bid) references B(bid))`)

            await db.conn.exec(`INSERT INTO A VALUES (16, 900), (11, 650), (6, 400), (1, 150), (14, 800), (9, 550), (4, 300),  (17, 950), (12, 700), 
                                    (7, 450), (2, 200), (15, 850), (10, 600), (5, 350),  (0, 100), (18, 1000), (13, 750), (8, 500), (3, 250)`)

            await db.conn.exec(`INSERT INTO B VALUES (12, 800), (5, 450), (0, 100), (14, 900), (7, 550), (2, 200), (16, 1000),  (9, 650), (4, 300), (11, 750), 
                                    (13, 850), (6, 500), (1, 150), (15, 950),  (8, 600), (3, 250), (10, 700)`)

            await db.conn.exec(`INSERT INTO T VALUES (0, 2, 5), (1, 12, 3), (2, 1, 7), (3, 0, 8), (4, 8, 7), (5, 10, 4),  (6, 16, 1), (7, 12, 0), 
                                    (8, 9, 6), (9, 13, 7), (10, 3, 9), (11, 3, 13),  (12, 0, 8), (13, 14, 11), (14, 12, 9), (15, 0, 6), 
                                    (16, 8, 6), (17, 18, 4),  (18, 1, 12), (19, 15, 14), (20, 10, 0), (21, 17, 0), (22, 8, 13), 
                                    (23, 6, 2), (24, 16, 12), (25, 14, 0), (26, 0, 13), (27, 14, 10), (28, 2, 15), (29, 10, 11),
                                    (30, 7, 3), (31, 5, 9), (32, 2, 5), (33, 1, 12), (34, 18, 4), (35, 2, 7),  (36, 13, 13), (37, 6, 10), 
                                    (38, 11, 1), (39, 10, 5), (40, 6, 9), (41, 7, 16),  (42, 13, 3), (43, 11, 5), (44, 17, 10), (45, 7, 12), 
                                    (46, 11, 14), (47, 3, 15),  (48, 13, 3), (49, 4, 10)`)

            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            let sa = c.linear("sa")
            let sb = c.linear("sb")
            let VT = c.dot("T", { x: sa('aid'), y: sb('bid'), fill:'black'})
            let VA = c.text("A", {x: 0, y: sa('aid'), text: 'a'}, {textAnchor: "left"})
            let VB = c.text("B", {x: sb('bid'), y: 0, text: 'b'}, {textAnchor: "bottom"})
        }

        if (0) { /* fig c parallel coords */

            await db.conn.exec(`CREATE TABLE A (aid int primary key, a int)`)
            await db.conn.exec(`CREATE TABLE B (bid int primary key, b int)`)
            await db.conn.exec(`CREATE TABLE T (_rav_id int primary key, aid int, bid int, FOREIGN KEY (aid) references A(aid), FOREIGN KEY (bid) references B(bid))`)

            await db.conn.exec(`INSERT INTO A VALUES (16, 900), (11, 650), (6, 400), (1, 150), (14, 800), (9, 550), (4, 300),  (17, 950), (12, 700), 
                                    (7, 450), (2, 200), (15, 850), (10, 600), (5, 350),  (0, 100), (18, 1000), (13, 750), (8, 500), (3, 250)`)

            await db.conn.exec(`INSERT INTO B VALUES (12, 800), (5, 450), (0, 100), (14, 900), (7, 550), (2, 200), (16, 1000),  (9, 650), (4, 300), (11, 750), 
                                    (13, 850), (6, 500), (1, 150), (15, 950),  (8, 600), (3, 250), (10, 700)`)

            await db.conn.exec(`INSERT INTO T VALUES (0, 2, 5), (1, 12, 3), (2, 1, 7), (3, 0, 8), (4, 8, 7), (5, 10, 4),  (6, 16, 1), (7, 12, 0), 
                                    (8, 9, 6), (9, 13, 7), (10, 3, 9), (11, 3, 13),  (12, 0, 8), (13, 14, 11), (14, 12, 9), (15, 0, 6), 
                                    (16, 8, 6), (17, 18, 4),  (18, 1, 12), (19, 15, 14), (20, 10, 0), (21, 17, 0), (22, 8, 13), 
                                    (23, 6, 2), (24, 16, 12), (25, 14, 0), (26, 0, 13), (27, 14, 10), (28, 2, 15), (29, 10, 11),
                                    (30, 7, 3), (31, 5, 9), (32, 2, 5), (33, 1, 12), (34, 18, 4), (35, 2, 7),  (36, 13, 13), (37, 6, 10), 
                                    (38, 11, 1), (39, 10, 5), (40, 6, 9), (41, 7, 16),  (42, 13, 3), (43, 11, 5), (44, 17, 10), (45, 7, 12), 
                                    (46, 11, 14), (47, 3, 15),  (48, 13, 3), (49, 4, 10)`)
            
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            const o = { x: {domain: [0,15]}}
            let VA = c.dot("A", {x: 0, y: "a"}, o)
            let VB = c.dot("B", {x: 10, y: "b"}, o)
            let VT = c.link("T", {x1: VA.get("aid", ['x']), y1: VA.get("aid", ['y']), x2: VB.get("bid", ['x']), y2: VB.get("bid", ['y'])})
        }

        if (0) { /* fig d, nesting */

            await db.conn.exec(`CREATE TABLE B(bid int primary key, b int)`)
            await db.conn.exec(`CREATE TABLE A( _rav_id int primary key, a int, bid int, FOREIGN KEY(bid) references B(bid))`)

            await db.conn.exec(`INSERT INTO B VALUES (0, 0), (1, 3), (2, 2), (3, 1), (4, 4), (5, 5)`)
            
            await db.conn.exec(`INSERT INTO A VALUES (0, 68, 0), (1, 27, 1), (2, 61, 2), (3, 49, 0), (4, 37, 3), (5, 6, 0), (6, 38, 4), (7, 6, 2), 
                                (8, 53, 4), (9, 77, 2), (10, 95, 3), (11, 93, 4), (12, 7, 5), (13, 7, 3), (14, 22, 0), (15, 1, 3),
                                (16, 29, 5), (17, 84, 3), (18, 51, 5), (19, 41, 5), (20, 0, 5), (21, 62, 0), (22, 4, 1), (23, 56, 1),
                                (24, 46, 1), (25, 69, 0), (26, 67, 0), (27, 98, 2), (28, 2, 4), (29, 69, 4), (30, 50, 2), (31, 11, 4),
                                (32, 33, 1), (33, 72, 0), (34, 21, 3), (35, 87, 0), (36, 67, 3), (37, 55, 3), (38, 0, 3), (39, 54, 4),
                                (40, 12, 4), (41, 60, 0), (42, 31, 0), (43, 28, 3), (44, 45, 0), (45, 17, 3), (46, 42, 2), (47, 22, 4),
                                (48, 32, 1), (49, 7, 0)`)

            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            const o = { x: {domain: [0,3]}};
            let VB = c.rect("B", { x: 'b', y: 0, w: 10, h: 20, fill:'white', stroke:'black'})
            let VA = c.dot("A", { x: 0, y: 'a', fill:'black'}, o)
            c.nest(VA, VB, "bid")
        }

        if (0) { /* fig e, categorical scatterplot */
            await db.conn.exec(`CREATE TABLE B(bid int primary key, b int)`)
            await db.conn.exec(`CREATE TABLE A( _rav_id int primary key, a int, bid int, FOREIGN KEY(bid) references B(bid))`)

            await db.conn.exec(`INSERT INTO B VALUES (0, 0), (1, 3), (2, 2), (3, 1), (4, 4), (5, 5)`)
            
            await db.conn.exec(`INSERT INTO A VALUES (0, 68, 0), (1, 27, 1), (2, 61, 2), (3, 49, 0), (4, 37, 3), (5, 6, 0), (6, 38, 4), (7, 6, 2), 
                                (8, 53, 4), (9, 77, 2), (10, 95, 3), (11, 93, 4), (12, 7, 5), (13, 7, 3), (14, 22, 0), (15, 1, 3),
                                (16, 29, 5), (17, 84, 3), (18, 51, 5), (19, 41, 5), (20, 0, 5), (21, 62, 0), (22, 4, 1), (23, 56, 1),
                                (24, 46, 1), (25, 69, 0), (26, 67, 0), (27, 98, 2), (28, 2, 4), (29, 69, 4), (30, 50, 2), (31, 11, 4),
                                (32, 33, 1), (33, 72, 0), (34, 21, 3), (35, 87, 0), (36, 67, 3), (37, 55, 3), (38, 0, 3), (39, 54, 4),
                                (40, 12, 4), (41, 60, 0), (42, 31, 0), (43, 28, 3), (44, 45, 0), (45, 17, 3), (46, 42, 2), (47, 22, 4),
                                (48, 32, 1), (49, 7, 0)`)

            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;
            let VB = c.text("B", {x: "bid", text: "b"}, {textAnchor:"bottom"}, { x: {domain: [0,10]} })
            let VA = c.dot("A", {x: VB.get("bid",["x"]), y: "a", fill:"black"}, { x: {domain: [0,10]} })
        }

        if (0) { /* fig f, table */
            await db.conn.exec(`CREATE TABLE A (aid int primary key, a int)`)
            await db.conn.exec(`CREATE TABLE B (bid int primary key, b int, FOREIGN KEY (bid) references A(aid))`)
            await db.conn.exec(`INSERT INTO A VALUES (0, 1), (1, 2), (2, 5), (3, 6), (4, 19), (5, 30), (6, 22), (7, 40), (8, 35),
                                    (9, 16), (10, 27), (11, 13), (12, 37), (13, 53), (14, 26), (15, 89), (16, 42),
                                    (17, 55), (18, 71), (19, 62)`)
            await db.conn.exec(`INSERT INTO B VALUES (0, 3), (1, 10), (2, 1), (3, 12), (4, 38), (5, 47), (6, 6), (7, 48), (8, 42),
                                    (9, 39), (10, 56), (11, 11), (12, 77), (13, 25), (14, 74), (15, 45), (16, 81),
                                    (17, 42), (18, 66), (19, 50)`)

            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;
            const o = { x: {domain: [0,10]}};
            function adjustPos(x) {
                return x + 20
            }
            let VA = c.text("A", {x: 3, y: 'aid', text: "a"}, o);
            let VB = c.text("B", {x: VA.get("bid", ['x'], adjustPos), y: 'bid', text: "b"}, o)
        }

        if (0) { /* layout example */
            await db.conn.exec(`CREATE TABLE test (a int primary key, b int, c int, d int,_rav_id int unique )`)
            await db.conn.exec(`CREATE TABLE t1 (_rav_id int primary key,a int references test(a), f int)`)

            await db.conn.exec(`INSERT INTO test VALUES (1,2,3,100,0), (4,5,6,111,1), (7, 8, 9,132,2), (10, 51, 12,145,3)`)
            await db.conn.exec(`INSERT INTO t1 VALUES (0, 1, 1), (1, 1, 2), (2, 1, 5), 
                                    (3, 4, 2), (4, 4,6), (5, 1, 1), 
                                    (6, 1, 5), (7, 7, 6), (8, 7,2), 
                                    (9, 1, 2), (10, 10, 1), (11, 10, 2), (12, 1,1)`)
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            let rect1 = c.rectX("test", { ...sq("b")('y1', 'y2'), x:'b', stroke:"b", fill:"none" })
            let rect2 = c.rect("t1", { ...sq('f')(), stroke: "grey", fill: 'none' }, {axis:null})
            let text2 = c.text("t1", { ...sq('f')('x', 'y'), dx:10, text: 'f', fill:'black' }, {axis:null})
                            
            let dot1 = c.dot("t1", { x: 'f', ...propY('f')(), fill:'red' })
                                    
            c.nest(rect2, rect1, "a")
            c.nest(text2, rect1, "a")
            c.nest(dot1, rect1, "a")
        }


        if (0) { /* taxonomy hier */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            let tables = await c.hier("species", ["morder", "family", "genus", "specificEpithet"])
            let vorder = c.dot("morder", {x: "morder", y: 50}, {y: {range: [0, 100]}})
            let vfamily = c.dot("family", {x: "family", y: 150}, {y: {range: [100, 200]}})
            let vgenus = c.dot("genus", {x: "genus", y: 250}, {y: {range: [200, 300]}})
            let vlink1 = c.link("family", {x1: vorder.get("morder", ["x"]), y1: vorder.get("morder", ["y"]), x2: vfamily.get(["morder", "family"], ["x"]), y2: vfamily.get(["morder", "family"], ["y"]) })
            let vlink2 = c.link("genus", {x1: vfamily.get(["morder", "family"], ["x"]), y1: vfamily.get(["morder", "family"], ["y"]), x2: vgenus.get(["morder", "family", "genus"], ["x"]), y2: vgenus.get(["morder", "family", "genus"], ["y"]) })
        }

        if (0) { /* hr_layout example  */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalize("hrdata", ['DeptID'], "departments")
            let rect1 = c.rect("departments", { ...eqX()(), stroke:"grey", fill:"none" })
            let bar1 = c.bar("hrdata", { x: 'Salary', y: 'EmpSatisfaction', fill:'red' })
            c.nest(bar1, rect1)
        }

        if (0) { /* penguins parallel coordinates */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalizeMany("penguins", ['beaklen', 'beakdepth', 'flipperlen', 'mass', 'sex'].map((a)=>[a]))
            const o = { x: {domain: [0,50]}}
            let sex = c.dot("penguins_sex", { x: 10, y: "sex"}, o)
            let beakdepth = c.dot("penguins_beakdepth", { x: 20, y: "beakdepth"}, o)
            let beaklen = c.dot("penguins_beaklen", { x: 30, y: "beaklen"}, o)
            let mass = c.dot("penguins_mass", { x: 40, y: "mass"}, o)

            let vlink1 = c.link("penguins_fact", {x1: sex.get("sex", ['x']), y1: sex.get("sex", ['y']), x2: beakdepth.get("beakdepth", ['x']), y2: beakdepth.get("beakdepth", ['y'])})
            let vlink2 = c.link("penguins_fact", {x1: beakdepth.get("beakdepth", ['x']), y1: beakdepth.get("beakdepth", ['y']),  x2: beaklen.get("beaklen", ['x']), y2: beaklen.get("beaklen", ['y'])})
            let vlink3 = c.link("penguins_fact", {x1: beaklen.get("beaklen", ['x']), y1: beaklen.get("beaklen", ['y']), x2: mass.get("mass", ['x']), y2: mass.get("mass", ['y'])})
                                    
        }

        if (0) { /* housing scatter plot */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            let vdot = c.dot("housing", {x: 'Lattitude', y: 'Longtitude', r: 'Landsize', fill: "Price"})
        }

        if (0) { /* housing punchcard */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalizeMany("housing",['Rooms','Bathroom'].map((a) => [a]))
            let sa = c.linear("room_scale")
            let sb = c.linear("bathroom_scale")
            let VT = c.dot("housing_fact", { x: sb("Bathroom"), y: sa("Rooms")})

            let VA = c.text("housing_Rooms", {x: 0, y: sa("Rooms"), text: "Rooms"}, {textAnchor: "left"})
            let VB = c.text("housing_Bathroom", {x: sb("Bathroom"), y: 0, text: "Bathroom"}, {textAnchor: "bottom"})
        }

        if (0) { /* housing nesting */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalize("housing", ['Rooms', 'Price', 'Landsize'], "housing_rooms_price_landsize")
            await db.normalize("housing_rooms_price_landsize", ['Rooms'], "housing_rooms", "housing_price_landsize")

            let VB = c.rect("housing_rooms", { x: 'Rooms', y: 0, w: 10, h: 20, fill:'white', stroke:'black'})
            let VA = c.dot("housing_price_landsize", { x: 'Landsize', y: 'Price', fill:'Price'})
            c.nest(VA, VB)
        }

        if (0) { /* housing table WORK IN PROGRESS !!!!!!!!! DO NOT RENDER THIS*/
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalize("housing", ['Price', 'Rooms'], "housing_price_rooms", "tmp0")
            await db.normalize("housing_price_rooms",['Price'], "price", "tmp1");
            await db.normalize("housing_price_rooms",['Rooms'], "rooms", "tmp2");
            const o = { x: {domain: [0,10]}};
            let vprice = c.text("price", { y: mgg.id, text:'Price', x: 3}, o);
            let vrooms = c.text("rooms", { y: mgg.id, text:'Rooms', x: 5}, o);
        }

        if (0) { /* housing treemap */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalize("small_housing", ['Rooms', 'YearBuilt', 'Price'], "housing_room_year_price")
            await db.normalize("housing_room_year_price", ['Rooms'], "housing_room", "housing_year_price")

            let rect1 = c.rectX("housing_room", { ...sq("Rooms")(), stroke: "Rooms", fill:"none" })
            let rect2 = c.rectX("housing_room_year_price", { ...sq("YearBuilt")(), "stroke-width":"1px", stroke: "black", fill:"Price" })
            c.nest(rect2, rect1)
        }

        if (0) { /* airport nodelink */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            let VA = c.dot("airports", {x: "latitude", y: "longitude"})
            let VT = c.link("routes", {x1: VA.get("ORIGIN", ['x']), y1: VA.get("ORIGIN", ['y']), x2: VA.get("DEST", ['x']), y2: VA.get("DEST", ['y'])})
            let vtext_origin = c.text("airports", {x: VA.get("airport", "x"), y: VA.get("airport", "y"), text: "airport", fill: "red"})
        }

        if (0) { // nesting experiment
            await db.conn.exec(`CREATE TABLE outerrects (a int primary key)`)
            await db.conn.exec(`CREATE TABLE innerrects (aid int, bid int, PRIMARY KEY (aid, bid), FOREIGN KEY (aid) REFERENCES outerrects (a))`)
            await db.conn.exec(`CREATE TABLE dots (aid int, bid int, c int, PRIMARY KEY (aid, bid, c), FOREIGN KEY (aid, bid) REFERENCES innerrects (aid, bid))`)

            await db.conn.exec(`INSERT INTO outerrects VALUES (0), (1)`)
            await db.conn.exec(`INSERT INTO innerrects VALUES (0, 0), (0, 1), (1, 0), (1, 1)`)
            await db.conn.exec(`INSERT INTO dots VALUES (0, 0, 0), (0, 1, 1), (1, 0, 0), (1, 1, 1)`)

            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            let vouter = c.rect("outerrects", { x: 'a', fill:'white', stroke:'black'})
            /**
             * The statement below causes bug in scaling!
             */
            //let vinner = c.rect("innerrects", { x: vouter.get(["aid"], "x"),y: 'bid', fill:'white', stroke:'black'})
            let vinner = c.rect("innerrects", {y: 'bid', fill:'white', stroke:'black'})

            let vdots = c.dot("dots", { x: 0, y: 'c', fill:'red'})
            c.nest(vinner, vouter, ["aid"])
            c.nest(vdots, vinner, ["aid", "bid"])


        }

        if (0) {
            await db.conn.exec(`CREATE TABLE tables (tid int primary key, table_name string)`)
            await db.conn.exec(`INSERT INTO tables VALUES (0, 'Customers'), (1, 'Orders'), (2, 'Products'), (3, 'Payments'), (4, 'CanPlace'), (5, 'Contains'), (6, 'LinkedTo')`)

            await db.conn.exec(`CREATE TABLE columns (tid int, colname string, is_key int, type string, ordinal_position int, PRIMARY KEY (tid, colname), FOREIGN KEY (tid) REFERENCES tables (tid))`)
            await db.conn.exec(`INSERT INTO columns VALUES
                    (0, 'customerID', 1, 'int', 0),
                    (0, 'name', 0, 'string', 1),
                    (0, 'email', 0, 'string', 2),
                    (0, 'country', 0, 'string', 3),

                    (1, 'orderID', 1, 'int', 0), 
                    (1, 'orderDate', 0, 'date', 1),
                    (1, 'amount', 0, 'int', 2),

                    (2, 'productID', 1, 'int', 0), 
                    (2, 'name', 0, 'string', 1),
                    (2, 'price', 0, 'string', 2),
                    (2, 'category', 0, 'int', 3),

                    (3, 'paymentID', 1, 'int', 0), 
                    (3, 'paymentDate', 0, 'date', 1),
                    (3, 'paymentMethod', 0, 'string', 2),

                    (4, 'customerID', 1, 'int', 0), 
                    (4, 'orderID', 1, 'int', 1),

                    (5, 'orderID', 1, 'int', 0), 
                    (5, 'productID', 1, 'int', 1),

                    (6, 'orderID', 1, 'int', 0), 
                    (6, 'paymentID', 1, 'int', 1),
                    
            `)
            await db.conn.exec(`CREATE TABLE fkeys (tid1 int, col1 string, tid2 int, col2 string, FOREIGN KEY(tid1, col1) references columns(tid, colname), FOREIGN KEY(tid2, col2) references columns(tid, colname))`)
            await db.conn.exec(`INSERT INTO fkeys VALUES
                    (4, 'customerID', 0, 'customerID'),
                    (4, 'orderID', 1, 'orderID'),
                    (5, 'orderID', 1, 'orderID'),
                    (5, 'productID', 2, 'productID'),
                    (6, 'orderID', 1, 'orderID'),
                    (6, 'paymentID', 3, 'paymentID'),
                    `
                )

            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 800})
            canvas = c
            window.c = c;
            window.db = db;

            let vtables = c.rect("tables", { x: 'tid', y: 0, fill:'white', stroke:'black'})
            let vlabels = c.text("tables", {x: vtables.get(["tid"], "x"), y: vtables.get(["tid"], "y"), text: "table_name"})
            let vattributes= c.text("columns", {
                                            y: 'ordinal_position',
                                            text: {cols: ["colname", "type"], func: (d) => `${d.colname} ${d.type}`},
                                            'text-decoration': {cols: ["is_key"], func: (d) => d.is_key ? 'underline': 'none'},
                                            x: 0
                            })

            c.nest(vattributes, vtables, "tid")

            let vfkeys = c.link("fkeys", {
                                    x1: vattributes.get(["tid1", "col1"], ['x']), 
                                    y1: vattributes.get(["tid1", "col1"], ['y']), 
                                    x2: vattributes.get(["tid2", "col2"], ['x']), 
                                    y2: vattributes.get(["tid2", "col2"], ['y'])})
            await c.erDiagram(vtables, vlabels, vattributes, vfkeys)
        }

        if (0) {
            await db.conn.exec(`CREATE TABLE T (id int primary key, a int, b int)`)
            await db.conn.exec(`CREATE TABLE S (id int primary key, c int, d int, FOREIGN KEY (c) REFERENCES T(id))`)

            await db.conn.exec(`INSERT INTO T (id, a, b) VALUES 
                    (1, 10, 100),
                    (2, 20, 200),
                    (3, 30, 300),
                    (4, 40, 400),
                    (5, 50, 500);
                    `)
            await db.conn.exec(`INSERT INTO S (id, c, d) VALUES 
                    (1, 1, 1000),
                    (2, 2, 2000),
                    (3, 2, 3000),
                    (4, 4, 4000),
                    (5, 5, 5000);`)

            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 800})
            canvas = c
            window.c = c;
            window.db = db;

            let dots = c.dot("S", {x: "d", y: c.db.table("T").get(null, "a")})
        }
        (await canvas.render({ document, svg, graphSvg, IsERDiagram: false }));
        if (erDiagramCanvas)
            await erDiagramCanvas.render({document, erDiagramSvg, erDiagramGraphSvg, IsErDiagram: true})

        /*
        c1: T -1-n- S
        all calls to auto in enc() are resolved to a common function
        M = db.t("T").enc("box", {
            x: auto(),  // passed bounding box and statistics as input?
            y: 'y',
            w: auto(),
            h: auto()
        })
        db.C("c1").enc("containment", M)
        db.t("S").enc("point", {
        })
        */
    });
</script>

<svelte:head>
    <title>Demo</title>
    <meta name="description" content="Demo" />
</svelte:head>

<svelte:window bind:innerWidth />


{#await db_up}
loading...
{:then initTime}

<TopNav/>

    <div class="row">
        <div class="col">
            <TableInspector bind:this={inspector}/>
            <Debug bind:this={debug}/>

                   <!-- <Container> </Container> -->
        </div>
        <div class="col">
            <div bind:this={rootelement}>
                <svg bind:this={svg}/>
            </div>
        </div>
        <div class="col">
            <div bind:this={rootelement}>
                <svg bind:this={graphSvg}/>
            </div>
        </div>
        <div class="col">
            <div bind:this={rootelement}>
                <svg bind:this={erDiagramSvg}/>
            </div>
        </div>
        <div class="col">
            <div bind:this={rootelement}>
                <svg bind:this={erDiagramGraphSvg}/>
            </div>
        </div>
    </div>
{/await}


<style>
@import 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css';
</style>