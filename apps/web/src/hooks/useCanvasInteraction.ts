import { useCallback, useRef } from 'react';
import type { TableRenderData, RelationshipRenderData } from '@biagram/shared';
import type { DiagramEngine } from '@biagram/diagram-engine';

interface Point {
  x: number;
  y: number;
}

interface InteractionState {
  isDraggingCanvas: boolean;
  isDraggingTable: boolean;
  draggedTableId: string | null;
  lastMousePos: Point;
  mouseDownPos: Point;
  mouseDownTableId: string | null;
  mouseDownRelationshipId: string | null;
  hasMoved: boolean;
}

const DRAG_THRESHOLD = 5; // pixels

/**
 * Hook for handling canvas mouse interactions
 */
export function useCanvasInteraction() {
  const stateRef = useRef<InteractionState>({
    isDraggingCanvas: false,
    isDraggingTable: false,
    draggedTableId: null,
    lastMousePos: { x: 0, y: 0 },
    mouseDownPos: { x: 0, y: 0 },
    mouseDownTableId: null,
    mouseDownRelationshipId: null,
    hasMoved: false,
  });

  /**
   * Find table at canvas position
   */
  const findTableAtPosition = useCallback((
    canvasX: number,
    canvasY: number,
    tables: TableRenderData[],
    engine: DiagramEngine
  ): string | null => {
    const viewport = engine.getViewportManager().getViewport();

    // Convert screen coordinates to world coordinates
    const worldX = (canvasX - viewport.pan.x) / viewport.zoom;
    const worldY = (canvasY - viewport.pan.y) / viewport.zoom;

    // Check tables in reverse order (top-most first)
    for (let i = tables.length - 1; i >= 0; i--) {
      const table = tables[i];
      if (!table) continue;

      const { x, y, width, height } = table.bounds;

      if (worldX >= x && worldX <= x + width &&
          worldY >= y && worldY <= y + height) {
        return table.id;
      }
    }
    return null;
  }, []);

  /**
   * Calculate distance from point to line segment
   */
  const distanceToSegment = useCallback((
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number => {
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

    return Math.sqrt((px - closestX) * (px - closestX) + (py - closestY) * (py - closestY));
  }, []);

  /**
   * Find relationship at canvas position
   */
  const findRelationshipAtPosition = useCallback((
    canvasX: number,
    canvasY: number,
    relationships: RelationshipRenderData[],
    engine: DiagramEngine
  ): string | null => {
    const viewport = engine.getViewportManager().getViewport();

    const worldX = (canvasX - viewport.pan.x) / viewport.zoom;
    const worldY = (canvasY - viewport.pan.y) / viewport.zoom;

    const hitWidth = 10 / viewport.zoom;

    for (const rel of relationships) {
      const relData = rel as any;

      const points: Array<{ x: number; y: number }> = [
        relData.path.start,
        ...(relData.path.controlPoints || []),
        relData.path.end,
      ];

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
  }, [distanceToSegment]);

  /**
   * Handle mouse down event
   */
  const handleMouseDown = useCallback((
    e: MouseEvent,
    canvas: HTMLCanvasElement,
    tables: TableRenderData[],
    relationships: RelationshipRenderData[],
    engine: DiagramEngine
  ): { tableId: string | null; relationshipId: string | null; isCanvasDrag: boolean } => {
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const relationshipId = findRelationshipAtPosition(canvasX, canvasY, relationships, engine);
    const tableId = relationshipId ? null : findTableAtPosition(canvasX, canvasY, tables, engine);

    const state = stateRef.current;
    state.mouseDownPos = { x: e.clientX, y: e.clientY };
    state.mouseDownTableId = tableId;
    state.mouseDownRelationshipId = relationshipId;
    state.lastMousePos = { x: e.clientX, y: e.clientY };
    state.hasMoved = false;

    let isCanvasDrag = false;

    if (tableId && !e.ctrlKey && !e.metaKey && e.button === 0) {
      // Table click - might become drag
    } else if (relationshipId && !e.ctrlKey && !e.metaKey && e.button === 0) {
      // Relationship click
    } else if (e.button === 0 || e.button === 1 || e.ctrlKey || e.metaKey) {
      // Canvas pan
      state.isDraggingCanvas = true;
      isCanvasDrag = true;
    }

    return { tableId, relationshipId, isCanvasDrag };
  }, [findTableAtPosition, findRelationshipAtPosition]);

  /**
   * Handle mouse move event
   * Returns updated table bounds if dragging a table
   */
  const handleMouseMove = useCallback((
    e: MouseEvent,
    canvas: HTMLCanvasElement,
    tables: TableRenderData[],
    engine: DiagramEngine,
    onTableDrag?: (tableId: string, deltaX: number, deltaY: number) => void
  ): { isDragging: boolean; type: 'table' | 'canvas' | null } => {
    const state = stateRef.current;
    const rect = canvas.getBoundingClientRect();

    // Check drag threshold
    if (!state.hasMoved && state.mouseDownTableId) {
      const dx = e.clientX - state.mouseDownPos.x;
      const dy = e.clientY - state.mouseDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > DRAG_THRESHOLD) {
        state.hasMoved = true;
        state.isDraggingTable = true;
        state.draggedTableId = state.mouseDownTableId;
      }
    }

    if (state.isDraggingTable && state.draggedTableId) {
      const deltaX = e.clientX - state.lastMousePos.x;
      const deltaY = e.clientY - state.lastMousePos.y;

      const viewport = engine.getViewportManager().getViewport();
      const worldDeltaX = deltaX / viewport.zoom;
      const worldDeltaY = deltaY / viewport.zoom;

      if (onTableDrag) {
        onTableDrag(state.draggedTableId, worldDeltaX, worldDeltaY);
      }

      state.lastMousePos = { x: e.clientX, y: e.clientY };
      return { isDragging: true, type: 'table' };
    }

    if (state.isDraggingCanvas) {
      state.hasMoved = true;
      const deltaX = e.clientX - state.lastMousePos.x;
      const deltaY = e.clientY - state.lastMousePos.y;

      engine.getViewportManager().handleEvent({
        type: 'drag',
        position: {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        },
        delta: { x: deltaX, y: deltaY },
        button: e.button,
        modifiers: {
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
        },
      });

      state.lastMousePos = { x: e.clientX, y: e.clientY };
      return { isDragging: true, type: 'canvas' };
    }

    return { isDragging: false, type: null };
  }, []);

  /**
   * Handle mouse up event
   * Returns click info if it was a click (not drag)
   */
  const handleMouseUp = useCallback((): {
    wasClick: boolean;
    tableId: string | null;
    relationshipId: string | null;
    wasDraggingTable: boolean;
  } => {
    const state = stateRef.current;
    const wasClick = !state.hasMoved;
    const result = {
      wasClick,
      tableId: wasClick ? state.mouseDownTableId : null,
      relationshipId: wasClick ? state.mouseDownRelationshipId : null,
      wasDraggingTable: state.isDraggingTable,
    };

    // Reset drag state
    state.isDraggingTable = false;
    state.draggedTableId = null;
    state.isDraggingCanvas = false;
    state.mouseDownTableId = null;
    state.mouseDownRelationshipId = null;
    state.hasMoved = false;

    return result;
  }, []);

  /**
   * Handle mouse leave event
   */
  const handleMouseLeave = useCallback((): void => {
    const state = stateRef.current;
    state.isDraggingTable = false;
    state.draggedTableId = null;
    state.isDraggingCanvas = false;
    state.hasMoved = false;
  }, []);

  /**
   * Handle wheel event for zoom
   */
  const handleWheel = useCallback((
    e: WheelEvent,
    canvas: HTMLCanvasElement,
    engine: DiagramEngine
  ): void => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    engine.getViewportManager().handleEvent({
      type: 'wheel',
      position: {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      },
      delta: { x: e.deltaX, y: e.deltaY },
      button: 0,
      modifiers: {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      },
    });
  }, []);

  /**
   * Handle double click for table editing
   */
  const handleDoubleClick = useCallback((
    e: MouseEvent,
    tables: TableRenderData[],
    engine: DiagramEngine
  ): string | null => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const viewport = engine.getViewportManager().getViewport();
    const worldX = (canvasX - viewport.pan.x) / viewport.zoom;
    const worldY = (canvasY - viewport.pan.y) / viewport.zoom;

    const clickedTable = tables.find(table => {
      return (
        worldX >= table.bounds.x &&
        worldX <= table.bounds.x + table.bounds.width &&
        worldY >= table.bounds.y &&
        worldY <= table.bounds.y + table.bounds.height
      );
    });

    return clickedTable?.name || null;
  }, []);

  /**
   * Get current interaction state
   */
  const getState = useCallback((): Readonly<InteractionState> => {
    return { ...stateRef.current };
  }, []);

  return {
    findTableAtPosition,
    findRelationshipAtPosition,
    distanceToSegment,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleWheel,
    handleDoubleClick,
    getState,
  };
}

export default useCanvasInteraction;
