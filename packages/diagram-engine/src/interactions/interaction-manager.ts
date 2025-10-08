import {
  Position2D,
  Rectangle2D,
  InteractionEvent,
  HitTestResult,
  TableRenderData,
  RelationshipRenderData,
} from '@biagram/shared';
import { ViewportManager } from '../viewport/viewport-manager';

export interface InteractionHandlers {
  onTableClick?: (tableId: string, event: InteractionEvent) => void;
  onTableDoubleClick?: (tableId: string, event: InteractionEvent) => void;
  onTableDragStart?: (tableId: string, event: InteractionEvent) => void;
  onTableDrag?: (tableId: string, event: InteractionEvent) => void;
  onTableDragEnd?: (tableId: string, event: InteractionEvent) => void;
  onRelationshipClick?: (relationshipId: string, event: InteractionEvent) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  onCanvasClick?: (event: InteractionEvent) => void;
  onHover?: (target: HitTestResult | null) => void;
}

/**
 * Interaction manager for diagram user input
 *
 * Handles mouse, touch, and keyboard events, providing high-level interaction
 * callbacks for diagram manipulation. Includes hit testing, drag/drop, and selection.
 */
export class InteractionManager {
  private canvas: HTMLCanvasElement;
  private viewportManager: ViewportManager;
  private handlers: InteractionHandlers;

  // Current state
  private isDragging = false;
  private dragStartPos?: Position2D;
  private dragTarget?: { type: 'table' | 'relationship'; id: string };
  private lastClickTime = 0;
  private doubleClickThreshold = 300; // ms

  // Hit test data
  private tables: TableRenderData[] = [];
  private relationships: RelationshipRenderData[] = [];

  // Selection state
  private selectedIds = new Set<string>();
  private hoveredTarget: HitTestResult | null = null;

  // Event state
  private isMouseDown = false;
  private lastMousePos?: Position2D;

  constructor(
    canvas: HTMLCanvasElement,
    viewportManager: ViewportManager,
    handlers: InteractionHandlers = {}
  ) {
    this.canvas = canvas;
    this.viewportManager = viewportManager;
    this.handlers = handlers;

    this.setupEventListeners();
  }

  /**
   * Update render data for hit testing
   */
  updateRenderData(tables: TableRenderData[], relationships: RelationshipRenderData[]): void {
    this.tables = tables;
    this.relationships = relationships;
  }

  /**
   * Update interaction handlers
   */
  updateHandlers(handlers: Partial<InteractionHandlers>): void {
    Object.assign(this.handlers, handlers);
  }

  /**
   * Get current selection
   */
  getSelection(): string[] {
    return Array.from(this.selectedIds);
  }

  /**
   * Set selection
   */
  setSelection(ids: string[]): void {
    this.selectedIds.clear();
    ids.forEach(id => this.selectedIds.add(id));
    this.handlers.onSelectionChange?.(this.getSelection());
  }

  /**
   * Add to selection
   */
  addToSelection(id: string): void {
    this.selectedIds.add(id);
    this.handlers.onSelectionChange?.(this.getSelection());
  }

  /**
   * Remove from selection
   */
  removeFromSelection(id: string): void {
    this.selectedIds.delete(id);
    this.handlers.onSelectionChange?.(this.getSelection());
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedIds.clear();
    this.handlers.onSelectionChange?.(this.getSelection());
  }

  /**
   * Perform hit test at screen position
   */
  hitTest(screenPos: Position2D): HitTestResult | null {
    const worldPos = this.viewportManager.screenToWorld(screenPos);

    // Test tables first (they're on top)
    for (let i = this.tables.length - 1; i >= 0; i--) {
      const table = this.tables[i];
      if (table && this.isPointInRectangle(worldPos, table.bounds)) {
        return {
          type: 'table',
          target: {
            id: table.id,
            data: table,
          },
          position: worldPos,
        };
      }
    }

    // Test relationships
    for (const relationship of this.relationships) {
      if (this.isPointOnRelationship(worldPos, relationship)) {
        return {
          type: 'relationship',
          target: {
            id: relationship.id,
            data: relationship,
          },
          position: worldPos,
        };
      }
    }

    return {
      type: 'background',
      position: worldPos,
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));

    // Touch events
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // Keyboard events
    this.canvas.addEventListener('keydown', this.handleKeyDown.bind(this));

    // Focus
    this.canvas.setAttribute('tabindex', '0');
  }

  /**
   * Handle mouse down events
   */
  private handleMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.canvas.focus();

    const screenPos = this.getMousePosition(event);
    const hitResult = this.hitTest(screenPos);

    this.isMouseDown = true;
    this.dragStartPos = screenPos;
    this.lastMousePos = screenPos;

    if (hitResult?.target) {
      this.dragTarget = {
        type: hitResult.type as 'table' | 'relationship',
        id: hitResult.target.id,
      };

      // Handle selection
      if (!event.ctrlKey && !event.metaKey) {
        if (!this.selectedIds.has(hitResult.target.id)) {
          this.setSelection([hitResult.target.id]);
        }
      } else {
        // Toggle selection
        if (this.selectedIds.has(hitResult.target.id)) {
          this.removeFromSelection(hitResult.target.id);
        } else {
          this.addToSelection(hitResult.target.id);
        }
      }

      // Start drag for tables
      if (hitResult.type === 'table') {
        this.handlers.onTableDragStart?.(hitResult.target.id, {
          type: 'drag',
          position: screenPos,
          button: event.button,
          modifiers: {
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            alt: event.altKey,
            meta: event.metaKey,
          },
        });
      }
    } else {
      // Clear selection if not holding modifier
      if (!event.ctrlKey && !event.metaKey) {
        this.clearSelection();
      }
    }
  }

  /**
   * Handle mouse move events
   */
  private handleMouseMove(event: MouseEvent): void {
    const screenPos = this.getMousePosition(event);

    if (!this.isMouseDown) {
      // Handle hover
      const hitResult = this.hitTest(screenPos);
      if (hitResult !== this.hoveredTarget) {
        this.hoveredTarget = hitResult;
        this.handlers.onHover?.(hitResult);
      }
      return;
    }

    if (!this.dragStartPos || !this.lastMousePos) return;

    const delta = {
      x: screenPos.x - this.lastMousePos.x,
      y: screenPos.y - this.lastMousePos.y,
    };

    const totalDelta = {
      x: screenPos.x - this.dragStartPos.x,
      y: screenPos.y - this.dragStartPos.y,
    };

    // Start dragging if moved enough
    if (!this.isDragging && (Math.abs(totalDelta.x) > 5 || Math.abs(totalDelta.y) > 5)) {
      this.isDragging = true;
    }

    if (this.isDragging) {
      if (this.dragTarget?.type === 'table') {
        // Drag table
        this.handlers.onTableDrag?.(this.dragTarget.id, {
          type: 'drag',
          position: screenPos,
          delta,
          modifiers: {
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            alt: event.altKey,
            meta: event.metaKey,
          },
        });
      } else {
        // Pan viewport
        this.viewportManager.handleEvent({
          type: 'drag',
          position: screenPos,
          delta,
        });
      }
    }

    this.lastMousePos = screenPos;
  }

  /**
   * Handle mouse up events
   */
  private handleMouseUp(event: MouseEvent): void {
    const screenPos = this.getMousePosition(event);

    if (this.isDragging && this.dragTarget?.type === 'table') {
      this.handlers.onTableDragEnd?.(this.dragTarget.id, {
        type: 'drag',
        position: screenPos,
        modifiers: {
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          alt: event.altKey,
          meta: event.metaKey,
        },
      });
    } else if (!this.isDragging) {
      // Handle click
      this.handleClick(screenPos, event);
    }

    // Reset state
    this.isMouseDown = false;
    this.isDragging = false;
    this.dragStartPos = undefined;
    this.dragTarget = undefined;
    this.lastMousePos = undefined;
  }

  /**
   * Handle click events
   */
  private handleClick(screenPos: Position2D, event: MouseEvent): void {
    const hitResult = this.hitTest(screenPos);
    const currentTime = Date.now();
    const isDoubleClick = currentTime - this.lastClickTime < this.doubleClickThreshold;

    this.lastClickTime = currentTime;

    const interactionEvent: InteractionEvent = {
      type: isDoubleClick ? 'doubleclick' : 'click',
      position: screenPos,
      button: event.button,
      modifiers: {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey,
      },
    };

    if (hitResult?.target) {
      if (hitResult.type === 'table') {
        if (isDoubleClick) {
          this.handlers.onTableDoubleClick?.(hitResult.target.id, interactionEvent);
        } else {
          this.handlers.onTableClick?.(hitResult.target.id, interactionEvent);
        }
      } else if (hitResult.type === 'relationship') {
        this.handlers.onRelationshipClick?.(hitResult.target.id, interactionEvent);
      }
    } else {
      this.handlers.onCanvasClick?.(interactionEvent);
    }
  }

  /**
   * Handle wheel events
   */
  private handleWheel(event: WheelEvent): void {
    event.preventDefault();

    const screenPos = this.getMousePosition(event);

    this.viewportManager.handleEvent({
      type: 'wheel',
      position: screenPos,
      delta: { x: event.deltaX, y: event.deltaY },
      modifiers: {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey,
      },
    });
  }

  /**
   * Handle context menu
   */
  private handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
    // TODO: Implement context menu
  }

  /**
   * Handle touch start
   */
  private handleTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      // Single touch - simulate mouse down
      const touch = event.touches[0];
      if (touch) {
        const mouseEvent = new MouseEvent('mousedown', {
          clientX: touch.clientX,
          clientY: touch.clientY,
          button: 0,
        });
        this.handleMouseDown(mouseEvent);
      }
    }
  }

  /**
   * Handle touch move
   */
  private handleTouchMove(event: TouchEvent): void {
    event.preventDefault();

    if (event.touches.length === 1) {
      // Single touch - simulate mouse move
      const touch = event.touches[0];
      if (touch) {
        const mouseEvent = new MouseEvent('mousemove', {
          clientX: touch.clientX,
          clientY: touch.clientY,
        });
        this.handleMouseMove(mouseEvent);
      }
    } else if (event.touches.length === 2) {
      // Two finger zoom/pan
      this.handleTouchZoom(event);
    }
  }

  /**
   * Handle touch end
   */
  private handleTouchEnd(event: TouchEvent): void {
    if (event.changedTouches.length === 1) {
      // Single touch - simulate mouse up
      const touch = event.changedTouches[0];
      if (touch) {
        const mouseEvent = new MouseEvent('mouseup', {
          clientX: touch.clientX,
          clientY: touch.clientY,
          button: 0,
        });
        this.handleMouseUp(mouseEvent);
      }
    }
  }

  /**
   * Handle two-finger touch zoom
   */
  private handleTouchZoom(event: TouchEvent): void {
    // TODO: Implement pinch-to-zoom
  }

  /**
   * Handle keyboard events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.clearSelection();
        break;

      case 'Delete':
      case 'Backspace':
        if (this.selectedIds.size > 0) {
          // TODO: Implement delete
        }
        break;

      case 'a':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          // Select all
          const allIds = [...this.tables.map(t => t.id), ...this.relationships.map(r => r.id)];
          this.setSelection(allIds);
        }
        break;
    }
  }

  /**
   * Get mouse position relative to canvas
   */
  private getMousePosition(event: MouseEvent | Touch): Position2D {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  /**
   * Check if point is inside rectangle
   */
  private isPointInRectangle(point: Position2D, rect: Rectangle2D): boolean {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }

  /**
   * Check if point is on relationship line
   */
  private isPointOnRelationship(point: Position2D, relationship: RelationshipRenderData): boolean {
    const { path, style } = relationship;
    const distance = this.distanceToLine(point, path.start, path.end);
    return distance <= style.hitWidth;
  }

  /**
   * Calculate distance from point to line
   */
  private distanceToLine(point: Position2D, lineStart: Position2D, lineEnd: Position2D): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;

    if (lenSq === 0) {
      // Line start and end are the same point
      return Math.sqrt(A * A + B * B);
    }

    const param = dot / lenSq;

    let xx: number, yy: number;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;

    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // Remove event listeners if needed
  }
}