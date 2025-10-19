import {
  Token,
  TokenType,
  ASTNode,
  ASTNodeType,
  ParseError,
  ParseResult,
  ParseOptions,
  SourcePosition,
  DatabaseSchema,
  Table,
  Column,
  Relationship,
  Enum,
  Index,
  TableGroup,
} from '@biagram/shared';
import { DBMLTokenizer } from '../lexer/tokenizer';

/**
 * High-performance recursive descent parser for DBML
 *
 * Implements complete DBML syntax with error recovery and incremental parsing capabilities.
 * Optimized for real-time parsing with minimal latency.
 */
export class DBMLParser {
  private tokens: Token[];
  private current: number = 0;
  private errors: ParseError[] = [];
  private options: ParseOptions;

  constructor(tokens: Token[], options: Partial<ParseOptions> = {}) {
    this.tokens = tokens.filter(t =>
      t.type !== 'newline' &&
      t.type !== 'comment' &&
      t.type !== 'multiline_comment'
    );
    this.current = 0;
    this.errors = [];
    this.options = {
      strict: options.strict ?? false,
      ignoreErrors: options.ignoreErrors ?? false,
      preserveComments: options.preserveComments ?? true,
      autoFixErrors: options.autoFixErrors ?? false,
      maxErrors: options.maxErrors ?? 100,
    };
  }

  static parse(source: string, options: Partial<ParseOptions> = {}): ParseResult {
    const startTime = performance.now();

    // Tokenize
    const tokenizer = new DBMLTokenizer(source);
    const { tokens, errors: tokenErrors } = tokenizer.tokenize();

    // Parse
    const parser = new DBMLParser(tokens, options);
    const schema = parser.parseProgram();

    const endTime = performance.now();

    const allErrors = [...tokenErrors, ...parser.errors];

    return {
      success: allErrors.filter(e => e.severity === 'error').length === 0,
      schema: allErrors.length === 0 ? schema : undefined,
      errors: allErrors.filter(e => e.severity === 'error'),
      warnings: allErrors.filter(e => e.severity === 'warning') as any,
      metadata: {
        sourceType: 'dbml',
        parseTime: endTime - startTime,
        tokenCount: tokens.length,
        nodeCount: parser.countNodes(schema as any),
      },
    };
  }

  private parseProgram(): DatabaseSchema {
    const schema: DatabaseSchema = {
      id: this.generateId(),
      name: 'Untitled Schema',
      description: undefined,
      tables: [],
      relationships: [],
      enums: [],
      indexes: [],
      tableGroups: [],
      metadata: {
        source: 'dbml',
        version: '1.0',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    // Parse top-level declarations
    while (!this.isAtEnd()) {
      try {
        const declaration = this.parseDeclaration();
        if (declaration) {
          this.addToSchema(schema, declaration);
        }
      } catch (error) {
        if (this.errors.length >= this.options.maxErrors!) {
          break;
        }
        this.synchronize();
      }
    }

    return schema;
  }

  private parseDeclaration(): any {
    if (this.match('project')) {
      return this.parseProjectDeclaration();
    }

    if (this.match('table')) {
      return this.parseTableDeclaration();
    }

    if (this.match('enum')) {
      return this.parseEnumDeclaration();
    }

    if (this.match('ref')) {
      return this.parseReferenceDeclaration();
    }

    if (this.match('tablegroup')) {
      return this.parseTableGroupDeclaration();
    }

    // Skip unknown tokens with error recovery
    this.addError(
      'syntax',
      'UNEXPECTED_TOKEN',
      `Unexpected token: ${this.peek().type}`,
      this.peek().position
    );
    this.advance();
    return null;
  }

  private parseProjectDeclaration(): any {
    const name = this.consume('identifier', 'Expected project name').value;

    this.consume('left_brace', 'Expected "{" after project name');

    const settings: Record<string, any> = {};

    while (!this.check('right_brace') && !this.isAtEnd()) {
      const property = this.parseProjectProperty();
      if (property) {
        settings[property.key] = property.value;
      }
    }

    this.consume('right_brace', 'Expected "}" after project body');

    return {
      type: 'project',
      name,
      settings,
    };
  }

  private parseTableDeclaration(): any {
    const name = this.parseTableName();
    const alias = this.match('identifier') ? this.previous().value : undefined;

    this.consume('left_brace', 'Expected "{" after table name');

    const columns: Column[] = [];
    const indexes: Index[] = [];
    let tableNote: string | undefined;

    while (!this.check('right_brace') && !this.isAtEnd()) {
      // Check for table-level Note first (before trying to parse as column)
      if (this.match('note')) {
        // Parse table-level Note: "Note" keyword
        this.consume('colon', 'Expected ":" after Note');
        const noteToken = this.consume('string', 'Expected note text');
        tableNote = noteToken.value.slice(1, -1); // Remove quotes
      } else if (this.match('indexes')) {
        indexes.push(...this.parseIndexesBlock());
      } else {
        const column = this.parseColumnDeclaration();
        if (column) {
          columns.push(column);
        }
      }
    }

    this.consume('right_brace', 'Expected "}" after table body');

    return {
      type: 'table', // Add type field for schema identification
      id: this.generateId(),
      name,
      alias,
      columns,
      note: tableNote,
      color: undefined,
      headerColor: undefined,
      position: { x: 0, y: 0 },
      size: undefined,
    };
  }

  private parseColumnDeclaration(): Column {
    // Column name can be either identifier or quoted identifier
    let name: string;
    if (this.check('identifier')) {
      name = this.advance().value;
    } else {
      name = this.consume('identifier', 'Expected column name').value;
    }
    
    const type = this.parseDataType();
    const constraintData = this.parseColumnConstraints();

    return {
      id: this.generateId(),
      name,
      type,
      nullable: !constraintData.constraints.includes('not_null'),
      primaryKey: constraintData.constraints.includes('primary_key'),
      unique: constraintData.constraints.includes('unique'),
      autoIncrement: constraintData.constraints.includes('auto_increment'),
      defaultValue: constraintData.defaultValue,
      note: constraintData.note,
      references: constraintData.reference,
    };
  }

  private parseDataType(): any {
    const typeName = this.advance().value;

    let size: number | undefined;
    let precision: number | undefined;
    let scale: number | undefined;

    // Handle type parameters like varchar(255) or decimal(10,2)
    if (this.match('left_paren')) {
      size = parseInt(this.consume('number', 'Expected size').value);

      if (this.match('comma')) {
        scale = parseInt(this.consume('number', 'Expected scale').value);
        precision = size;
      }

      this.consume('right_paren', 'Expected ")" after type parameters');
    }

    return {
      name: typeName,
      size,
      precision,
      scale,
    };
  }

  private parseColumnConstraints(): { constraints: string[]; note?: string; defaultValue?: any; reference?: any } {
    const constraints: string[] = [];
    let note: string | undefined;
    let defaultValue: any;
    let reference: any;

    if (this.match('left_bracket')) {
      while (!this.check('right_bracket') && !this.isAtEnd()) {
        const constraintResult = this.parseConstraint();
        if (constraintResult) {
          constraints.push(constraintResult.type);
          if (constraintResult.note) note = constraintResult.note;
          if (constraintResult.defaultValue) defaultValue = constraintResult.defaultValue;
          if (constraintResult.reference) reference = constraintResult.reference;
        }

        if (!this.check('right_bracket')) {
          this.match('comma'); // Optional comma
        }
      }

      this.consume('right_bracket', 'Expected "]" after constraints');
    }

    return { constraints, note, defaultValue, reference };
  }

  private parseConstraint(): { type: string; note?: string; defaultValue?: any; reference?: any } | null {
    const token = this.advance();
    
    if (!token || !token.value) {
      return null;
    }

    switch (token.value.toLowerCase()) {
      case 'pk':
      case 'primary':
        if (this.match('identifier') && this.previous().value.toLowerCase() === 'key') {
          return { type: 'primary_key' };
        }
        return { type: 'primary_key' };

      case 'unique':
        return { type: 'unique' };

      case 'not':
        // Handle "not null" - null can be either identifier or boolean_literal token
        if (this.check('identifier') || this.check('boolean_literal')) {
          const next = this.advance();
          if (next.value.toLowerCase() === 'null') {
            return { type: 'not_null' };
          }
          // Put it back if it wasn't 'null'
          this.current--;
        }
        break;
        
      case 'null':
        // Just "null" constraint (nullable)
        return { type: 'null' };

      case 'increment':
      case 'auto_increment':
        return { type: 'auto_increment' };

      case 'default':
        this.consume('colon', 'Expected ":" after default');
        const defaultToken = this.advance(); // consume default value
        return { type: 'default', defaultValue: defaultToken.value };

      case 'note':
        this.consume('colon', 'Expected ":" after note');
        const noteToken = this.consume('string', 'Expected note text');
        // Remove quotes from string
        const noteValue = noteToken.value.slice(1, -1);
        return { type: 'note', note: noteValue };

      case 'ref':
        this.consume('colon', 'Expected ":" after ref');
        const ref = this.parseReference();
        return { type: 'reference', reference: ref };

      default:
        // Don't error on unknown constraints, just skip them
        // This allows for more flexible parsing
        console.warn(`Unknown constraint: ${token.value}`);
        return null;
    }

    return null;
  }

  private parseEnumDeclaration(): any {
    const name = this.consume('identifier', 'Expected enum name').value;

    this.consume('left_brace', 'Expected "{" after enum name');

    const values: any[] = [];

    while (!this.check('right_brace') && !this.isAtEnd()) {
      const valueName = this.consume('identifier', 'Expected enum value').value;

      let note: string | undefined;
      if (this.match('left_bracket')) {
        if (this.match('identifier') && this.previous().value.toLowerCase() === 'note') {
          this.consume('colon', 'Expected ":" after note');
          note = this.consume('string', 'Expected note text').value;
        }
        this.consume('right_bracket', 'Expected "]" after enum value attributes');
      }

      values.push({ name: valueName, note });
    }

    this.consume('right_brace', 'Expected "}" after enum body');

    return {
      type: 'enum', // Add type field
      id: this.generateId(),
      name,
      values,
      note: undefined,
    };
  }

  private parseReferenceDeclaration(): any {
    // Ref: can have optional colon after it
    // Ref: table.column > table.column
    // or
    // Ref table.column > table.column
    this.match('colon'); // Optional colon
    
    const fromRef = this.parseReference();

    let relationshipType: any = 'one-to-many';

    // Parse relationship type operators: <, >, -, <>
    if (this.match('one_to_one')) {
      relationshipType = 'one-to-one';
    } else if (this.match('one_to_many')) {
      relationshipType = 'one-to-many';
    } else if (this.match('many_to_one')) {
      relationshipType = 'many-to-one';
    } else if (this.match('many_to_many')) {
      relationshipType = 'many-to-many';
    }

    const toRef = this.parseReference();

    return {
      type: 'relationship', // Add type field
      id: this.generateId(),
      relationshipType, // Keep original type as relationshipType
      fromTable: fromRef.table,
      fromColumn: fromRef.column,
      toTable: toRef.table,
      toColumn: toRef.column,
      cardinality: undefined,
      onUpdate: undefined,
      onDelete: undefined,
      name: undefined,
      note: undefined,
    };
  }

  private parseReference(): any {
    // Table name or schema name (can be quoted identifier)
    let tableColumn: string;
    if (this.check('identifier')) {
      tableColumn = this.advance().value;
    } else {
      tableColumn = this.consume('identifier', 'Expected table.column reference').value;
    }

    if (this.match('dot')) {
      // Column name (can also be quoted identifier)
      let column: string;
      if (this.check('identifier')) {
        column = this.advance().value;
      } else {
        column = this.consume('identifier', 'Expected column name after "."').value;
      }
      return { table: tableColumn, column };
    }

    // If no dot, assume it's just a column name in current context
    return { table: '', column: tableColumn };
  }

  private parseTableGroupDeclaration(): TableGroup {
    const name = this.consume('identifier', 'Expected table group name').value;

    this.consume('left_brace', 'Expected "{" after table group name');

    const tables: string[] = [];

    while (!this.check('right_brace') && !this.isAtEnd()) {
      const tableName = this.consume('identifier', 'Expected table name').value;
      tables.push(tableName);
    }

    this.consume('right_brace', 'Expected "}" after table group body');

    return {
      id: this.generateId(),
      name,
      color: undefined,
      tables,
      note: undefined,
    };
  }

  private parseIndexesBlock(): Index[] {
    this.consume('left_brace', 'Expected "{" after indexes');

    const indexes: Index[] = [];

    while (!this.check('right_brace') && !this.isAtEnd()) {
      const index = this.parseIndexDeclaration();
      if (index) {
        indexes.push(index);
      }
    }

    this.consume('right_brace', 'Expected "}" after indexes block');

    return indexes;
  }

  private parseIndexDeclaration(): Index | null {
    // Parse index specification: (column1, column2) [unique]
    // Also support single column without parentheses for inline indexes
    
    const columns: string[] = [];
    let unique = false;
    let indexType: any = undefined;
    let indexName: string | undefined = undefined;

    // Check if it starts with parentheses (composite index) or just a column name
    if (this.match('left_paren')) {
      // Composite index: (col1, col2)
      do {
        let column: string;
        if (this.check('identifier')) {
          column = this.advance().value;
        } else {
          column = this.consume('identifier', 'Expected column name').value;
        }
        columns.push(column);
      } while (this.match('comma'));

      this.consume('right_paren', 'Expected ")" after index columns');
    } else if (this.check('identifier')) {
      // Single column index without parentheses
      columns.push(this.advance().value);
    } else {
      this.addError('syntax', 'EXPECTED_PAREN', 'Expected "(" or column name for index', this.peek().position);
      return null;
    }

    // Parse index attributes: [unique, name: "idx_name", pk, etc.]
    if (this.match('left_bracket')) {
      while (!this.check('right_bracket') && !this.isAtEnd()) {
        const attr = this.consume('identifier', 'Expected index attribute').value;

        if (attr.toLowerCase() === 'unique') {
          unique = true;
        } else if (attr.toLowerCase() === 'pk') {
          indexType = 'primary';
          unique = true;
        } else if (attr.toLowerCase() === 'name') {
          // Parse index name: name: "idx_name"
          this.consume('colon', 'Expected ":" after name');
          if (this.check('string')) {
            indexName = this.advance().value;
            // Remove quotes from string
            indexName = indexName.slice(1, -1);
          } else if (this.check('identifier')) {
            indexName = this.advance().value;
          }
        } else {
          indexType = attr;
        }

        this.match('comma'); // Optional comma
      }

      this.consume('right_bracket', 'Expected "]" after index attributes');
    }

    return {
      id: this.generateId(),
      name: indexName || `idx_${columns.join('_')}`,
      tableName: '', // Will be set by parent table
      columns,
      type: indexType,
      unique,
      note: undefined,
    };
  }

  private parseProjectProperty(): { key: string; value: any } | null {
    const key = this.consume('identifier', 'Expected property name').value;
    this.consume('colon', 'Expected ":" after property name');

    let value: any;

    if (this.check('string')) {
      value = this.advance().value.slice(1, -1); // Remove quotes
    } else if (this.check('number')) {
      value = parseFloat(this.advance().value);
    } else if (this.check('boolean_literal')) {
      value = this.advance().value === 'true';
    } else {
      value = this.advance().value;
    }

    return { key, value };
  }

  private parseTableName(): string {
    // Table name can be either identifier or quoted identifier
    let name: string;
    if (this.check('identifier')) {
      name = this.advance().value;
    } else {
      name = this.consume('identifier', 'Expected table name').value;
    }

    // Handle schema.table syntax
    if (this.match('dot')) {
      // After schema dot, accept identifier or 'note' keyword as table name
      // This allows CUSTOMER.NOTE pattern
      const nextToken = this.peek();
      if (nextToken.type === 'identifier' || nextToken.type === 'note') {
        const tableName = this.advance().value;
        return `${name}.${tableName}`;
      } else {
        this.addError('syntax', 'EXPECTED_TABLE_NAME', 'Expected table name after schema', this.peek().position);
        return name;
      }
    }

    return name;
  }

  // Utility methods
  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'eof';
  }

  private peek(): Token {
    return this.tokens[this.current] || {
      type: 'eof',
      value: '',
      position: { line: 0, column: 0, offset: 0 },
      raw: ''
    };
  }

  private previous(): Token {
    return this.tokens[this.current - 1] || {
      type: 'eof',
      value: '',
      position: { line: 0, column: 0, offset: 0 },
      raw: ''
    };
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }

    this.addError(
      'syntax',
      'EXPECTED_TOKEN',
      `${message}. Got: ${this.peek().type}`,
      this.peek().position
    );

    // Error recovery: return a synthetic token
    return {
      type,
      value: '',
      position: this.peek().position,
      raw: '',
    };
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === 'semicolon') return;

      switch (this.peek().type) {
        case 'table':
        case 'enum':
        case 'ref':
        case 'project':
        case 'tablegroup':
          return;
      }

      this.advance();
    }
  }

  private addError(
    type: 'syntax' | 'semantic',
    code: string,
    message: string,
    position: SourcePosition
  ): void {
    if (this.errors.length >= this.options.maxErrors!) {
      return;
    }

    const error: ParseError = {
      type,
      code,
      message,
      position,
      severity: 'error',
    };

    this.errors.push(error);
  }

  private addToSchema(schema: DatabaseSchema, declaration: any): void {
    switch (declaration.type) {
      case 'project':
        schema.name = declaration.name;
        // Apply project settings to schema metadata
        break;
      case 'table':
        schema.tables.push(declaration);
        break;
      case 'enum':
        schema.enums.push(declaration);
        break;
      case 'relationship':
        schema.relationships.push(declaration);
        break;
      case 'tablegroup':
        schema.tableGroups.push(declaration);
        break;
    }
  }

  private extractDefaultValue(constraints: string[]): any {
    // Extract default value from constraints
    // This would need to store the value when parsing 'default' constraint
    return undefined;
  }

  private extractNote(constraints: string[]): string | undefined {
    // Note is extracted during constraint parsing
    // We need to store it separately
    return undefined;
  }

  private extractReference(constraints: string[]): any {
    // Extract reference from constraints
    return undefined;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private countNodes(node: any): number {
    if (!node) return 0;

    let count = 1;

    if (Array.isArray(node)) {
      return node.reduce((sum, item) => sum + this.countNodes(item), 0);
    }

    if (typeof node === 'object') {
      for (const value of Object.values(node)) {
        count += this.countNodes(value);
      }
    }

    return count;
  }
}