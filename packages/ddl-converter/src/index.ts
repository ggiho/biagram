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

  // Check MySQL-specific keywords first (more specific patterns)
  if (
    upper.includes('AUTO_INCREMENT') ||
    upper.includes('ENGINE=') ||
    upper.includes('CHARSET=') ||
    upper.includes('COLLATE=')
  ) {
    return 'mysql';
  }

  // PostgreSQL-specific keywords (but exclude UUID in comments)
  // Only match UUID as a type, not in comments
  const cleanedDdl = upper.replace(/COMMENT\s+'[^']*'/g, '');
  if (
    cleanedDdl.includes(' SERIAL') ||
    cleanedDdl.includes(' BIGSERIAL') ||
    cleanedDdl.includes(' SMALLSERIAL') ||
    cleanedDdl.includes('CHARACTER VARYING') ||
    cleanedDdl.includes('TIMESTAMP WITH TIME ZONE') ||
    cleanedDdl.includes('TIMESTAMP WITHOUT TIME ZONE') ||
    cleanedDdl.includes(' JSONB') ||
    cleanedDdl.match(/\s+UUID(\s+|,|\))/i)  // UUID as a type, not in text
  ) {
    return 'postgresql';
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
