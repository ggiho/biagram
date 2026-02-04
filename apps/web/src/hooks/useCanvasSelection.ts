import { useCallback, useRef } from 'react';
import type { TableRenderData, RelationshipRenderData } from '@biagram/shared';
import type { DiagramEngine } from '@biagram/diagram-engine';

interface SavedViewport {
  zoom: number;
  pan: { x: number; y: number };
}

interface SavedPositions {
  positions: Map<string, { x: number; y: number }>;
}

/**
 * Hook for managing canvas selection state
 */
export function useCanvasSelection() {
  const savedViewportRef = useRef<SavedViewport | null>(null);
  const savedTablePositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);

  /**
   * Save current viewport state
   */
  const saveViewport = useCallback((engine: DiagramEngine): void => {
    const viewportManager = engine.getViewportManager();
    const currentViewport = viewportManager.getViewport();
    savedViewportRef.current = {
      zoom: currentViewport.zoom,
      pan: { x: currentViewport.pan.x, y: currentViewport.pan.y },
    };
  }, []);

  /**
   * Restore saved viewport state
   */
  const restoreViewport = useCallback((engine: DiagramEngine): boolean => {
    if (!savedViewportRef.current) return false;

    const viewportManager = engine.getViewportManager();
    const viewport = viewportManager.getViewport();
    const centerX = (viewport.bounds.width / 2 - savedViewportRef.current.pan.x) / savedViewportRef.current.zoom;
    const centerY = (viewport.bounds.height / 2 - savedViewportRef.current.pan.y) / savedViewportRef.current.zoom;
    viewportManager.panTo({ x: centerX, y: centerY }, false);
    viewportManager.zoomTo(savedViewportRef.current.zoom, true);
    savedViewportRef.current = null;
    return true;
  }, []);

  /**
   * Save table positions
   */
  const saveTablePositions = useCallback((tables: TableRenderData[]): void => {
    savedTablePositionsRef.current = new Map();
    tables.forEach(t => {
      savedTablePositionsRef.current!.set(t.id, { x: t.bounds.x, y: t.bounds.y });
    });
  }, []);

  /**
   * Restore saved table positions
   */
  const restoreTablePositions = useCallback((tables: TableRenderData[]): TableRenderData[] => {
    if (!savedTablePositionsRef.current || savedTablePositionsRef.current.size === 0) {
      return tables;
    }

    const restoredTables = tables.map(table => {
      const savedPos = savedTablePositionsRef.current!.get(table.id);
      if (savedPos) {
        return { ...table, bounds: { ...table.bounds, x: savedPos.x, y: savedPos.y } };
      }
      return table;
    });

    savedTablePositionsRef.current = null;
    return restoredTables;
  }, []);

  /**
   * Update table selection state
   */
  const updateTableSelection = useCallback((
    tables: TableRenderData[],
    selectedId: string | null
  ): TableRenderData[] => {
    return tables.map(table => ({
      ...table,
      isSelected: table.id === selectedId || table.name === selectedId,
    }));
  }, []);

  /**
   * Update relationship selection state
   */
  const updateRelationshipSelection = useCallback((
    relationships: RelationshipRenderData[],
    selectedTableId: string | null
  ): RelationshipRenderData[] => {
    return relationships.map((rel: any) => ({
      ...rel,
      isSelected: selectedTableId
        ? (rel.fromTable === selectedTableId || rel.toTable === selectedTableId)
        : false,
    }));
  }, []);

  /**
   * Handle relationship selection (special case)
   * Updates tables to highlight connected tables
   */
  const selectRelationship = useCallback((
    relationshipId: string,
    tables: TableRenderData[],
    relationships: RelationshipRenderData[]
  ): {
    tables: TableRenderData[];
    relationships: RelationshipRenderData[];
    fromTable: TableRenderData | undefined;
    toTable: TableRenderData | undefined;
  } => {
    const selectedRel: any = relationships.find((r: any) => r.id === relationshipId);

    if (!selectedRel) {
      return {
        tables: tables.map(t => ({ ...t, isSelected: false })),
        relationships: relationships.map((r: any) => ({ ...r, isSelected: false })),
        fromTable: undefined,
        toTable: undefined,
      };
    }

    const fromTable = tables.find(t =>
      t.name === selectedRel.fromTable || t.id === selectedRel.fromTable
    );
    const toTable = tables.find(t =>
      t.name === selectedRel.toTable || t.id === selectedRel.toTable
    );

    const updatedTables = tables.map(table => ({
      ...table,
      isSelected: table.name === selectedRel.fromTable || table.name === selectedRel.toTable,
    }));

    const updatedRelationships = relationships.map((rel: any) => ({
      ...rel,
      isSelected: rel.id === relationshipId,
    }));

    return {
      tables: updatedTables,
      relationships: updatedRelationships,
      fromTable,
      toTable,
    };
  }, []);

  /**
   * Clear all selections
   */
  const clearSelection = useCallback((
    tables: TableRenderData[],
    relationships: RelationshipRenderData[]
  ): { tables: TableRenderData[]; relationships: RelationshipRenderData[] } => {
    return {
      tables: tables.map(table => ({ ...table, isSelected: false })),
      relationships: relationships.map((rel: any) => ({ ...rel, isSelected: false })),
    };
  }, []);

  /**
   * Position two tables side by side in center (for relationship focus view)
   */
  const positionTablesForRelationship = useCallback((
    fromTable: TableRenderData,
    toTable: TableRenderData,
    canvasWidth: number,
    canvasHeight: number,
    targetZoom: number = 0.85
  ): { fromPos: { x: number; y: number }; toPos: { x: number; y: number } } => {
    const canvasCenterX = canvasWidth / 2 / targetZoom;
    const canvasCenterY = canvasHeight / 2 / targetZoom;
    const gap = 100;

    const fromTableNewX = canvasCenterX - fromTable.bounds.width - gap / 2;
    const toTableNewX = canvasCenterX + gap / 2;

    const maxHeight = Math.max(fromTable.bounds.height, toTable.bounds.height);
    const centerY = canvasCenterY - maxHeight / 2;

    return {
      fromPos: { x: fromTableNewX, y: centerY },
      toPos: { x: toTableNewX, y: centerY },
    };
  }, []);

  /**
   * Apply dim effect to non-selected tables
   */
  const applyDimEffect = useCallback((
    tables: TableRenderData[],
    selectedTableIds: string[]
  ): TableRenderData[] => {
    const dimmedTables: TableRenderData[] = [];
    const selectedTables: TableRenderData[] = [];

    tables.forEach(t => {
      const isSelected = selectedTableIds.includes(t.id) || selectedTableIds.includes(t.name);
      const tableWithOpacity = {
        ...t,
        // @ts-ignore - Adding opacity property
        opacity: isSelected ? 1.0 : 0.3,
      };

      if (isSelected) {
        selectedTables.push(tableWithOpacity);
      } else {
        dimmedTables.push(tableWithOpacity);
      }
    });

    // Selected tables at end (rendered on top)
    return [...dimmedTables, ...selectedTables];
  }, []);

  /**
   * Remove dim effect from all tables
   */
  const removeDimEffect = useCallback((tables: TableRenderData[]): TableRenderData[] => {
    return tables.map(table => ({
      ...table,
      // @ts-ignore - Removing opacity property
      opacity: 1.0,
    }));
  }, []);

  /**
   * Check if there are saved states
   */
  const hasSavedState = useCallback((): boolean => {
    return savedViewportRef.current !== null || savedTablePositionsRef.current !== null;
  }, []);

  return {
    saveViewport,
    restoreViewport,
    saveTablePositions,
    restoreTablePositions,
    updateTableSelection,
    updateRelationshipSelection,
    selectRelationship,
    clearSelection,
    positionTablesForRelationship,
    applyDimEffect,
    removeDimEffect,
    hasSavedState,
    savedViewportRef,
    savedTablePositionsRef,
  };
}

export default useCanvasSelection;
