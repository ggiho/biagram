import { z } from 'zod';
import { ProjectSchema, ProjectMetadataSchema, ProjectSettingsSchema } from './project.js';
import { DatabaseSchemaSchema, DatabaseTypeSchema } from './schema.js';
import { ParseOptionsSchema, ParseResultSchema } from './parser.js';
import { LayoutConfigSchema, LayoutResultSchema, ExportOptionsSchema } from './rendering.js';

// Generic API response wrapper
export const APIResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      field: z.string().optional(),
    }).optional(),
    metadata: z.object({
      timestamp: z.date(),
      requestId: z.string().optional(),
      version: z.string().optional(),
    }).optional(),
  });

export type APIResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    field?: string;
  };
  metadata?: {
    timestamp: Date;
    requestId?: string;
    version?: string;
  };
};

// Error codes
export const ErrorCodeSchema = z.enum([
  // General errors
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'RATE_LIMITED',

  // Parsing errors
  'PARSE_ERROR',
  'INVALID_DBML',
  'INVALID_DDL',
  'UNSUPPORTED_SQL_DIALECT',
  'SYNTAX_ERROR',
  'SEMANTIC_ERROR',

  // Schema errors
  'INVALID_SCHEMA',
  'MISSING_REFERENCE',
  'CIRCULAR_REFERENCE',
  'DUPLICATE_TABLE',
  'DUPLICATE_COLUMN',

  // Export errors
  'EXPORT_FAILED',
  'UNSUPPORTED_FORMAT',
  'EXPORT_TOO_LARGE',

  // Layout errors
  'LAYOUT_FAILED',
  'INVALID_CONSTRAINTS',
  'LAYOUT_TIMEOUT',

  // Project errors
  'PROJECT_NOT_FOUND',
  'PROJECT_ACCESS_DENIED',
  'PROJECT_VERSION_CONFLICT',
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

// Project API schemas
export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  dbType: DatabaseTypeSchema,
  isPublic: z.boolean().default(false),
  initialSchema: z.string().optional(), // DBML or DDL
  settings: ProjectSettingsSchema.optional(),
});

export const UpdateProjectRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  schema: DatabaseSchemaSchema.optional(),
  settings: ProjectSettingsSchema.optional(),
  isPublic: z.boolean().optional(),
});

export const ProjectListQuerySchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  isPublic: z.boolean().optional(),
});

export const ProjectListResponseSchema = z.object({
  projects: z.array(ProjectMetadataSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
});

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;
export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

// Parser API schemas
export const ParseDBMLRequestSchema = z.object({
  content: z.string(),
  options: ParseOptionsSchema.optional(),
});

export const ParseDDLRequestSchema = z.object({
  content: z.string(),
  sourceType: DatabaseTypeSchema,
  options: ParseOptionsSchema.optional(),
});

export const ValidateSchemaRequestSchema = z.object({
  schema: DatabaseSchemaSchema,
  strict: z.boolean().default(false),
});

export type ParseDBMLRequest = z.infer<typeof ParseDBMLRequestSchema>;
export type ParseDDLRequest = z.infer<typeof ParseDDLRequestSchema>;
export type ValidateSchemaRequest = z.infer<typeof ValidateSchemaRequestSchema>;

// Export API schemas
export const ExportSQLRequestSchema = z.object({
  schema: DatabaseSchemaSchema,
  targetType: DatabaseTypeSchema,
  options: z.object({
    includeDropStatements: z.boolean().default(false),
    includeConstraints: z.boolean().default(true),
    includeIndexes: z.boolean().default(true),
    includeComments: z.boolean().default(true),
    formatting: z.object({
      indentSize: z.number().default(2),
      useSpaces: z.boolean().default(true),
      uppercaseKeywords: z.boolean().default(true),
    }).optional(),
  }).optional(),
});

export const ExportImageRequestSchema = z.object({
  schema: DatabaseSchemaSchema,
  layout: LayoutConfigSchema.optional(),
  options: ExportOptionsSchema,
});

export const ExportDBMLRequestSchema = z.object({
  schema: DatabaseSchemaSchema,
  options: z.object({
    includeComments: z.boolean().default(true),
    formatting: z.object({
      indentSize: z.number().default(2),
      useSpaces: z.boolean().default(true),
    }).optional(),
  }).optional(),
});

export const ExportResponseSchema = z.object({
  content: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

export type ExportSQLRequest = z.infer<typeof ExportSQLRequestSchema>;
export type ExportImageRequest = z.infer<typeof ExportImageRequestSchema>;
export type ExportDBMLRequest = z.infer<typeof ExportDBMLRequestSchema>;
export type ExportResponse = z.infer<typeof ExportResponseSchema>;

// Layout API schemas
export const AutoLayoutRequestSchema = z.object({
  schema: DatabaseSchemaSchema,
  algorithm: z.enum(['force-directed', 'hierarchical', 'grid']).default('force-directed'),
  constraints: z.object({
    fixedTables: z.array(z.string()).optional(),
    groupings: z.array(z.string()).optional(),
    spacing: z.object({
      table: z.number().default(50),
      relationship: z.number().default(20),
    }).optional(),
  }).optional(),
});

export const OptimizeLayoutRequestSchema = z.object({
  schema: DatabaseSchemaSchema,
  currentLayout: LayoutResultSchema,
  objectives: z.array(z.enum(['minimize_crossings', 'minimize_distance', 'group_related'])).default(['minimize_crossings']),
});

export type AutoLayoutRequest = z.infer<typeof AutoLayoutRequestSchema>;
export type OptimizeLayoutRequest = z.infer<typeof OptimizeLayoutRequestSchema>;

// Batch operation schemas
export const BatchOperationSchema = z.object({
  type: z.enum(['parse', 'export', 'validate']),
  id: z.string(),
  input: z.unknown(),
});

export const BatchRequestSchema = z.object({
  operations: z.array(BatchOperationSchema),
  parallel: z.boolean().default(true),
});

export const BatchResponseSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
  })),
  metadata: z.object({
    totalTime: z.number(),
    parallelExecution: z.boolean(),
  }),
});

export type BatchOperation = z.infer<typeof BatchOperationSchema>;
export type BatchRequest = z.infer<typeof BatchRequestSchema>;
export type BatchResponse = z.infer<typeof BatchResponseSchema>;