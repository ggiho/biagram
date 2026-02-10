/**
 * MySQL database introspection
 *
 * Connects to a MySQL database and extracts schema information including
 * tables, columns, foreign keys, indexes, and constraints.
 */

import mysql from 'mysql2/promise';
import type {
  DatabaseConnection,
  IntrospectedDatabase,
  IntrospectedSchema,
  IntrospectedTable,
  IntrospectedColumn,
  IntrospectedForeignKey,
  IntrospectedIndex,
  IntrospectedPartition,
} from './types';

/**
 * System schemas to exclude from introspection
 */
const SYSTEM_SCHEMAS = ['mysql', 'information_schema', 'performance_schema', 'sys'];

/**
 * Create MySQL connection
 */
export async function createMySQLConnection(config: DatabaseConnection) {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? {} : undefined,
  });

  return connection;
}

/**
 * Introspect MySQL database
 */
export async function introspectMySQL(
  config: DatabaseConnection
): Promise<IntrospectedDatabase> {
  const connection = await createMySQLConnection(config);

  try {
    // Get MySQL version
    const [versionRows] = await connection.execute('SELECT VERSION() as version');
    const version = (versionRows as any)[0].version;

    // Get schemas to introspect
    const schemasToIntrospect = await getSchemasToIntrospect(connection, config.schemaFilter);

    // Introspect each schema
    const schemas: IntrospectedSchema[] = [];
    for (const schemaName of schemasToIntrospect) {
      const schema = await introspectSchema(connection, schemaName);
      schemas.push(schema);
    }

    return {
      schemas,
      version,
      databaseType: 'mysql',
    };
  } finally {
    await connection.end();
  }
}

/**
 * Get list of schemas to introspect
 */
async function getSchemasToIntrospect(
  connection: mysql.Connection,
  schemaFilter?: string[]
): Promise<string[]> {
  const [rows] = await connection.execute(`
    SELECT SCHEMA_NAME
    FROM information_schema.SCHEMATA
    WHERE SCHEMA_NAME NOT IN (${SYSTEM_SCHEMAS.map(s => `'${s}'`).join(',')})
    ORDER BY SCHEMA_NAME
  `);

  let schemas = (rows as any[]).map(row => row.SCHEMA_NAME);

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
  connection: mysql.Connection,
  schemaName: string
): Promise<IntrospectedSchema> {
  // Get all tables in schema
  const [tableRows] = await connection.execute(
    `
    SELECT
      TABLE_NAME,
      TABLE_COMMENT
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ?
      AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
    `,
    [schemaName]
  );

  const tables: IntrospectedTable[] = [];

  for (const tableRow of tableRows as any[]) {
    const table = await introspectTable(connection, schemaName, tableRow.TABLE_NAME, tableRow.TABLE_COMMENT);
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
  connection: mysql.Connection,
  schemaName: string,
  tableName: string,
  tableComment?: string
): Promise<IntrospectedTable> {
  // Get columns
  const columns = await getColumns(connection, schemaName, tableName);

  // Get primary keys
  const primaryKeys = await getPrimaryKeys(connection, schemaName, tableName);

  // Get foreign keys
  const foreignKeys = await getForeignKeys(connection, schemaName, tableName);

  // Get indexes
  const indexes = await getIndexes(connection, schemaName, tableName);

  // Get unique constraints
  const uniqueConstraints = await getUniqueConstraints(connection, schemaName, tableName);

  // Get partitions
  const partitions = await getPartitions(connection, schemaName, tableName);

  return {
    schema: schemaName,
    name: tableName,
    comment: tableComment || undefined,
    columns,
    primaryKeys,
    foreignKeys,
    indexes,
    uniqueConstraints,
    partitions: partitions.length > 0 ? partitions : undefined,
  };
}

/**
 * Get columns for a table
 */
async function getColumns(
  connection: mysql.Connection,
  schemaName: string,
  tableName: string
): Promise<IntrospectedColumn[]> {
  const [rows] = await connection.execute(
    `
    SELECT
      COLUMN_NAME,
      COLUMN_TYPE,
      IS_NULLABLE,
      COLUMN_DEFAULT,
      COLUMN_COMMENT,
      EXTRA,
      NUMERIC_PRECISION,
      NUMERIC_SCALE
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
    `,
    [schemaName, tableName]
  );

  return (rows as any[]).map(row => ({
    name: row.COLUMN_NAME,
    type: row.COLUMN_TYPE,
    nullable: row.IS_NULLABLE === 'YES',
    defaultValue: row.COLUMN_DEFAULT,
    comment: row.COLUMN_COMMENT || undefined,
    autoIncrement: row.EXTRA?.includes('auto_increment') || false,
    unsigned: row.COLUMN_TYPE?.includes('unsigned') || false,
    precision: row.NUMERIC_PRECISION || undefined,
    scale: row.NUMERIC_SCALE || undefined,
  }));
}

/**
 * Get primary key columns
 */
async function getPrimaryKeys(
  connection: mysql.Connection,
  schemaName: string,
  tableName: string
): Promise<string[]> {
  const [rows] = await connection.execute(
    `
    SELECT COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
      AND CONSTRAINT_NAME = 'PRIMARY'
    ORDER BY ORDINAL_POSITION
    `,
    [schemaName, tableName]
  );

  return (rows as any[]).map(row => row.COLUMN_NAME);
}

/**
 * Get foreign keys
 */
async function getForeignKeys(
  connection: mysql.Connection,
  schemaName: string,
  tableName: string
): Promise<IntrospectedForeignKey[]> {
  const [rows] = await connection.execute(
    `
    SELECT
      KCU.CONSTRAINT_NAME,
      KCU.COLUMN_NAME,
      KCU.REFERENCED_TABLE_SCHEMA,
      KCU.REFERENCED_TABLE_NAME,
      KCU.REFERENCED_COLUMN_NAME,
      RC.DELETE_RULE,
      RC.UPDATE_RULE
    FROM information_schema.KEY_COLUMN_USAGE KCU
    JOIN information_schema.REFERENTIAL_CONSTRAINTS RC
      ON KCU.CONSTRAINT_NAME = RC.CONSTRAINT_NAME
      AND KCU.CONSTRAINT_SCHEMA = RC.CONSTRAINT_SCHEMA
    WHERE KCU.TABLE_SCHEMA = ?
      AND KCU.TABLE_NAME = ?
      AND KCU.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY KCU.CONSTRAINT_NAME, KCU.ORDINAL_POSITION
    `,
    [schemaName, tableName]
  );

  return (rows as any[]).map(row => ({
    name: row.CONSTRAINT_NAME,
    column: row.COLUMN_NAME,
    referencedTable: row.REFERENCED_TABLE_NAME,
    referencedColumn: row.REFERENCED_COLUMN_NAME,
    referencedSchema: row.REFERENCED_TABLE_SCHEMA !== schemaName
      ? row.REFERENCED_TABLE_SCHEMA
      : undefined,
    onDelete: row.DELETE_RULE as any,
    onUpdate: row.UPDATE_RULE as any,
  }));
}

/**
 * Get indexes
 */
async function getIndexes(
  connection: mysql.Connection,
  schemaName: string,
  tableName: string
): Promise<IntrospectedIndex[]> {
  const [rows] = await connection.execute(
    `
    SELECT
      INDEX_NAME,
      NON_UNIQUE,
      COLUMN_NAME,
      SEQ_IN_INDEX
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
    ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `,
    [schemaName, tableName]
  );

  // Group by index name
  const indexMap = new Map<string, IntrospectedIndex>();

  for (const row of rows as any[]) {
    if (!indexMap.has(row.INDEX_NAME)) {
      indexMap.set(row.INDEX_NAME, {
        name: row.INDEX_NAME,
        columns: [],
        unique: row.NON_UNIQUE === 0,
        primary: row.INDEX_NAME === 'PRIMARY',
      });
    }

    indexMap.get(row.INDEX_NAME)!.columns.push(row.COLUMN_NAME);
  }

  return Array.from(indexMap.values());
}

/**
 * Get unique constraints
 */
async function getUniqueConstraints(
  connection: mysql.Connection,
  schemaName: string,
  tableName: string
): Promise<string[][]> {
  const [rows] = await connection.execute(
    `
    SELECT
      CONSTRAINT_NAME,
      COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
      AND CONSTRAINT_NAME != 'PRIMARY'
      AND CONSTRAINT_NAME IN (
        SELECT CONSTRAINT_NAME
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME = ?
          AND CONSTRAINT_TYPE = 'UNIQUE'
      )
    ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
    `,
    [schemaName, tableName, schemaName, tableName]
  );

  // Group by constraint name
  const constraintMap = new Map<string, string[]>();

  for (const row of rows as any[]) {
    if (!constraintMap.has(row.CONSTRAINT_NAME)) {
      constraintMap.set(row.CONSTRAINT_NAME, []);
    }
    constraintMap.get(row.CONSTRAINT_NAME)!.push(row.COLUMN_NAME);
  }

  return Array.from(constraintMap.values());
}

/**
 * Get partitions for a table
 */
async function getPartitions(
  connection: mysql.Connection,
  schemaName: string,
  tableName: string
): Promise<IntrospectedPartition[]> {
  const [rows] = await connection.execute(
    `
    SELECT
      PARTITION_NAME,
      PARTITION_METHOD,
      PARTITION_EXPRESSION,
      PARTITION_DESCRIPTION,
      PARTITION_ORDINAL_POSITION,
      SUBPARTITION_METHOD,
      SUBPARTITION_EXPRESSION
    FROM information_schema.PARTITIONS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
      AND PARTITION_NAME IS NOT NULL
    ORDER BY PARTITION_ORDINAL_POSITION
    `,
    [schemaName, tableName]
  );

  return (rows as any[]).map(row => ({
    name: row.PARTITION_NAME,
    method: row.PARTITION_METHOD as IntrospectedPartition['method'],
    expression: row.PARTITION_EXPRESSION || undefined,
    description: row.PARTITION_DESCRIPTION || undefined,
    ordinalPosition: row.PARTITION_ORDINAL_POSITION,
    subpartitionMethod: row.SUBPARTITION_METHOD || undefined,
    subpartitionExpression: row.SUBPARTITION_EXPRESSION || undefined,
  }));
}
