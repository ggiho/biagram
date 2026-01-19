import type { TableRenderData, RelationshipRenderData, ThemeConfig } from '@biagram/shared';

/**
 * Canvas component props
 */
export interface DiagramCanvasProps {
  schema: ParsedSchema | null;
  parseError?: string | null;
  className?: string;
  initialTablePositions?: Record<string, { x: number; y: number }>;
  onTablePositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
  onTableDoubleClick?: (tableName: string) => void;
}

/**
 * Parsed schema from DBML
 */
export interface ParsedSchema {
  tables: ParsedTable[];
  relationships: ParsedRelationship[];
  enums?: ParsedEnum[];
}

export interface ParsedTable {
  name: string;
  schema?: string;
  note?: string;
  columns: ParsedColumn[];
}

export interface ParsedColumn {
  name: string;
  type: string | { name: string; size?: number; precision?: number; scale?: number };
  primaryKey?: boolean;
  isPrimaryKey?: boolean;
  references?: string;
  isForeignKey?: boolean;
  nullable?: boolean;
  unique?: boolean;
  note?: string;
}

export interface ParsedRelationship {
  id?: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type?: string;
}

export interface ParsedEnum {
  name: string;
  values: string[];
}

/**
 * Mouse event state for drag handling
 */
export interface MouseState {
  isDraggingCanvas: boolean;
  isDraggingTable: boolean;
  draggedTableId: string | null;
  lastMousePos: { x: number; y: number };
  mouseDownPos: { x: number; y: number };
  mouseDownTableId: string | null;
  mouseDownRelationshipId: string | null;
  hasMoved: boolean;
}

/**
 * Connection offset for overlapping relationship lines
 */
export interface ConnectionOffset {
  fromOffset: number;
  toOffset: number;
}

/**
 * Theme configuration for dark/light mode
 */
export function createThemeConfig(isDarkMode: boolean): ThemeConfig {
  return isDarkMode
    ? {
        mode: 'dark',
        colors: {
          primary: '#3b82f6',
          secondary: '#6b7280',
          background: '#111827',
          surface: '#1f2937',
          text: '#e5e7eb',
          textSecondary: '#9ca3af',
          border: '#374151',
          accent: '#60a5fa',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
        },
        typography: {
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: 14,
          lineHeight: 1.5,
        },
      }
    : {
        mode: 'light',
        colors: {
          primary: '#3b82f6',
          secondary: '#6b7280',
          background: '#ffffff',
          surface: '#f9fafb',
          text: '#374151',
          textSecondary: '#6b7280',
          border: '#e5e7eb',
          accent: '#3b82f6',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
        },
        typography: {
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: 14,
          lineHeight: 1.5,
        },
      };
}

/**
 * Schema color palette for multi-schema diagrams
 */
export const SCHEMA_COLOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // green (emerald)
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1', // indigo
  '#ef4444', // red
  '#84cc16', // lime
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#22c55e', // green
  '#eab308', // yellow
  '#0ea5e9', // sky
  '#d946ef', // fuchsia
  '#64748b', // slate
  '#78716c', // stone
  '#f43f5e', // rose
  '#0d9488', // teal darker
] as const;

/**
 * Layout constants
 */
export const LAYOUT_CONSTANTS = {
  TABLE_GAP_X: 100,
  TABLE_GAP_Y: 80,
  START_X: 50,
  START_Y: 50,
  MAX_ROW_WIDTH: 3500,
  DRAG_THRESHOLD: 5,
  CHUNK_SIZE: 20,
  HEADER_HEIGHT: 32,
  ROW_HEIGHT: 24,
} as const;

/**
 * Table style configuration
 */
export interface TableStyleConfig {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  headerBackgroundColor: string;
  headerTextColor: string;
  headerHeight: number;
  textColor: string;
  typeTextColor: string;
  noteTextColor: string;
  padding: number;
  rowHeight: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  selectedRowColor: string;
  hoveredRowColor: string;
  connectedRowColor: string;
  connectedBorderColor: string;
  iconSize: number;
  iconSpacing: number;
  shadowColor: string;
  shadowBlur: number;
  schemaColor?: string;
}

/**
 * Create table style based on theme and schema color
 */
export function createTableStyle(
  isDarkMode: boolean,
  schemaColor?: string
): TableStyleConfig {
  return isDarkMode
    ? {
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
      }
    : {
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
}

/**
 * Re-export shared types for convenience
 */
export type { TableRenderData, RelationshipRenderData, ThemeConfig };
