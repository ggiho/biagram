import type { TableRenderData, RelationshipRenderData } from '@biagram/shared';
import type { DiagramEngine } from '@biagram/diagram-engine';

/**
 * Text width cache for performance optimization
 */
const textWidthCache = new Map<string, number>();
const MAX_CACHE_SIZE = 1000;

/**
 * Clear text width cache
 */
export function clearTextWidthCache(): void {
  textWidthCache.clear();
}

/**
 * Measure text width with caching for performance
 */
export function measureTextWidth(
  canvas: HTMLCanvasElement,
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string = 'normal'
): number {
  // Generate cache key
  const cacheKey = `${text}-${fontSize}-${fontFamily}-${fontWeight}`;

  // Check cache
  const cached = textWidthCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // Measure text
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return text.length * 8; // fallback
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const width = ctx.measureText(text).width;

  // Store in cache (with size limit)
  if (textWidthCache.size < MAX_CACHE_SIZE) {
    textWidthCache.set(cacheKey, width);
  }

  return width;
}

/**
 * Convert screen coordinates to world coordinates
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: { zoom: number; pan: { x: number; y: number } }
): { x: number; y: number } {
  return {
    x: (screenX - viewport.pan.x) / viewport.zoom,
    y: (screenY - viewport.pan.y) / viewport.zoom,
  };
}

/**
 * Convert world coordinates to screen coordinates
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  viewport: { zoom: number; pan: { x: number; y: number } }
): { x: number; y: number } {
  return {
    x: worldX * viewport.zoom + viewport.pan.x,
    y: worldY * viewport.zoom + viewport.pan.y,
  };
}

/**
 * Find table at screen position (hit test)
 */
export function findTableAtPosition(
  canvasX: number,
  canvasY: number,
  tables: TableRenderData[],
  engine: DiagramEngine
): string | null {
  const viewport = engine.getViewportManager().getViewport();
  const { x: worldX, y: worldY } = screenToWorld(canvasX, canvasY, viewport);

  // Check in reverse order (top-most table first)
  for (let i = tables.length - 1; i >= 0; i--) {
    const table = tables[i];
    if (!table) continue;

    const { x, y, width, height } = table.bounds;

    if (
      worldX >= x &&
      worldX <= x + width &&
      worldY >= y &&
      worldY <= y + height
    ) {
      return table.id;
    }
  }

  return null;
}

/**
 * Calculate distance from point to line segment
 */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  return Math.sqrt(
    (px - closestX) * (px - closestX) + (py - closestY) * (py - closestY)
  );
}

/**
 * Find relationship at screen position (hit test)
 */
export function findRelationshipAtPosition(
  canvasX: number,
  canvasY: number,
  relationships: RelationshipRenderData[],
  engine: DiagramEngine
): string | null {
  const viewport = engine.getViewportManager().getViewport();
  const { x: worldX, y: worldY } = screenToWorld(canvasX, canvasY, viewport);

  // Zoom-adjusted hit width
  const hitWidth = 10 / viewport.zoom;

  for (const rel of relationships) {
    const relData = rel as any;

    // Build all segment points
    const points: Array<{ x: number; y: number }> = [
      relData.path.start,
      ...(relData.path.controlPoints || []),
      relData.path.end,
    ];

    // Check distance to each segment
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      if (!p1 || !p2) continue;

      const distance = distanceToSegment(worldX, worldY, p1.x, p1.y, p2.x, p2.y);

      if (distance <= hitWidth) {
        return relData.id;
      }
    }
  }

  return null;
}

/**
 * Calculate column Y position in table
 */
export function getColumnY(
  table: { columns?: Array<{ name: string }> } | undefined,
  columnName: string,
  tableBounds: { x: number; y: number; width: number; height: number } | undefined,
  yOffset: number = 0
): number {
  if (!table || !tableBounds) return 0;

  const columnIndex = table.columns?.findIndex((col) => col.name === columnName);
  if (columnIndex === -1 || columnIndex === undefined) {
    return tableBounds.y + tableBounds.height / 2 + yOffset;
  }

  const headerHeight = 32;
  const rowHeight = 24;
  return tableBounds.y + headerHeight + columnIndex * rowHeight + rowHeight / 2 + yOffset;
}

/**
 * Calculate table dimensions based on content
 */
export function calculateTableDimensions(
  table: {
    name: string;
    schema?: string;
    columns?: Array<{ name: string; type: string | { name: string } }>;
  },
  canvas?: HTMLCanvasElement
): { width: number; height: number } {
  const columnCount = table.columns?.length || 0;
  const height = Math.max(100, columnCount * 25 + 50);

  // Table name width calculation
  const tableSchema = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : undefined);
  const tName = table.name.includes('.') ? table.name.split('.')[1] : table.name;
  const fullName = tableSchema ? `${tableSchema}.${tName}` : tName;

  // Estimate text width
  const estimatedNameWidth = fullName.length * 9;
  const maxColWidth = Math.max(
    ...(table.columns || []).map((c) => {
      const typeName = typeof c.type === 'string' ? c.type : c.type?.name || '';
      return `${c.name} ${typeName}`.length * 8;
    }),
    0
  );

  const width = Math.max(200, Math.max(estimatedNameWidth, maxColWidth) + 74);

  return { width, height };
}

/**
 * Get full table name with schema prefix
 */
export function getFullTableName(table: {
  name: string;
  schema?: string;
}): string {
  const tableSchema = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : undefined);
  const tableName = table.name.includes('.') ? table.name.split('.')[1] : table.name;
  return tableSchema ? `${tableSchema}.${tableName}` : tableName;
}

/**
 * Find table by name (supports schema.table format)
 */
export function findTableByName<T extends { name: string; schema?: string; id?: string }>(
  tables: T[],
  targetName: string
): T | undefined {
  return tables.find((t) => {
    const tableSchema = t.schema || (t.name.includes('.') ? t.name.split('.')[0] : undefined);
    const tableName = t.name.includes('.') ? t.name.split('.')[1] : t.name;
    const fullName = tableSchema ? `${tableSchema}.${tableName}` : tableName;
    return fullName === targetName || t.name === targetName || tableName === targetName || t.id === targetName;
  });
}

/**
 * Calculate connection groups for relationship line offsets
 */
export function calculateConnectionGroups(
  relationships: Array<{
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
  }>
): Map<string, Array<{ index: number }>> {
  const connectionGroups = new Map<string, Array<{ index: number }>>();

  relationships.forEach((rel, index) => {
    // Group by start point (table-column combination)
    const fromKey = `from:${rel.fromTable}:${rel.fromColumn}`;
    if (!connectionGroups.has(fromKey)) {
      connectionGroups.set(fromKey, []);
    }
    connectionGroups.get(fromKey)!.push({ index });

    // Group by end point
    const toKey = `to:${rel.toTable}:${rel.toColumn}`;
    if (!connectionGroups.has(toKey)) {
      connectionGroups.set(toKey, []);
    }
    connectionGroups.get(toKey)!.push({ index });
  });

  return connectionGroups;
}

/**
 * Calculate offsets for overlapping relationship lines
 */
export function calculateConnectionOffsets(
  connectionGroups: Map<string, Array<{ index: number }>>
): Map<number, { fromOffset: number; toOffset: number }> {
  const connectionOffsets = new Map<number, { fromOffset: number; toOffset: number }>();
  const offsetStep = 8; // pixels between lines

  connectionGroups.forEach((group, key) => {
    if (group.length > 1) {
      const totalOffset = (group.length - 1) * offsetStep;
      group.forEach((item, i) => {
        const offset = -totalOffset / 2 + i * offsetStep;
        const existing = connectionOffsets.get(item.index) || { fromOffset: 0, toOffset: 0 };

        if (key.startsWith('from:')) {
          existing.fromOffset = offset;
        } else {
          existing.toOffset = offset;
        }

        connectionOffsets.set(item.index, existing);
      });
    }
  });

  return connectionOffsets;
}

/**
 * Assign colors to schemas
 */
export function assignSchemaColors(
  tables: Array<{ name: string; schema?: string }>,
  colorPalette: readonly string[]
): Map<string, string> {
  const schemaColors = new Map<string, string>();
  let colorIndex = 0;

  tables.forEach((table) => {
    if (!table.name) return;
    const schemaName = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : undefined);
    if (schemaName && !schemaColors.has(schemaName)) {
      const color = colorPalette[colorIndex % colorPalette.length];
      if (color) {
        schemaColors.set(schemaName, color);
        colorIndex++;
      }
    }
  });

  return schemaColors;
}
