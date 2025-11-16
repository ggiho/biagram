/**
 * Type mapping from database-specific types to DBML types
 *
 * MySQL and PostgreSQL use different type names, but they need to be
 * mapped to standard DBML types for consistency.
 */

/**
 * MySQL type to DBML type mapping
 */
export const MYSQL_TO_DBML: Record<string, string> = {
  // Integer types
  'tinyint': 'tinyint',
  'smallint': 'smallint',
  'mediumint': 'int',
  'int': 'int',
  'integer': 'int',
  'bigint': 'bigint',

  // String types
  'char': 'char',
  'varchar': 'varchar',
  'tinytext': 'text',
  'text': 'text',
  'mediumtext': 'text',
  'longtext': 'text',

  // Binary types
  'binary': 'binary',
  'varbinary': 'varbinary',
  'tinyblob': 'blob',
  'blob': 'blob',
  'mediumblob': 'blob',
  'longblob': 'blob',

  // Date/Time types
  'date': 'date',
  'datetime': 'datetime',
  'timestamp': 'timestamp',
  'time': 'time',
  'year': 'int',

  // Numeric types
  'decimal': 'decimal',
  'numeric': 'decimal',
  'float': 'float',
  'double': 'double',
  'real': 'double',

  // Boolean type
  'boolean': 'boolean',
  'bool': 'boolean',

  // JSON type
  'json': 'json',

  // Enum and Set (will be converted to varchar with note)
  'enum': 'varchar',
  'set': 'varchar',

  // Spatial types (not fully supported in DBML)
  'geometry': 'varchar',
  'point': 'varchar',
  'linestring': 'varchar',
  'polygon': 'varchar',
};

/**
 * PostgreSQL type to DBML type mapping
 */
export const POSTGRESQL_TO_DBML: Record<string, string> = {
  // Integer types
  'smallint': 'smallint',
  'int2': 'smallint',
  'integer': 'int',
  'int': 'int',
  'int4': 'int',
  'bigint': 'bigint',
  'int8': 'bigint',
  'serial': 'int',
  'serial2': 'smallint',
  'serial4': 'int',
  'bigserial': 'bigint',
  'serial8': 'bigint',
  'smallserial': 'smallint',

  // String types
  'character varying': 'varchar',
  'varchar': 'varchar',
  'character': 'char',
  'char': 'char',
  'text': 'text',
  'name': 'varchar',

  // Binary types
  'bytea': 'blob',

  // Date/Time types
  'date': 'date',
  'time': 'time',
  'time without time zone': 'time',
  'time with time zone': 'time',
  'timetz': 'time',
  'timestamp': 'timestamp',
  'timestamp without time zone': 'timestamp',
  'timestamp with time zone': 'timestamp',
  'timestamptz': 'timestamp',
  'interval': 'varchar',

  // Numeric types
  'numeric': 'decimal',
  'decimal': 'decimal',
  'real': 'float',
  'float4': 'float',
  'double precision': 'double',
  'float8': 'double',
  'money': 'decimal',

  // Boolean type
  'boolean': 'boolean',
  'bool': 'boolean',

  // JSON types
  'json': 'json',
  'jsonb': 'json',

  // UUID type
  'uuid': 'varchar',

  // Array types (will be converted to varchar with note)
  'array': 'varchar',

  // Network address types
  'inet': 'varchar',
  'cidr': 'varchar',
  'macaddr': 'varchar',
  'macaddr8': 'varchar',

  // Bit string types
  'bit': 'varchar',
  'bit varying': 'varchar',
  'varbit': 'varchar',

  // Text search types
  'tsvector': 'varchar',
  'tsquery': 'varchar',

  // XML type
  'xml': 'text',

  // Geometric types
  'point': 'varchar',
  'line': 'varchar',
  'lseg': 'varchar',
  'box': 'varchar',
  'path': 'varchar',
  'polygon': 'varchar',
  'circle': 'varchar',
};

/**
 * Map a database type to DBML type
 */
export function mapTypeToDBML(originalType: string, databaseType: 'mysql' | 'postgresql'): string {
  // Extract base type (remove precision, length, etc.)
  // Example: "VARCHAR(255)" → "varchar", "DECIMAL(10,2)" → "decimal"
  const baseType = originalType.toLowerCase().replace(/\(.*\)/, '').trim();

  const mappingTable = databaseType === 'mysql' ? MYSQL_TO_DBML : POSTGRESQL_TO_DBML;

  // Try exact match first
  if (mappingTable[baseType]) {
    return mappingTable[baseType];
  }

  // Try partial match (for types like "int unsigned", "character varying")
  for (const [dbType, dbmlType] of Object.entries(mappingTable)) {
    if (baseType.includes(dbType)) {
      return dbmlType;
    }
  }

  // Default to varchar if no mapping found
  console.warn(`Unknown type "${originalType}" (${databaseType}), defaulting to varchar`);
  return 'varchar';
}

/**
 * Format type with precision/length for DBML
 */
export function formatDBMLType(
  originalType: string,
  dbmlType: string,
  precision?: number,
  scale?: number
): string {
  // For types that support precision/scale in DBML
  if ((dbmlType === 'decimal' || dbmlType === 'numeric') && precision !== undefined) {
    if (scale !== undefined) {
      return `${dbmlType}(${precision},${scale})`;
    }
    return `${dbmlType}(${precision})`;
  }

  // For string types, extract length from original type
  if (dbmlType === 'varchar' || dbmlType === 'char') {
    const match = originalType.match(/\((\d+)\)/);
    if (match) {
      return `${dbmlType}(${match[1]})`;
    }
  }

  return dbmlType;
}
