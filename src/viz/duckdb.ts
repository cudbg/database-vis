import * as R from "ramda"
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

import { EventEmitter } from "./util";



export class DuckDB extends EventEmitter {
  // elements can be
  // { name: tablename, url: url }
  // { name: tablename, csv: CSV String }
  // { name: tablename, array: array of objects } // NOT SUPPORTED YET
  sources = []
  db = null;
  conn = null;

  constructor(options:any = {}) {
    super()

    this.sources = [options.sources ?? []].flat();
  }

  register(source) {
    this.sources.push(source)
  }

  async init() {
    const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
      mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
      },
      eh: {
        mainModule: duckdb_wasm_eh,
        mainWorker: eh_worker,
      },
    };
    // Select a bundle based on browser checks
    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    // Instantiate the asynchronus version of DuckDB-wasm
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    this.db = new duckdb.AsyncDuckDB(logger, worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    this.conn = await this.db.connect()

    for (let source of this.sources) {
      await this.load(source)
    }
  }

  async load(source) {
    // TODO: error handling
    let name = source.name;
    if (source.csv) {
      await this.db.registerFileText(name, source.csv);
      await this.conn.insertCSVFromPath(name, {
        name, schema: "main", detect: true, header: true
      })
    } else if (source.url) {
      let response = await fetch(source.url)
      let buf = await response.arrayBuffer()
      const u8buf = new Uint8Array(buf);
      await this.db.registerFileBuffer(name, u8buf);
      await this.conn.insertCSVFromPath(name, {
        name, schema: "main", detect: true, header: true
      })
    }
    //await db.registerFileURL('remote.parquet', 'https://origin/remote.parquet');
    return this;
  }

  public async exec(...queries) {
    let results = null;
    queries = queries.flat();
    for (const q of queries) {
      console.log(`${q}`)
      let res = await this.conn.query(`${q}`)
      let rows = res.toArray().map((o) => {
        o = o.toJSON();
        return R.map((v) => {
          if (v instanceof Uint32Array)
            return parseFloat(v)
          return v;
        }, o)
      })
      rows.columns = res.schema.fields.map((d) => d.name);
      results = rows;
      this.emit("data", rows)
    }
    return results;
  }
}


