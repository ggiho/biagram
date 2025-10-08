import { DDLParseResult, TableDef, ColumnDef, ForeignKeyDef, IndexDef } from './types';

export class MySQLParser {
  private tables: TableDef[] = [];
  private errors: string[] = [];
  private warnings: string[] = [];

  parse(ddl: string): DDLParseResult {
    this.tables = [];
    this.errors = [];
    this.warnings = [];

    try {
      // Remove comments
      const cleaned = this.removeComments(ddl);

      // Split into statements
      const statements = this.splitStatements(cleaned);

      // Parse each statement
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed.toUpperCase().startsWith('CREATE TABLE')) {
          this.parseCreateTable(trimmed);
        }
      }

      // Convert to DBML
      const dbml = this.convertToDBML();

      return {
        success: this.errors.length === 0,
        dbml,
        errors: this.errors.length > 0 ? this.errors : undefined,
        warnings: this.warnings.length > 0 ? this.warnings : undefined,
      };
    } catch (error) {
      this.errors.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        dbml: '',
        errors: this.errors,
        warnings: undefined,
      };
    }
  }

  private removeComments(sql: string): string {
    // Remove single-line comments
    let result = sql.replace(/--[^\n]*/g, '');
    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
  }

  private splitStatements(sql: string): string[] {
    // Simple split by semicolon (could be improved for edge cases)
    return sql.split(';').filter(s => s.trim().length > 0);
  }

  private parseCreateTable(stmt: string): void {
    // Extract table name
    const tableNameMatch = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i);
    if (!tableNameMatch || !tableNameMatch[1]) {
      this.errors.push('Could not extract table name');
      return;
    }

    const tableName = tableNameMatch[1];

    // Extract table definition (content between parentheses)
    const defMatch = stmt.match(/\(([\s\S]+)\)(?:\s*ENGINE|\s*DEFAULT|\s*COMMENT|\s*;|\s*$)/i);
    if (!defMatch || !defMatch[1]) {
      this.errors.push(`Could not extract table definition for ${tableName}`);
      return;
    }

    const tableDef: TableDef = {
      name: tableName,
      columns: [],
      primaryKeys: [],
      foreignKeys: [],
      indexes: [],
    };

    // Parse column and constraint definitions
    const lines = this.splitTableDefinitions(defMatch[1]);

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.toUpperCase().startsWith('PRIMARY KEY')) {
        this.parsePrimaryKey(trimmed, tableDef);
      } else if (trimmed.toUpperCase().startsWith('FOREIGN KEY')) {
        this.parseForeignKey(trimmed, tableDef);
      } else if (trimmed.toUpperCase().startsWith('KEY') ||
                 trimmed.toUpperCase().startsWith('INDEX') ||
                 trimmed.toUpperCase().startsWith('UNIQUE')) {
        this.parseIndex(trimmed, tableDef);
      } else if (trimmed.length > 0) {
        // Column definition
        this.parseColumn(trimmed, tableDef);
      }
    }

    this.tables.push(tableDef);
  }

  private splitTableDefinitions(def: string): string[] {
    // Split by comma, but respect parentheses
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < def.length; i++) {
      const char = def[i];

      if (char === '(') {
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      result.push(current.trim());
    }

    return result;
  }

  private parseColumn(line: string, table: TableDef): void {
    // Extract column name (might be backtick-quoted)
    const nameMatch = line.match(/^`?(\w+)`?\s+/);
    if (!nameMatch || !nameMatch[1]) return;

    const columnName = nameMatch[1];
    const rest = line.substring(nameMatch[0].length);

    // Extract data type
    const typeMatch = rest.match(/^(\w+)(?:\(([^)]+)\))?/i);
    if (!typeMatch || !typeMatch[1]) {
      this.warnings.push(`Could not parse type for column ${columnName}`);
      return;
    }

    const column: ColumnDef = {
      name: columnName,
      type: typeMatch[1].toLowerCase(),
      nullable: !rest.toUpperCase().includes('NOT NULL'),
      autoIncrement: rest.toUpperCase().includes('AUTO_INCREMENT'),
    };

    // Parse size/precision
    if (typeMatch[2]) {
      const params = typeMatch[2].split(',').map(p => p.trim());
      if (params.length === 1 && params[0]) {
        column.size = parseInt(params[0]);
      } else if (params.length === 2 && params[0] && params[1]) {
        column.precision = parseInt(params[0]);
        column.scale = parseInt(params[1]);
      }
    }

    // Extract default value
    const defaultMatch = rest.match(/DEFAULT\s+([^,\s]+)/i);
    if (defaultMatch && defaultMatch[1]) {
      column.defaultValue = defaultMatch[1].replace(/['"]/g, '');
    }

    // Extract comment
    const commentMatch = rest.match(/COMMENT\s+'([^']+)'/i);
    if (commentMatch && commentMatch[1]) {
      column.comment = commentMatch[1];
    }

    // Check for PRIMARY KEY inline
    if (rest.toUpperCase().includes('PRIMARY KEY')) {
      table.primaryKeys.push(columnName);
    }

    table.columns.push(column);
  }

  private parsePrimaryKey(line: string, table: TableDef): void {
    const match = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (match && match[1]) {
      table.primaryKeys = match[1].split(',').map(c => c.trim().replace(/`/g, ''));
    }
  }

  private parseForeignKey(line: string, table: TableDef): void {
    const match = line.match(/FOREIGN\s+KEY\s*\(`?(\w+)`?\)\s*REFERENCES\s+`?(\w+)`?\s*\(`?(\w+)`?\)/i);
    if (match && match[1] && match[2] && match[3]) {
      const fk: ForeignKeyDef = {
        columnName: match[1],
        referencedTable: match[2],
        referencedColumn: match[3],
        onDelete: undefined,
        onUpdate: undefined,
      };

      // Parse ON DELETE/UPDATE
      const onDeleteMatch = line.match(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION)/i);
      if (onDeleteMatch && onDeleteMatch[1]) {
        fk.onDelete = onDeleteMatch[1];
      }

      const onUpdateMatch = line.match(/ON\s+UPDATE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION)/i);
      if (onUpdateMatch && onUpdateMatch[1]) {
        fk.onUpdate = onUpdateMatch[1];
      }

      table.foreignKeys.push(fk);
    }
  }

  private parseIndex(line: string, table: TableDef): void {
    const unique = line.toUpperCase().startsWith('UNIQUE');
    const nameMatch = line.match(/(?:KEY|INDEX)\s+(?:`?(\w+)`?\s+)?\(([^)]+)\)/i);

    if (nameMatch && nameMatch[2]) {
      const columns = nameMatch[2].split(',').map(c => c.trim().replace(/`/g, ''));
      table.indexes.push({
        name: nameMatch[1] || `idx_${columns.join('_')}`,
        columns,
        unique,
      });
    }
  }

  private convertToDBML(): string {
    const lines: string[] = [];

    for (const table of this.tables) {
      lines.push(`Table ${table.name} {`);

      // Add columns
      for (const col of table.columns) {
        const constraints: string[] = [];

        // Build type string
        let typeStr = col.type;
        if (col.size !== undefined) {
          typeStr += `(${col.size})`;
        } else if (col.precision !== undefined && col.scale !== undefined) {
          typeStr += `(${col.precision},${col.scale})`;
        }

        // Add constraints
        if (table.primaryKeys.includes(col.name)) {
          constraints.push('primary key');
        }
        if (!col.nullable) {
          constraints.push('not null');
        }
        if (col.autoIncrement) {
          constraints.push('increment');
        }
        if (col.defaultValue !== undefined) {
          constraints.push(`default: ${col.defaultValue}`);
        }
        if (col.comment) {
          constraints.push(`note: '${col.comment}'`);
        }

        const constraintStr = constraints.length > 0 ? ` [${constraints.join(', ')}]` : '';
        lines.push(`  ${col.name} ${typeStr}${constraintStr}`);
      }

      // Add indexes
      if (table.indexes.length > 0) {
        lines.push('');
        lines.push('  indexes {');
        for (const idx of table.indexes) {
          const attrs = idx.unique ? ' [unique]' : '';
          lines.push(`    (${idx.columns.join(', ')})${attrs}`);
        }
        lines.push('  }');
      }

      lines.push('}');
      lines.push('');
    }

    // Add foreign key relationships
    for (const table of this.tables) {
      for (const fk of table.foreignKeys) {
        lines.push(`Ref: ${table.name}.${fk.columnName} > ${fk.referencedTable}.${fk.referencedColumn}`);
      }
    }

    return lines.join('\n');
  }
}
