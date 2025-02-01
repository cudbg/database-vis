import * as R from "ramda";
import { get, writable, derived } from "svelte/store";
import { Query, literal, sql, agg, and, eq, column } from "@uwdata/mosaic-sql";
import { Table, IDNAME, TName, maybetname } from "./table";
import { Schema } from "./schema";
import { constraintFromText, Constraint, Cardinality, FKConstraint } from "./constraint";
import { idexpr } from "./id"
import { coercetype } from "./util"



const isArray = R.is(Array);


export class Database {
  tables: Map<string, Table>;
  constraints: Map<string, Constraint>;
  schemaname: string;
  conn;

  constructor(conn, db=null) {
    if (db) {
      this.tables = new Map(db.tables);
      this.constraints = new Map(db.constraints);
      this.conn = conn ?? db.conn;
    } else {
      this.tables = new Map<string, Table>();
      this.constraints = new Map<string, Constraint>();
      this.conn = conn;
    }

    this.schemaname = "rav";
  }

  async init() {
    let qs = [];
    qs.push(`DROP SCHEMA IF EXISTS ${this.schemaname}`);
    qs.push(`CREATE SCHEMA ${this.schemaname}`);
    await this.conn.exec(qs)
    return this;
  }

  async data(tablename, format="rows") {
    let t = this.table(tablename);
    if (!t) return null;
    const sql = t.schema.has(IDNAME)
      ? `SELECT * FROM ${tablename}`
      : `SELECT ${idexpr} as ${IDNAME}, * FROM ${tablename}` ;

    let rows = await this.conn.exec(sql);
    if (format == "row") return rows;
    let cols = Object.fromEntries(rows.columns
      .map((col) => [col, R.pluck(col, rows)]));
    return cols;

  }


  async fromRows(rows, internalname=null) {
    if (!rows || rows.length == 0) return null;
    internalname ??= Table.newname();
    //const name = `${db.schemaname}.${internalname}`;
    const row = rows[0];
    let keys = R.keys(row);
    const needIDNAME = R.contains(IDNAME, keys);
    keys = (needIDNAME)? [IDNAME,...keys]:keys;

    const tname = new TName(internalname, keys);
    const body = rows.map((r,i) => {
      let vals = [];
      if (needIDNAME) vals.push(i);
      vals.concat(keys.map((k) => literal(r[k])))
      return `(${vals.join(",")})`;
    }).join(",");

    let sql = `CREATE VIEW ${tname} AS VALUES ${body}`
    await this.conn.exec(sql)
    const tables = await this.tablesFromConnection(internalname)
    this.setTable(tables[0])
    return tables[0]
  }

  async fromCols(cols, internalname=null) {
    if (!cols) return null;
    internalname ??= Table.newname()

    let keys = R.keys(cols);
    if (keys.length == 0) 
      throw new Error("Trying to create table from data with no rows AND no columns!")
    const N = cols.n ?? cols[keys[0]].length;
    if (!keys.includes(IDNAME)){
      keys.push(IDNAME)
      cols[IDNAME] = R.range(0,N)
    }

    cols = R.map((v) => v.value??v, cols)
    const handleFloats = R.map((col) => 
      (R.isNil(col[0]) || Number.isNaN(+col[0]))
      ? R.identity
      : (+col[0]==Math.round(col[0]))
      ? (v) => sql`cast(${v} as int)`
      : (v) => sql`cast(${v} as double)`
      , cols)

    const tname = new TName(internalname, keys);
    const body = R.range(0,N).map((i) => {
      const vals = keys.map((k) => handleFloats[k](literal(cols[k][i]))).join(",")
      return `(${vals})`
    } ).join(",")

    let q = `CREATE VIEW ${tname} AS VALUES ${body}`
    await this.conn.exec(q)
    const tables = await this.tablesFromConnection(internalname)
    this.setTable(tables[0])
    return tables[0]
  }

  async fromSql(q, internalname=null)  {
    internalname ??= Table.newname();
    //let name = `${db.schemaname}.${internalname}`;
    const name = internalname;
    let sql = `CREATE TABLE ${name} AS ${q}`
    await this.conn.exec(sql)
    // TODO: actually check schema and tablename!
    const t = await this.tableFromConnection(internalname)
    this.setTable(t)
    return t;
  }

  async createView(viewname, q:Query|String) {
    viewname = maybetname(viewname);
    let sqls = [
      `DROP VIEW IF EXISTS ${viewname.tablename}`,
      `CREATE VIEW ${viewname} AS (${q})`
    ]
    await this.conn.exec(sqls);
    const t = await this.tableFromConnection(viewname.tablename)
    this.setTable(t)
    return t
  }

  async createTable(q, internalname=null) {
    internalname ??= Table.newname();
    //let name = `${db.schemaname}.${internalname}`;
    const name = internalname;
    let sql = `CREATE TABLE ${name} ${q}`
    await this.conn.exec(sql)
    // TODO: actually check schema and tablename!
    const t = await this.tableFromConnection(internalname)
    this.setTable(t)
    return t;
  }

  // async insertIntoTable(q, name: string) {
  //   let sql = `INSERT INTO ${name} VALUES ${q}`
  //   await this.conn.exec(sql)
  //   const ret = await this.tableFromConnection(name)
  //   return ret
  // }

  async loadFromConnection(...tablenames) {
    (await this.tablesFromConnection(tablenames))
      .forEach((t)=>this.setTable(t))
    await this.constraintsFromConnection(tablenames);
    return this;
  }

  async tableFromConnection(tablename) {
    const tables = await this.tablesFromConnection(tablename)
    return tables[0];
  }

  // Loads tablenames from the duckdb connection in this.conn
  // @param tablenames list of table names or null/empty to load all tables
  async tablesFromConnection(...tablenames) {
    tablenames = tablenames.flat()
    let q = Query
      .from("information_schema.columns")
      .select(["table_name", "column_name", "data_type"])
    if (tablenames.length > 0) {
      const s = tablenames.map((t) => `'${t}'`).join(",")
      q.where(`table_name IN (${s})`)
    }
    let schemas = {};
    let res = await this.conn.exec(q);

    res.forEach(({table_name, column_name, data_type}) => {
      schemas[table_name] ??= new Schema();
      schemas[table_name].push(column_name, coercetype(data_type));
    })

    for (const [name, schema] of Object.entries(schemas)) {
      if (!schema.attrs.includes(IDNAME)) {
        await this.appendID(name)
        schema.push(IDNAME, "num")
      }
    }

    let ts = []
    for (const table in schemas) {
      console.log('create table', table, schemas[table])
      ts.push(new Table(this, { internalname: table, schema:schemas[table]}))
    }
    return ts;
  }

  async constraintsFromConnection(...tablenames) {
    tablenames = tablenames.flat();
    let where = [`constraint_type in ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')`];//"schema_name = '${this.schemaname}'"]
    if (tablenames.length > 0) {
      const s = tablenames.map((t) => `'${t}'`).join(",")
      where.push(`tablename IN (${s})`)
    }
    let q = `SELECT table_name, constraint_text as text, constraint_column_names as attrs
     FROM duckdb_constraints() 
     WHERE ${where.join(" AND ")}`  
           
    let res = await this.conn.exec(q);
    res.forEach(({table_name, text, attrs}) => {
      let t = this.tables.get(table_name)
      //let t = this.tables[table_name]
      const { pk, fk, uniq } = constraintFromText(text);
      if (pk) t.keys(pk)
      if (uniq) t.keys(uniq)
      if (fk) {
        const c = new FKConstraint({
          t1: t,
           X: fk.fkattrs, 
          t2: this.tables.get(fk.ref),
           Y: fk.refattrs});
        this.addConstraint(c)
      }
    })
  }


  // @returns { }
  getFkDependencyGraph() {
    let edges = {};
    for (const [cname, c] of Object.entries(this.constraints)) {
      if (!(c instanceof FKConstraint)) continue
      let {t1,t2,card} = c;
      if (card == Cardinality.ONEONE) {
        edges[t1.internalname] ??= [];
        edges[t2.internalname] ??= [];
        edges[t1.internalname].push({ src: t1.internalname, dst: t2.internalname, c })
        edges[t2.internalname].push({ src: t2.internalname, dst: t1.internalname, c })
      } else if (card == Cardinality.ONEMANY) {
        edges[t1.internalname] ??= [];
        edges[t2.internalname] ??= [];
        edges[t2.internalname].push({ src: t2.internalname, dst: t1.internalname, c })
      }

    }
    return edges;
  }

  getFkPath(source:Table|string, destination:Table|string) {
    for (const path of this.getFkPaths(source, destination)) 
      return path;
    return null;
  }


  getFkPaths(source:Table|string, destination:Table|string) {
    source = (source instanceof Table)? source.internalname: source;
    destination = (destination instanceof Table)? destination.internalname: destination;
   
    let edges = this.getFkDependencyGraph();

    // bfs to search from src to dst and return path of constraints
    let paths = [];
    let seen = {};
    let queue = [{ src: source, dst: destination, path: [] }];

    while (queue.length > 0) {
      let { src, dst, path } = queue.shift();
      if (seen[src]) continue;
      seen[src] = true;
      if (src === dst) paths.push(path)
      for (let { dst:_dst, c } of (edges[src]??[])) {
        queue.push({ src: _dst, dst, path: [...path, c] });
      }
    }
    paths = R.uniqBy((path) => R.pluck("id",path).join("--"), paths)
    return paths;
  }


  dfs(edges, curr: string, destination: string, visited: Set<string>, path: FKConstraint[], currEdge: FKConstraint) {
    visited.add(curr)
    path.push(currEdge)

    if (curr == destination)
      return path


    for (let { dst:_dst, c } of (edges[curr]??[])) {
      if (!visited.has(_dst)) {
        let result = this.dfs(edges, _dst, destination, visited, path, c)
        if (result)
          return result
      }
    }
    path.pop()
    visited.delete(curr)
    return null
  }

  getFKPath(source:Table, destination:Table, searchConstraint: FKConstraint) {
    let edges = this.getFkDependencyGraph()

    let visited = new Set<string>()
    visited.add(source.internalname)
    let path = [searchConstraint]
    let start


    if (searchConstraint.card == Cardinality.ONEMANY) {
      start = searchConstraint.t1.internalname
      visited.add(searchConstraint.t1.internalname)
    } else if (searchConstraint.t1.internalname != source.internalname) {
      start = searchConstraint.t1.internalname
      visited.add(searchConstraint.t1.internalname)
    } else {
      start = searchConstraint.t2.internalname
      visited.add(searchConstraint.t2.internalname)
    }

    if (start == destination.internalname)
      return path

    for (let { dst:_dst, c } of (edges[start]??[])) {
      if (!visited.has(_dst)) {
        let result = this.dfs(edges, _dst, destination.internalname, visited, path, c)
        if (result)
          return result
      }
    }

    return null

  }

  constraint(name) {
    if (name instanceof Constraint) return name;
    return this.constraints[name];
  }

  addConstraint(c) {
    this.constraints[c.name] = c;
    return this;
  }
  delConstraint(c) {
    delete this.constraints[c.name];
    return this;
  }

  table(name) {
    if (name instanceof Table) return name;
    return this.tables.get(name);
  }

  setTable(table) {
    // XXX: potential name collision, but unlikely
    this.tables.set(table.displayname, table);
    this.tables.set(table.internalname, table);
    return this;
  }

  delTable(table) {
    delete this.tables[table.displayname];
    delete this.tables[table.internalname];
    return this;
  }

  checkConstraint(c,vis) { 
    // TODO
    return true; 
  }

  checkConstraints(vis) {
    return R.all((c) => this.checkConstraint(c,vis), R.values(this.constraints))
  }

  // decompose given functional dependency X->Y
  async decompose(name, X:string|string[], Y:string|string[], newname1, newname2) {
    X = isArray(X)? X : [X];
    Y = isArray(Y)? Y : [Y];
    let t = this.table(name);
    let t1 = await t.project(t.schema.except(Y).asObject(), newname1)
    let t2 = await t.project(new Schema(R.concat(X,Y)).asObject(), newname2)
    t2.keys(X)

    // NOTE; duckdb doesn't allow adding FK references to tables
    let c = new FKConstraint({t1, X, t2, Y:X})
    this.setTable(t1)
    this.setTable(t2);
    this.addConstraint(c);
    return [t1, t2]
  }

  // normalize into dimension and fact tables
  // let A be the schema of base table
  //   dim(dim_id, attrs)
  //   fact(A-attrs, dim_id)
  async normalize(name, attrs:string|string[], dimname=null, factname=null) {
    
    attrs = isArray(attrs)? attrs : [attrs];
    dimname ??= `${name}_dim`;
    factname ??= `${name}_fact`;

    let t = this.table(name);
    let select = t.schema.pick(attrs).asObject();
    let newDim = await t.distinctproject(select, dimname) //newDim contains only attrs
    newDim.keys(IDNAME)

    let rest = t.schema.except([...attrs, IDNAME]).attrs;
    const fkattr = (attrs.length==1)? attrs[0] : `${dimname}_id`;

    let q = Query
      .from({l:t.internalname, r:newDim.internalname})
      .where(and(attrs.map((a) => eq(column('l',a),column('r',a)))))
      .select(rest)
      .select({[fkattr]: column('r',IDNAME)})
      .select({[IDNAME]: idexpr})
    let newFact = await this.fromSql(q, factname)
    newFact.name(factname)
    newFact.keys(IDNAME)

    let c1 = new FKConstraint({t1: t, X: [IDNAME], t2: newFact, Y: [IDNAME]})
    let c2 = new FKConstraint({t1: newFact, X: [fkattr], t2: newDim, Y: [IDNAME]})
    this.setTable(newDim)
    this.setTable(newFact)
    this.addConstraint(c1)
    this.addConstraint(c2)
  }


  async normalizeMany(name, list_of_attrs:string[][], { dimnames, factname}={}) {
    dimnames ??= list_of_attrs.map((a) => `${name}_${a}`)
    factname ??= `${name}_fact`

    let t = this.table(name)
    let rest = t.schema.except([...list_of_attrs.flat(), IDNAME]).attrs
    let q = Query
      .from({l: t.internalname})
      .select(rest)
      .select({[IDNAME]: idexpr})
    let constraints = []
    for (const [attrs, dimname] of R.zip(list_of_attrs, dimnames)) {
      const fkattr = (attrs.length==1)? attrs[0] : `${dimname}_id`;

      let new_table = await t.distinctproject(t.schema.pick(attrs).asObject(), dimname)

      this.setTable(new_table)
      new_table.keys(IDNAME)
      constraints.push({t1: null, X: [fkattr], t2: new_table, Y: [IDNAME]})
      q
      .from({[dimname as string]: new_table.internalname})
      .where(and(attrs.map((a) => eq(column('l',a),column(dimname,a)))))
      .select({[fkattr]: column(dimname, IDNAME)})
    }
    let newFact = await this.fromSql(q, factname)
    newFact.name(factname)
    newFact.keys(IDNAME)
    this.setTable(newFact)

    for (const c of constraints) {
      c.t1 = newFact;
      this.addConstraint(new FKConstraint(c))
    }
  }

    /**
   * It would be really nice if we had a function that allowed the user to combine columns 
   * from different tables to create a new table
   * Something like
   * db.join({t1, t2}, {tablename: column, ...}, {x: y, ...} <new table name>)
   * 
   * t1: left table name
   * t2: right table name
   * 
   * {x: y, ...}: obj that specifies what columns to join on. x is a column in t1. y is a column in t2
   * 
   * {tablename: column}: obj that specify what columns to select from what table.
   *                        tablename must be either t1 or t2
  */
    async join({t1, t2}, selectCols: {[key: string]: string[]}, joinKeys, newTableName) {
      t1 = this.table(t1)
      t2 = this.table(t2)
    
      let q = Query.from(t1.internalname, t2.internalname)
  
      for (let [tablename, cols] of Object.entries(selectCols)) {
        for (let col of cols)
          q = q.select({[col]: column(tablename, col)})
      }
  
      /**
       * Assume that user never selects _rav_id because that is not supposed to be exposed to user
       */
      q = q.select({[IDNAME]: idexpr})
      
      for (let [leftcol, rightcol] of Object.entries(joinKeys))
        q = q.where(eq(column(t1.internalname, leftcol), column(t2.internalname, rightcol)))
  
      let newTable = await this.fromSql(q, newTableName)
      newTable.name(newTableName)
      newTable.keys(IDNAME)
      this.setTable(newTable)
    }


  async appendID(tablename) {
    await this.conn.exec(`ALTER TABLE ${tablename} ADD COLUMN ${IDNAME} INTEGER;`)
    await this.conn.exec(`CREATE TEMPORARY TABLE temp_table AS
                          SELECT
                              *,
                              row_number() OVER () - 1 AS new_id
                          FROM ${tablename};`)
    
    await this.conn.exec(`UPDATE ${tablename}
                          SET ${IDNAME} = temp_table.new_id
                          FROM temp_table
                          WHERE ${tablename}.rowid = temp_table.rowid;`)
    await this.conn.exec("DROP TABLE temp_table")
  }
}


