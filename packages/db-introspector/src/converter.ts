/**
 * Convert introspected database schema to DBML format
 *
 * Takes IntrospectedDatabase and generates DBML syntax that can be
 * parsed by the DBML parser.
 */

import type {
  IntrospectedDatabase,
  IntrospectedSchema,
  IntrospectedTable,
  IntrospectedColumn,
  IntrospectedForeignKey,
} from './types';
import { mapTypeToDBML, formatDBMLType } from './type-mapping';

/**
 * Convert IntrospectedDatabase to DBML string
 */
export function convertToDBML(database: IntrospectedDatabase): string {
  const dbmlParts: string[] = [];

  // Add database comment with version info
  dbmlParts.push(`// Database: ${database.databaseType}`);
  dbmlParts.push(`// Version: ${database.version}`);
  dbmlParts.push(`// Generated at: ${new Date().toISOString()}`);
  dbmlParts.push('');

  // Convert each schema
  for (const schema of database.schemas) {
    const schemaDBML = convertSchema(schema, database.databaseType);
    if (schemaDBML) {
      dbmlParts.push(schemaDBML);
      dbmlParts.push('');
    }
  }

  return dbmlParts.join('\n').trim();
}

/**
 * Convert a schema to DBML
 */
function convertSchema(
  schema: IntrospectedSchema,
  databaseType: 'mysql' | 'postgresql'
): string {
  const dbmlParts: string[] = [];

  // Add schema comment if not default
  if (schema.name !== 'public' && schema.name !== 'dbo') {
    dbmlParts.push(`// Schema: ${schema.name}`);
  }

  // Convert tables
  for (const table of schema.tables) {
    const tableDBML = convertTable(table, databaseType);
    dbmlParts.push(tableDBML);
    dbmlParts.push('');
  }

  // Convert relationships (foreign keys)
  const relationships = extractRelationships(schema);
  if (relationships.length > 0) {
    dbmlParts.push('// Relationships');
    for (const rel of relationships) {
      dbmlParts.push(rel);
    }
  }

  return dbmlParts.join('\n');
}

/**
 * Convert a table to DBML
 */
function convertTable(
  table: IntrospectedTable,
  databaseType: 'mysql' | 'postgresql'
): string {
  const lines: string[] = [];

  // Table declaration with schema prefix if not default
  const tableIdentifier =
    table.schema !== 'public' && table.schema !== 'dbo'
      ? `${table.schema}.${table.name}`
      : table.name;

  lines.push(`Table ${tableIdentifier} {`);

  // Add columns
  for (const column of table.columns) {
    const columnLine = convertColumn(column, table.primaryKeys, databaseType);
    lines.push(`  ${columnLine}`);
  }

  // Add table-level indexes
  if (table.indexes && table.indexes.length > 0) {
    lines.push('');
    for (const index of table.indexes) {
      // Skip primary key indexes as they're handled in column definitions
      if (index.primary) continue;

      const indexLine = convertIndex(index);
      lines.push(`  ${indexLine}`);
    }
  }

  // Add table comment
  if (table.comment) {
    lines.push('');
    lines.push(`  Note: '${escapeString(table.comment)}'`);
  }

  lines.push('}');

  return lines.join('\n');
}

/**
 * Convert a column to DBML
 */
function convertColumn(
  column: IntrospectedColumn,
  primaryKeys: string[],
  databaseType: 'mysql' | 'postgresql'
): string {
  // Map type to DBML
  const dbmlType = mapTypeToDBML(column.type, databaseType);
  const formattedType = formatDBMLType(column.type, dbmlType, column.precision, column.scale);

  // Build column definition
  const parts: string[] = [column.name, formattedType];

  // Add constraints
  const constraints: string[] = [];

  if (primaryKeys.includes(column.name)) {
    constraints.push('pk');
  }

  if (!column.nullable) {
    constraints.push('not null');
  }

  if (column.autoIncrement) {
    constraints.push('increment');
  }

  if (column.defaultValue !== undefined && column.defaultValue !== null) {
    // Clean up default value
    let defaultVal = String(column.defaultValue);

    // Remove PostgreSQL type casts
    defaultVal = defaultVal.replace(/::[a-z]+/gi, '');

    // Handle special values
    if (
      defaultVal.toLowerCase().includes('nextval') ||
      defaultVal.toLowerCase().includes('sequence')
    ) {
      // Skip sequence-based defaults (handled by increment)
    } else if (
      defaultVal.toLowerCase() === 'current_timestamp' ||
      defaultVal.toLowerCase() === 'now()'
    ) {
      constraints.push('default: CURRENT_TIMESTAMP');
    } else if (defaultVal.match(/^[0-9]+$/)) {
      // Numeric default
      constraints.push(`default: ${defaultVal}`);
    } else if (defaultVal === 'true' || defaultVal === 'false') {
      // Boolean default
      constraints.push(`default: ${defaultVal}`);
    } else {
      // String default
      const cleanVal = defaultVal.replace(/^'|'$/g, '');
      constraints.push(`default: '${escapeString(cleanVal)}'`);
    }
  }

  if (column.comment) {
    constraints.push(`note: '${escapeString(column.comment)}'`);
  }

  // Combine parts
  if (constraints.length > 0) {
    parts.push(`[${constraints.join(', ')}]`);
  }

  return parts.join(' ');
}

/**
 * Convert an index to DBML
 */
function convertIndex(index: { name: string; columns: string[]; unique: boolean }): string {
  // DBML syntax:
  // - Single column: name [unique, name: "index_name"]
  // - Multiple columns: (col1, col2) [unique, name: "index_name"]
  let columns: string;
  if (index.columns.length === 1) {
    columns = index.columns[0] || '';
  } else {
    columns = `(${index.columns.join(', ')})`;
  }

  // Build attributes array
  const attrs: string[] = [];
  if (index.unique) {
    attrs.push('unique');
  }
  if (index.name) {
    attrs.push(`name: '${index.name}'`);
  }

  if (attrs.length > 0) {
    return `indexes {
    ${columns} [${attrs.join(', ')}]
  }`;
  } else {
    return `indexes {
    ${columns}
  }`;
  }
}

/**
 * Extract relationships from foreign keys
 */
function extractRelationships(schema: IntrospectedSchema): string[] {
  const relationships: string[] = [];

  for (const table of schema.tables) {
    for (const fk of table.foreignKeys) {
      const fromTable =
        table.schema !== 'public' && table.schema !== 'dbo'
          ? `${table.schema}.${table.name}`
          : table.name;

      const toTable = fk.referencedSchema
        ? `${fk.referencedSchema}.${fk.referencedTable}`
        : fk.referencedTable;

      // Determine relationship type (many-to-one is most common)
      const relType = '>';

      // Build relationship with actions
      const actions: string[] = [];

      if (fk.onDelete && fk.onDelete !== 'NO ACTION') {
        actions.push(`delete: ${fk.onDelete.toLowerCase().replace(' ', '_')}`);
      }

      if (fk.onUpdate && fk.onUpdate !== 'NO ACTION') {
        actions.push(`update: ${fk.onUpdate.toLowerCase().replace(' ', '_')}`);
      }

      const actionsStr = actions.length > 0 ? ` [${actions.join(', ')}]` : '';

      relationships.push(
        `Ref: ${fromTable}.${fk.column} ${relType} ${toTable}.${fk.referencedColumn}${actionsStr}`
      );
    }
  }

  return relationships;
}

/**
 * Escape special characters in strings
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Generate statistics about the conversion
 */
export function getConversionStats(database: IntrospectedDatabase) {
  let tableCount = 0;
  let relationshipCount = 0;

  for (const schema of database.schemas) {
    tableCount += schema.tables.length;

    for (const table of schema.tables) {
      relationshipCount += table.foreignKeys.length;
    }
  }

  return {
    schemaCount: database.schemas.length,
    tableCount,
    relationshipCount,
  };
}
