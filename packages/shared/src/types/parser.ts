import { z } from 'zod';
import { DatabaseTypeSchema } from './schema.js';

// Source position for error reporting
export const SourcePositionSchema = z.object({
  line: z.number(),
  column: z.number(),
  offset: z.number(),
});

export type SourcePosition = z.infer<typeof SourcePositionSchema>;

// Parse error types
export const ParseErrorSchema = z.object({
  type: z.enum(['syntax', 'semantic', 'validation']),
  code: z.string(),
  message: z.string(),
  position: SourcePositionSchema,
  severity: z.enum(['error', 'warning', 'info']),
  suggestions: z.array(z.string()).optional(),
  context: z.string().optional(),
});

export type ParseError = z.infer<typeof ParseErrorSchema>;

// Parse warning
export const ParseWarningSchema = ParseErrorSchema.extend({
  severity: z.literal('warning'),
});

export type ParseWarning = z.infer<typeof ParseWarningSchema>;

// Parse options
export const ParseOptionsSchema = z.object({
  strict: z.boolean().default(false),
  ignoreErrors: z.boolean().default(false),
  preserveComments: z.boolean().default(true),
  autoFixErrors: z.boolean().default(false),
  maxErrors: z.number().default(100),
  timeout: z.number().optional(), // 타임아웃 (밀리초)
});

export type ParseOptions = z.infer<typeof ParseOptionsSchema>;

// Parse metadata
export const ParseMetadataSchema = z.object({
  sourceType: z.enum(['dbml', 'ddl', 'json']),
  dialectType: DatabaseTypeSchema.optional(),
  version: z.string().optional(),
  encoding: z.string().optional(),
  parseTime: z.number(),
  tokenCount: z.number(),
  nodeCount: z.number(),
});

export type ParseMetadata = z.infer<typeof ParseMetadataSchema>;

// Parse result
export const ParseResultSchema = z.object({
  success: z.boolean(),
  schema: z.unknown().optional(), // DatabaseSchema when successful
  errors: z.array(ParseErrorSchema),
  warnings: z.array(ParseWarningSchema),
  metadata: ParseMetadataSchema,
});

export type ParseResult = z.infer<typeof ParseResultSchema>;

// Token types for lexer
export const TokenTypeSchema = z.enum([
  // Keywords
  'table',
  'enum',
  'ref',
  'project',
  'indexes',
  'tablegroup',
  'note',

  // Data types
  'varchar',
  'integer',
  'bigint',
  'decimal',
  'boolean',
  'timestamp',
  'date',
  'time',
  'text',
  'json',
  'uuid',

  // Operators and delimiters
  'colon',
  'semicolon',
  'comma',
  'dot',
  'left_brace',
  'right_brace',
  'left_bracket',
  'right_bracket',
  'left_paren',
  'right_paren',

  // Relationship operators
  'one_to_one',
  'one_to_many',
  'many_to_one',
  'many_to_many',

  // Literals
  'string',
  'number',
  'identifier',
  'boolean_literal',

  // Special
  'newline',
  'whitespace',
  'comment',
  'multiline_comment',
  'eof',
  'error',
]);

export type TokenType = z.infer<typeof TokenTypeSchema>;

// Token definition
export const TokenSchema = z.object({
  type: TokenTypeSchema,
  value: z.string(),
  position: SourcePositionSchema,
  raw: z.string(),
});

export type Token = z.infer<typeof TokenSchema>;

// AST Node types
export const ASTNodeTypeSchema = z.enum([
  'program',
  'table_declaration',
  'column_declaration',
  'enum_declaration',
  'reference_declaration',
  'index_declaration',
  'project_declaration',
  'tablegroup_declaration',
  'note_declaration',
  'data_type',
  'constraint',
  'expression',
  'identifier',
  'literal',
]);

export type ASTNodeType = z.infer<typeof ASTNodeTypeSchema>;

// Base AST Node
export const BaseASTNodeSchema = z.object({
  type: ASTNodeTypeSchema,
  position: SourcePositionSchema,
  children: z.array(z.lazy(() => ASTNodeSchema)).optional(),
});

// Extended AST Node with recursive definition
export const ASTNodeSchema: z.ZodType<any> = BaseASTNodeSchema.extend({
  // Additional properties will be added based on node type
  name: z.string().optional(),
  value: z.unknown().optional(),
  properties: z.record(z.unknown()).optional(),
});

export type ASTNode = z.infer<typeof ASTNodeSchema>;