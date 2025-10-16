import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { convertDDLtoDBMLAuto } from '@biagram/ddl-converter';
import { DBMLParser } from '@biagram/dbml-parser';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc';

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
  // Create a new diagram
  create: publicProcedure
    .input(CreateDiagramSchema)
    .mutation(async ({ input, ctx }) => {
      // Temporary implementation
      return {
        id: 'temp-diagram-id',
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'temp-user-id',
      };
    }),

  // Get all diagrams
  getAll: publicProcedure
    .query(async ({ ctx }) => {
      // Temporary implementation
      return [];
    }),

  // Get a specific diagram
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      // Temporary implementation
      return null;
    }),

  // Update a diagram
  update: publicProcedure
    .input(UpdateDiagramSchema)
    .mutation(async ({ input, ctx }) => {
      // Temporary implementation
      return {
        success: true,
        message: 'Update functionality coming soon',
      };
    }),

  // Delete a diagram
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Temporary implementation
      return {
        success: true,
        message: 'Delete functionality coming soon',
      };
    }),

  // Convert DDL to DBML
  convertDDL: publicProcedure
    .input(z.object({
      ddl: z.string(),
      dialect: z.enum(['mysql', 'postgresql', 'auto']).default('auto')
    }))
    .mutation(async ({ input }) => {
      try {
        console.log('🔄 SERVER: convertDDL called with dialect:', input.dialect);

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
        console.error('❌ convertDDL error:', error);
        return {
          success: false,
          dbml: '',
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          warnings: undefined,
        };
      }
    }),

  // Parse DBML content - made more resilient
  parseDBML: publicProcedure
    .input(z.object({ content: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        console.log('🟢 SERVER: parseDBML function called!');
        console.log('🟢 SERVER: Raw input object:', input);
        console.log('🟢 SERVER: Input type:', typeof input);
        console.log('🟢 SERVER: Input content:', input?.content);
        console.log('🟢 SERVER: Input content type:', typeof input?.content);
        console.log('🟢 SERVER: Input content length:', input?.content?.length);
        console.log('parseDBML: Received input:', input);

        // Validate content string
        if (typeof input.content !== 'string') {
          console.log('parseDBML: Invalid content type:', typeof input.content);
          return {
            tables: [],
            relationships: [],
            enums: [],
            success: false,
            error: 'Invalid content type',
            schema: null,
          };
        }

        console.log('parseDBML: Received input with content length:', input.content?.length || 0);

        if (!input.content || !input.content.trim()) {
          console.log('parseDBML: Empty content, returning empty schema');
          return {
            tables: [],
            relationships: [],
            enums: [],
            success: true,
            schema: { tables: [], relationships: [], enums: [] },
          };
        }

        console.log('parseDBML: Processing content:', input.content.substring(0, 100) + '...');

        // Use the actual DBML parser
        const parseResult = DBMLParser.parse(input.content);
        
        const tempSchema = parseResult.schema as any;
        console.log('🔍 SERVER: Parse result:', {
          success: parseResult.success,
          tablesCount: tempSchema?.tables?.length || 0,
          relationshipsCount: tempSchema?.relationships?.length || 0,
          errors: parseResult.errors,
        });

        if (!parseResult.success || !parseResult.schema) {
          console.error('❌ SERVER: Parse failed:', parseResult.errors);
          return {
            tables: [],
            relationships: [],
            enums: [],
            success: false,
            error: parseResult.errors?.[0]?.message || 'Failed to parse DBML',
            schema: null,
          };
        }

        const schema = parseResult.schema as {
          tables: any[];
          relationships: any[];
          enums?: any[];
        };
        
        // Transform schema to the format expected by the frontend
        const tables = schema.tables.map((table: any, index: number) => {
          const columns = table.columns.map((col: any) => ({
            name: col.name,
            type: typeof col.type === 'string' ? col.type : col.type?.name || 'unknown',
            isPrimaryKey: col.primaryKey || false,
            isNotNull: !col.nullable,
            isUnique: col.unique || false,
            note: col.note,
          }));

          return {
            id: table.id,
            name: table.name,
            columns,
            // Use deterministic positioning for SuperJSON compatibility
            x: table.position?.x ?? (50 + (index % 3) * 250),
            y: table.position?.y ?? (50 + Math.floor(index / 3) * 200),
            note: table.note,
          };
        });

        const relationships = schema.relationships.map((rel: any) => ({
          id: rel.id,
          fromTable: rel.fromTable,
          fromColumn: rel.fromColumn,
          toTable: rel.toTable,
          toColumn: rel.toColumn,
          type: rel.type,
          name: rel.name,
        }));

        console.log('✅ SERVER: Parsed tables:', tables.map((t: any) => t.name));
        console.log('🔗 SERVER: Parsed relationships:', relationships);
        console.log('🔗 SERVER: Relationships count:', relationships.length);

        return {
          tables,
          relationships,
          enums: schema.enums || [],
          success: true,
          schema: { tables, relationships, enums: schema.enums || [] },
        };
      } catch (error) {
        console.error('parseDBML error:', error);
        // Return a successful response even on error to prevent client issues
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
});