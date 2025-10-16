import { z } from 'zod';
import { Position2DSchema, Size2DSchema, Rectangle2DSchema } from './schema.js';

// Color and styling
export const ColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$|^#[0-9A-Fa-f]{3}$|^rgba?\([^)]+\)$/);
export const FontWeightSchema = z.enum(['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']);

export type Color = z.infer<typeof ColorSchema>;
export type FontWeight = z.infer<typeof FontWeightSchema>;

// Theme configuration
export const ThemeConfigSchema = z.object({
  mode: z.enum(['light', 'dark']),
  colors: z.object({
    primary: ColorSchema,
    secondary: ColorSchema,
    background: ColorSchema,
    surface: ColorSchema,
    text: ColorSchema,
    textSecondary: ColorSchema,
    border: ColorSchema,
    accent: ColorSchema,
    success: ColorSchema,
    warning: ColorSchema,
    error: ColorSchema,
  }),
  typography: z.object({
    fontFamily: z.string(),
    fontSize: z.number(),
    lineHeight: z.number(),
  }),
});

export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;

// Table styling
export const TableStyleSchema = z.object({
  backgroundColor: ColorSchema,
  borderColor: ColorSchema,
  borderWidth: z.number(),
  borderRadius: z.number(),
  headerBackgroundColor: ColorSchema,
  headerTextColor: ColorSchema,
  headerHeight: z.number(),
  textColor: ColorSchema,
  typeTextColor: ColorSchema,
  noteTextColor: ColorSchema.optional(), // Comment/note color
  padding: z.number(),
  rowHeight: z.number(),
  fontSize: z.number(),
  fontFamily: z.string(),
  fontWeight: FontWeightSchema,
  selectedRowColor: ColorSchema,
  hoveredRowColor: ColorSchema,
  iconSize: z.number(),
  iconSpacing: z.number(),
  shadowColor: ColorSchema,
  shadowBlur: z.number(),
  schemaColor: ColorSchema.optional(), // Schema-based coloring
});

export type TableStyle = z.infer<typeof TableStyleSchema>;

// Relationship styling
export const RelationshipStyleSchema = z.object({
  color: ColorSchema,
  width: z.number(),
  arrowSize: z.number(),
  dashed: z.boolean(),
  hitWidth: z.number(), // For interaction
  selectedColor: ColorSchema,
  hoveredColor: ColorSchema,
  labelBackgroundColor: ColorSchema,
  labelTextColor: ColorSchema,
  labelPadding: z.number(),
  labelFontSize: z.number(),
});

export type RelationshipStyle = z.infer<typeof RelationshipStyleSchema>;

// Viewport state
export const ViewportStateSchema = z.object({
  zoom: z.number().min(0.1).max(5),
  pan: Position2DSchema,
  selection: z.array(z.string()),
  focus: z.string().optional(),
  bounds: Rectangle2DSchema,
});

export type ViewportState = z.infer<typeof ViewportStateSchema>;

// Layout algorithm types
export const LayoutAlgorithmSchema = z.enum([
  'auto',
  'manual',
  'force-directed',
  'hierarchical',
  'grid',
  'circular',
]);

export type LayoutAlgorithm = z.infer<typeof LayoutAlgorithmSchema>;

// Layout configuration
export const LayoutConfigSchema = z.object({
  algorithm: LayoutAlgorithmSchema,
  spacing: z.object({
    table: z.number(),
    relationship: z.number(),
    group: z.number(),
  }),
  direction: z.enum(['horizontal', 'vertical', 'radial']),
  alignment: z.enum(['start', 'center', 'end']),
  grouping: z.boolean(),
  padding: z.number(),
});

export type LayoutConfig = z.infer<typeof LayoutConfigSchema>;

// Layout constraints
export const LayoutConstraintsSchema = z.object({
  fixedTables: z.array(z.string()).optional(),
  groupings: z.array(z.string()).optional(),
  boundaries: Rectangle2DSchema.optional(),
  preserveAspectRatio: z.boolean().default(true),
});

export type LayoutConstraints = z.infer<typeof LayoutConstraintsSchema>;

// Layout result
export const LayoutResultSchema = z.object({
  tablePositions: z.record(Position2DSchema),
  bounds: Rectangle2DSchema,
  metadata: z.object({
    algorithm: LayoutAlgorithmSchema,
    iterations: z.number().optional(),
    energy: z.number().optional(),
    time: z.number(),
  }),
});

export type LayoutResult = z.infer<typeof LayoutResultSchema>;

// Render data for tables
export const TableRenderDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  schema: z.string().optional(), // Schema name for schema.table support
  displayName: z.string().optional(), // Display name (can include schema prefix)
  note: z.string().optional(), // Table comment/note
  columns: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    isPrimaryKey: z.boolean(),
    isForeignKey: z.boolean(),
    isSelected: z.boolean(),
    isHovered: z.boolean(),
    note: z.string().optional(), // Column comment/note
  })),
  bounds: Rectangle2DSchema,
  style: TableStyleSchema,
  isSelected: z.boolean(),
  isHovered: z.boolean(),
});

export type TableRenderData = z.infer<typeof TableRenderDataSchema>;

// Render data for relationships
export const RelationshipRenderDataSchema = z.object({
  id: z.string(),
  type: z.string(),
  path: z.object({
    start: Position2DSchema,
    end: Position2DSchema,
    controlPoints: z.array(Position2DSchema).optional(),
    midpoint: Position2DSchema,
    direction: z.number(),
  }),
  style: RelationshipStyleSchema,
  label: z.string().optional(),
  isSelected: z.boolean(),
  isHovered: z.boolean(),
});

export type RelationshipRenderData = z.infer<typeof RelationshipRenderDataSchema>;

// Hit test result
export const HitTestResultSchema = z.object({
  type: z.enum(['table', 'column', 'relationship', 'background']),
  target: z.object({
    id: z.string(),
    data: z.unknown(),
  }).optional(),
  position: Position2DSchema,
});

export type HitTestResult = z.infer<typeof HitTestResultSchema>;

// Interaction event
export const InteractionEventSchema = z.object({
  type: z.enum(['click', 'doubleclick', 'hover', 'drag', 'wheel', 'key']),
  position: Position2DSchema,
  button: z.number().optional(),
  modifiers: z.object({
    ctrl: z.boolean(),
    shift: z.boolean(),
    alt: z.boolean(),
    meta: z.boolean(),
  }).optional(),
  delta: Position2DSchema.optional(),
  key: z.string().optional(),
});

export type InteractionEvent = z.infer<typeof InteractionEventSchema>;

// Export options
export const ExportOptionsSchema = z.object({
  format: z.enum(['png', 'svg', 'pdf', 'json']),
  quality: z.number().min(0.1).max(1).default(1),
  scale: z.number().min(0.5).max(5).default(1),
  backgroundColor: ColorSchema.default('#ffffff'),
  includeMetadata: z.boolean().default(true),
  padding: z.number().default(20),
  bounds: Rectangle2DSchema.optional(),
});

export type ExportOptions = z.infer<typeof ExportOptionsSchema>;