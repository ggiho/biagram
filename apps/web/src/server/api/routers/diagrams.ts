import { z } from 'zod';
import { convertDDLtoDBMLAuto, convertDBMLtoDDL } from '@biagram/ddl-converter';
import { DBMLParser } from '@biagram/dbml-parser';

import { createTRPCRouter, publicProcedure, protectedProcedure, rateLimitedProcedure } from '@/server/api/trpc';

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
  getAll: publicProcedure
    .query(async ({ ctx }) => {
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
    .input(z.object({
      ddl: z.string().max(500000, 'DDL content exceeds maximum size of 500KB'),
      dialect: z.enum(['mysql', 'postgresql', 'auto']).default('auto')
    }))
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

  // Parse DBML content - rate limited for DoS protection
  parseDBML: rateLimitedProcedure
    .input(z.object({ content: z.string().max(500000, 'DBML content exceeds maximum size of 500KB') }))
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
              type: string | { name: string; size?: number; precision?: number; scale?: number };
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
          enums?: Array<{ name: string; values: Array<{ name: string; note?: string }> }>;
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
        const formatColumnType = (type: string | { name: string; size?: number; precision?: number; scale?: number }): string => {
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
          const columns = table.columns.map((col) => ({
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
            x: table.position?.x ?? (50 + (index % 3) * 250),
            y: table.position?.y ?? (50 + Math.floor(index / 3) * 200),
            note: table.note,
          };
        });

        const relationships = tempSchema.relationships.map((rel) => ({
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
    .input(z.object({
      dbml: z.string(),
      dialect: z.enum(['mysql', 'postgresql']).default('mysql'),
      includeForeignKeys: z.boolean().default(true)
    }))
    .mutation(async ({ input }) => {
      try {
        const parseResult = DBMLParser.parse(input.dbml);

        if (!parseResult.success || !parseResult.schema) {
          return {
            success: false,
            ddl: '',
            errors: parseResult.errors?.map(e => e.message) || ['Failed to parse DBML'],
          };
        }

        const ddl = convertDBMLtoDDL(parseResult.schema as Parameters<typeof convertDBMLtoDDL>[0], input.dialect, input.includeForeignKeys);

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
