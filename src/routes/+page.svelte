<script lang="ts">
    import { watchResize } from "svelte-watch-resize";
	import { tick, onMount, afterUpdate, getContext, setContext } from "svelte";
	import { Database } from "../viz/db";
    import { DuckDB } from "../viz/duckdb";
    import { Canvas }  from "../viz/canvas";
    import { markof, RLX, RLY, propX, propY, eqX, eqY, sq } from "../viz/ref"

    import Debug from "../components/Debug.svelte";
    import TableInspector from "../components/TableInspector.svelte";
    import TopNav from "../components/TopNav.svelte";
    import { mgg } from "../viz/uapi/mgg";


    let innerWidth = 10000;
    let debug = null;
    let db_up = null;
    let rootelement = null;
    let svg = null;
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
                name: "hrdata",
                url: "/HRDataset_v14.csv"
            }]
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

        /*
        //fig a
        await duckdb.exec(`CREATE TABLE T (
            _rav_id int primary key,
            a int,
            b int,
        )`)

        await duckdb.exec(`INSERT INTO T values
            (0,1,3), (1,2,10), (2, 5, 1), (3, 6, 12)
        `)
        */

        
        //fig b punchcard EASY
        await duckdb.exec(
            `create TABLE A (aid int primary key, a int)`
        )
        await duckdb.exec(
            `CREATE TABLE B (bid int primary key, b int)`
        )
        await duckdb.exec(
            `CREATE TABLE T (_rav_id int primary key, aid int, bid int, FOREIGN KEY (aid) references A(aid), FOREIGN KEY (bid) references B(bid))`
        )

        await duckdb.exec(`INSERT INTO A values
            (0, 100), (1, 200), (2, 300), (4, 150)
        `)

        await duckdb.exec(`INSERT INTO B values
            (0, 100), (1, 200), (2, 300)
        `)
        await duckdb.exec(`INSERT INTO T values
            (0, 0, 0), (1, 0, 1), (2, 1, 2), (3, 1, 0), (4, 2, 0), (5, 4, 2)
        `)
        
        



        
        /*
        //fig b punchcard HARD
        await duckdb.exec(
            `create TABLE A (aid int primary key, a int)`
        )
        await duckdb.exec(
            `CREATE TABLE B (bid int primary key, b int)`
        )
        await duckdb.exec(
            `CREATE TABLE T (_rav_id int primary key, aid int, bid int, FOREIGN KEY (aid) references A(aid), FOREIGN KEY (bid) references B(bid))`
        )

        await duckdb.exec(`INSERT INTO A values
            (16, 900), (11, 650), (6, 400), (1, 150), (14, 800), (9, 550), (4, 300),  (17, 950), (12, 700), 
            (7, 450), (2, 200), (15, 850), (10, 600), (5, 350),  (0, 100), (18, 1000), (13, 750), (8, 500), (3, 250)
        `)

        await duckdb.exec(`INSERT INTO B values
            (12, 800), (5, 450), (0, 100), (14, 900), (7, 550), (2, 200), (16, 1000),  (9, 650), (4, 300), (11, 750), 
            (13, 850), (6, 500), (1, 150), (15, 950),  (8, 600), (3, 250), (10, 700)`
        )

        await duckdb.exec(`INSERT INTO T values
            (0, 2, 5), (1, 12, 3), (2, 1, 7), (3, 0, 8), (4, 8, 7), (5, 10, 4),  (6, 16, 1), (7, 12, 0), 
            (8, 9, 6), (9, 13, 7), (10, 3, 9), (11, 3, 13),  (12, 0, 8), (13, 14, 11), (14, 12, 9), (15, 0, 6), 
            (16, 8, 6), (17, 18, 4),  (18, 1, 12), (19, 15, 14), (20, 10, 0), (21, 17, 0), (22, 8, 13), 
            (23, 6, 2), (24, 16, 12), (25, 14, 0), (26, 0, 13), (27, 14, 10), (28, 2, 15), (29, 10, 11),
            (30, 7, 3), (31, 5, 9), (32, 2, 5), (33, 1, 12), (34, 18, 4), (35, 2, 7),  (36, 13, 13), (37, 6, 10), 
            (38, 11, 1), (39, 10, 5), (40, 6, 9), (41, 7, 16),  (42, 13, 3), (43, 11, 5), (44, 17, 10), (45, 7, 12), 
            (46, 11, 14), (47, 3, 15), (48, 13, 3), (49, 4, 10)`
        )
        */
        

        /*
        //fig c
        await duckdb.exec(`CREATE TABLE A (
            aid int primary key,
            a int
        )`)

        await duckdb.exec(`INSERT INTO A values
            (1,100), (2,200), (3, 300)
        `)

        await duckdb.exec(`CREATE TABLE B (
            bid int primary key,
            b int
        )`)

        await duckdb.exec(`INSERT INTO B values
            (1,100), (2,200), (3, 300)
        `)

        await duckdb.exec(`CREATE TABLE T (
            _rav_id int primary key,
            aid int,
            bid int,
            FOREIGN KEY (aid) references A(aid),
            FOREIGN KEY (bid) references B(bid),
        )`)

        await duckdb.exec(`INSERT INTO T values
            (0,1,2), (1,1,3), (2, 3, 1), (3, 3, 2)
        `)
        */

        /*
        //fig d
        await duckdb.exec(`CREATE TABLE A (
            _rav_id int primary key,
            a int,
            bid int
        )`)

        await duckdb.exec(`INSERT INTO A values
            (0, 400, 0), 
            (1, 100, 1), 
            (2, 300, 1), 
            (3, 100, 2), 
            (4, 300, 2), 
            (5, 400, 2)
        `)

        await duckdb.exec(`CREATE TABLE B (
            bid int primary key,
            b int,
        )`)

        await duckdb.exec(`INSERT INTO B values
            (0, 100), 
            (1, 200), 
            (2, 400)
        `)
        */
        

        /*
        //fig e
        await duckdb.exec(`CREATE TABLE T (
            _rav_id int primary key,
            a int,
            b int
        )`)

        await duckdb.exec(`INSERT INTO T values
            (0, 400, 100), 
            (1, 100, 200), 
            (2, 300, 200), 
            (3, 100, 400), 
            (4, 300, 400), 
            (5, 400, 400)
        `)
        */

        /*
        //fig f table
        await duckdb.exec(`CREATE TABLE A (
            _rav_id int primary key,
            a int,
        )`)

        await duckdb.exec(`CREATE TABLE B (
            _rav_id int primary key,
            b int,
        )`)


        await duckdb.exec(`INSERT INTO A values
            (0, 100), 
            (1, 200), 
            (2, 300)
        `)

        await duckdb.exec(`INSERT INTO B values
            (0, 200), 
            (1, 400), 
            (2, 600)
        `)
        */

        /*
        //layout experiment
        await duckdb.exec(`CREATE TABLE test (
            a int primary key, b int, c int, d int,
            _rav_id int unique )`)
        await duckdb.exec(`insert into test values
            (1,2,3,100,0), (4,5,6,111,1), (7, 8, 9,132,2), 
            (10, 51, 12,145,3) `)
        await duckdb.exec(`CREATE TABLE t1 (
            _rav_id int primary key,
            a int references test(a), 
            f int)`)
        await duckdb.exec(`INSERT INTO t1 VALUES
            (0, 1, 1), (1, 1, 2), (2, 1, 5),
            (3, 4, 2), (4, 4,6), (5, 1, 1), (6, 1, 5),
            (7, 7, 6), (8, 7,2), (9, 1, 2),
            (10, 10, 1), (11, 10, 2), (12, 1,1)
        `)
        */

        
        //ER diagram experiment
        await duckdb.exec(`CREATE TABLE tables (tid int primary key, table_name string)`)
        await duckdb.exec(`INSERT INTO tables VALUES (0, 'Courses'), (1, 'Terms'), (2, 'Offered')`)

        await duckdb.exec(`CREATE TABLE columns (tid int, colname string, is_key int, type string, ordinal_position int, PRIMARY KEY (tid, colname))`)
        await duckdb.exec(`INSERT INTO columns VALUES
                (0, 'coursenum', 1, 'int', 0), (0, 'coursename', 0, 'string', 1), (0, 'deptname', 0, 'string', 2),
                (1, 'semester', 1, 'string', 0), (1, 'year', 1, 'int', 1),
                (2, 'coursenum', 1, 'int', 0), (2, 'coursename', 1, 'string', 1), (2, 'deptname', 1, 'string', 2), (2, 'semester', 1, 'string', 3), (2, 'year', 1, 'int', 4)
                
        `)
        await duckdb.exec(`CREATE TABLE fkeys (tid1 int, col1 string, tid2 int, col2 string, FOREIGN KEY(tid1, col1) references columns(tid, colname), FOREIGN KEY(tid2, col2) references columns(tid, colname))`)
        await duckdb.exec(`INSERT INTO fkeys VALUES
                (2, 'coursenum', 0, 'coursenum')`)
        
        
        })(duckdb);


        await db_up;

        inspector.conn = duckdb;

        let db = new Database(duckdb);
        await db.init();
        await db.loadFromConnection();

        let c = new Canvas(db, {width: 800, height: 500})
        window.c = c;
        window.db = db;

        if (0) { //fig a, normal scatter plot WORKS
            const o = { x: {domain: [0,10]}, y: {domain: [0, 15]}}
            let v = c.dot("T", {x: 'a', y: 'b', fill: 'black'}, o)
        }

        if (0) { //fig b, punchcard plot KINDA WORKS?
            let sa = c.linear("sa", "T", "aid") //scale name, table name, col name. table and col can be dropped
            let sb = c.linear("sb", "T", "bid")


            let VT = c.dot("T", { x: sa('aid'), y: sb('bid'), fill:'black'})

            let VA = c.text("A", {text: 'a', textAnchor: "start"}, {lineAnchor: "bottom"})
            let VB = c.text("B", {text: 'b', textAnchor: "start"}, {lineAnchor: "bottom"})
        }

        if (0) { //fig c, parallel coord WORKS
            const o = { x: {domain: [0,15]}}
            let VA = c.dot("A", {x: 0, y: "a"}, o)
            let VB = c.dot("B", {x: 10, y: "b"}, o)
            let VT = c.link("T", {x1: VA.get("aid", ['x']), y1: VA.get("aid", ['y']), x2: VB.get("bid", ['x']), y2: VB.get("bid", ['y'])}, {axis:null})
            //let VT = c.link("T", {start: VA.get("aid", ['x','y']), end: VB.get("bid", ['x', 'y'])}, {axis:null})
        }

        if (0) { //fig d, nest WORKS
            const o = { x: {domain: [0,3]}}

            let VB = c.rect("B", { x: 'b', y: 0, w: 10, h: 20, fill:'white', stroke:'black'})
            let VA = c.dot("A", { x: 0, y: 'a', fill:'black'}, o)
            c.nest(VA, VB, "bid")
            //c.nest({ t1: "A", t2: "B", on:"bid"})
        }

        if (0) { //fig e, categorical scatterplot WORKS
            await db.normalizeMany("T",['b'].map((a) => [a]))
            const o = { x: {domain: [0,3]}}
            let VA = c.dot("T_fact", {x: "b", y: "a", fill:"black"}, o)
            let VB = c.text("T_b", {x: VA.get("b", ['x']), y: -10}, {axis:null}) //label not implemented
        }

        if (0) { //fig f, table

            let yscale = c.linear("yscale")

            const o = { x: {domain: [0,10]}}

            function adjustPos(x, width) {
                return x + width
            }

            let VA = c.text("A", { y:yscale(mgg.id), text:'a', width:"5em", x: 3}, o)
            //let VB = c.text("B", { y:yscale(mgg.id), text:'b', x: VA.get(mgg.id, ["x", "width"], adjustPos)}, o)
            let VB = c.text("B", { y:yscale(mgg.id), text:'b', x: 5}, o)
        }


        // nested
        if (0) {
            let rect1 = c.rectX("test", { ...sq("b")('y1', 'y2'), x:'b', stroke:"b", fill:"none" })
            let rect2 = c.rect("t1", { ...sq('f')(), stroke: "grey", fill: 'none' }, {axis:null})
            let text1 = c.text("t1", { ...sq('f')('x', 'y'), dx:10, text: 'f', fill:'white' }, {axis:null})
            console.log("before dot")
            let dot1 = c.dot("t1", { x: 'f', ...propY('f')(), fill:'red' }, {axis:null })
            //c.nest({ t1: "test", t2: "t1", on:"a" })
            c.nest(rect2, rect1, "a")
        }

        //demo Housing Scatter
        if (0) {            
            let v = c.dot("housing", {x: 'Landsize', y: 'Price', fill: 'Rooms'})
        }

        //demo Housing Nested
        if (0) {
            await db.normalize("housing", ['Rooms', 'Price', 'Landsize'], "nest_housing_rooms_price_landsize", "tmp_nest")
            await db.normalize("nest_housing_rooms_price_landsize", ['Rooms'], "nest_housing_rooms", "nest_housing_price_landsize")

            let VB = c.rect("nest_housing_rooms", { x: 'Rooms', y: 0, w: 10, h: 20, fill:'white', stroke:'black'})
            let VA = c.dot("nest_housing_price_landsize", { x: 'Landsize', y: 'Price', fill:'Price'})
            c.nest(VA, VB, "Rooms")
        }

        //demo Housing Parallel Coord
        if (0) {
            await db.normalize("housing", ['Rooms', 'Car'], "pc_housing_rooms_car", "pc_tmp_housing")
            await db.normalize("pc_housing_rooms_car", ['Rooms'], "pc_housing_rooms", "pc_tmp2_housing")
            await db.normalize("pc_housing_rooms_car", ['Car'], "pc_housing_car", "pc_tmp3_housing")
            const o = { x: {domain: [0,45]}, axis: null}
            let VA = c.dot("pc_housing_rooms", {x: 10, y: "Rooms"}, o)
            let VB = c.dot("pc_housing_car", {x: 30, y: "Car"}, o)
            let VT = c.link("pc_housing_rooms_car", {start: VA.get("Rooms", ['x','y']), end: VB.get("Car", ['x', 'y'])})
        }

        //demo Housing TreeMap
        if (0) {
            await db.normalize("small_housing", ['Rooms', 'YearBuilt', 'Price'], "housing_room_year_price")
            await db.normalize("housing_room_year_price", ['Rooms'], "housing_room", "housing_year_price")
            
            let rect1 = c.rect("housing_room", { ...sq("Rooms")(), x:'Rooms', stroke: "Rooms", fill:"none" })
            let rect2 = c.rect("housing_room_year_price", { ...sq("YearBuilt")(), "stroke-width":"1px", stroke: "black", fill: "Price"})
            c.nest(rect2, rect1, "Rooms")
        }

        if (0) { //housing table
            let scale = c.linear("rooms_scale", "housing", "Rooms")
            console.log("fn", fn)

            // console.log("a", res.domain)
            // console.log("b", res.range)
            

            const o = { x: {domain: [0,10]}}
            await db.normalize("housing", ['Rooms', 'Bathroom'], "room_bathroom")
            let VA = c.text("room_bathroom", { y:scale(mgg.id), text:'Rooms', x: 3}, o)
            let VB = c.text("room_bathroom", { y:scale(mgg.id), text:'Bathroom', x: 5}, o)
        }

        if (0) { //housing punchcard
            await db.normalizeMany("housing",['Rooms','Bathroom'].map((a) => [a]))

            let sa = c.linear("housing_fact", "Rooms", "room_scale")
            let sb = c.linear("housing_fact", "Bathroom", "bathroom_scale")
            let VT = c.dot("housing_fact", { x: sb("Bathroom"), y: sa("Rooms")}, {axis: null})

            let VA = c.text("housing_Rooms", {x: 0, y: sa("Rooms"), text: "Rooms"}, {axis: null})
            let VB = c.text("housing_Bathroom", {x: sb("Bathroom"), y: 0, text: "Bathroom"}, {axis: null})
        }

        if (1) { //node link WORKS
            let VA = c.dot("airports", {x: "latitude", y: "longitude"})
            let VT = c.link("routes", {x1: VA.get("ORIGIN", ['x']), y1: VA.get("ORIGIN", ['y']), x2: VA.get("DEST", ['x']), y2: VA.get("DEST", ['y'])})
            let vtext_origin = c.text("airports", {x: "latitude", y: "longitude", text: "airport", fill: "red"})
        }

        if (0) {
            //let table = await mgg.createTable("penguins", ["beaklen", "beakdepth", "flipperlen", "mass", "sex"], "working_penguins")
            await db.normalizeMany("penguins", ['beaklen', 'beakdepth', 'flipperlen', 'mass', 'sex'].map((a)=>[a]))
            const o = { x: {domain: [0,50]}, axis:null}
            let sex = c.dot("penguins_sex", { x: 10, y: "sex"}, o)
            let beakdepth = c.dot("penguins_beakdepth", { x: 20, y: "beakdepth"}, o)
            let beaklen = c.dot("penguins_beaklen", { x: 30, y: "beaklen"}, o)
            let mass = c.dot("penguins_mass", { x: 40, y: "mass"}, o)

            let vlink1 = c.link("penguins_fact", {x1: sex.get(null, ['x']), y1: sex.get(null, ['y']), x2: beakdepth.get(null, ['x']), y2: beakdepth.get(null, ['y'])}, {}, {axis:null})
            let vlink2 = c.link("penguins_fact", {x1: beakdepth.get(null, ['x']), y1: beakdepth.get(null, ['y']),  x2: beaklen.get(null, ['x']), y2: beaklen.get(null, ['y'])}, {}, {axis:null})
            let vlink3 = c.link("penguins_fact", {x1: beaklen.get(null, ['x']), y1: beaklen.get(null, ['y']), x2: mass.get(null, ['x']), y2: mass.get(null, ['y'])}, {}, {axis:null})
        }
        if (0) {

            await db.normalize("hrdata", ['DeptID', 'Salary', 'Absences', 'PerformanceScore'], "hrdata_base", "tmp_hrdata")
            await db.normalize("hrdata_base", ['DeptID'], "hrdata_DeptID", "tmp_hrdata2")

            
            let rect1 = c.rect("hrdata_DeptID", { ...eqX("DeptID")(), stroke:"grey", fill:"none" })
            let bar1 = c.bar("hrdata_base", { x: 'Salary', y: 'EmpSatisfaction', fill:'red' })
            c.nest(bar1, rect1, "DeptID")
        }

        if (0) {
            await db.normalize("hrdata", ['DeptID', 'EmpSatisfaction', 'Absences', 'Salary'], "hrdata_base", "tmp_hrdata")
            await db.normalize("hrdata_base", ['DeptID'], "hrdata_DeptID", "hrdata_EmpSatisfaction_Absences_Salary",)

            let rect1 = c.rectX("hrdata_DeptID", { ...sq("DeptID")(), x:'DeptID', stroke:"grey", fill:"none" }, {axis: null})
            let cell1 = c.cell("hrdata_EmpSatisfaction_Absences_Salary", {x: "EmpSatisfaction", y: "Absences", fill:"Salary" })

            c.nest(cell1, rect1, "DeptID")
        }

        //layout experiment
        if (0) {
            let rect1 = c.rectX("test", { ...sq("b")('y1', 'y2'), x:'b', stroke:"b", fill:"none" })

            let rect2 = c.rect("t1", { ...sq('f')(), stroke: "grey", fill: 'none' }, {axis:null})


            let text2 = c.text("t1", { ...sq('f')('x', 'y'), dx:10, text: 'f', fill:'white' }, {axis:null})

            // console.log("before dot")
            // let dot1 = c.dot("t1", { x: 'f', ...propY('f')(), fill:'red' }, {axis:null })
            
            c.nest(rect2, rect1, "a" )
        }

        if (0) {
            let vdot = c.dot("housing", {x: 'Lattitude', y: 'Longtitude', r: 'Landsize', fill: "Price"})
        }

        if (0) {
            let tables = await c.hier("small_housing", ["CouncilArea", "Suburb", "Bathroom", "Rooms"])
            console.log("all tables from hier", tables)
            console.log(c.db.constraints)
            /*
            Top most table is at the end
            */
            let vcarea = c.dot("CouncilArea", {x: "CouncilArea", y: 50}, {y: {range: [0, 100]}})
            let vcarea_sub = c.dot("CouncilArea_Suburb", {x: "Suburb", y: 150}, {y: {range: [100, 200]}})
            let vcarea_sub_bath = c.dot("CouncilArea_Suburb_Bathroom", {x: "Bathroom", y: 250}, {y: {range: [200, 300]}})
            let vcarea_sub_bath_rooms = c.dot("CouncilArea_Suburb_Bathroom_Rooms", {x: "Rooms", y: 350}, {y: {range: [300, 400]}})
            
            
            /*
            CouncilArea_Suburb_Bathroom_Rooms_fact
            CouncilArea_Suburb_Bathroom_fact
            CouncilArea_Suburb_fact
            */
           let vlink1 = c.link("CouncilArea_Suburb_fact", {x1: vcarea.get(null, ["x"]), y1: vcarea.get(null, ["y"]), x2: vcarea_sub.get(null, ["x"]), y2: vcarea_sub.get(null, ["y"])})
           let vlink2 = c.link("CouncilArea_Suburb_Bathroom_fact", {x1: vcarea_sub.get(null, ["x"]), y1: vcarea_sub.get(null, ["y"]), x2: vcarea_sub_bath.get(null, ["x"]), y2: vcarea_sub_bath.get(null, ["y"])})
           let vlink3 = c.link("CouncilArea_Suburb_Bathroom_Rooms_fact", {x1: vcarea_sub_bath.get(null, ["x"]), y1: vcarea_sub_bath.get(null, ["y"]), x2: vcarea_sub_bath_rooms.get(null, ["x"]), y2: vcarea_sub_bath_rooms.get(null, ["y"])})
        }

        if (0) {
            const o = { x: {domain: [0,10]}};

            function adjustPos(x) {
                return x + 20
            }

            let VA = c.dot("A", {x: 3, y: mgg.id, fill: 'black'}, o);
            let VB = c.dot("B", {x: VA.get(null, ['x'], adjustPos), y: mgg.id, fill: 'black'}, o);
        }

        if (0) {
            let tables = await c.hier("species", ["morder", "family", "genus", "specificEpithet"])

            /*
            Top most table is at the end
            */
            let vorder = c.dot("morder", {x: "morder", y: 50}, {y: {range: [0, 100]}})
            let vorder_family = c.dot("morder_family_fact", {x: "family", y: 150}, {y: {range: [100, 200]}})
            let vorder_family_genus = c.dot("morder_family_genus_fact", {x: "genus", y: 250}, {y: {range: [200, 300]}})
            
           let vlink1 = c.link("morder_family", {x1: vorder.get("morder", ["x"]), y1: vorder.get("morder", ["y"]), x2: vorder_family.get("family", ["x"]), y2: vorder_family.get("family", ["y"])})
           let vlink2 = c.link("morder_family_genus", {x1: vorder_family.get("family", ["x"]), y1: vorder_family.get("family", ["y"]), x2: vorder_family_genus.get("genus", ["x"]), y2: vorder_family_genus.get("genus", ["y"])})

        }

        if (0) {
            let vtables = c.rect("tables", { x: 'tid', fill:'white', stroke:'black'})
            let vcolname= c.text("columns", {
                                            y: 'ordinal_position',
                                            text: "colname",
                                            //'text-decoration': (d) => d.is_key? 'underline': 'none',
                                            x: 0
                            })
            function adjustPos(x) {
                return x + 50
            }
            let vtype = c.text("columns", {
                                            y: "ordinal_position",
                                            x: vcolname.get(null, ["x"], adjustPos),
                                            text: "type"
                                        })
            c.nest(vcolname, vtables, "tid")
            c.nest(vtype, vtables, "tid")
                    
            // let VF = c.link('FKeys', {
            //                             x1: vcolname.get(["tid1","col1"], ["x"]),
            //                             y1: vcolname.get(["tid1","col1"], ["y"]),
            //                             x2: vcolname.get(["tid2","col2"], ["x"]),
            //                             y2: vcolname.get(["tid2","col2"], ["y"])
            // })
        }

        (await c.render({ document, svg }));

        /*
        SELECT DISTINCT 
        "morder_marktable0"."x" AS "x1", 
        "morder_marktable0"."y" AS "y1", 
        "morder_family_fact_marktable1"."x" AS "x2", 
        "morder_family_fact_marktable1"."y" AS "y2"
        FROM 
        "morder"
        JOIN "morder_family" ON "morder_family" ."morder" = "morder"."morder"
        JOIN "morder_family_fact" ON "morder_family_fact"."family" = "morder_family"."family"
        JOIN "morder_family_fact_marktable1" ON "morder_family_fact"."_rav_id" = "morder_family_fact_marktable1"."_rav_id"
        JOIN "morder_marktable0" ON "morder"."_rav_id" = "morder_marktable0"."_rav_id"
        */
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
    </div>
{/await}


<style>
@import 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css';
</style>