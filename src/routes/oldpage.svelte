<script lang="ts">
	import { watchResize } from "svelte-watch-resize";
	import { tick, onMount, afterUpdate, getContext, setContext } from "svelte";
	import { Database } from "../viz/db";
  import { DuckDB } from "../viz/duckdb";
  import { Canvas }  from "../viz/canvas";
	import Debug from "../components/Debug.svelte";
  import { markof, RLX, RLY, propX, propY, eqX, eqY, sq } from "../viz/ref"
  import TableInspector from "../components/TableInspector.svelte";


  let innerWidth = 800;
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
          url:  "/penguins.csv"
        },
        {
          name: "hrdata",
          url: "/HRDataset_v14.csv"
        }
        ]
    });
    db_up = await (async function dbGoLive(duckdb) {
      await duckdb.init()
      duckdb.on("data", debug.render)

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

      await duckdb.exec(`CREATE TABLE T (
        _rav_id int primary key,
        a int,
        b int
      )`)

      await duckdb.exec(`INSERT INTO T values
        (0,100,200), (1,100,300), (2, 300, 100), (3, 300, 200)
      `)
    })(duckdb);


		await db_up;

    inspector.conn = duckdb;

    let db = new Database(duckdb);
    await db.init();
    await db.loadFromConnection();
    
    //await db.decompose("test", 'b', ['d'], 'test1', 'test2')
    await db.table('penguins').fold(['beaklen', 'beakdepth', 'flipperlen', 'mass', 'sex'], 'key', 'val', "penguinsf")

    let c = new Canvas(db, {width: 800, height: 500})
    window.c = c;
    window.db = db;

    await db.normalizeMany("T",['a','b'].map((a) => [a]))

    if (1) {
        const o = { x: {domain: [0,15]}}
        let va = c.dot("T_a", {x: 0, y: "a"}, o)
        let vb = c.dot("T_b", {x: 10, y: "b"}, o)
        let vt = c.link("T_fact", {start: va.get("a", ['x','y']), end: vb.get("b", ['x', 'y'])}, {axis:null})
    }

    // parallel coord
    //await db.normalizeMany("penguins", ['sex','beakdepth'].map((a) =>[a]))
    await db.normalizeMany("penguins", 
      ['beaklen', 'beakdepth', 'flipperlen', 'mass', 'sex'].map((a)=>[a]))
    
    if (0) {
      await db.normalizeMany("penguins", ['beaklen', 'beakdepth', 'flipperlen', 'mass', 'sex'].map((a)=>[a]))
      const o = { x: {domain: [0,50]}, axis:null}
      let sex = c.dot("penguins_sex", { x: 10, y: "sex"}, o)
      let beakdepth = c.dot("penguins_beakdepth", { x: 20, y: "beakdepth"}, o)
      c.dot("penguins_beaklen", { x: 30, y: "beaklen"}, o)
      c.dot("penguins_mass", { x: 40, y: "mass"}, o)

      let vt = c.link("penguins_fact", {start: sex.get("_rav_id", ['x','y']), end: beakdepth.get("_rav_id", ['x', 'y'])}, {}, {axis:null})
      let link = c.link({ t1: "penguins_sex", t2: "penguins_beakdepth"}, {}, { axis: null })
      
      c.link({ t1: "penguins_beakdepth", t2: "penguins_beaklen"},{},  {axis:null})
      c.link({ t1: "penguins_mass", t2: "penguins_beaklen"},{},  {axis:null})
      c.link({ t1: "penguins_sex", t2: "penguins_beaklen"}, { stroke: "red"}, {axis:null})
    }
    

    // nested
    if (0) {
      let rect1 = c.rectX("test", { ...sq("b")('y1', 'y2'), x:'b', stroke:"b", fill:"none" })

      let rect2 = c.rect("t1", { ...sq('f')(), stroke: "grey", fill: 'none' }, {axis:null})


      let text2 = c.text("t1", { ...sq('f')('x', 'y'), dx:10, text: 'f', fill:'white' }, {axis:null})

      console.log("before dot")
      let dot1 = c.dot("t1", { x: 'f', ...propY('f')(), fill:'red' }, {axis:null })
      
      c.nest({ t1: "test", t2: "t1", on:"a" })

      //c.link({t1: 'test', t2: 't1', on: 'a'}, 
      //  { start: markof("test"), end: markof("t1"), stroke: "black" },
      //  { axis: null })
    }

    
        
    if (0) {
      await db.normalizeMany("hrdata", ['DeptID', 'Salary', 'Absences', 'PerformanceScore'].map((a)=>[a]))
      let rect1 = c.rect("hrdata_DeptID", { ...eqX("DeptID")(), stroke:"grey", fill:"none" })
      let bar1 = c.bar("hrdata", { x: 'Salary', y: 'EmpSatisfaction', fill:'red' })
      c.nest({t1: "hrdata_DeptID", t2: "hrdata", on:"DeptID"})
    }

    if (0) {
      let rect1 = c.rectX("hrdata_DeptID", { ...sq("DeptID")(), x:'DeptID', stroke:"grey", fill:"none" })
      let cell1 = c.cell("hrdata", {x: "EmpSatisfaction", y: "Absences", fill:"Salary" })

      c.nest({ t1: "hrdata_DeptID", t2: "hrdata", on:"DeptID" })
    }

    (await c.render({ document, svg }));


    // c1: T -1-n- S
    // all calls to auto in enc() are resolved to a common function
//    M = db.t("T").enc("box", {
//      x: auto(),  // passed bounding box and statistics as input?
//      y: 'y',
//      w: auto(),
//      h: auto()
//    })
//    db.C("c1").enc("containment", M)
//    db.t("S").enc("point", {
//    })
   

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
	<div class="row">
		<div class="col">
      <TableInspector bind:this={inspector}/>
      <Debug bind:this={debug}/>
			<!--<Container> </Container>-->
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
