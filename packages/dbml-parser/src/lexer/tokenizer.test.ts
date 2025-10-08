import { describe, it, expect } from 'vitest';
import { DBMLTokenizer } from './tokenizer.js';

describe('DBMLTokenizer', () => {
  describe('Basic Tokenization', () => {
    it('should tokenize simple table declaration', () => {
      const source = `
        Table users {
          id integer
          name varchar(100)
        }
      `;

      const tokenizer = new DBMLTokenizer(source);
      const { tokens, errors } = tokenizer.tokenize();

      expect(errors).toHaveLength(0);

      const tokenTypes = tokens
        .filter(t => t.type !== 'newline' && t.type !== 'eof')
        .map(t => t.type);

      expect(tokenTypes).toEqual([
        'table',
        'identifier',      // users
        'left_brace',
        'identifier',      // id
        'integer',
        'identifier',      // name
        'varchar',
        'left_paren',
        'number',          // 100
        'right_paren',
        'right_brace',
      ]);
    });

    it('should tokenize keywords correctly', () => {
      const source = 'table enum ref project indexes tablegroup note';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens } = tokenizer.tokenize();

      const keywordTokens = tokens.filter(t => t.type !== 'eof');
      expect(keywordTokens).toHaveLength(7);
      expect(keywordTokens.map(t => t.type)).toEqual([
        'table', 'enum', 'ref', 'project', 'indexes', 'tablegroup', 'note'
      ]);
    });

    it('should tokenize data types correctly', () => {
      const source = 'varchar integer bigint decimal boolean timestamp date time text json uuid';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens } = tokenizer.tokenize();

      const typeTokens = tokens.filter(t => t.type !== 'eof');
      expect(typeTokens.map(t => t.type)).toEqual([
        'varchar', 'integer', 'bigint', 'decimal', 'boolean',
        'timestamp', 'date', 'time', 'text', 'json', 'uuid'
      ]);
    });
  });

  describe('String Literals', () => {
    it('should tokenize double-quoted strings', () => {
      const source = '"Hello World"';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens, errors } = tokenizer.tokenize();

      expect(errors).toHaveLength(0);
      expect(tokens[0]).toEqual({
        type: 'string',
        value: '"Hello World"',
        position: { line: 1, column: 0, offset: 0 },
        raw: '"Hello World"',
      });
    });

    it('should tokenize single-quoted strings', () => {
      const source = "'Single quotes'";
      const tokenizer = new DBMLTokenizer(source);
      const { tokens, errors } = tokenizer.tokenize();

      expect(errors).toHaveLength(0);
      expect(tokens[0].type).toBe('string');
      expect(tokens[0].value).toBe("'Single quotes'");
    });

    it('should handle escape sequences in strings', () => {
      const source = '"Line 1\\nLine 2\\tTabbed"';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens, errors } = tokenizer.tokenize();

      expect(errors).toHaveLength(0);
      expect(tokens[0].type).toBe('string');
    });

    it('should handle unterminated strings', () => {
      const source = '"Unterminated string';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens, errors } = tokenizer.tokenize();

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('UNTERMINATED_STRING');
    });
  });

  describe('Numbers', () => {
    it('should tokenize integers', () => {
      const source = '123 0 999';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens } = tokenizer.tokenize();

      const numberTokens = tokens.filter(t => t.type === 'number');
      expect(numberTokens).toHaveLength(3);
      expect(numberTokens.map(t => t.value)).toEqual(['123', '0', '999']);
    });

    it('should tokenize decimal numbers', () => {
      const source = '123.45 0.0 3.14159';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens } = tokenizer.tokenize();

      const numberTokens = tokens.filter(t => t.type === 'number');
      expect(numberTokens).toHaveLength(3);
      expect(numberTokens.map(t => t.value)).toEqual(['123.45', '0.0', '3.14159']);
    });
  });

  describe('Comments', () => {
    it('should tokenize line comments', () => {
      const source = `
        // This is a comment
        table users {}
        // Another comment
      `;

      const tokenizer = new DBMLTokenizer(source);
      const { tokens } = tokenizer.tokenize();

      const commentTokens = tokens.filter(t => t.type === 'comment');
      expect(commentTokens).toHaveLength(2);
      expect(commentTokens[0].value).toBe('// This is a comment');
      expect(commentTokens[1].value).toBe('// Another comment');
    });

    it('should tokenize block comments', () => {
      const source = `
        /* This is a
           multi-line comment */
        table users {}
      `;

      const tokenizer = new DBMLTokenizer(source);
      const { tokens } = tokenizer.tokenize();

      const commentTokens = tokens.filter(t => t.type === 'multiline_comment');
      expect(commentTokens).toHaveLength(1);
      expect(commentTokens[0].value).toMatch(/\/\* This is a[\s\S]*multi-line comment \*\//);
    });

    it('should handle unterminated block comments', () => {
      const source = '/* Unterminated comment';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens, errors } = tokenizer.tokenize();

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('UNTERMINATED_COMMENT');
    });
  });

  describe('Relationship Operators', () => {
    it('should tokenize relationship operators', () => {
      const source = '- < > <>';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens } = tokenizer.tokenize();

      const relationTokens = tokens.filter(t => t.type !== 'eof');
      expect(relationTokens.map(t => t.type)).toEqual([
        'one_to_one',
        'many_to_one',
        'one_to_many',
        'many_to_many'
      ]);
    });
  });

  describe('Delimiters and Operators', () => {
    it('should tokenize all delimiters', () => {
      const source = '{ } [ ] ( ) : ; , .';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens } = tokenizer.tokenize();

      const delimiterTokens = tokens.filter(t => t.type !== 'eof');
      expect(delimiterTokens.map(t => t.type)).toEqual([
        'left_brace', 'right_brace',
        'left_bracket', 'right_bracket',
        'left_paren', 'right_paren',
        'colon', 'semicolon', 'comma', 'dot'
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected characters', () => {
      const source = 'table users { @invalid }';
      const tokenizer = new DBMLTokenizer(source);
      const { tokens, errors } = tokenizer.tokenize();

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('UNEXPECTED_CHARACTER');
      expect(errors[0].message).toContain('@');
    });
  });

  describe('Position Tracking', () => {
    it('should track line and column positions correctly', () => {
      const source = `table users {
  id integer
}`;
      const tokenizer = new DBMLTokenizer(source);
      const { tokens } = tokenizer.tokenize();

      // Find the 'id' token
      const idToken = tokens.find(t => t.value === 'id');
      expect(idToken).toBeDefined();
      expect(idToken!.position.line).toBe(2);
      expect(idToken!.position.column).toBe(2);
    });
  });

  describe('Performance', () => {
    it('should tokenize large input efficiently', () => {
      // Generate a large DBML input
      const tables = Array.from({ length: 100 }, (_, i) => `
        Table table_${i} {
          id integer [pk]
          name varchar(255)
          created_at timestamp
          updated_at timestamp
        }
      `).join('\n');

      const start = performance.now();
      const tokenizer = new DBMLTokenizer(tables);
      const { tokens, errors } = tokenizer.tokenize();
      const end = performance.now();

      expect(errors).toHaveLength(0);
      expect(tokens.length).toBeGreaterThan(1000);
      expect(end - start).toBeLessThan(100); // Should complete in under 100ms
    });
  });
});