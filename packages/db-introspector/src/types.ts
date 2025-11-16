/**
 * Database introspection types
 *
 * Defines the structure of introspected database schemas that will be
 * converted to DBML format.
 */

export type DatabaseType = 'mysql' | 'postgresql';

export interface DatabaseConnection {
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  schemaFilter?: string[];  // Specific schemas to introspect
}

export interface IntrospectedDatabase {
  schemas: IntrospectedSchema[];
  version: string;
  databaseType: DatabaseType;
}

export interface IntrospectedSchema {
  name: string;
  tables: IntrospectedTable[];
}

export interface IntrospectedTable {
  schema: string;
  name: string;
  comment?: string;
  columns: IntrospectedColumn[];
  primaryKeys: string[];
  foreignKeys: IntrospectedForeignKey[];
  indexes: IntrospectedIndex[];
  uniqueConstraints: string[][];
}

export interface IntrospectedColumn {
  name: string;
  type: string;              // Original DB type (e.g., "VARCHAR(255)", "INT UNSIGNED")
  nullable: boolean;
  defaultValue?: string | null;
  comment?: string;
  autoIncrement?: boolean;
  unsigned?: boolean;        // MySQL only
  precision?: number;        // For DECIMAL, NUMERIC, etc.
  scale?: number;           // For DECIMAL, NUMERIC, etc.
}

export interface IntrospectedForeignKey {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  referencedSchema?: string;
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' | 'SET DEFAULT';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' | 'SET DEFAULT';
}

export interface IntrospectedIndex {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
}

export interface IntrospectionResult {
  success: boolean;
  database?: IntrospectedDatabase;
  dbml?: string;
  error?: string;
  stats?: {
    schemaCount: number;
    tableCount: number;
    relationshipCount: number;
  };
}
