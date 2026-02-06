import { useCallback, useRef } from 'react';
import type { TableRenderData } from '@biagram/shared';
import { calculateOrthogonalRoute } from '@/lib/edge-routing';

interface RelationshipStyle {
  color: string;
  width: number;
  selectedColor: string;
  hoveredColor: string;
  dashed: boolean;
  arrowSize: number;
  hitWidth: number;
  labelFontSize: number;
  labelPadding: number;
  labelBackgroundColor: string;
  labelTextColor: string;
}

interface SchemaRelationship {
  id?: string;
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  type?: string;
}

interface SchemaTable {
  name: string;
  schema?: string | undefined;
  columns?: Array<{ name: string }> | undefined;
  note?: string | undefined;
}

/**
 * Extended relationship render data with table/column info
 * (The base RelationshipRenderData doesn't include fromTable/toTable)
 */
export interface ExtendedRelationshipRenderData {
  id: string;
  type: string;
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  path: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    controlPoints?: Array<{ x: number; y: number }>;
    midpoint: { x: number; y: number };
    direction: number;
  };
  style: RelationshipStyle;
  label: string;
  isSelected: boolean;
  isHovered: boolean;
}

const DEFAULT_RELATIONSHIP_STYLE: RelationshipStyle = {
  color: '#6b7280',
  width: 2,
  selectedColor: '#3b82f6',
  hoveredColor: '#4b5563',
  dashed: false,
  arrowSize: 8,
  hitWidth: 30,
  labelFontSize: 12,
  labelPadding: 4,
  labelBackgroundColor: '#ffffff',
  labelTextColor: '#374151',
};

/**
 * Hook for calculating relationship paths between tables
 * Consolidates duplicated relationship routing logic
 */
export function useRelationshipRouting() {
  // Cache for connection offsets
  const connectionOffsetsRef = useRef<Map<number, { fromOffset: number; toOffset: number }>>(new Map());

  /**
   * Get column Y position within a table
   */
  const getColumnY = useCallback((
    table: SchemaTable | undefined,
    columnName: string,
    tableBounds: { x: number; y: number; width: number; height: number } | undefined,
    yOffset: number = 0
  ): number => {
    if (!table || !tableBounds) return 0;

    const columnIndex = table.columns?.findIndex((col) => col.name === columnName) ?? -1;
    if (columnIndex === -1) {
      return tableBounds.y + tableBounds.height / 2 + yOffset;
    }

    const headerHeight = 32;
    const rowHeight = 24;
    // Note는 이제 헤더 안에 표시되므로 추가 높이 불필요
    return tableBounds.y + headerHeight + (columnIndex * rowHeight) + (rowHeight / 2) + yOffset;
  }, []);

  /**
   * Find table by name (supports schema.table notation)
   */
  const findTableByName = useCallback((
    tables: SchemaTable[],
    targetName: string
  ): SchemaTable | undefined => {
    return tables.find((t) => {
      const tableSchema = t.schema || (t.name.includes('.') ? t.name.split('.')[0] : undefined);
      const tableName = t.name.includes('.') ? t.name.split('.')[1] : t.name;
      const fullName = tableSchema ? `${tableSchema}.${tableName}` : tableName;
      return fullName === targetName || t.name === targetName || tableName === targetName;
    });
  }, []);

  /**
   * Find table render data by name
   */
  const findTableDataByName = useCallback((
    tables: TableRenderData[],
    targetName: string
  ): TableRenderData | undefined => {
    return tables.find((t) => {
      const tableSchema = t.schema || (t.name.includes('.') ? t.name.split('.')[0] : undefined);
      const tableName = t.name.includes('.') ? t.name.split('.')[1] : t.name;
      const fullName = tableSchema ? `${tableSchema}.${tableName}` : tableName;
      return fullName === targetName || t.name === targetName || tableName === targetName || t.id === targetName;
    });
  }, []);

  /**
   * Calculate connection offsets for overlapping connection points
   */
  const calculateConnectionOffsets = useCallback((
    relationships: SchemaRelationship[]
  ): Map<number, { fromOffset: number; toOffset: number }> => {
    const connectionGroups = new Map<string, { rel: SchemaRelationship; index: number }[]>();

    relationships.forEach((rel, index) => {
      // Group by from connection point
      const fromKey = `from:${rel.fromTable}:${rel.fromColumn}`;
      if (!connectionGroups.has(fromKey)) {
        connectionGroups.set(fromKey, []);
      }
      connectionGroups.get(fromKey)!.push({ rel, index });

      // Group by to connection point
      const toKey = `to:${rel.toTable}:${rel.toColumn}`;
      if (!connectionGroups.has(toKey)) {
        connectionGroups.set(toKey, []);
      }
      connectionGroups.get(toKey)!.push({ rel, index });
    });

    const offsets = new Map<number, { fromOffset: number; toOffset: number }>();
    connectionGroups.forEach((group, key) => {
      if (group.length > 1) {
        const offsetStep = 4; // 8px → 4px로 줄여서 겹침 방지하면서 위치 오차 최소화
        const totalOffset = (group.length - 1) * offsetStep;
        group.forEach((item, i) => {
          const offset = -totalOffset / 2 + i * offsetStep;
          const existing = offsets.get(item.index) || { fromOffset: 0, toOffset: 0 };
          if (key.startsWith('from:')) {
            existing.fromOffset = offset;
          } else {
            existing.toOffset = offset;
          }
          offsets.set(item.index, existing);
        });
      }
    });

    connectionOffsetsRef.current = offsets;
    return offsets;
  }, []);

  /**
   * Calculate connection points and routing for a relationship
   */
  const calculateRelationshipPath = useCallback((
    rel: SchemaRelationship,
    index: number,
    tableRenderData: TableRenderData[],
    schemaTables: SchemaTable[],
    options?: {
      offsets?: { fromOffset: number; toOffset: number };
      selectedId?: string | null | undefined;
      highlightedId?: string | null | undefined;
    }
  ): ExtendedRelationshipRenderData => {
    const fromTableData = findTableDataByName(tableRenderData, rel.fromTable);
    const toTableData = findTableDataByName(tableRenderData, rel.toTable);
    const fromTableBounds = fromTableData?.bounds;
    const toTableBounds = toTableData?.bounds;

    const fromTable = findTableByName(schemaTables, rel.fromTable);
    const toTable = findTableByName(schemaTables, rel.toTable);

    const relId = rel.id || `rel-${index}`;
    const isSelected = options?.selectedId === relId || options?.highlightedId === relId;
    const offsets = options?.offsets || { fromOffset: 0, toOffset: 0 };

    // Fallback for missing bounds
    if (!fromTableBounds || !toTableBounds) {
      const startX = fromTableBounds ? fromTableBounds.x + fromTableBounds.width : 150;
      const startY = fromTableBounds ? getColumnY(fromTable, rel.fromColumn, fromTableBounds) : 100;
      const endX = toTableBounds ? toTableBounds.x : 300;
      const endY = toTableBounds ? getColumnY(toTable, rel.toColumn, toTableBounds) : 100;

      return {
        id: relId,
        type: rel.type || 'one-to-many',
        fromTable: rel.fromTable,
        toTable: rel.toTable,
        fromColumn: rel.fromColumn,
        toColumn: rel.toColumn,
        path: {
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          midpoint: { x: (startX + endX) / 2, y: (startY + endY) / 2 },
          direction: 0,
        },
        style: DEFAULT_RELATIONSHIP_STYLE,
        isSelected,
        isHovered: false,
        label: `${rel.fromTable}.${rel.fromColumn} → ${rel.toTable}.${rel.toColumn}`,
      };
    }

    // Calculate connection sides based on table positions
    const fromLeft = fromTableBounds.x;
    const fromRight = fromTableBounds.x + fromTableBounds.width;
    const fromCenterX = fromLeft + fromTableBounds.width / 2;
    const toLeft = toTableBounds.x;
    const toRight = toTableBounds.x + toTableBounds.width;
    const toCenterX = toLeft + toTableBounds.width / 2;

    const fromColumnY = getColumnY(fromTable, rel.fromColumn, fromTableBounds, offsets.fromOffset);
    const toColumnY = getColumnY(toTable, rel.toColumn, toTableBounds, offsets.toOffset);

    const GAP = 25;
    const horizontalOverlap = !(fromRight + GAP < toLeft || toRight + GAP < fromLeft);

    let startX: number, startY: number, endX: number, endY: number;
    let fromSide: 'left' | 'right', toSide: 'left' | 'right';

    if (!horizontalOverlap) {
      // Tables don't overlap horizontally - standard left/right connection
      if (fromCenterX < toCenterX) {
        startX = fromRight;
        startY = fromColumnY;
        endX = toLeft;
        endY = toColumnY;
        fromSide = 'right';
        toSide = 'left';
      } else {
        startX = fromLeft;
        startY = fromColumnY;
        endX = toRight;
        endY = toColumnY;
        fromSide = 'left';
        toSide = 'right';
      }
    } else {
      // Tables overlap horizontally - need bypass route
      const goRight = fromCenterX < toCenterX || (fromRight - toLeft < toRight - fromLeft);

      if (goRight) {
        startX = fromRight;
        startY = fromColumnY;
        endX = toRight;
        endY = toColumnY;
        fromSide = 'right';
        toSide = 'right';
      } else {
        startX = fromLeft;
        startY = fromColumnY;
        endX = toLeft;
        endY = toColumnY;
        fromSide = 'left';
        toSide = 'left';
      }
    }

    // Calculate orthogonal route with obstacle avoidance
    const obstacles = tableRenderData.map(t => t.bounds);
    const controlPoints = calculateOrthogonalRoute(
      { x: startX, y: startY },
      { x: endX, y: endY },
      fromSide,
      toSide,
      obstacles,
      fromTableBounds,
      toTableBounds
    );

    // Calculate arrow direction
    const lastControlPoint = controlPoints[controlPoints.length - 1];
    const direction = lastControlPoint
      ? Math.atan2(endY - lastControlPoint.y, endX - lastControlPoint.x)
      : Math.atan2(endY - startY, endX - startX);

    return {
      id: relId,
      type: rel.type || 'one-to-many',
      fromTable: rel.fromTable,
      toTable: rel.toTable,
      fromColumn: rel.fromColumn,
      toColumn: rel.toColumn,
      path: {
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        controlPoints,
        midpoint: { x: (startX + endX) / 2, y: (startY + endY) / 2 },
        direction,
      },
      style: DEFAULT_RELATIONSHIP_STYLE,
      isSelected,
      isHovered: false,
      label: `${rel.fromTable}.${rel.fromColumn} → ${rel.toTable}.${rel.toColumn}`,
    };
  }, [getColumnY, findTableByName, findTableDataByName]);

  /**
   * Calculate all relationship paths for a schema
   */
  const calculateAllRelationships = useCallback((
    schemaRelationships: SchemaRelationship[],
    tableRenderData: TableRenderData[],
    schemaTables: SchemaTable[],
    options?: {
      selectedId?: string | null | undefined;
      highlightedId?: string | null | undefined;
    }
  ): ExtendedRelationshipRenderData[] => {
    const offsets = calculateConnectionOffsets(schemaRelationships);

    return schemaRelationships.map((rel, index) => {
      const relOffsets = offsets.get(index) || { fromOffset: 0, toOffset: 0 };
      return calculateRelationshipPath(rel, index, tableRenderData, schemaTables, {
        offsets: relOffsets,
        selectedId: options?.selectedId ?? null,
        highlightedId: options?.highlightedId ?? null,
      });
    });
  }, [calculateConnectionOffsets, calculateRelationshipPath]);

  return {
    getColumnY,
    findTableByName,
    findTableDataByName,
    calculateConnectionOffsets,
    calculateRelationshipPath,
    calculateAllRelationships,
  };
}

export default useRelationshipRouting;
