/**
 * @biagram/db-introspector
 *
 * Database introspection package for MySQL and PostgreSQL databases.
 * Extracts schema information and converts to DBML format.
 */

// Export types
export type {
  DatabaseType,
  DatabaseConnection,
  IntrospectedDatabase,
  IntrospectedSchema,
  IntrospectedTable,
  IntrospectedColumn,
  IntrospectedForeignKey,
  IntrospectedIndex,
  IntrospectionResult,
} from './types';

// Export introspection functions
export { introspectMySQL, createMySQLConnection } from './mysql';
export { introspectPostgreSQL, createPostgreSQLPool } from './postgresql';

// Export conversion functions
export { convertToDBML, getConversionStats } from './converter';

// Export type mapping utilities
export { mapTypeToDBML, formatDBMLType, MYSQL_TO_DBML, POSTGRESQL_TO_DBML } from './type-mapping';

/**
 * Main introspection function that handles both MySQL and PostgreSQL
 */
import type { DatabaseConnection, IntrospectionResult } from './types';
import { introspectMySQL } from './mysql';
import { introspectPostgreSQL } from './postgresql';
import { convertToDBML, getConversionStats } from './converter';

export async function introspectDatabase(
  config: DatabaseConnection
): Promise<IntrospectionResult> {
  try {
    // Select introspection function based on database type
    const introspectFn = config.type === 'mysql' ? introspectMySQL : introspectPostgreSQL;

    // Perform introspection
    const database = await introspectFn(config);

    // Convert to DBML
    const dbml = convertToDBML(database);

    // Get statistics
    const stats = getConversionStats(database);

    return {
      success: true,
      database,
      dbml,
      stats,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
