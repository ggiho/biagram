// Import parser functionality
import { DBMLParser } from './parser/parser';
import { DBMLTokenizer } from './lexer/tokenizer';

// Import types from shared package
import type {
  ParseResult,
  ParseOptions,
  ParseError,
  ParseWarning,
  Token,
  TokenType,
  ASTNode,
  DatabaseSchema,
  Table,
  Column,
  Relationship,
  Enum,
  Index,
  TableGroup,
} from '@biagram/shared';

// Export main parser functionality
export { DBMLParser } from './parser/parser';
export { DBMLTokenizer } from './lexer/tokenizer';

// Re-export types from shared package for convenience
export type {
  ParseResult,
  ParseOptions,
  ParseError,
  ParseWarning,
  Token,
  TokenType,
  ASTNode,
  DatabaseSchema,
  Table,
  Column,
  Relationship,
  Enum,
  Index,
  TableGroup,
} from '@biagram/shared';

// Parser utilities
export class DBML {
  /**
   * Parse DBML source code into a DatabaseSchema
   */
  static parse(source: string, options?: Partial<ParseOptions>): ParseResult {
    return DBMLParser.parse(source, options);
  }

  /**
   * Tokenize DBML source code
   */
  static tokenize(source: string): { tokens: Token[]; errors: ParseError[] } {
    const tokenizer = new DBMLTokenizer(source);
    return tokenizer.tokenize();
  }

  /**
   * Validate DBML syntax without full parsing
   */
  static validate(source: string): ParseError[] {
    const result = DBMLParser.parse(source, {
      strict: true,
      ignoreErrors: false,
      preserveComments: false,
      autoFixErrors: false,
      maxErrors: 100,
    });
    return result.errors;
  }

  /**
   * Check if DBML source is syntactically valid
   */
  static isValid(source: string): boolean {
    const errors = DBML.validate(source);
    return errors.length === 0;
  }

  /**
   * Parse with performance timing
   */
  static parseWithTiming(source: string, options?: Partial<ParseOptions>): ParseResult & { timing: number } {
    const start = performance.now();
    const result = DBMLParser.parse(source, options);
    const end = performance.now();

    return {
      ...result,
      timing: end - start,
    };
  }
}

// Convenience function for simple parsing
export function parseDBML(source: string, options?: Partial<ParseOptions>): ParseResult {
  return DBML.parse(source, options);
}

// Default export
export default DBML;