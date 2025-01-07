<script lang="ts">
  import { page } from '$app/stores';
  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import { store_example_code, store_example_schema, store_example_data, store_preloaded_data } from '../../../stores';
  import { watchResize } from "svelte-watch-resize";
	import { onDestroy, onMount } from "svelte";
	import { Database } from "../../../viz/db";
  import { DuckDB } from "../../../viz/duckdb";
  import { Canvas }  from "../../../viz/canvas";
  import { markof, RLX, RLY, propX, propY, eqX, eqY, sq } from "../../../viz/ref";
  import { mgg } from '../../../viz/uapi/mgg';
  import AllExamples from "../../../components/AllExamples.svelte";
  import Debug from '../../../components/Debug.svelte';
  import TableInspector from '../../../components/TableInspector.svelte';
  import NewEditor from '../../../components/NewEditor.svelte';

  
  // Reactive store value for plotType
  $: plotType = $page.params.slug || 'scatter_plot';

  // Update example reactively when plotType or store_example_code changes
  $: code = store_example_code[plotType] || store_example_code["scatter_plot"] || "";

  $: schemas = (store_example_schema[plotType] || store_example_schema["scatter_plot"] || "");

  $: datas =  (store_example_data[plotType]|| store_example_data["scatter_plot"] || "");
  
  $: complete_info = ("/*\nSchema:\n"
                    + schemas.join("\n")
                    + "\n\nData:\n" 
                    + datas.join("\n") 
                    + "\n*/\n\n\n"
                    + code.join("\n"))

  // Debugging logs
  $: console.log("Plot type:", plotType);
  $: console.log("code:", code);
  $: console.log("schema:", schemas);
  $: console.log("data:", datas);
  $: console.log("complete_info:", complete_info);

  let innerWidth = 800;
  let debug = null;
  let db_up = null;
  let rootelement = null;
  let svg = null;
  let inspector = null;
  let data = null;
  let text = "";


  let previewingExamples = false;

  let key = 0

  function previewExamples() {
      previewingExamples = !previewingExamples
  }

  function runCode() {
    key += 1
    location.reload()
  }

  beforeNavigate((navigation) => {
    console.log("beforeNavigate")
    if (navigation) {
      let currentPath = navigation.from?.url?.pathname
      let nextPath = navigation.to?.url?.pathname;
      console.log("currentPath", currentPath);
      console.log("nextPath", nextPath);

      if (!nextPath || currentPath == nextPath) { //rerender, take most updated version before rerender
        console.log("same path or rerender")
        let editorContent = document.getElementById("editor").value
        localStorage.setItem("text", editorContent)
      } else {
        console.log("switching")
        localStorage.clear()
      }

    }
  })

  onMount(async () => {
    if (localStorage.getItem("text")) {
      console.log("found text in storage");
      console.log(localStorage.getItem("text"));
      text = localStorage.getItem("text")
    } else {
      console.log("no text because just switched route");
      text = complete_info;
    }

    console.log("mounting +page.svelte")
      let duckdb = new DuckDB({
          sources: [
            { 
              name: "housing",
              url:  "/clean_melb_data.csv"
            },
            { 
                name: "small_housing",
                url:  "/small_housing.csv"
            },
            {
              name: "penguins",
              url:  "/penguins.csv"
            },
            {
              name: "hrdata",
              url: "/HRDataset_v14.csv"
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
          ]
      });
      db_up = await (async function dbGoLive(duckdb) {
        console.log("dbGoLive")
        await duckdb.init()
        duckdb.on("data debugrender", debug.render)

        /**
         * Need to set up foreign key references for airport nodelink diagram to work properly
        */
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

        console.log("plotType has housing?", plotType.includes("housing"))

        let is_preloaded_data = false;

        for (let i = 0; i < store_preloaded_data.length; i++) {
          if (plotType.includes(store_preloaded_data[i])) {
            is_preloaded_data = true
            break
          }
        }

        if (!is_preloaded_data) {
            for (let i = 0; i < schemas.length; i++) {
                let schema = schemas[i]
                console.log("example schema", schema)
                let tablenameEndIdx = schema.indexOf('(')
                let tablename = schema.substring(0, tablenameEndIdx)
                let dropTableQuery = `DROP TABLE IF EXISTS ${tablename}`
                
                let createTableQuery = `CREATE TABLE ${schema}`

                let insertQuery = `INSERT INTO ${tablename} VALUES ${datas[i]}`

                await duckdb.exec(dropTableQuery)
                await duckdb.exec(createTableQuery)
                await duckdb.exec(insertQuery)
          }
        }
    })(duckdb);

    await db_up;


    inspector.conn = duckdb;

    let db = new Database(duckdb);
    await db.init();
    await db.loadFromConnection();

    let width = 800;
    let height = 500;

    let c = new Canvas(db, {width: width, height: height})
    window.c = c;
    window.db = db;

    console.log("complete_info", text)
    eval(`(async () => { ${text} + await c.render({ document, svg }) })()`)
  });

  afterNavigate((navigation) => {
    console.log("afterNavigate")
    if (navigation) {
      let currentPath = navigation.from?.url?.pathname
      let nextPath = navigation.to?.url?.pathname;
      console.log("currentPath", currentPath);
      console.log("nextPath", nextPath);

      if (!currentPath || currentPath == nextPath) { //rerender, take most updated version before rerender
        console.log("same path or rerender")
        console.log("text", text)
        text = localStorage.getItem("text")
      } else {
        console.log("finished switch")
        text = complete_info
      }
    }
  })

</script>


<div>
  <div class="topnav" style="height: 100px">
    <button id="run" on:click={runCode} style="font-size: 20px;">Run</button>
    <button id="examples" on:click={previewExamples} style="font-size: 20px;">Examples</button>
    {#if previewingExamples}
        <AllExamples />
    {/if}
  </div>
  <NewEditor bind:text={text}/>
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
</div>

  
<!-- <style>
  @import 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css';
</style> -->