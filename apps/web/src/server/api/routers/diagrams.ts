import { TRPCError } from '@trpc/server';
import { z } from 'zod';

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

        // Basic DBML parsing implementation
        const tables: any[] = [];
        const relationships: any[] = [];

        // Parse tables from DBML content
        const tableMatches = Array.from(input.content.matchAll(/Table\s+(\w+)\s*\{([^}]+)\}/gi));

        for (const match of tableMatches) {
          const tableName = match[1];
          const tableBody = match[2];

          if (!tableName || !tableBody) continue;

          // Parse columns from table body
          const columns = [];
          const columnMatches = Array.from(tableBody.matchAll(/(\w+)\s+(\w+)(?:\s+\[([^\]]+)\])?/gi));

          for (const colMatch of columnMatches) {
            const [, name, type, attributes] = colMatch;
            columns.push({
              name,
              type,
              isPrimaryKey: attributes?.includes('primary key') || attributes?.includes('pk') || false,
              isNotNull: attributes?.includes('not null') || false,
              isUnique: attributes?.includes('unique') || false,
            });
          }

          // Use deterministic positioning instead of Math.random() for SuperJSON compatibility
          const tableIndex = tables.length;
          tables.push({
            id: tableName,
            name: tableName,
            columns,
            x: 50 + (tableIndex % 3) * 250, // Deterministic grid positioning
            y: 50 + Math.floor(tableIndex / 3) * 200,
          });
        }

        // Parse relationships
        const refMatches = Array.from(input.content.matchAll(/Ref:\s*(\w+)\.(\w+)\s*([<>-]+)\s*(\w+)\.(\w+)/gi));

        for (const match of refMatches) {
          const [, fromTable, fromColumn, operator, toTable, toColumn] = match;

          if (!fromTable || !fromColumn || !operator || !toTable || !toColumn) continue;

          relationships.push({
            id: `${fromTable}_${fromColumn}_${toTable}_${toColumn}`,
            fromTable,
            fromColumn,
            toTable,
            toColumn,
            type: operator.includes('>') ? 'one-to-many' : 'many-to-one',
          });
        }

        console.log('🔗 SERVER: Parsed relationships:', relationships);
        console.log('🔗 SERVER: Relationships count:', relationships.length);

        return {
          tables,
          relationships,
          enums: [],
          success: true,
          schema: { tables, relationships, enums: [] },
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