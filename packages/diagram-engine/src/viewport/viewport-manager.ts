import {
  Position2D,
  Rectangle2D,
  ViewportState,
  InteractionEvent,
} from '@biagram/shared';

/**
 * Viewport management for diagram navigation and interaction
 *
 * Handles zoom, pan, and coordinate transformations between screen and world space.
 * Optimized for smooth interactions and performance.
 */
export class ViewportManager {
  private viewport: ViewportState;
  private canvas: HTMLCanvasElement;

  // Constraints
  private minZoom = 0.1;
  private maxZoom = 5.0;
  private panBounds?: Rectangle2D;

  // Smooth animation
  private animationId?: number;
  private targetViewport?: Partial<ViewportState>;
  private animationStartTime?: number;
  private animationDuration = 300; // ms

  // Event callbacks
  private onViewportChange?: (viewport: ViewportState) => void;

  constructor(canvas: HTMLCanvasElement, initialViewport?: Partial<ViewportState>) {
    this.canvas = canvas;

    const rect = canvas.getBoundingClientRect();
    this.viewport = {
      zoom: 1,
      pan: { x: 0, y: 0 },
      selection: [],
      bounds: {
        x: 0,
        y: 0,
        width: rect.width,
        height: rect.height,
      },
      ...initialViewport,
    };

    this.setupEventListeners();
  }

  /**
   * Get current viewport state
   */
  getViewport(): ViewportState {
    return { ...this.viewport };
  }

  /**
   * Set viewport change callback
   */
  onViewportChanged(callback: (viewport: ViewportState) => void): void {
    this.onViewportChange = callback;
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenPoint: Position2D): Position2D {
    return {
      x: (screenPoint.x - this.viewport.pan.x) / this.viewport.zoom,
      y: (screenPoint.y - this.viewport.pan.y) / this.viewport.zoom,
    };
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldPoint: Position2D): Position2D {
    return {
      x: worldPoint.x * this.viewport.zoom + this.viewport.pan.x,
      y: worldPoint.y * this.viewport.zoom + this.viewport.pan.y,
    };
  }

  /**
   * Zoom at a specific screen point
   */
  zoomAt(screenPoint: Position2D, factor: number, animate = true): void {
    const worldPoint = this.screenToWorld(screenPoint);
    const newZoom = this.clampZoom(this.viewport.zoom * factor);

    if (Math.abs(newZoom - this.viewport.zoom) < 0.0001) {
      return; // No significant change
    }

    const newPan = {
      x: screenPoint.x - worldPoint.x * newZoom,
      y: screenPoint.y - worldPoint.y * newZoom,
    };

    const targetViewport = {
      zoom: newZoom,
      pan: this.clampPan(newPan, newZoom),
    };

    if (animate) {
      this.animateToViewport(targetViewport);
    } else {
      this.updateViewport(targetViewport);
    }
  }

  /**
   * Zoom to specific level
   */
  zoomTo(zoom: number, animate = true): void {
    const center = {
      x: this.viewport.bounds.width / 2,
      y: this.viewport.bounds.height / 2,
    };

    const factor = zoom / this.viewport.zoom;
    this.zoomAt(center, factor, animate);
  }

  /**
   * Pan by delta
   */
  panBy(delta: Position2D): void {
    const newPan = {
      x: this.viewport.pan.x + delta.x,
      y: this.viewport.pan.y + delta.y,
    };

    this.updateViewport({
      pan: this.clampPan(newPan, this.viewport.zoom),
    });
  }

  /**
   * Pan to specific world position
   */
  panTo(worldPosition: Position2D, animate = true): void {
    const center = {
      x: this.viewport.bounds.width / 2,
      y: this.viewport.bounds.height / 2,
    };

    const newPan = {
      x: center.x - worldPosition.x * this.viewport.zoom,
      y: center.y - worldPosition.y * this.viewport.zoom,
    };

    if (animate) {
      this.animateToViewport({
        pan: this.clampPan(newPan, this.viewport.zoom),
      });
    } else {
      this.updateViewport({
        pan: this.clampPan(newPan, this.viewport.zoom),
      });
    }
  }

  /**
   * Fit rectangle in viewport
   */
  fitToRect(rect: Rectangle2D, padding = 50, animate = true): void {
    const viewportWidth = this.viewport.bounds.width - padding * 2;
    const viewportHeight = this.viewport.bounds.height - padding * 2;

    const scaleX = viewportWidth / rect.width;
    const scaleY = viewportHeight / rect.height;
    const scale = Math.min(scaleX, scaleY);

    const zoom = this.clampZoom(scale);

    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;

    const pan = {
      x: this.viewport.bounds.width / 2 - centerX * zoom,
      y: this.viewport.bounds.height / 2 - centerY * zoom,
    };

    if (animate) {
      this.animateToViewport({
        zoom,
        pan: this.clampPan(pan, zoom),
      });
    } else {
      this.updateViewport({
        zoom,
        pan: this.clampPan(pan, zoom),
      });
    }
  }

  /**
   * Reset viewport to default
   */
  reset(animate = true): void {
    const defaultViewport = {
      zoom: 1,
      pan: { x: 0, y: 0 },
    };

    if (animate) {
      this.animateToViewport(defaultViewport);
    } else {
      this.updateViewport(defaultViewport);
    }
  }

  /**
   * Set zoom constraints
   */
  setZoomConstraints(min: number, max: number): void {
    this.minZoom = min;
    this.maxZoom = max;
    this.viewport.zoom = this.clampZoom(this.viewport.zoom);
    this.notifyViewportChange();
  }

  /**
   * Set pan bounds
   */
  setPanBounds(bounds?: Rectangle2D): void {
    this.panBounds = bounds;
    this.viewport.pan = this.clampPan(this.viewport.pan, this.viewport.zoom);
    this.notifyViewportChange();
  }

  /**
   * Update canvas size
   */
  updateCanvasSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.viewport.bounds = {
      x: 0,
      y: 0,
      width: rect.width,
      height: rect.height,
    };
    this.notifyViewportChange();
  }

  /**
   * Handle interaction events
   */
  handleEvent(event: InteractionEvent): boolean {
    switch (event.type) {
      case 'wheel':
        return this.handleWheel(event);

      case 'drag':
        return this.handleDrag(event);

      default:
        return false;
    }
  }

  /**
   * Animate to target viewport
   */
  private animateToViewport(target: Partial<ViewportState>): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.targetViewport = {
      zoom: target.zoom ?? this.viewport.zoom,
      pan: target.pan ?? this.viewport.pan,
    };
    this.animationStartTime = performance.now();

    this.animate();
  }

  /**
   * Animation loop
   */
  private animate(): void {
    if (!this.targetViewport || !this.animationStartTime) return;

    const elapsed = performance.now() - this.animationStartTime;
    const progress = Math.min(elapsed / this.animationDuration, 1);

    // Easing function (ease-out)
    const eased = 1 - Math.pow(1 - progress, 3);

    const currentZoom = this.viewport.zoom;
    const currentPan = this.viewport.pan;

    const targetZoom = this.targetViewport.zoom!;
    const targetPan = this.targetViewport.pan!;

    this.updateViewport({
      zoom: currentZoom + (targetZoom - currentZoom) * eased,
      pan: {
        x: currentPan.x + (targetPan.x - currentPan.x) * eased,
        y: currentPan.y + (targetPan.y - currentPan.y) * eased,
      },
    });

    if (progress < 1) {
      this.animationId = requestAnimationFrame(() => this.animate());
    } else {
      this.targetViewport = undefined;
      this.animationStartTime = undefined;
      this.animationId = undefined;
    }
  }

  /**
   * Update viewport state and force immediate re-render
   */
  private updateViewport(changes: Partial<ViewportState>): void {
    // Apply changes
    Object.assign(this.viewport, changes);

    // Immediately notify for synchronous updates
    this.notifyViewportChange();
  }

  /**
   * Clamp zoom within constraints
   */
  private clampZoom(zoom: number): number {
    return Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  /**
   * Clamp pan within bounds
   */
  private clampPan(pan: Position2D, zoom: number): Position2D {
    if (!this.panBounds) return pan;

    const { bounds } = this.viewport;
    const { panBounds } = this;

    const minX = bounds.width - panBounds.width * zoom;
    const maxX = 0;
    const minY = bounds.height - panBounds.height * zoom;
    const maxY = 0;

    return {
      x: Math.max(minX, Math.min(maxX, pan.x)),
      y: Math.max(minY, Math.min(maxY, pan.y)),
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // DISABLED: ResizeObserver moved to React component level
    // This prevents stale engine references from triggering renders
    // React component will call updateCanvasSize() manually when needed
  }

  /**
   * Handle wheel events for zooming
   */
  private handleWheel(event: InteractionEvent): boolean {
    if (!event.delta) return false;

    const zoomFactor = event.delta.y > 0 ? 0.9 : 1.1;
    this.zoomAt(event.position, zoomFactor, false);

    return true;
  }

  /**
   * Handle drag events for panning
   */
  private handleDrag(event: InteractionEvent): boolean {
    if (!event.delta) {
      return false;
    }

    this.panBy(event.delta);
    return true;
  }

  /**
   * Notify viewport change
   */
  private notifyViewportChange(): void {
    if (this.onViewportChange) {
      // Create a clean copy of the viewport
      const cleanViewport = { ...this.viewport };
      this.onViewportChange(cleanViewport);
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}