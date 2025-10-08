import { MySQLParser } from './mysql-parser';
import { PostgreSQLParser } from './postgres-parser';
import { DDLParseResult, SQLDialect } from './types';

export * from './types';
export { MySQLParser } from './mysql-parser';
export { PostgreSQLParser } from './postgres-parser';

/**
 * Convert DDL (Data Definition Language) to DBML
 *
 * @param ddl - The DDL SQL string to convert
 * @param dialect - The SQL dialect ('mysql' or 'postgresql')
 * @returns Parse result with DBML string
 */
export function convertDDLtoDBML(ddl: string, dialect: SQLDialect = 'mysql'): DDLParseResult {
  if (dialect === 'mysql') {
    const parser = new MySQLParser();
    return parser.parse(ddl);
  } else if (dialect === 'postgresql') {
    const parser = new PostgreSQLParser();
    return parser.parse(ddl);
  } else {
    return {
      success: false,
      dbml: '',
      errors: [`Unsupported SQL dialect: ${dialect}`],
      warnings: undefined,
    };
  }
}

/**
 * Auto-detect SQL dialect from DDL content
 *
 * @param ddl - The DDL SQL string
 * @returns Detected SQL dialect
 */
export function detectSQLDialect(ddl: string): SQLDialect {
  const upper = ddl.toUpperCase();

  // PostgreSQL-specific keywords
  if (
    upper.includes('SERIAL') ||
    upper.includes('BIGSERIAL') ||
    upper.includes('SMALLSERIAL') ||
    upper.includes('CHARACTER VARYING') ||
    upper.includes('TIMESTAMP WITH TIME ZONE') ||
    upper.includes('TIMESTAMP WITHOUT TIME ZONE') ||
    upper.includes('JSONB') ||
    upper.includes('UUID')
  ) {
    return 'postgresql';
  }

  // MySQL-specific keywords
  if (
    upper.includes('AUTO_INCREMENT') ||
    upper.includes('ENGINE=') ||
    upper.includes('CHARSET=') ||
    upper.includes('COLLATE=')
  ) {
    return 'mysql';
  }

  // Default to MySQL
  return 'mysql';
}

/**
 * Convert DDL to DBML with auto-detection
 *
 * @param ddl - The DDL SQL string
 * @returns Parse result with DBML string
 */
export function convertDDLtoDBMLAuto(ddl: string): DDLParseResult {
  const dialect = detectSQLDialect(ddl);
  return convertDDLtoDBML(ddl, dialect);
}
