// Import all necessary components
import { CanvasRenderer } from './renderers/canvas-renderer';
import { ViewportManager } from './viewport/viewport-manager';
import { InteractionManager } from './interactions/interaction-manager';
import type { InteractionHandlers } from './interactions/interaction-manager';

// Import types from shared package
import type {
  Position2D,
  Rectangle2D,
  ViewportState,
  TableRenderData,
  RelationshipRenderData,
  TableStyle,
  RelationshipStyle,
  ThemeConfig,
  InteractionEvent,
  HitTestResult,
} from '@biagram/shared';

// Export main rendering components
export { CanvasRenderer } from './renderers/canvas-renderer';

// Export viewport management
export { ViewportManager } from './viewport/viewport-manager';

// Export interaction handling
export { InteractionManager } from './interactions/interaction-manager';
export type { InteractionHandlers } from './interactions/interaction-manager';

// Re-export types from shared package for convenience
export type {
  Position2D,
  Rectangle2D,
  ViewportState,
  TableRenderData,
  RelationshipRenderData,
  TableStyle,
  RelationshipStyle,
  ThemeConfig,
  InteractionEvent,
  HitTestResult,
} from '@biagram/shared';

/**
 * Main diagram engine class that coordinates all components
 */
export class DiagramEngine {
  private canvas: HTMLCanvasElement;
  private renderer: CanvasRenderer;
  private viewportManager: ViewportManager;
  private interactionManager: InteractionManager;

  // Current data
  private tables: TableRenderData[] = [];
  private relationships: RelationshipRenderData[] = [];
  private theme?: ThemeConfig;
  private showGrid = true;

  constructor(canvas: HTMLCanvasElement, options?: {
    enableSVGOverlay?: boolean;
    initialViewport?: Partial<ViewportState>;
  }) {
    this.canvas = canvas;

    // Initialize components
    this.renderer = new CanvasRenderer(canvas, options?.enableSVGOverlay ? {
      enableSVGOverlay: options.enableSVGOverlay,
    } : undefined);

    this.viewportManager = new ViewportManager(canvas, options?.initialViewport);

    this.interactionManager = new InteractionManager(canvas, this.viewportManager);

    // Setup viewport change handler - this is CRITICAL for zoom/pan to work
    this.viewportManager.onViewportChanged((viewport) => {
      console.log('🎯 DiagramEngine viewport listener called');
      // Force immediate re-render when viewport changes
      this.renderer.invalidate();
      this.render();
    });
  }

  /**
   * Update diagram data
   */
  updateData(tables: TableRenderData[], relationships: RelationshipRenderData[], theme?: ThemeConfig): void {
    this.tables = tables;
    this.relationships = relationships;
    if (theme) {
      this.theme = theme;
    }
    this.renderer.invalidate(); // Mark renderer as dirty to force re-render
    this.interactionManager.updateRenderData(tables, relationships);
    this.render();
  }

  /**
   * Render the diagram
   */
  render(): void {
    this.renderer.render({
      tables: this.tables,
      relationships: this.relationships,
      viewport: this.viewportManager.getViewport(),
      theme: this.theme,
      showGrid: this.showGrid,
    });
  }

  /**
   * Set grid visibility
   */
  setShowGrid(show: boolean): void {
    this.showGrid = show;
    this.renderer.invalidate();
    this.render();
  }

  /**
   * Get grid visibility
   */
  getShowGrid(): boolean {
    return this.showGrid;
  }

  /**
   * Get viewport manager
   */
  getViewportManager(): ViewportManager {
    return this.viewportManager;
  }

  /**
   * Get interaction manager
   */
  getInteractionManager(): InteractionManager {
    return this.interactionManager;
  }

  /**
   * Get current viewport state
   */
  getViewport(): ViewportState {
    return this.viewportManager.getViewport();
  }

  /**
   * Zoom to fit all content
   */
  zoomToFit(padding = 50): void {
    if (this.tables.length === 0) return;

    // Calculate bounds of all tables
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const table of this.tables) {
      const { x, y, width, height } = table.bounds;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }

    if (minX === Infinity) return;

    const bounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };

    this.viewportManager.fitToRect(bounds, padding);
  }

  /**
   * Export diagram as image
   */
  exportAsImage(format: 'png' | 'jpeg' = 'png', quality = 1): string {
    return this.canvas.toDataURL(`image/${format}`, quality);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.renderer.dispose();
    this.viewportManager.dispose();
    this.interactionManager.dispose();
  }
}

// Default export
export default DiagramEngine;