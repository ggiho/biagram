import { describe, it, expect } from 'vitest';
import { DBML } from '../index.js';

describe('DBML Parser', () => {
  describe('Basic Parsing', () => {
    it('should parse a simple table declaration', () => {
      const source = `
        Table users {
          id integer [pk]
          name varchar(100)
          email varchar(255) [unique]
          created_at timestamp
        }
      `;

      const result = DBML.parse(source);

      expect(result.success).toBe(true);
      expect(result.schema).toBeDefined();
      expect(result.schema!.tables).toHaveLength(1);

      const table = result.schema!.tables[0];
      expect(table.name).toBe('users');
      expect(table.columns).toHaveLength(4);

      // Check primary key
      const idColumn = table.columns.find(c => c.name === 'id');
      expect(idColumn?.primaryKey).toBe(true);

      // Check unique constraint
      const emailColumn = table.columns.find(c => c.name === 'email');
      expect(emailColumn?.unique).toBe(true);
    });

    it('should parse enums', () => {
      const source = `
        Enum user_status {
          active
          inactive
          pending [note: "Awaiting approval"]
        }
      `;

      const result = DBML.parse(source);

      expect(result.success).toBe(true);
      expect(result.schema!.enums).toHaveLength(1);

      const enumDef = result.schema!.enums[0];
      expect(enumDef.name).toBe('user_status');
      expect(enumDef.values).toHaveLength(3);
      expect(enumDef.values.map(v => v.name)).toEqual(['active', 'inactive', 'pending']);
    });

    it('should parse relationships', () => {
      const source = `
        Table users {
          id integer [pk]
        }

        Table posts {
          id integer [pk]
          user_id integer
        }

        Ref: posts.user_id > users.id
      `;

      const result = DBML.parse(source);

      expect(result.success).toBe(true);
      expect(result.schema!.relationships).toHaveLength(1);

      const relationship = result.schema!.relationships[0];
      expect(relationship.fromTable).toBe('posts');
      expect(relationship.fromColumn).toBe('user_id');
      expect(relationship.toTable).toBe('users');
      expect(relationship.toColumn).toBe('id');
      expect(relationship.type).toBe('many-to-one');
    });

    it('should parse table groups', () => {
      const source = `
        TableGroup ecommerce {
          users
          products
          orders
        }
      `;

      const result = DBML.parse(source);

      expect(result.success).toBe(true);
      expect(result.schema!.tableGroups).toHaveLength(1);

      const group = result.schema!.tableGroups[0];
      expect(group.name).toBe('ecommerce');
      expect(group.tables).toEqual(['users', 'products', 'orders']);
    });

    it('should parse indexes', () => {
      const source = `
        Table users {
          id integer [pk]
          email varchar(255)
          name varchar(100)

          indexes {
            (email) [unique]
            (name, email)
          }
        }
      `;

      const result = DBML.parse(source);

      expect(result.success).toBe(true);
      expect(result.schema!.tables[0].name).toBe('users');
      // Note: In a full implementation, indexes would be properly linked
    });
  });

  describe('Complex Scenarios', () => {
    it('should parse a complete e-commerce schema', () => {
      const source = `
        Project ecommerce_db {
          database_type: 'PostgreSQL'
          Note: 'E-commerce database schema'
        }

        Enum order_status {
          pending
          processing
          shipped
          delivered
          cancelled
        }

        Table users {
          id integer [pk, increment]
          email varchar(255) [unique, not null]
          password_hash varchar(255) [not null]
          first_name varchar(100)
          last_name varchar(100)
          created_at timestamp [default: \`now()\`]
          updated_at timestamp
        }

        Table products {
          id integer [pk, increment]
          name varchar(255) [not null]
          description text
          price decimal(10,2) [not null]
          stock_quantity integer [default: 0]
          created_at timestamp [default: \`now()\`]
        }

        Table orders {
          id integer [pk, increment]
          user_id integer [ref: > users.id]
          status order_status [default: 'pending']
          total_amount decimal(10,2) [not null]
          created_at timestamp [default: \`now()\`]
          updated_at timestamp
        }

        Table order_items {
          id integer [pk, increment]
          order_id integer [ref: > orders.id]
          product_id integer [ref: > products.id]
          quantity integer [not null]
          unit_price decimal(10,2) [not null]
        }

        TableGroup core {
          users
          products
        }

        TableGroup transactions {
          orders
          order_items
        }
      `;

      const result = DBML.parse(source);

      expect(result.success).toBe(true);
      expect(result.schema).toBeDefined();

      const schema = result.schema!;
      expect(schema.tables).toHaveLength(4);
      expect(schema.enums).toHaveLength(1);
      expect(schema.tableGroups).toHaveLength(2);

      // Check that all tables are present
      const tableNames = schema.tables.map(t => t.name).sort();
      expect(tableNames).toEqual(['order_items', 'orders', 'products', 'users']);

      // Check enum
      expect(schema.enums[0].name).toBe('order_status');
      expect(schema.enums[0].values).toHaveLength(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors gracefully', () => {
      const source = `
        Table users {
          id integer [pk
          // Missing closing bracket
        }
      `;

      const result = DBML.parse(source);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('syntax');
    });

    it('should provide meaningful error messages', () => {
      const source = `
        Table {
          // Missing table name
        }
      `;

      const result = DBML.parse(source);

      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Expected table name');
    });
  });

  describe('Performance', () => {
    it('should parse large schemas efficiently', () => {
      // Generate a large schema
      const tables = Array.from({ length: 50 }, (_, i) => `
        Table table_${i} {
          id integer [pk, increment]
          name varchar(255) [not null]
          description text
          value decimal(10,2)
          created_at timestamp [default: \`now()\`]
          updated_at timestamp
        }
      `).join('\n');

      const relationships = Array.from({ length: 25 }, (_, i) => {
        const fromTable = `table_${i}`;
        const toTable = `table_${(i + 1) % 50}`;
        return `Ref: ${fromTable}.id > ${toTable}.id`;
      }).join('\n');

      const source = tables + '\n' + relationships;

      const result = DBML.parseWithTiming(source);

      expect(result.success).toBe(true);
      expect(result.schema!.tables).toHaveLength(50);
      expect(result.schema!.relationships).toHaveLength(25);
      expect(result.timing).toBeLessThan(200); // Should parse in under 200ms
    });
  });

  describe('Utility Methods', () => {
    it('should validate DBML syntax', () => {
      const validSource = 'Table users { id integer [pk] }';
      const invalidSource = 'Table { id integer }'; // Missing table name

      expect(DBML.isValid(validSource)).toBe(true);
      expect(DBML.isValid(invalidSource)).toBe(false);

      const errors = DBML.validate(invalidSource);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should tokenize DBML source', () => {
      const source = 'Table users { id integer }';
      const { tokens, errors } = DBML.tokenize(source);

      expect(errors).toHaveLength(0);
      expect(tokens.length).toBeGreaterThan(0);

      const tokenTypes = tokens
        .filter(t => t.type !== 'eof')
        .map(t => t.type);

      expect(tokenTypes).toEqual([
        'table',
        'identifier',      // users
        'left_brace',
        'identifier',      // id
        'integer',
        'right_brace',
      ]);
    });
  });
});