export interface DDLParseResult {
  success: boolean;
  dbml: string;
  errors: string[] | undefined;
  warnings: string[] | undefined;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyDef[];
  indexes: IndexDef[];
  comment?: string;
}

export interface ColumnDef {
  name: string;
  type: string;
  size?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  comment?: string;
}

export interface ForeignKeyDef {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete: string | undefined;
  onUpdate: string | undefined;
}

export interface IndexDef {
  name: string;
  columns: string[];
  unique: boolean;
  type?: string;
}

export type SQLDialect = 'mysql' | 'postgresql';
