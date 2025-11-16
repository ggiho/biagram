/**
 * PostgreSQL database introspection
 *
 * Connects to a PostgreSQL database and extracts schema information including
 * tables, columns, foreign keys, indexes, and constraints.
 */

import { Pool } from 'pg';
import type {
  DatabaseConnection,
  IntrospectedDatabase,
  IntrospectedSchema,
  IntrospectedTable,
  IntrospectedColumn,
  IntrospectedForeignKey,
  IntrospectedIndex,
} from './types';

/**
 * System schemas to exclude from introspection
 */
const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];

/**
 * Create PostgreSQL connection pool
 */
export async function createPostgreSQLPool(config: DatabaseConnection) {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  return pool;
}

/**
 * Introspect PostgreSQL database
 */
export async function introspectPostgreSQL(
  config: DatabaseConnection
): Promise<IntrospectedDatabase> {
  const pool = await createPostgreSQLPool(config);

  try {
    // Get PostgreSQL version
    const versionResult = await pool.query('SELECT version()');
    const version = versionResult.rows[0].version;

    // Get schemas to introspect
    const schemasToIntrospect = await getSchemasToIntrospect(pool, config.schemaFilter);

    // Introspect each schema
    const schemas: IntrospectedSchema[] = [];
    for (const schemaName of schemasToIntrospect) {
      const schema = await introspectSchema(pool, schemaName);
      schemas.push(schema);
    }

    return {
      schemas,
      version,
      databaseType: 'postgresql',
    };
  } finally {
    await pool.end();
  }
}

/**
 * Get list of schemas to introspect
 */
async function getSchemasToIntrospect(
  pool: Pool,
  schemaFilter?: string[]
): Promise<string[]> {
  const result = await pool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN (${SYSTEM_SCHEMAS.map(s => `'${s}'`).join(',')})
      AND schema_name NOT LIKE 'pg_%'
    ORDER BY schema_name
  `);

  let schemas = result.rows.map(row => row.schema_name);

  // Apply schema filter if provided
  if (schemaFilter && schemaFilter.length > 0) {
    schemas = schemas.filter(s => schemaFilter.includes(s));
  }

  return schemas;
}

/**
 * Introspect a single schema
 */
async function introspectSchema(
  pool: Pool,
  schemaName: string
): Promise<IntrospectedSchema> {
  // Get all tables in schema
  const tableResult = await pool.query(
    `
    SELECT
      c.relname AS table_name,
      obj_description(c.oid) AS table_comment
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relkind = 'r'
    ORDER BY c.relname
    `,
    [schemaName]
  );

  const tables: IntrospectedTable[] = [];

  for (const tableRow of tableResult.rows) {
    const table = await introspectTable(
      pool,
      schemaName,
      tableRow.table_name,
      tableRow.table_comment
    );
    tables.push(table);
  }

  return {
    name: schemaName,
    tables,
  };
}

/**
 * Introspect a single table
 */
async function introspectTable(
  pool: Pool,
  schemaName: string,
  tableName: string,
  tableComment?: string
): Promise<IntrospectedTable> {
  // Get columns
  const columns = await getColumns(pool, schemaName, tableName);

  // Get primary keys
  const primaryKeys = await getPrimaryKeys(pool, schemaName, tableName);

  // Get foreign keys
  const foreignKeys = await getForeignKeys(pool, schemaName, tableName);

  // Get indexes
  const indexes = await getIndexes(pool, schemaName, tableName);

  // Get unique constraints
  const uniqueConstraints = await getUniqueConstraints(pool, schemaName, tableName);

  return {
    schema: schemaName,
    name: tableName,
    comment: tableComment || undefined,
    columns,
    primaryKeys,
    foreignKeys,
    indexes,
    uniqueConstraints,
  };
}

/**
 * Get columns for a table
 */
async function getColumns(
  pool: Pool,
  schemaName: string,
  tableName: string
): Promise<IntrospectedColumn[]> {
  const result = await pool.query(
    `
    SELECT
      a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS column_type,
      NOT a.attnotnull AS is_nullable,
      pg_get_expr(d.adbin, d.adrelid) AS column_default,
      col_description(a.attrelid, a.attnum) AS column_comment,
      a.attidentity AS identity_type,
      CASE
        WHEN a.atttypid = ANY ('{int,int8,int2}'::regtype[])
          AND EXISTS (
            SELECT 1 FROM pg_attrdef ad
            WHERE ad.adrelid = a.attrelid
              AND ad.adnum = a.attnum
              AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
          )
        THEN true
        ELSE false
      END AS is_serial,
      information_schema._pg_numeric_precision(
        information_schema._pg_truetypid(a.*, t.*),
        information_schema._pg_truetypmod(a.*, t.*)
      ) AS numeric_precision,
      information_schema._pg_numeric_scale(
        information_schema._pg_truetypid(a.*, t.*),
        information_schema._pg_truetypmod(a.*, t.*)
      ) AS numeric_scale
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = $1
      AND c.relname = $2
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
    `,
    [schemaName, tableName]
  );

  return result.rows.map(row => ({
    name: row.column_name,
    type: row.column_type,
    nullable: row.is_nullable,
    defaultValue: row.column_default,
    comment: row.column_comment || undefined,
    autoIncrement: row.identity_type !== '' || row.is_serial,
    precision: row.numeric_precision || undefined,
    scale: row.numeric_scale || undefined,
  }));
}

/**
 * Get primary key columns
 */
async function getPrimaryKeys(
  pool: Pool,
  schemaName: string,
  tableName: string
): Promise<string[]> {
  const result = await pool.query(
    `
    SELECT a.attname AS column_name
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
    WHERE n.nspname = $1
      AND c.relname = $2
      AND con.contype = 'p'
    ORDER BY array_position(con.conkey, a.attnum)
    `,
    [schemaName, tableName]
  );

  return result.rows.map(row => row.column_name);
}

/**
 * Get foreign keys
 */
async function getForeignKeys(
  pool: Pool,
  schemaName: string,
  tableName: string
): Promise<IntrospectedForeignKey[]> {
  const result = await pool.query(
    `
    SELECT
      con.conname AS constraint_name,
      a.attname AS column_name,
      fn.nspname AS referenced_schema,
      fc.relname AS referenced_table,
      fa.attname AS referenced_column,
      con.confdeltype AS delete_rule,
      con.confupdtype AS update_rule
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1]
    JOIN pg_catalog.pg_class fc ON fc.oid = con.confrelid
    JOIN pg_catalog.pg_namespace fn ON fn.oid = fc.relnamespace
    JOIN pg_catalog.pg_attribute fa ON fa.attrelid = fc.oid AND fa.attnum = con.confkey[1]
    WHERE n.nspname = $1
      AND c.relname = $2
      AND con.contype = 'f'
    ORDER BY con.conname
    `,
    [schemaName, tableName]
  );

  const actionMap: Record<string, 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' | 'SET DEFAULT'> = {
    'a': 'NO ACTION',
    'r': 'RESTRICT',
    'c': 'CASCADE',
    'n': 'SET NULL',
    'd': 'SET DEFAULT',
  };

  return result.rows.map(row => ({
    name: row.constraint_name,
    column: row.column_name,
    referencedTable: row.referenced_table,
    referencedColumn: row.referenced_column,
    referencedSchema: row.referenced_schema !== schemaName
      ? row.referenced_schema
      : undefined,
    onDelete: actionMap[row.delete_rule] || 'NO ACTION',
    onUpdate: actionMap[row.update_rule] || 'NO ACTION',
  }));
}

/**
 * Get indexes
 */
async function getIndexes(
  pool: Pool,
  schemaName: string,
  tableName: string
): Promise<IntrospectedIndex[]> {
  const result = await pool.query(
    `
    SELECT
      i.relname AS index_name,
      idx.indisunique AS is_unique,
      idx.indisprimary AS is_primary,
      array_agg(a.attname ORDER BY array_position(idx.indkey, a.attnum)) AS columns
    FROM pg_catalog.pg_index idx
    JOIN pg_catalog.pg_class i ON i.oid = idx.indexrelid
    JOIN pg_catalog.pg_class c ON c.oid = idx.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(idx.indkey)
    WHERE n.nspname = $1
      AND c.relname = $2
    GROUP BY i.relname, idx.indisunique, idx.indisprimary
    ORDER BY i.relname
    `,
    [schemaName, tableName]
  );

  return result.rows.map(row => ({
    name: row.index_name,
    columns: row.columns,
    unique: row.is_unique,
    primary: row.is_primary,
  }));
}

/**
 * Get unique constraints
 */
async function getUniqueConstraints(
  pool: Pool,
  schemaName: string,
  tableName: string
): Promise<string[][]> {
  const result = await pool.query(
    `
    SELECT
      con.conname AS constraint_name,
      array_agg(a.attname ORDER BY array_position(con.conkey, a.attnum)) AS columns
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
    WHERE n.nspname = $1
      AND c.relname = $2
      AND con.contype = 'u'
    GROUP BY con.conname
    ORDER BY con.conname
    `,
    [schemaName, tableName]
  );

  return result.rows.map(row => row.columns);
}
