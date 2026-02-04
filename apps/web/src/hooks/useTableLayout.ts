import { useCallback, useRef } from 'react';
import type { TableRenderData, TableStyle } from '@biagram/shared';

/**
 * Extended table style with additional properties used by the canvas
 */
export interface ExtendedTableStyle extends TableStyle {
  connectedRowColor?: string;
  connectedBorderColor?: string;
}

interface SchemaTable {
  name: string;
  schema?: string;
  columns?: Array<{
    name: string;
    type?: string | { name: string };
    isPrimaryKey?: boolean;
    primaryKey?: boolean;
    isForeignKey?: boolean;
    foreignKey?: boolean;
    note?: string;
  }>;
  note?: string;
}

interface SchemaRelationship {
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
}

interface LayoutOptions {
  startX?: number;
  startY?: number;
  maxRowWidth?: number;
  tableGapX?: number;
  tableGapY?: number;
}

const DEFAULT_LAYOUT_OPTIONS: Required<LayoutOptions> = {
  startX: 50,
  startY: 50,
  maxRowWidth: 3500,
  tableGapX: 100,
  tableGapY: 80,
};

const SCHEMA_COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#ef4444', '#84cc16',
  '#06b6d4', '#a855f7', '#22c55e', '#eab308', '#0ea5e9',
  '#d946ef', '#64748b', '#78716c', '#f43f5e', '#0d9488',
];

/**
 * Hook for calculating table layout and styling
 */
export function useTableLayout() {
  // Text width measurement cache
  const textWidthCacheRef = useRef<Map<string, number>>(new Map());
  // Schema color assignments
  const schemaColorsRef = useRef<Map<string, string>>(new Map());

  /**
   * Measure text width with caching
   */
  const measureTextWidth = useCallback((
    canvas: HTMLCanvasElement | null,
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: string = 'normal'
  ): number => {
    if (!canvas) return text.length * 8; // fallback

    const cacheKey = `${text}-${fontSize}-${fontFamily}-${fontWeight}`;
    const cached = textWidthCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return text.length * 8;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const width = ctx.measureText(text).width;

    // Cache management (max 1000 entries)
    if (textWidthCacheRef.current.size < 1000) {
      textWidthCacheRef.current.set(cacheKey, width);
    }

    return width;
  }, []);

  /**
   * Get table dimensions (width and height)
   */
  const getTableDimensions = useCallback((
    table: SchemaTable,
    canvas?: HTMLCanvasElement | null
  ): { width: number; height: number } => {
    const columnCount = table.columns?.length || 0;
    const height = 32 + (columnCount * 24) + 12;

    const tableSchema = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : undefined);
    const tableName = table.name.includes('.') ? table.name.split('.')[1] : table.name;
    const fullName = tableSchema ? `${tableSchema}.${tableName || table.name}` : (tableName || table.name);

    if (canvas) {
      const fontSize = 14;
      const fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      const padding = 12;

      const tableNameWidth = measureTextWidth(canvas, fullName, fontSize, fontFamily, 'bold');
      const noteText = table.note ? ` ${table.note}` : '';
      const headerWidth = measureTextWidth(canvas, fullName + noteText, fontSize - 1, fontFamily);

      let maxColumnWidth = Math.max(tableNameWidth, headerWidth);
      (table.columns || []).forEach((column) => {
        const columnType = typeof column.type === 'string' ? column.type : column.type?.name || '';
        const columnText = `${column.name} ${columnType}`;
        const columnWidth = measureTextWidth(canvas, columnText, fontSize, fontFamily);
        maxColumnWidth = Math.max(maxColumnWidth, columnWidth);
      });

      const width = Math.max(200, maxColumnWidth + padding * 2 + 50);
      return { width, height };
    }

    // Fallback estimation without canvas
    const estimatedNameWidth = (fullName || table.name).length * 9;
    const maxColWidth = Math.max(...(table.columns || []).map((c) => {
      const typeStr = typeof c.type === 'string' ? c.type : c.type?.name || '';
      return (`${c.name} ${typeStr}`).length * 8;
    }), 0);
    const width = Math.max(200, Math.max(estimatedNameWidth, maxColWidth) + 74);

    return { width, height };
  }, [measureTextWidth]);

  /**
   * Assign colors to schemas
   */
  const assignSchemaColors = useCallback((tables: SchemaTable[]): Map<string, string> => {
    const colors = new Map<string, string>();
    let colorIndex = 0;

    tables.forEach((table) => {
      const schemaName = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : undefined);
      if (schemaName && !colors.has(schemaName)) {
        const color = SCHEMA_COLOR_PALETTE[colorIndex % SCHEMA_COLOR_PALETTE.length];
        if (color) {
          colors.set(schemaName, color);
          colorIndex++;
        }
      }
    });

    schemaColorsRef.current = colors;
    return colors;
  }, []);

  /**
   * Calculate grid positions for tables
   */
  const calculateGridPositions = useCallback((
    tables: SchemaTable[],
    savedPositions?: Record<string, { x: number; y: number }>,
    options?: LayoutOptions,
    canvas?: HTMLCanvasElement | null
  ): Map<string, { x: number; y: number }> => {
    const opts = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
    const positions = new Map<string, { x: number; y: number }>();

    // Group tables by schema for sorted layout
    const tablesBySchema = new Map<string, SchemaTable[]>();
    const noSchemaKey = '__no_schema__';

    tables.forEach((table) => {
      const schemaName = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : undefined);
      const key = schemaName || noSchemaKey;
      if (!tablesBySchema.has(key)) {
        tablesBySchema.set(key, []);
      }
      tablesBySchema.get(key)!.push(table);
    });

    // Sort schemas alphabetically
    const sortedTables: SchemaTable[] = [];
    const schemaKeys = Array.from(tablesBySchema.keys()).sort((a, b) => {
      if (a === noSchemaKey) return 1;
      if (b === noSchemaKey) return -1;
      return a.localeCompare(b);
    });

    for (const schemaKey of schemaKeys) {
      const schemaTables = tablesBySchema.get(schemaKey) || [];
      sortedTables.push(...schemaTables);
    }

    // Filter tables without saved positions
    const tablesToLayout = sortedTables.filter((table) => !savedPositions?.[table.name]);

    let currentX = opts.startX;
    let currentY = opts.startY;
    let rowMaxHeight = 0;

    for (const table of tablesToLayout) {
      const { width, height } = getTableDimensions(table, canvas);

      // New row if exceeds max width
      if (currentX + width > opts.maxRowWidth && currentX > opts.startX) {
        currentY += rowMaxHeight + opts.tableGapY;
        currentX = opts.startX;
        rowMaxHeight = 0;
      }

      positions.set(table.name, { x: currentX, y: currentY });
      currentX += width + opts.tableGapX;
      rowMaxHeight = Math.max(rowMaxHeight, height);
    }

    return positions;
  }, [getTableDimensions]);

  /**
   * Collect connected columns from relationships
   */
  const collectConnectedColumns = useCallback((
    relationships: SchemaRelationship[]
  ): {
    connectedColumns: Map<string, Set<string>>;
    fkColumnRefs: Map<string, Map<string, string>>;
  } => {
    const connectedColumns = new Map<string, Set<string>>();
    const fkColumnRefs = new Map<string, Map<string, string>>();

    relationships.forEach((rel) => {
      // Track connected columns
      if (!connectedColumns.has(rel.fromTable)) {
        connectedColumns.set(rel.fromTable, new Set());
      }
      if (!connectedColumns.has(rel.toTable)) {
        connectedColumns.set(rel.toTable, new Set());
      }
      connectedColumns.get(rel.fromTable)?.add(rel.fromColumn);
      connectedColumns.get(rel.toTable)?.add(rel.toColumn);

      // Track FK references
      if (!fkColumnRefs.has(rel.fromTable)) {
        fkColumnRefs.set(rel.fromTable, new Map());
      }
      fkColumnRefs.get(rel.fromTable)?.set(rel.fromColumn, rel.toTable);
    });

    return { connectedColumns, fkColumnRefs };
  }, []);

  /**
   * Get table style based on theme
   */
  const getTableStyle = useCallback((
    theme: 'light' | 'dark',
    schemaColor?: string
  ): ExtendedTableStyle => {
    return theme === 'dark' ? {
      backgroundColor: '#1f2937',
      borderColor: schemaColor || '#374151',
      borderWidth: schemaColor ? 2 : 1,
      borderRadius: 8,
      headerBackgroundColor: schemaColor || '#111827',
      headerTextColor: '#f3f4f6',
      headerHeight: 32,
      textColor: '#e5e7eb',
      typeTextColor: '#9ca3af',
      noteTextColor: '#6b7280',
      padding: 12,
      rowHeight: 24,
      fontSize: 14,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      fontWeight: 'normal',
      selectedRowColor: '#1e40af',
      hoveredRowColor: '#374151',
      connectedRowColor: '#1e3a8a',
      connectedBorderColor: '#60a5fa',
      iconSize: 16,
      iconSpacing: 8,
      shadowColor: '#00000040',
      shadowBlur: 4,
      schemaColor: schemaColor,
    } : {
      backgroundColor: '#ffffff',
      borderColor: schemaColor || '#e5e7eb',
      borderWidth: schemaColor ? 2 : 1,
      borderRadius: 8,
      headerBackgroundColor: schemaColor || '#f9fafb',
      headerTextColor: schemaColor ? '#ffffff' : '#374151',
      headerHeight: 32,
      textColor: '#374151',
      typeTextColor: '#6b7280',
      noteTextColor: '#9ca3af',
      padding: 12,
      rowHeight: 24,
      fontSize: 14,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      fontWeight: 'normal',
      selectedRowColor: '#dbeafe',
      hoveredRowColor: '#f3f4f6',
      connectedRowColor: '#eff6ff',
      connectedBorderColor: '#3b82f6',
      iconSize: 16,
      iconSpacing: 8,
      shadowColor: '#00000020',
      shadowBlur: 4,
      schemaColor: schemaColor,
    };
  }, []);

  /**
   * Clear caches
   */
  const clearCaches = useCallback(() => {
    textWidthCacheRef.current.clear();
    schemaColorsRef.current.clear();
  }, []);

  return {
    measureTextWidth,
    getTableDimensions,
    assignSchemaColors,
    calculateGridPositions,
    collectConnectedColumns,
    getTableStyle,
    clearCaches,
    schemaColorsRef,
  };
}

export default useTableLayout;
