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

    await this.loadMetadata()

    return this;
  }

  async loadMetadata() {
    await this.conn.exec(`CREATE TABLE tables (id int primary key, table_name string)`)
    await this.conn.exec(`INSERT INTO tables SELECT (ROW_NUMBER() OVER ()) - 1 AS id, table_name
    FROM information_schema.tables
    WHERE table_schema = 'main'`)

    let metadataTables = await this.tableFromConnection("tables")
    this.setTable(metadataTables)

    metadataTables.name("tables")
    metadataTables.keys("id")
    metadataTables.keys(IDNAME)

    await this.conn.exec("CREATE TABLE columns(id int unique, tid int, colname string, is_key bool, type string, ord_pos int, PRIMARY KEY (tid, colname), FOREIGN KEY (tid) REFERENCES tables(id))")
    await this.conn.exec(
      `INSERT INTO columns (id, tid, colname, is_key, type, ord_pos)
      SELECT (ROW_NUMBER() OVER ()) - 1 AS id,
       t.id AS tid,
       c.column_name AS colname,
       CASE WHEN c.column_name IN (
                SELECT k.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage k
                    ON tc.constraint_name = k.constraint_name
                WHERE tc.table_name = t.table_name
                  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
             )
            THEN TRUE ELSE FALSE END AS is_key,
       c.data_type AS type,
       c.ordinal_position AS ord_pos
      FROM information_schema.columns c
      JOIN tables t
          ON c.table_name = t.table_name
      WHERE c.table_schema = 'main';
      `)

    let columnTable = await this.tableFromConnection("columns")
    this.setTable(columnTable)
    columnTable.name("columns")
    columnTable.keys("id")
    columnTable.keys(IDNAME)
    columnTable.keys(["tid", "colname"])

    let c = new FKConstraint({t1: columnTable, X: ["tid"], t2: this.table("tables"), Y: ["id"]})
    this.addConstraint(c)


    await this.conn.exec("CREATE TABLE fkeys (id int primary key, tid1 int, col1 string, tid2 int, col2 string, FOREIGN KEY(tid1, col1) references columns(tid, colname), FOREIGN KEY(tid2, col2) references columns(tid, colname))")
    await this.conn.exec(
      `
      WITH fk_columns AS (
          SELECT ccu.constraint_name AS fk_name,
                ccu.table_name AS from_table,
                ccu.column_name AS from_column
          FROM information_schema.constraint_column_usage ccu
          JOIN information_schema.table_constraints tc
              ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
      ),
      pk_columns AS (
          SELECT ccu.constraint_name AS pk_name,
                ccu.table_name AS to_table,
                ccu.column_name AS to_column
          FROM information_schema.constraint_column_usage ccu
          JOIN information_schema.table_constraints tc
              ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
      ),
      referential AS (
          SELECT rc.constraint_name, rc.unique_constraint_name
          FROM information_schema.referential_constraints rc
      ),
      joined_fkeys AS (
          SELECT fk.from_table, fk.from_column, pk.to_table, pk.to_column, fk.fk_name, pk.pk_name
          FROM fk_columns fk
          JOIN referential r ON fk.fk_name = r.constraint_name
          JOIN pk_columns pk ON r.unique_constraint_name = pk.pk_name
      ),
      mapped_fkeys AS (
          SELECT (ROW_NUMBER() OVER ()) - 1 AS id,
                t1.id AS tid1,
                joined_fkeys.from_column AS col1,
                t2.id AS tid2,
                joined_fkeys.to_column AS col2
          FROM joined_fkeys
          JOIN tables t1 ON joined_fkeys.from_table = t1.table_name
          JOIN tables t2 ON joined_fkeys.to_table = t2.table_name
          JOIN columns fk_col ON fk_col.tid = t1.id AND fk_col.colname = joined_fkeys.from_column
          JOIN columns pk_col ON pk_col.tid = t2.id AND pk_col.colname = joined_fkeys.to_column
          WHERE t1.table_name NOT IN ('tables', 'columns')
            AND t2.table_name NOT IN ('tables', 'columns')
      )
      INSERT INTO fkeys (id, tid1, col1, tid2, col2)
      SELECT id, tid1, col1, tid2, col2
      FROM mapped_fkeys;
      `)
      let fkeysTable = await this.tableFromConnection("fkeys")
      this.setTable(fkeysTable)
      fkeysTable.name("fkeys")
      fkeysTable.keys("id")
      fkeysTable.keys(IDNAME)

      let c1 = new FKConstraint({t1: fkeysTable, X:["tid1", "col1"], t2: this.table("columns"), Y:["tid", "colname"]})
      let c2 = new FKConstraint({t1: fkeysTable, X:["tid2", "col2"], t2: this.table("columns"), Y:["tid", "colname"]})

      this.addConstraint(c1)
      this.addConstraint(c2)
  }

  async updateMetadata(tablename) {
    await this.conn.exec(
      `INSERT INTO tables (id, table_name, _rav_id)
      SELECT COALESCE(MAX(id), 0) + 1, '${tablename}', COALESCE(MAX(id), 0) + 1, FROM tables;`)

    await this.conn.exec(
      `WITH new_table_id AS (
    SELECT id FROM tables WHERE table_name = '${tablename}'
    ),
    table_columns AS (
        SELECT column_name, ordinal_position, data_type
        FROM information_schema.columns
        WHERE table_name = '${tablename}'
    )
    INSERT INTO columns (id, tid, colname, is_key, type, ord_pos, _rav_id)
    SELECT row_number() OVER () + COALESCE((SELECT MAX(id) FROM columns), 0),
          (SELECT id FROM new_table_id),
          column_name,
          column_name IN (
              SELECT column_name
              FROM information_schema.key_column_usage
              WHERE table_name = '${tablename}'
          ),
          data_type,
          ordinal_position,
          row_number() OVER () + COALESCE((SELECT MAX(_rav_id) FROM columns), 0) as _rav_id
    FROM table_columns;
    `)
  }

  async updateFkeysMetadata(t1Name: string, t2Name: string, X: string[], Y: string[]) {
    /**
     * Skip updating if we are trying to include information about the metadata tables
     */
    if (t1Name.includes("tables_marktable") || t1Name.includes("columns_marktable") || t1Name.includes("fkeys_marktable")) {
      return Promise.resolve()
    }

    if (t2Name.includes("tables_marktable") || t2Name.includes("columns_marktable") || t2Name.includes("fkeys_marktable")) {
      return Promise.resolve()
    }

    console.log("t1Name", t1Name)
    console.log("t2Name", t2Name)
    console.log("X", X)
    console.log("Y", Y)

    let x = "(" + X.map(elem => `'${elem}'`).join(",") + ")"
    let y = "(" + Y.map(elem => `'${elem}'`).join(",") + ")"

    await this.conn.exec(
      `INSERT INTO fkeys (id, tid1, col1, tid2, col2, _rav_id)
      SELECT
      row_number() OVER () + COALESCE((SELECT MAX(id) FROM fkeys), 0) as id,
      c1.tid as tid1,
      c1.colname as col1,
      c2.tid as tid2,
      c2.colname as col2,
      row_number() OVER () + COALESCE((SELECT MAX(id) FROM fkeys), 0) as _rav_id
      FROM columns c1, tables t1, columns c2, tables t2
      WHERE c1.tid = t1.id AND t1.table_name = '${t1Name}'
      AND c2.tid = t2.id AND t2.table_name= '${t2Name}'
      AND c1.colname in ${x} AND c2.colname in ${y}`
    )

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

    await this.updateMetadata(internalname)
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

    if (!internalname.includes("tables_marktable") && !internalname.includes("columns_marktable") && !internalname.includes("fkeys_marktable")) {
      await this.updateMetadata(internalname)
    }
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
        /**
         * honestly unsure about whether to include this line
         * Ideally we always want to go from N to 1, but this line goes from 1 to N, which can lead to row explosion
         */
        //edges[t1.internalname].push({ src: t1.internalname, dst: t2.internalname, c })
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

    /**
     * Start is set to the side of the FKConstraint that is not source
     */
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
  async decompose(tablename, X:string|string[], Y:string|string[], newname1, newname2) {
    X = isArray(X)? X : [X];
    Y = isArray(Y)? Y : [Y];
    let t = this.table(tablename);
    let t1 = await t.project(t.schema.except(Y).asObject(), newname1)
    let t2 = await t.project(new Schema(R.concat(X,Y)).asObject(), newname2)
    t2.keys(X)

    // NOTE; duckdb doesn't allow adding FK references to tables
    let c = new FKConstraint({t1, X, t2, Y:X})
    this.setTable(t1)
    this.setTable(t2);
    this.addConstraint(c);
    await this.updateFkeysMetadata(t1.internalname, t2.internalname, X, Y)
    return [t1, t2]
  }

  // normalize into dimension and fact tables
  // let A be the schema of base table
  //   dim(dim_id, attrs)
  //   fact(A-attrs, dim_id)
  async normalize(tablename, attrs:string|string[], dimname=null, factname=null) {
    
    attrs = isArray(attrs)? attrs : [attrs];
    dimname ??= `${tablename}_dim`;
    factname ??= `${tablename}_fact`;

    let t = this.table(tablename);
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
    await this.updateFkeysMetadata(t.internalname, newFact.internalname, [IDNAME], [IDNAME])
    await this.updateFkeysMetadata(newFact.internalname, newDim.internalname, [fkattr], [IDNAME])

    /**
     * If there exists constraints from base table with attrs that were normalized out,
     * we need to create constraints from newDim to the table that is related to base table
     * 
     * We do not need do this for newFact because newFact does not contain attrs
     */
    for (const [cname, constraint] of Object.entries(this.constraints)) {
      if (constraint.t2.internalname == tablename) {
        if (constraint.Y.every(col => attrs.includes(col))) {
          let c = new FKConstraint({t1: constraint.t1, X: constraint.X, t2: newDim, Y: constraint.Y})
          this.addConstraint(c)
          await this.updateFkeysMetadata(c.t1.internalname, c.t2.internalname, c.X, c.Y)
        }
      } else if (constraint.t1.internalname == tablename) {
        if (constraint.X.every(col => attrs.includes(col))) {
          let c = new FKConstraint({t1: newDim, X: constraint.X, t2: constraint.t2, Y: constraint.Y})
          this.addConstraint(c)
          await this.updateFkeysMetadata(c.t1.internalname, c.t2.internalname, c.X, c.Y)
        }
      }
    }

  }


  async normalizeMany(tablename, list_of_attrs:string[][], { dimnames, factname}={}) {
    dimnames ??= list_of_attrs.map((a) => `${tablename}_${a}`)
    factname ??= `${tablename}_fact`

    let t = this.table(tablename)
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
      await this.updateFkeysMetadata(c.t1.internalname, c.t2.internalname, c.X, c.Y)
    }

    this.addConstraint(new FKConstraint({t1: t, X: [IDNAME], t2: newFact, Y: [IDNAME]}))
    await this.updateFkeysMetadata(t.internalname, newFact.internalname, [IDNAME], [IDNAME])
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
  async join({t1, t2}, selectCols: {t1Cols: {renameAs: string, col: string}[], t2Cols: {renameAs: string, col: string}[]}, joinKeys: string[][], newTableName: string) {
    let table1 = this.table(t1)
    let table2 = this.table(t2)

    if (!table1) {
      throw new Error(`t1 ${t1} does not exist`)
    }

    if (!table2) {
      throw new Error(`t2 ${t2} does not exist`)
    }

    let query = new Query()
    query = query.distinct()

    let {t1Cols, t2Cols} = selectCols

    t1Cols.forEach((obj,i) => {
      let {renameAs, col} = obj
      query = query.select({[renameAs]: column(table1.internalname, col)})
    })

    t2Cols.forEach((obj, i) => {
      let {renameAs, col} = obj
      query = query.select({[renameAs]: column(table2.internalname, col)})
    })

    joinKeys.forEach((join) => {
      let left = join[0]
      let right = join[1]

      query = query.where(eq(column(table1.internalname, left), column(table2.internalname, right)))
    })

    query = query.select({[IDNAME]: idexpr})
    query = query.from(table1.internalname)
    query = query.from(table2.internalname)

    let newTable = await this.fromSql(query, newTableName)
    newTable.name(newTableName)
    newTable.keys(IDNAME)
    this.setTable(newTable)

    for (let i = 0; i < t1Cols.length; i++) {
      let {renameAs, col} = t1Cols[i]
      let c = new FKConstraint({t1: table1, X: [col], t2: newTable, Y: [renameAs]})
      this.addConstraint(c)
      await this.updateFkeysMetadata(c.t1.internalname, c.t2.internalname, c.X, c.Y)
    }

    for (let i = 0; i < t2Cols.length; i++) {
      let {renameAs, col} = t2Cols[i]
      let c = new FKConstraint({t1: table2, X: [col], t2: newTable, Y: [renameAs]})
      this.addConstraint(c)
      await this.updateFkeysMetadata(c.t1.internalname, c.t2.internalname, c.X, c.Y)
    }
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


