import { z } from 'zod';
import { convertDDLtoDBMLAuto, convertDBMLtoDDL } from '@biagram/ddl-converter';
import { DBMLParser } from '@biagram/dbml-parser';
import {
  convertToDBMLRefs,
  inferRelationships,
  type IntrospectedDatabase,
  type IntrospectedForeignKey,
  type IntrospectedIndex,
  type IntrospectedTable,
} from '@biagram/db-introspector';

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  rateLimitedProcedure,
} from '@/server/api/trpc';

type ParsedColumnLike = {
  name: string;
  type?:
    | string
    | { name?: string; size?: number; precision?: number; scale?: number };
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  autoIncrement?: boolean;
  defaultValue?: unknown;
  note?: string;
  references?: { table: string; column: string; schema?: string };
};

type ParsedTableLike = {
  name: string;
  schema?: string;
  note?: string;
  columns?: ParsedColumnLike[];
  indexes?: Array<{ name?: string; columns: string[]; unique?: boolean }>;
};

type ParsedRelationshipLike = {
  name?: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  onDelete?: string;
  onUpdate?: string;
};

function formatColumnType(
  type?:
    | string
    | { name?: string; size?: number; precision?: number; scale?: number }
): string {
  if (!type) return 'unknown';
  if (typeof type === 'string') return type;
  if (!type.name) return 'unknown';
  if (type.precision !== undefined && type.scale !== undefined) {
    return `${type.name}(${type.precision},${type.scale})`;
  }
  if (type.size !== undefined) {
    return `${type.name}(${type.size})`;
  }
  return type.name;
}

function normalizeTableRef(rawName: string, explicitSchema?: string) {
  if (explicitSchema) {
    const rawTableName = rawName.includes('.')
      ? rawName.split('.').pop() || rawName
      : rawName;
    return {
      schemaName: explicitSchema,
      tableName: rawTableName,
      fullName: `${explicitSchema}.${rawTableName}`,
    };
  }

  if (rawName.includes('.')) {
    const [schemaName, tableName] = rawName.split('.');
    return {
      schemaName: schemaName || 'public',
      tableName: tableName || rawName,
      fullName: `${schemaName || 'public'}.${tableName || rawName}`,
    };
  }

  return {
    schemaName: 'public',
    tableName: rawName,
    fullName: `public.${rawName}`,
  };
}

function buildIntrospectedDatabaseFromParsedSchema(parsedSchema: {
  tables?: ParsedTableLike[];
  relationships?: ParsedRelationshipLike[];
}): {
  database: IntrospectedDatabase;
  importedTableNames: Set<string>;
} {
  const tableRecords = (parsedSchema.tables || []).map(table => {
    const normalized = normalizeTableRef(table.name, table.schema);
    const introspectedTable: IntrospectedTable = {
      schema: normalized.schemaName,
      name: normalized.tableName,
      ...(table.note ? { comment: table.note } : {}),
      columns: (table.columns || []).map(column => {
        const defaultValue =
          typeof column.defaultValue === 'string' || column.defaultValue == null
            ? (column.defaultValue as string | null | undefined)
            : JSON.stringify(column.defaultValue);

        return {
          name: column.name,
          type: formatColumnType(column.type),
          nullable: column.nullable ?? true,
          ...(defaultValue !== undefined ? { defaultValue } : {}),
          ...(column.note ? { comment: column.note } : {}),
          autoIncrement: column.autoIncrement ?? false,
          unsigned: false,
        };
      }),
      primaryKeys: (table.columns || [])
        .filter(column => column.primaryKey)
        .map(column => column.name),
      foreignKeys: [],
      indexes: (table.indexes || []).map(
        (index): IntrospectedIndex => ({
          name:
            index.name ||
            `idx_${normalized.tableName}_${index.columns.join('_')}`,
          columns: index.columns,
          unique: index.unique ?? false,
          primary: false,
        })
      ),
      uniqueConstraints: [],
    };

    return {
      ...normalized,
      source: table,
      introspectedTable,
    };
  });

  const tableByFullName = new Map(
    tableRecords.map(record => [record.fullName, record])
  );
  const tablesByBareName = new Map<string, typeof tableRecords>();

  for (const record of tableRecords) {
    const existing = tablesByBareName.get(record.tableName) || [];
    existing.push(record);
    tablesByBareName.set(record.tableName, existing);
  }

  const resolveTableRecord = (tableName: string) => {
    const normalized = normalizeTableRef(tableName);
    const exact = tableByFullName.get(normalized.fullName);
    if (exact) return exact;

    const bareMatches = tablesByBareName.get(normalized.tableName) || [];
    if (bareMatches.length === 1) {
      return bareMatches[0];
    }

    return bareMatches.find(
      match => match.schemaName === normalized.schemaName
    );
  };

  const addForeignKey = (
    sourceRecord:
      | (typeof tableRecords extends Array<infer T> ? T : never)
      | undefined,
    foreignKey: IntrospectedForeignKey
  ) => {
    if (!sourceRecord) return;
    const alreadyExists = sourceRecord.introspectedTable.foreignKeys.some(
      existing =>
        existing.column === foreignKey.column &&
        existing.referencedTable === foreignKey.referencedTable &&
        existing.referencedColumn === foreignKey.referencedColumn &&
        existing.referencedSchema === foreignKey.referencedSchema
    );

    if (!alreadyExists) {
      sourceRecord.introspectedTable.foreignKeys.push(foreignKey);
    }
  };

  for (const relationship of parsedSchema.relationships || []) {
    const fromRecord = resolveTableRecord(relationship.fromTable);
    const toRecord = resolveTableRecord(relationship.toTable);

    const foreignKey: IntrospectedForeignKey = {
      name:
        relationship.name ||
        `fk_${fromRecord?.tableName || 'table'}_${relationship.fromColumn}`,
      column: relationship.fromColumn,
      referencedTable:
        toRecord?.tableName ||
        normalizeTableRef(relationship.toTable).tableName,
      referencedColumn: relationship.toColumn,
    };

    if (toRecord?.schemaName) {
      foreignKey.referencedSchema = toRecord.schemaName;
    }

    if (relationship.onDelete) {
      foreignKey.onDelete = relationship.onDelete as NonNullable<
        IntrospectedForeignKey['onDelete']
      >;
    }

    if (relationship.onUpdate) {
      foreignKey.onUpdate = relationship.onUpdate as NonNullable<
        IntrospectedForeignKey['onUpdate']
      >;
    }

    addForeignKey(fromRecord, foreignKey);
  }

  for (const record of tableRecords) {
    for (const column of record.source.columns || []) {
      if (!column.references) continue;
      const referenced = normalizeTableRef(
        column.references.table,
        column.references.schema
      );

      addForeignKey(record, {
        name: `fk_${record.tableName}_${column.name}`,
        column: column.name,
        referencedTable: referenced.tableName,
        referencedColumn: column.references.column,
        ...(referenced.schemaName
          ? { referencedSchema: referenced.schemaName }
          : {}),
      });
    }
  }

  const schemaMap = new Map<
    string,
    { name: string; tables: IntrospectedTable[] }
  >();

  for (const record of tableRecords) {
    if (!schemaMap.has(record.schemaName)) {
      schemaMap.set(record.schemaName, {
        name: record.schemaName,
        tables: [],
      });
    }

    schemaMap.get(record.schemaName)?.tables.push(record.introspectedTable);
  }

  return {
    database: {
      schemas: Array.from(schemaMap.values()),
      version: 'dbml-import',
      databaseType: 'postgresql',
    },
    importedTableNames: new Set(tableRecords.map(record => record.fullName)),
  };
}

const CreateDiagramSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  content: z.string(),
  isPublic: z.boolean().default(false),
});

const UpdateDiagramSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  isPublic: z.boolean().optional(),
});

export const diagramRouter = createTRPCRouter({
  // Create a new diagram (requires authentication)
  create: protectedProcedure
    .input(CreateDiagramSchema)
    .mutation(async ({ input, ctx }) => {
      // TODO: Implement with database
      return {
        id: 'temp-diagram-id',
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: ctx.user.id,
      };
    }),

  // Get all diagrams
  getAll: publicProcedure.query(async ({ ctx }) => {
    // TODO: Implement with database
    return [];
  }),

  // Get a specific diagram
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      // TODO: Implement with database
      return null;
    }),

  // Update a diagram (requires authentication)
  update: protectedProcedure
    .input(UpdateDiagramSchema)
    .mutation(async ({ input, ctx }) => {
      // TODO: Implement with database, verify ownership
      return {
        success: true,
        message: 'Update functionality coming soon',
      };
    }),

  // Delete a diagram (requires authentication)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // TODO: Implement with database, verify ownership
      return {
        success: true,
        message: 'Delete functionality coming soon',
      };
    }),

  // Convert DDL to DBML (rate limited)
  convertDDL: rateLimitedProcedure
    .input(
      z.object({
        ddl: z
          .string()
          .max(500000, 'DDL content exceeds maximum size of 500KB'),
        dialect: z.enum(['mysql', 'postgresql', 'auto']).default('auto'),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = convertDDLtoDBMLAuto(input.ddl);

        if (!result.success) {
          return {
            success: false,
            dbml: '',
            errors: result.errors,
            warnings: result.warnings,
          };
        }

        return {
          success: true,
          dbml: result.dbml,
          errors: undefined,
          warnings: result.warnings,
        };
      } catch (error) {
        console.error('convertDDL error:', error);
        return {
          success: false,
          dbml: '',
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          warnings: undefined,
        };
      }
    }),

  inferDBMLRelationships: rateLimitedProcedure
    .input(
      z.object({
        existingContent: z
          .string()
          .max(500000, 'Existing DBML content exceeds maximum size of 500KB')
          .optional()
          .default(''),
        importedContent: z
          .string()
          .max(500000, 'Imported DBML content exceeds maximum size of 500KB'),
        importMode: z.enum(['append', 'replace']).default('append'),
        minConfidence: z.enum(['high', 'medium', 'low']).default('low'),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const importedParse = DBMLParser.parse(input.importedContent);

        if (!importedParse.success || !importedParse.schema) {
          return {
            success: false,
            refs: [] as string[],
            autoApplyRefs: [] as string[],
            relationships: [],
            stats: undefined,
            error:
              'Failed to parse converted DBML before relationship inference',
          };
        }

        const combinedContent =
          input.importMode === 'append' && input.existingContent.trim()
            ? `${input.existingContent.trim()}\n\n${input.importedContent.trim()}`
            : input.importedContent;

        const combinedParse = DBMLParser.parse(combinedContent);

        if (!combinedParse.success || !combinedParse.schema) {
          return {
            success: false,
            refs: [] as string[],
            autoApplyRefs: [] as string[],
            relationships: [],
            stats: undefined,
            error: 'Failed to analyze DBML relationships after conversion',
          };
        }

        const { database } = buildIntrospectedDatabaseFromParsedSchema(
          combinedParse.schema as {
            tables?: ParsedTableLike[];
            relationships?: ParsedRelationshipLike[];
          }
        );
        const { importedTableNames } =
          buildIntrospectedDatabaseFromParsedSchema(
            importedParse.schema as {
              tables?: ParsedTableLike[];
              relationships?: ParsedRelationshipLike[];
            }
          );

        const inferred = inferRelationships(database, {
          includeExistingFKs: false,
          minConfidence: input.minConfidence,
        });

        const filteredRelationships = inferred.relationships.filter(
          relationship => {
            const fromKey = `${relationship.fromSchema}.${relationship.fromTable}`;
            const toKey = `${relationship.toSchema}.${relationship.toTable}`;
            return (
              importedTableNames.has(fromKey) || importedTableNames.has(toKey)
            );
          }
        );

        const refs = convertToDBMLRefs(filteredRelationships);
        const autoApplyRefs = convertToDBMLRefs(
          filteredRelationships.filter(
            relationship => relationship.confidence === 'high'
          )
        );

        return {
          success: true,
          refs,
          autoApplyRefs,
          relationships: filteredRelationships,
          stats: {
            totalInferred: filteredRelationships.length,
            highConfidence: filteredRelationships.filter(
              relationship => relationship.confidence === 'high'
            ).length,
            mediumConfidence: filteredRelationships.filter(
              relationship => relationship.confidence === 'medium'
            ).length,
            lowConfidence: filteredRelationships.filter(
              relationship => relationship.confidence === 'low'
            ).length,
          },
          error: undefined,
        };
      } catch (error) {
        console.error('inferDBMLRelationships error:', error);
        return {
          success: false,
          refs: [] as string[],
          autoApplyRefs: [] as string[],
          relationships: [],
          stats: undefined,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to infer relationships from DBML content',
        };
      }
    }),

  // Parse DBML content - rate limited for DoS protection
  parseDBML: rateLimitedProcedure
    .input(
      z.object({
        content: z
          .string()
          .max(500000, 'DBML content exceeds maximum size of 500KB'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Validate content string
        if (typeof input.content !== 'string') {
          return {
            tables: [],
            relationships: [],
            enums: [],
            success: false,
            error: 'Invalid content type',
            schema: null,
          };
        }

        if (!input.content || !input.content.trim()) {
          return {
            tables: [],
            relationships: [],
            enums: [],
            success: true,
            schema: { tables: [], relationships: [], enums: [] },
          };
        }

        // Use the actual DBML parser
        const parseResult = DBMLParser.parse(input.content);
        const tempSchema = parseResult.schema as {
          tables: Array<{
            id: string;
            name: string;
            schema?: string;
            columns: Array<{
              name: string;
              type:
                | string
                | {
                    name: string;
                    size?: number;
                    precision?: number;
                    scale?: number;
                  };
              primaryKey?: boolean;
              nullable?: boolean;
              unique?: boolean;
              note?: string;
              references?: unknown;
              ref?: unknown;
            }>;
            position?: { x: number; y: number };
            note?: string;
          }>;
          relationships: Array<{
            id: string;
            fromTable: string;
            fromColumn: string;
            toTable: string;
            toColumn: string;
            type: string;
            name?: string;
          }>;
          enums?: Array<{
            name: string;
            values: Array<{ name: string; note?: string }>;
          }>;
        };

        if (!parseResult.success || !parseResult.schema) {
          const firstError = parseResult.errors?.[0];
          const errorMessage = firstError
            ? `Line ${firstError.position?.line || '?'}, Column ${firstError.position?.column || '?'}: ${firstError.message}`
            : 'Failed to parse DBML';

          return {
            tables: [],
            relationships: [],
            enums: [],
            success: false,
            error: errorMessage,
            schema: null,
          };
        }

        // Helper function to format column type with size/precision/scale
        const formatColumnType = (
          type:
            | string
            | {
                name: string;
                size?: number;
                precision?: number;
                scale?: number;
              }
        ): string => {
          if (typeof type === 'string') {
            return type;
          }
          if (!type || !type.name) {
            return 'unknown';
          }

          const typeName = type.name;

          if (type.precision !== undefined && type.scale !== undefined) {
            return `${typeName}(${type.precision},${type.scale})`;
          }

          if (type.size !== undefined) {
            return `${typeName}(${type.size})`;
          }

          return typeName;
        };

        // Transform schema to the format expected by the frontend
        const tables = tempSchema.tables.map((table, index: number) => {
          const columns = table.columns.map(col => ({
            name: col.name,
            type: formatColumnType(col.type),
            isPrimaryKey: col.primaryKey || false,
            isForeignKey: !!(col.references || col.ref),
            isNotNull: !col.nullable,
            isUnique: col.unique || false,
            note: col.note,
          }));

          return {
            id: table.id,
            name: table.name,
            schema: table.schema,
            columns,
            x: table.position?.x ?? 50 + (index % 3) * 250,
            y: table.position?.y ?? 50 + Math.floor(index / 3) * 200,
            note: table.note,
          };
        });

        const relationships = tempSchema.relationships.map(rel => ({
          id: rel.id,
          fromTable: rel.fromTable,
          fromColumn: rel.fromColumn,
          toTable: rel.toTable,
          toColumn: rel.toColumn,
          type: rel.type,
          name: rel.name,
        }));

        return {
          tables,
          relationships,
          enums: tempSchema.enums || [],
          success: true,
          schema: { tables, relationships, enums: tempSchema.enums || [] },
        };
      } catch (error) {
        console.error('parseDBML error:', error);
        return {
          tables: [],
          relationships: [],
          enums: [],
          success: false,
          error: 'Failed to parse DBML content',
          schema: null,
        };
      }
    }),

  // Convert DBML to DDL
  convertDBMLtoDDL: publicProcedure
    .input(
      z.object({
        dbml: z.string(),
        dialect: z.enum(['mysql', 'postgresql']).default('mysql'),
        includeForeignKeys: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const parseResult = DBMLParser.parse(input.dbml);

        if (!parseResult.success || !parseResult.schema) {
          return {
            success: false,
            ddl: '',
            errors: parseResult.errors?.map(e => e.message) || [
              'Failed to parse DBML',
            ],
          };
        }

        const ddl = convertDBMLtoDDL(
          parseResult.schema as Parameters<typeof convertDBMLtoDDL>[0],
          input.dialect,
          input.includeForeignKeys
        );

        return {
          success: true,
          ddl,
          errors: undefined,
        };
      } catch (error) {
        console.error('convertDBMLtoDDL error:', error);
        return {
          success: false,
          ddl: '',
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        };
      }
    }),
});
