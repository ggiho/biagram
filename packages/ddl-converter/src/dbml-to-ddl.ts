// Type definitions (avoid import issues)
interface DatabaseSchema {
  id: string;
  name: string;
  tables: Table[];
  relationships: Relationship[];
  enums?: Enum[];
}

interface Table {
  id: string;
  name: string;
  schema?: string;
  columns: Column[];
  note?: string;
  indexes?: Index[];
}

interface Column {
  id: string;
  name: string;
  type: any;
  nullable?: boolean;
  defaultValue?: any;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  unique?: boolean;
  note?: string;
}

interface Relationship {
  id?: string;
  name?: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

interface Enum {
  id: string;
  name: string;
  values: Array<{ name: string; note?: string }>;
}

interface Index {
  name?: string;
  columns: string[];
  unique?: boolean;
  type?: string;
}

/**
 * Convert DBML schema to DDL (SQL)
 */
export function convertDBMLtoDDL(
  schema: DatabaseSchema,
  dialect: 'mysql' | 'postgresql' = 'mysql',
  includeForeignKeys: boolean = true
): string {
  const lines: string[] = [];
  
  // Add header comment
  lines.push(`-- Generated from DBML`);
  lines.push(`-- Dialect: ${dialect.toUpperCase()}`);
  lines.push(`-- Generated at: ${new Date().toISOString()}`);
  lines.push('');

  // Convert ENUMs (PostgreSQL only)
  if (dialect === 'postgresql' && schema.enums?.length) {
    lines.push('-- ENUMS');
    for (const enumDef of schema.enums) {
      lines.push(`CREATE TYPE ${enumDef.name} AS ENUM (`);
      const values = enumDef.values.map(v => `  '${v.name}'`);
      lines.push(values.join(',\n'));
      lines.push(');');
      lines.push('');
    }
  }

  // Convert TABLES
  lines.push('-- TABLES');
  for (const table of schema.tables) {
    lines.push(...convertTable(table, dialect, schema.enums || []));
    lines.push('');
  }

  // Convert FOREIGN KEY CONSTRAINTS (if enabled)
  if (includeForeignKeys && schema.relationships?.length) {
    lines.push('-- FOREIGN KEY CONSTRAINTS');
    for (const rel of schema.relationships) {
      const constraint = convertRelationship(rel, dialect);
      if (constraint) {
        lines.push(constraint);
      }
    }
    lines.push('');
  } else if (!includeForeignKeys && schema.relationships?.length) {
    lines.push('-- FOREIGN KEY CONSTRAINTS (excluded by export option)');
    lines.push('-- To maintain referential integrity, consider adding these constraints manually:');
    for (const rel of schema.relationships) {
      lines.push(`-- ${rel.fromTable}.${rel.fromColumn} -> ${rel.toTable}.${rel.toColumn}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Convert a table to CREATE TABLE statement
 */
function convertTable(table: Table, dialect: 'mysql' | 'postgresql', enums: Enum[]): string[] {
  const lines: string[] = [];
  
  // Handle schema prefix if present
  const tableName = table.schema 
    ? `${quoteIdentifier(table.schema, dialect)}.${quoteIdentifier(table.name, dialect)}`
    : quoteIdentifier(table.name, dialect);

  // Add table comment if present
  if (table.note) {
    lines.push(`-- ${table.note}`);
  }

  lines.push(`CREATE TABLE ${tableName} (`);
  
  const columnLines: string[] = [];
  const primaryKeys: string[] = [];

  // Convert columns
  for (const column of table.columns) {
    const columnDef = convertColumn(column, dialect, enums);
    columnLines.push(`  ${columnDef}`);
    
    if (column.primaryKey) {
      primaryKeys.push(quoteIdentifier(column.name, dialect));
    }
  }

  // Add primary key constraint
  if (primaryKeys.length > 0) {
    columnLines.push(`  PRIMARY KEY (${primaryKeys.join(', ')})`);
  }

  // Skip indexes for now since they're not in the Table type
  // TODO: Add index support when Table type includes indexes

  lines.push(columnLines.join(',\n'));
  
  // Add table comment inline for MySQL
  if (table.note && dialect === 'mysql') {
    lines.push(`) COMMENT = '${escapeString(table.note)}';`);
  } else if (table.note && dialect === 'postgresql') {
    lines.push(');');
    lines.push(`COMMENT ON TABLE ${tableName} IS '${escapeString(table.note)}';`);
  } else {
    lines.push(');');
  }

  // Add column comments for PostgreSQL (MySQL handles them inline)
  if (dialect === 'postgresql') {
    for (const column of table.columns) {
      if (column.note) {
        lines.push(`COMMENT ON COLUMN ${tableName}.${quoteIdentifier(column.name, dialect)} IS '${escapeString(column.note)}';`);
      }
    }
  }

  return lines;
}

/**
 * Convert a column to column definition
 */
function convertColumn(column: Column, dialect: 'mysql' | 'postgresql', enums: Enum[]): string {
  const parts: string[] = [];
  
  // Column name
  parts.push(quoteIdentifier(column.name, dialect));
  
  // Data type
  const dataType = convertDataType(column.type, dialect, enums);
  parts.push(dataType);
  
  // NULL/NOT NULL
  if (column.nullable === false) {
    parts.push('NOT NULL');
  }
  
  // DEFAULT value
  if (column.defaultValue !== undefined && column.defaultValue !== null) {
    const defaultVal = formatDefaultValue(column.defaultValue, column.type, dialect);
    parts.push(`DEFAULT ${defaultVal}`);
  }
  
  // AUTO_INCREMENT / SERIAL
  if (column.autoIncrement) {
    if (dialect === 'mysql') {
      parts.push('AUTO_INCREMENT');
    }
    // PostgreSQL uses SERIAL/BIGSERIAL type instead
  }
  
  // UNIQUE
  if (column.unique) {
    parts.push('UNIQUE');
  }
  
  // Column comment
  if (column.note) {
    if (dialect === 'mysql') {
      parts.push(`COMMENT '${escapeString(column.note)}'`);
    }
    // PostgreSQL handles column comments separately
  }
  
  return parts.join(' ');
}

/**
 * Convert data type from DBML to SQL
 */
function convertDataType(type: any, dialect: 'mysql' | 'postgresql', enums: Enum[]): string {
  // Handle string type (e.g., "varchar(50)")
  if (typeof type === 'string') {
    // Check if the string already includes size (e.g., "varchar(50)")
    const sizeMatch = type.match(/^(\w+)\(([^)]+)\)$/);
    if (sizeMatch) {
      const baseType = sizeMatch[1];
      const size = sizeMatch[2];
      if (baseType && size) {
        const mappedType = mapDataType(baseType, dialect, enums);
        return `${mappedType}(${size})`;
      }
    }
    return mapDataType(type, dialect, enums);
  }
  
  // Handle object type with name and size/args
  if (type && typeof type === 'object' && type.name) {
    const baseType = mapDataType(type.name, dialect, enums);
    
    // Handle size property
    if (type.size !== undefined && type.size !== null) {
      return `${baseType}(${type.size})`;
    }
    
    // Handle precision and scale for decimal types
    if (type.precision !== undefined && type.scale !== undefined) {
      return `${baseType}(${type.precision}, ${type.scale})`;
    } else if (type.precision !== undefined) {
      return `${baseType}(${type.precision})`;
    }
    
    // Handle args array
    if (type.args && type.args.length > 0) {
      return `${baseType}(${type.args.join(', ')})`;
    }
    
    // Handle parameters array (alternative to args)
    if (type.parameters && type.parameters.length > 0) {
      return `${baseType}(${type.parameters.join(', ')})`;
    }
    
    return baseType;
  }
  
  // Default fallback
  return 'VARCHAR(255)';
}

/**
 * Map DBML types to SQL types
 */
function mapDataType(typeName: string, dialect: 'mysql' | 'postgresql', enums: Enum[]): string {
  const upperType = typeName.toUpperCase();
  
  // Check if it's an enum
  if (enums.some(e => e.name.toUpperCase() === upperType)) {
    return typeName; // Return enum name as-is
  }
  
  // Common mappings
  const commonMappings: Record<string, { mysql: string; postgresql: string }> = {
    'INTEGER': { mysql: 'INT', postgresql: 'INTEGER' },
    'INT': { mysql: 'INT', postgresql: 'INTEGER' },
    'BIGINT': { mysql: 'BIGINT', postgresql: 'BIGINT' },
    'SMALLINT': { mysql: 'SMALLINT', postgresql: 'SMALLINT' },
    'TINYINT': { mysql: 'TINYINT', postgresql: 'SMALLINT' },
    'DECIMAL': { mysql: 'DECIMAL', postgresql: 'DECIMAL' },
    'NUMERIC': { mysql: 'NUMERIC', postgresql: 'NUMERIC' },
    'FLOAT': { mysql: 'FLOAT', postgresql: 'REAL' },
    'DOUBLE': { mysql: 'DOUBLE', postgresql: 'DOUBLE PRECISION' },
    'REAL': { mysql: 'FLOAT', postgresql: 'REAL' },
    'VARCHAR': { mysql: 'VARCHAR', postgresql: 'VARCHAR' },
    'CHAR': { mysql: 'CHAR', postgresql: 'CHAR' },
    'TEXT': { mysql: 'TEXT', postgresql: 'TEXT' },
    'LONGTEXT': { mysql: 'LONGTEXT', postgresql: 'TEXT' },
    'MEDIUMTEXT': { mysql: 'MEDIUMTEXT', postgresql: 'TEXT' },
    'TINYTEXT': { mysql: 'TINYTEXT', postgresql: 'TEXT' },
    'BINARY': { mysql: 'BINARY', postgresql: 'BYTEA' },
    'VARBINARY': { mysql: 'VARBINARY', postgresql: 'BYTEA' },
    'BLOB': { mysql: 'BLOB', postgresql: 'BYTEA' },
    'DATE': { mysql: 'DATE', postgresql: 'DATE' },
    'TIME': { mysql: 'TIME', postgresql: 'TIME' },
    'DATETIME': { mysql: 'DATETIME', postgresql: 'TIMESTAMP' },
    'TIMESTAMP': { mysql: 'TIMESTAMP', postgresql: 'TIMESTAMP' },
    'YEAR': { mysql: 'YEAR', postgresql: 'INTEGER' },
    'BOOLEAN': { mysql: 'BOOLEAN', postgresql: 'BOOLEAN' },
    'BOOL': { mysql: 'BOOLEAN', postgresql: 'BOOLEAN' },
    'JSON': { mysql: 'JSON', postgresql: 'JSON' },
    'JSONB': { mysql: 'JSON', postgresql: 'JSONB' },
    'UUID': { mysql: 'VARCHAR(36)', postgresql: 'UUID' },
    'SERIAL': { mysql: 'INT AUTO_INCREMENT', postgresql: 'SERIAL' },
    'BIGSERIAL': { mysql: 'BIGINT AUTO_INCREMENT', postgresql: 'BIGSERIAL' },
  };
  
  const mapping = commonMappings[upperType];
  if (mapping) {
    return mapping[dialect];
  }
  
  // Return as-is if not found in mappings
  return typeName;
}

/**
 * Convert index definition
 */
function convertIndex(index: Index, tableName: string, dialect: 'mysql' | 'postgresql'): string {
  if (!index.columns || index.columns.length === 0) {
    return '';
  }

  const indexName = index.name || `idx_${tableName}_${index.columns.join('_')}`;
  const columns = index.columns.map(col => quoteIdentifier(col, dialect)).join(', ');
  
  if (index.unique) {
    // Inline unique constraint
    return `UNIQUE KEY ${quoteIdentifier(indexName, dialect)} (${columns})`;
  } else {
    // Separate CREATE INDEX statement
    return `CREATE INDEX ${quoteIdentifier(indexName, dialect)} ON ${quoteIdentifier(tableName, dialect)} (${columns});`;
  }
}

/**
 * Convert relationship to ALTER TABLE statement
 */
function convertRelationship(rel: Relationship, dialect: 'mysql' | 'postgresql'): string {
  const fromTable = quoteIdentifier(rel.fromTable, dialect);
  const toTable = quoteIdentifier(rel.toTable, dialect);
  const fromColumn = quoteIdentifier(rel.fromColumn, dialect);
  const toColumn = quoteIdentifier(rel.toColumn, dialect);
  
  // Generate constraint name
  const constraintName = rel.name || `fk_${rel.fromTable}_${rel.fromColumn}`;
  
  let onDelete = '';
  let onUpdate = '';
  
  // Handle relationship type
  switch (rel.type) {
    case 'one-to-many':
    case 'many-to-one':
      onDelete = 'ON DELETE RESTRICT';
      onUpdate = 'ON UPDATE CASCADE';
      break;
    case 'one-to-one':
      onDelete = 'ON DELETE CASCADE';
      onUpdate = 'ON UPDATE CASCADE';
      break;
    case 'many-to-many':
      // Many-to-many typically uses a junction table
      return ''; // Skip for now
  }
  
  return `ALTER TABLE ${fromTable} ADD CONSTRAINT ${quoteIdentifier(constraintName, dialect)} ` +
         `FOREIGN KEY (${fromColumn}) REFERENCES ${toTable} (${toColumn}) ${onDelete} ${onUpdate};`;
}

/**
 * Quote identifier based on dialect
 * Handles schema.table syntax by splitting and quoting each part
 */
function quoteIdentifier(name: string, dialect: 'mysql' | 'postgresql'): string {
  // Check if name contains schema.table syntax
  if (name.includes('.')) {
    const parts = name.split('.');
    if (dialect === 'mysql') {
      return parts.map(part => `\`${part}\``).join('.');
    } else {
      return parts.map(part => `"${part}"`).join('.');
    }
  }

  // Simple identifier
  if (dialect === 'mysql') {
    return `\`${name}\``;
  } else {
    return `"${name}"`;
  }
}

/**
 * Format default value based on type and dialect
 */
function formatDefaultValue(value: any, type: any, dialect: 'mysql' | 'postgresql'): string {
  // NULL
  if (value === null || value === 'NULL') {
    return 'NULL';
  }
  
  // Boolean
  if (typeof value === 'boolean') {
    if (dialect === 'mysql') {
      return value ? '1' : '0';
    }
    return value ? 'TRUE' : 'FALSE';
  }
  
  // Number
  if (typeof value === 'number') {
    return value.toString();
  }
  
  // String value
  const strValue = String(value);
  
  // Check for SQL functions/keywords
  const upperValue = strValue.toUpperCase();
  const sqlKeywords = [
    'CURRENT_TIMESTAMP',
    'CURRENT_DATE',
    'CURRENT_TIME',
    'NOW()',
    'UUID()',
    'NULL',
    'TRUE',
    'FALSE'
  ];
  
  if (sqlKeywords.some(keyword => upperValue === keyword || upperValue.startsWith(keyword + '('))) {
    return strValue;
  }
  
  // Regular string - needs quotes
  return `'${escapeString(strValue)}'`;
}

/**
 * Escape string for SQL
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}