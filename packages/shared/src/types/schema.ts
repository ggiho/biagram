import { z } from 'zod';

// Position and geometry types
export const Position2DSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const Size2DSchema = z.object({
  width: z.number(),
  height: z.number(),
});

export const Rectangle2DSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export type Position2D = z.infer<typeof Position2DSchema>;
export type Size2D = z.infer<typeof Size2DSchema>;
export type Rectangle2D = z.infer<typeof Rectangle2DSchema>;

// Database types
export const DatabaseTypeSchema = z.enum([
  'postgresql',
  'mysql',
  'sqlite',
  'mssql',
  'oracle',
  'mongodb',
  'generic',
]);

export type DatabaseType = z.infer<typeof DatabaseTypeSchema>;

// Column data types
export const ColumnTypeSchema = z.object({
  name: z.string(),
  size: z.number().optional(),
  precision: z.number().optional(),
  scale: z.number().optional(),
  parameters: z.array(z.string()).optional(),
});

export type ColumnType = z.infer<typeof ColumnTypeSchema>;

// Column constraints
export const ColumnConstraintSchema = z.enum([
  'primary_key',
  'foreign_key',
  'unique',
  'not_null',
  'auto_increment',
  'default',
]);

export type ColumnConstraint = z.infer<typeof ColumnConstraintSchema>;

// Column reference for foreign keys
export const ColumnReferenceSchema = z.object({
  table: z.string(),
  column: z.string(),
  schema: z.string().optional(),
});

export type ColumnReference = z.infer<typeof ColumnReferenceSchema>;

// Column definition
export const ColumnSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ColumnTypeSchema,
  nullable: z.boolean().default(true),
  primaryKey: z.boolean().default(false),
  unique: z.boolean().default(false),
  autoIncrement: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  note: z.string().optional(),
  references: ColumnReferenceSchema.optional(),
});

export type Column = z.infer<typeof ColumnSchema>;

// Relationship types and cardinality
export const RelationshipTypeSchema = z.enum([
  'one-to-one',
  'one-to-many',
  'many-to-one',
  'many-to-many',
]);

export const RelationshipCardinalitySchema = z.object({
  from: z.enum(['0', '1', 'many']),
  to: z.enum(['0', '1', 'many']),
});

export const CascadeActionSchema = z.enum([
  'cascade',
  'restrict',
  'set_null',
  'set_default',
  'no_action',
]);

export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;
export type RelationshipCardinality = z.infer<typeof RelationshipCardinalitySchema>;
export type CascadeAction = z.infer<typeof CascadeActionSchema>;

// Relationship definition
export const RelationshipSchema = z.object({
  id: z.string(),
  type: RelationshipTypeSchema,
  fromTable: z.string(),
  fromColumn: z.string(),
  toTable: z.string(),
  toColumn: z.string(),
  cardinality: RelationshipCardinalitySchema.optional(),
  onUpdate: CascadeActionSchema.optional(),
  onDelete: CascadeActionSchema.optional(),
  name: z.string().optional(),
  note: z.string().optional(),
});

export type Relationship = z.infer<typeof RelationshipSchema>;

// Enum definition
export const EnumValueSchema = z.object({
  name: z.string(),
  note: z.string().optional(),
});

export const EnumSchema = z.object({
  id: z.string(),
  name: z.string(),
  values: z.array(EnumValueSchema),
  note: z.string().optional(),
});

export type EnumValue = z.infer<typeof EnumValueSchema>;
export type Enum = z.infer<typeof EnumSchema>;

// Index definition
export const IndexTypeSchema = z.enum([
  'btree',
  'hash',
  'gin',
  'gist',
  'unique',
  'fulltext',
]);

export const IndexSchema = z.object({
  id: z.string(),
  name: z.string(),
  tableName: z.string(),
  columns: z.array(z.string()),
  type: IndexTypeSchema.optional(),
  unique: z.boolean().default(false),
  note: z.string().optional(),
});

export type IndexType = z.infer<typeof IndexTypeSchema>;
export type Index = z.infer<typeof IndexSchema>;

// Table group definition
export const TableGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  tables: z.array(z.string()),
  note: z.string().optional(),
});

export type TableGroup = z.infer<typeof TableGroupSchema>;

// Table definition
export const TableSchema = z.object({
  id: z.string(),
  name: z.string(),
  schema: z.string().optional(),
  alias: z.string().optional(),
  columns: z.array(ColumnSchema),
  indexes: z.array(z.object({
    name: z.string(),
    columns: z.array(z.string()),
    unique: z.boolean().default(false),
  })).optional(),
  note: z.string().optional(),
  color: z.string().optional(),
  headerColor: z.string().optional(),
  position: Position2DSchema.default({ x: 0, y: 0 }),
  size: Size2DSchema.optional(),
});

export type Table = z.infer<typeof TableSchema>;

// Database schema metadata
export const SchemaMetadataSchema = z.object({
  source: z.enum(['dbml', 'ddl', 'import', 'manual']),
  version: z.string().optional(),
  encoding: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  author: z.string().optional(),
});

export type SchemaMetadata = z.infer<typeof SchemaMetadataSchema>;

// Complete database schema
export const DatabaseSchemaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tables: z.array(TableSchema),
  relationships: z.array(RelationshipSchema),
  enums: z.array(EnumSchema),
  indexes: z.array(IndexSchema),
  tableGroups: z.array(TableGroupSchema),
  metadata: SchemaMetadataSchema,
});

export type DatabaseSchema = z.infer<typeof DatabaseSchemaSchema>;