# Changelog

All notable changes to Biagram will be documented in this file.

## [Unreleased]

### Added
- Support for quoted identifiers in DBML (e.g., `"TABLE_NAME"`, `"COLUMN_NAME"`)
- Support for additional data types: `binary`, `tinyint`, `smallint`, `float`, `double`, `real`
- Improved DBML parser to handle SQL-style database schemas with quoted identifiers
- Support for quoted identifiers in relationships (e.g., `Ref: "TABLE_A"."COL_A" > "TABLE_B"."COL_B"`)
- Enhanced index parsing to support:
  - Single column indexes without parentheses
  - Named indexes with `name:` attribute
  - Quoted column names in indexes
- **Dynamic table width calculation** - Tables now automatically resize based on content length
- **🎨 Schema.Table Support** - Full support for `schema_name.table_name` notation
  - Automatic parsing and rendering of schema prefixes
  - Visual distinction between schemas
- **🎨 Schema-based Color System** - Each schema gets a unique color
  - 8-color palette for schema differentiation
  - Colors applied to table headers and borders
  - Automatic color assignment
- **💬 Comment/Note Display** - Show table and column notes
  - Display notes below table headers
  - Toggle comments on/off with toolbar button
  - Italic, smaller font for notes
  - Truncation for long comments

### Fixed
- Monaco Editor cursor jumping to beginning when deleting text
- Cursor position now preserved during text editing operations
- Canvas rendering issue with quoted table and column names
- Parser now correctly handles references with quoted identifiers
- Index parsing now supports both `(column)` and `column` syntax
- **Text overflow in tables** - Long table/column names no longer get cut off
- `not null` constraint parsing issue
- **Code-Canvas bidirectional sync for quoted table names** - Clicking on quoted tables in canvas now scrolls to correct code position
- Cursor position tracking in code editor now recognizes quoted table names

### Technical Details
- Modified `DBMLTokenizer.scanString()` to recognize quoted identifiers vs string literals
- Added cursor position restoration in `CodeEditor.handleEditorChange()`
- Extended keyword map in tokenizer for new data types
- Updated `parseReference()` to handle quoted table/column names
- Enhanced `parseIndexDeclaration()` for flexible index syntax
- Replaced regex-based parsing in tRPC router with actual DBML parser
- Added `measureTextWidth()` helper function using Canvas 2D context
- Table width calculated dynamically based on longest text content
- Modified `parseConstraint()` to return object with metadata (note, defaultValue, reference)
- Enhanced `parseTableDeclaration()` to parse table-level Note statements
- Added schema color assignment algorithm with 8-color palette
- Updated `CanvasRenderer.renderTable()` to display table notes below header
- Regex improvements for quoted table name matching in editor sync

## [0.1.0] - Initial Release

### Features
- Code-first DBML diagram editor
- Real-time diagram rendering with Canvas
- Monaco Editor with DBML syntax highlighting
- Import from DDL (MySQL, PostgreSQL)
- Export to PNG, SVG, PDF
- Table relationships visualization
- Zoom, pan, and interactive canvas
- Dark mode support
