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
      console.log('🔄 MySQL Parser: Starting parse...');
      
      // Remove comments
      const cleaned = this.removeComments(ddl);
      console.log('✅ Comments removed, length:', cleaned.length);

      // Split into statements
      const statements = this.splitStatements(cleaned);
      console.log('📋 Found', statements.length, 'statements');

      // Parse each statement
      for (let i = 0; i < statements.length; i++) {
        const trimmed = statements[i]?.trim() || '';
        if (trimmed.toUpperCase().startsWith('CREATE TABLE')) {
          console.log(`🔨 Parsing table ${i + 1}/${statements.length}...`);
          try {
            this.parseCreateTable(trimmed);
            console.log('✅ Table parsed successfully');
          } catch (error) {
            const errMsg = `Error parsing table ${i + 1}: ${error instanceof Error ? error.message : String(error)}`;
            console.error('❌', errMsg);
            this.errors.push(errMsg);
          }
        }
      }

      console.log('📊 Total tables parsed:', this.tables.length);
      console.log('⚠️ Total errors:', this.errors.length);
      console.log('💡 Total warnings:', this.warnings.length);

      // Convert to DBML
      const dbml = this.convertToDBML();
      console.log('📝 DBML generated, length:', dbml.length);

      return {
        success: this.errors.length === 0,
        dbml,
        errors: this.errors.length > 0 ? this.errors : undefined,
        warnings: this.warnings.length > 0 ? this.warnings : undefined,
      };
    } catch (error) {
      const errMsg = `Parse error: ${error instanceof Error ? error.message : String(error)}`;
      console.error('❌ Fatal parse error:', errMsg);
      this.errors.push(errMsg);
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
    // Extract table name (with optional schema)
    const tableNameMatch = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?(\w+)`?\.)?`?(\w+)`?/i);
    if (!tableNameMatch) {
      console.error('❌ Could not match table name in:', stmt.substring(0, 100));
      this.errors.push('Could not extract table name');
      return;
    }

    // Schema.Table or just Table
    // If tableNameMatch[2] exists, then tableNameMatch[1] is schema, [2] is table
    // If tableNameMatch[2] doesn't exist, then tableNameMatch[1] is table (no schema)
    const schemaName = tableNameMatch[2] ? tableNameMatch[1] : undefined;
    const tableName = tableNameMatch[2] || tableNameMatch[1] || '';
    const fullTableName = schemaName ? `${schemaName}.${tableName}` : tableName;
    console.log('🏷️ Parsed table:', { schemaName, tableName, fullTableName });

    // Extract table definition (content between parentheses)
    const defMatch = stmt.match(/\(([\s\S]+)\)(?:\s*ENGINE|\s*DEFAULT|\s*COMMENT|\s*;|\s*$)/i);
    if (!defMatch || !defMatch[1]) {
      console.error('❌ Could not match table definition. Statement length:', stmt.length);
      console.error('Statement preview:', stmt.substring(0, 200));
      this.errors.push(`Could not extract table definition for ${fullTableName}`);
      return;
    }
    console.log('✅ Table definition matched, length:', defMatch[1].length);

    const tableDef: TableDef = {
      name: fullTableName,
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
      } else if (trimmed.toUpperCase().startsWith('CONSTRAINT')) {
        this.parseConstraint(trimmed, tableDef);
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
    if (!nameMatch || !nameMatch[1]) {
      console.warn('⚠️ Could not parse column name from:', line.substring(0, 50));
      return;
    }

    const columnName = nameMatch[1];
    const rest = line.substring(nameMatch[0].length);

    // Extract data type
    const typeMatch = rest.match(/^(\w+)(?:\(([^)]+)\))?/i);
    if (!typeMatch || !typeMatch[1]) {
      const warning = `Could not parse type for column ${columnName}`;
      console.warn('⚠️', warning, 'Rest:', rest.substring(0, 50));
      this.warnings.push(warning);
      return;
    }
    console.log(`  ✓ Column: ${columnName} ${typeMatch[1]}`);

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
    // Match FOREIGN KEY with optional schema in REFERENCES
    const match = line.match(/FOREIGN\s+KEY\s*\(`?(\w+)`?\)\s*REFERENCES\s+(?:`?(\w+)`?\.)?`?(\w+)`?\s*\(`?(\w+)`?\)/i);
    if (match && match[1]) {
      const schemaName = match[2];
      const tableName = match[3] || match[2] || '';
      const columnName = match[4] || match[3] || '';
      
      const fullTableName = schemaName && match[3] ? `${schemaName}.${tableName}` : tableName;
      
      const fk: ForeignKeyDef = {
        columnName: match[1],
        referencedTable: fullTableName,
        referencedColumn: columnName,
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

  private parseConstraint(line: string, table: TableDef): void {
    // Handle CONSTRAINT ... FOREIGN KEY
    if (line.toUpperCase().includes('FOREIGN KEY')) {
      this.parseForeignKey(line, table);
    }
    // Handle CONSTRAINT ... PRIMARY KEY
    else if (line.toUpperCase().includes('PRIMARY KEY')) {
      this.parsePrimaryKey(line, table);
    }
    // Handle CONSTRAINT ... UNIQUE
    else if (line.toUpperCase().includes('UNIQUE')) {
      this.parseIndex(line, table);
    }
  }

  private parseIndex(line: string, table: TableDef): void {
    const unique = line.toUpperCase().includes('UNIQUE');
    // Match KEY/INDEX with optional name and column list (handle partial indexes like col(100))
    // Use greedy match to capture everything between outer parentheses
    const nameMatch = line.match(/(?:KEY|INDEX)\s+(?:`?(\w+)`?\s+)?\((.*)\)(?:\s|,|$)/i);

    if (nameMatch && nameMatch[2]) {
      // Clean up columns (remove partial index sizes like "full_name(100)")
      const columns = nameMatch[2]
        .split(',')
        .map(c => {
          const trimmed = c.trim().replace(/`/g, '');
          // Remove partial index notation like (100)
          const cleaned = trimmed.replace(/\(\d+\)$/, '');
          return cleaned;
        })
        .filter(c => c.length > 0);  // Remove empty strings
      
      console.log(`  ✓ Index: ${nameMatch[1] || 'unnamed'} on (${columns.join(', ')})`);
      
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
