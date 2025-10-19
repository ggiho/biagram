// Database schema and types
export * from './db/schema.js';

// Core schema types
export * from './types/schema.js';

// Project types
export * from './types/project.js';

// Parser types
export * from './types/parser.js';

// Rendering types
export * from './types/rendering.js';

// API types
export * from './types/api.js';

// Specification types (Table Center)
export * from './types/specification.js';

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Constants
export const SUPPORTED_DATABASE_TYPES = [
  'postgresql',
  'mysql',
  'sqlite',
  'mssql',
  'oracle',
  'mongodb',
  'generic',
] as const;

export const SUPPORTED_EXPORT_FORMATS = [
  'png',
  'svg',
  'pdf',
  'sql',
  'dbml',
  'json',
] as const;

export const DEFAULT_THEME = {
  mode: 'light',
  colors: {
    primary: '#3b82f6',
    secondary: '#64748b',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    accent: '#06b6d4',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
  },
} as const;

export const DEFAULT_TABLE_STYLE = {
  backgroundColor: '#ffffff',
  borderColor: '#e2e8f0',
  borderWidth: 1,
  borderRadius: 8,
  headerBackgroundColor: '#f1f5f9',
  headerTextColor: '#0f172a',
  headerHeight: 32,
  textColor: '#374151',
  typeTextColor: '#6b7280',
  padding: 12,
  rowHeight: 28,
  fontSize: 13,
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontWeight: '400',
  selectedRowColor: '#dbeafe',
  hoveredRowColor: '#f3f4f6',
  iconSize: 16,
  iconSpacing: 4,
  shadowColor: 'rgba(0, 0, 0, 0.1)',
  shadowBlur: 4,
} as const;

export const DEFAULT_RELATIONSHIP_STYLE = {
  color: '#6b7280',
  width: 2,
  arrowSize: 8,
  dashed: false,
  hitWidth: 8,
  selectedColor: '#3b82f6',
  hoveredColor: '#1d4ed8',
  labelBackgroundColor: '#ffffff',
  labelTextColor: '#374151',
  labelPadding: 4,
  labelFontSize: 11,
} as const;