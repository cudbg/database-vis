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
        let canvas


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

            let sa = c.linear("sa", "T", "aid")
            let sb = c.linear("sb", "T", "bid")
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
            let text2 = c.text("t1", { ...sq('f')('x', 'y'), dx:10, text: 'f', fill:'white' }, {axis:null})
                            
            let dot1 = c.dot("t1", { x: 'f', ...propY('f')(), fill:'red' })
                                    
            c.nest(rect2, rect1, "a")
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

        if (0) { /* hr_layout example */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            await db.normalizeMany("hrdata", ['DeptID', 'Salary', 'Absences', 'PerformanceScore'].map((a)=>[a]))
            let rect1 = c.rect("hrdata_DeptID", { ...eqX("DeptID")(), stroke:"grey", fill:"none" })
            let bar1 = c.bar("hrdata", { x: 'Salary', y: 'EmpSatisfaction', fill:'red' })
            c.nest(bar1, rect1, "DeptID")
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
            let sa = c.linear("room_scale", "housing_fact", "Rooms")
            let sb = c.linear("bathroom_scale", "housing_fact", "Bathroom")
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
            c.nest(VA, VB, "Rooms")
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

            let rect1 = c.rectX("housing_room", { ...sq("Rooms")(), x:'Rooms', stroke: "Rooms", fill:"none" })
            let rect2 = c.rectX("housing_room_year_price", { ...sq("YearBuilt")(), x:'YearBuilt', "stroke-width":"1px", stroke: "black", fill:"Price" })
            c.nest(rect2, rect1, "Rooms")
        }

        if (1) { /* airport nodelink */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

            let VA = c.dot("airports", {x: "latitude", y: "longitude"})
            let VT = c.link("routes", {x1: VA.get("ORIGIN", ['x']), y1: VA.get("ORIGIN", ['y']), x2: VA.get("DEST", ['x']), y2: VA.get("DEST", ['y'])})
            let vtext_origin = c.text("airports", {x: "latitude", y: "longitude", text: "airport", fill: "red"})
        }

        if (0) { /* ER diagram WORK IN PROGRESS !!!!!!!! */
            await db.loadFromConnection()

            let c = new Canvas(db, {width: 800, height: 500})
            canvas = c
            window.c = c;
            window.db = db;

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

        (await canvas.render({ document, svg }));

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