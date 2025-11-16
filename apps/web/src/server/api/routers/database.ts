/**
 * Database connection and introspection router
 *
 * Handles database connections, introspection, and DBML conversion.
 * Credentials are session-based and never stored permanently.
 */

import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { introspectDatabase } from '@biagram/db-introspector';
import type { DatabaseConnection } from '@biagram/db-introspector';
import { randomUUID } from 'crypto';

/**
 * Connection pool manager
 * Stores active connections with TTL (Time To Live)
 */
class ConnectionPoolManager {
  private pools = new Map<
    string,
    {
      config: DatabaseConnection;
      createdAt: Date;
      lastUsedAt: Date;
    }
  >();

  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get or create connection pool for session
   */
  getConnection(sessionId: string): DatabaseConnection | null {
    const entry = this.pools.get(sessionId);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.lastUsedAt.getTime() > this.TTL) {
      this.pools.delete(sessionId);
      return null;
    }

    // Update last used time
    entry.lastUsedAt = new Date();
    return entry.config;
  }

  /**
   * Store connection config for session
   */
  setConnection(sessionId: string, config: DatabaseConnection): void {
    this.pools.set(sessionId, {
      config,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    });
  }

  /**
   * Remove connection for session
   */
  removeConnection(sessionId: string): void {
    this.pools.delete(sessionId);
  }

  /**
   * Cleanup expired connections
   */
  cleanup(): void {
    const now = Date.now();
    for (const [sessionId, entry] of Array.from(this.pools.entries())) {
      if (now - entry.lastUsedAt.getTime() > this.TTL) {
        this.pools.delete(sessionId);
      }
    }
  }
}

// Global connection pool manager
const poolManager = new ConnectionPoolManager();

// Cleanup expired connections every minute
setInterval(() => {
  poolManager.cleanup();
}, 60 * 1000);

/**
 * Validation schemas
 */
const DatabaseConnectionSchema = z.object({
  type: z.enum(['mysql', 'postgresql']),
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1, 'Database name is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string(), // Can be empty for some setups
  ssl: z.boolean().optional(),
  schemaFilter: z.array(z.string()).optional(),
});

const TestConnectionInputSchema = DatabaseConnectionSchema;

const IntrospectInputSchema = z.object({
  useStoredConnection: z.boolean().optional(),
  connection: DatabaseConnectionSchema.optional(),
  sessionId: z.string().optional(), // For unauthenticated users
});

/**
 * Helper to get session ID (authenticated or temporary)
 */
function getSessionId(ctx: any): string {
  if (ctx.session?.userId) {
    return ctx.session.userId;
  }
  // Generate temporary session ID for unauthenticated users
  // Use IP or create a temporary ID (in production, consider using cookies)
  return `temp-${randomUUID()}`;
}

/**
 * Database router
 */
export const databaseRouter = createTRPCRouter({
  /**
   * Test database connection
   */
  testConnection: publicProcedure
    .input(TestConnectionInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Validate connection config
        const config: DatabaseConnection = {
          type: input.type,
          host: input.host,
          port: input.port,
          database: input.database,
          username: input.username,
          password: input.password,
          ...(input.ssl !== undefined && { ssl: input.ssl }),
          ...(input.schemaFilter !== undefined && { schemaFilter: input.schemaFilter }),
        };

        // Test connection by attempting introspection
        // We don't need the full result, just want to verify connection works
        const result = await introspectDatabase(config);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Connection test failed',
          };
        }

        // Store connection in session if test succeeded
        const sessionId = getSessionId(ctx);
        poolManager.setConnection(sessionId, config);

        return {
          success: true,
          message: 'Connection successful',
          stats: result.stats,
          sessionId, // Return sessionId so client can use it for introspection
        };
      } catch (error) {
        console.error('Database connection test failed:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          success: false,
          error: errorMessage,
        };
      }
    }),

  /**
   * Introspect database and return DBML
   */
  introspect: publicProcedure
    .input(IntrospectInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        let config: DatabaseConnection | null = null;

        // Use stored connection or provided connection
        if (input.useStoredConnection) {
          // Use provided sessionId or get from context
          const sessionId = input.sessionId || getSessionId(ctx);
          config = poolManager.getConnection(sessionId);

          if (!config) {
            return {
              success: false,
              error: 'No stored connection found. Please test connection first.',
            };
          }
        } else if (input.connection) {
          config = {
            type: input.connection.type,
            host: input.connection.host,
            port: input.connection.port,
            database: input.connection.database,
            username: input.connection.username,
            password: input.connection.password,
            ...(input.connection.ssl !== undefined && { ssl: input.connection.ssl }),
            ...(input.connection.schemaFilter !== undefined && { schemaFilter: input.connection.schemaFilter }),
          };
        } else {
          return {
            success: false,
            error: 'No connection configuration provided',
          };
        }

        // Perform introspection
        if (!config) {
          return {
            success: false,
            error: 'No connection configuration available',
          };
        }

        const result = await introspectDatabase(config);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Introspection failed',
          };
        }

        return {
          success: true,
          dbml: result.dbml,
          stats: result.stats,
        };
      } catch (error) {
        console.error('Database introspection failed:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          success: false,
          error: errorMessage,
        };
      }
    }),

  /**
   * Clear stored connection
   */
  clearConnection: publicProcedure
    .input(z.object({ sessionId: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const sessionId = input.sessionId || getSessionId(ctx);
      poolManager.removeConnection(sessionId);

      return {
        success: true,
        message: 'Connection cleared',
      };
    }),

  /**
   * Check if connection is stored
   */
  hasStoredConnection: publicProcedure
    .input(z.object({ sessionId: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const sessionId = input.sessionId || getSessionId(ctx);
      const config = poolManager.getConnection(sessionId);

      return {
        hasConnection: config !== null,
        connectionInfo: config
          ? {
              type: config.type,
              host: config.host,
              port: config.port,
              database: config.database,
              username: config.username,
            }
          : null,
      };
    }),
});
