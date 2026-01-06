import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { convertDDLtoDBMLAuto, convertDBMLtoDDL } from '@biagram/ddl-converter';
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
        console.log('📝 DDL length:', input.ddl.length);
        console.log('📝 DDL preview:', input.ddl.substring(0, 100));

        const result = convertDDLtoDBMLAuto(input.ddl);

        console.log('📊 Parse result:', { success: result.success, errors: result.errors, dbmlLength: result.dbml?.length || 0 });

        if (!result.success) {
          console.error('❌ Parse failed:', result.errors);
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
        console.log('🔧 SERVER: Starting DBMLParser.parse()...');
        let parseResult;
        try {
          parseResult = DBMLParser.parse(input.content);
          console.log('✅ SERVER: DBMLParser.parse() completed');
        } catch (parseError) {
          console.error('❌ SERVER: DBMLParser.parse() threw exception:', parseError);
          console.error('❌ SERVER: Parse error type:', parseError?.constructor?.name);
          console.error('❌ SERVER: Parse error message:', parseError instanceof Error ? parseError.message : String(parseError));
          throw parseError;
        }
        
        const tempSchema = parseResult.schema as any;
        console.log('🔍 SERVER: Parse result:', {
          success: parseResult.success,
          tablesCount: tempSchema?.tables?.length || 0,
          relationshipsCount: tempSchema?.relationships?.length || 0,
          errors: parseResult.errors,
        });

        if (!parseResult.success || !parseResult.schema) {
          console.error('❌ SERVER: Parse failed:', parseResult.errors);

          // 🚨 위치 정보를 포함한 상세 에러 메시지 생성
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

        const schema = parseResult.schema as {
          tables: any[];
          relationships: any[];
          enums?: any[];
        };
        
        // Transform schema to the format expected by the frontend
        const tables = schema.tables.map((table: any, index: number) => {
          // Debug: Log table info
          if (index === 0) {
            console.log('🔍 DEBUG: First table raw data:', {
              name: table.name,
              note: table.note,
              firstColumn: table.columns?.[0],
            });
          }
          
          const columns = table.columns.map((col: any) => ({
            name: col.name,
            type: typeof col.type === 'string' ? col.type : col.type?.name || 'unknown',
            isPrimaryKey: col.primaryKey || false,
            // FK는 references가 있거나 ref 속성이 있는 경우
            isForeignKey: !!(col.references || col.ref),
            isNotNull: !col.nullable,
            isUnique: col.unique || false,
            note: col.note,
          }));

          return {
            id: table.id,
            name: table.name,
            schema: table.schema, // Include schema for schema.table notation
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

  // Convert DBML to DDL
  convertDBMLtoDDL: publicProcedure
    .input(z.object({
      dbml: z.string(),
      dialect: z.enum(['mysql', 'postgresql']).default('mysql'),
      includeForeignKeys: z.boolean().default(true)
    }))
    .mutation(async ({ input }) => {
      try {
        console.log('🔄 SERVER: convertDBMLtoDDL called with dialect:', input.dialect);
        console.log('📝 DBML length:', input.dbml.length);

        // Parse DBML first
        const parseResult = DBMLParser.parse(input.dbml);

        if (!parseResult.success || !parseResult.schema) {
          console.error('❌ DBML parse failed:', parseResult.errors);
          return {
            success: false,
            ddl: '',
            errors: parseResult.errors?.map(e => e.message) || ['Failed to parse DBML'],
          };
        }

        // Convert to DDL
        const ddl = convertDBMLtoDDL(parseResult.schema, input.dialect, input.includeForeignKeys);

        console.log('✅ DDL generated successfully, length:', ddl.length, 'includeForeignKeys:', input.includeForeignKeys);

        return {
          success: true,
          ddl,
          errors: undefined,
        };
      } catch (error) {
        console.error('❌ convertDBMLtoDDL error:', error);
        return {
          success: false,
          ddl: '',
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        };
      }
    }),
});