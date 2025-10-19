import {
  Position2D,
  Rectangle2D,
  TableRenderData,
  RelationshipRenderData,
  TableStyle,
  RelationshipStyle,
  ViewportState,
  ThemeConfig,
  DEFAULT_TABLE_STYLE,
  DEFAULT_RELATIONSHIP_STYLE,
} from '@biagram/shared';

/**
 * High-performance Canvas-based diagram renderer
 *
 * Implements hybrid Canvas+SVG rendering strategy:
 * - Canvas: High-performance rendering for shapes, backgrounds, and bulk operations
 * - SVG overlay: Text, icons, and interactive elements for accessibility
 */
export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private devicePixelRatio: number;
  private svgOverlay?: SVGElement;

  // Performance optimization
  private renderCache = new Map<string, ImageData>();
  private lastViewport?: ViewportState;
  private isDirty = true;

  // Theme
  private currentTheme?: ThemeConfig;

  // Animation
  private animationTimestamp = 0;
  private animationFrameId?: number;

  // Rendering layers
  private backgroundLayer?: HTMLCanvasElement;
  private tableLayer?: HTMLCanvasElement;
  private relationshipLayer?: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, options?: { enableSVGOverlay?: boolean }) {
    this.canvas = canvas;
    this.devicePixelRatio = window.devicePixelRatio || 1;

    const ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true, // Performance optimization
    });

    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }

    this.ctx = ctx;
    this.setupCanvas();

    if (options?.enableSVGOverlay) {
      this.setupSVGOverlay();
    }

    // Setup layered rendering for complex scenes
    this.setupLayers();
  }

  /**
   * Render the complete diagram
   */
  render(data: {
    tables: TableRenderData[];
    relationships: RelationshipRenderData[];
    viewport: ViewportState;
    theme?: ThemeConfig;
    showGrid?: boolean;
    showComments?: boolean;
  }): void {
    const { tables, relationships, viewport, theme, showGrid = true, showComments = true } = data;

    console.log('🖼️ CanvasRenderer.render() called with:');
    console.log('🖼️ Tables to render:', tables.length);
    console.log('🖼️ First table bounds:', tables[0]?.bounds);
    console.log('🖼️ Viewport:', viewport);
    console.log('🖼️ Canvas dimensions:', this.canvas.width, 'x', this.canvas.height);

    // Force render during viewport changes to prevent disappearing
    const isViewportChanging = this.lastViewport && (
      Math.abs(viewport.pan.x - this.lastViewport.pan.x) > 0.001 ||
      Math.abs(viewport.pan.y - this.lastViewport.pan.y) > 0.001 ||
      Math.abs(viewport.zoom - this.lastViewport.zoom) > 0.001
    );

    if (isViewportChanging) {
      console.log('🖱️ Viewport change detected (pan or zoom), forcing render');
      this.isDirty = true;
    }

    // Early exit if nothing changed AND we have valid data to compare
    if (!this.isDirty &&
        this.lastViewport &&
        tables.length > 0 &&
        this.viewportEquals(viewport, this.lastViewport)) {
      console.log('🖼️ Early exit - no changes detected');
      return;
    }

    const startTime = performance.now();

    // 테마 저장 (animation loop에서도 사용)
    if (theme) {
      this.currentTheme = theme;
    }

    // Clear canvas
    this.clear();

    // Fill background with theme color (저장된 테마 사용)
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for full canvas fill
    this.ctx.fillStyle = this.currentTheme?.colors.background || '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();

    // Apply viewport transformation
    this.applyViewport(viewport);

    // Render grid background if enabled (저장된 테마 사용)
    if (showGrid) {
      this.renderGrid(viewport, this.currentTheme);
    }

    // Render in layers for optimal performance
    this.renderRelationships(relationships, viewport);
    this.renderTables(tables, viewport, showComments);

    this.lastViewport = { ...viewport };
    this.isDirty = false;

    const endTime = performance.now();
    console.log(`🖼️ Render completed in ${(endTime - startTime).toFixed(2)}ms`);

    // Start animation loop if not already running
    if (!this.animationFrameId) {
      this.startAnimationLoop();
    }
  }

  /**
   * Start animation loop for relationship animations
   */
  private startAnimationLoop(): void {
    const animate = (timestamp: number) => {
      this.animationTimestamp = timestamp;
      this.isDirty = true; // Force re-render for animation
      this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Stop animation loop
   */
  private stopAnimationLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  /**
   * Render database tables
   */
  private renderTables(tables: TableRenderData[], viewport: ViewportState, showComments: boolean = true): void {
    console.log('🏢 renderTables() called with:', tables.length, 'tables');

    // DISABLE CULLING: Always render all tables to ensure visibility
    // TODO: Fix frustum culling logic later when coordinate system is stable
    const visibleTables = tables;

    console.log('🏢 Visible tables (culling DISABLED):', visibleTables.length);
    console.log('🏢 First visible table:', visibleTables[0]?.bounds);

    for (const table of visibleTables) {
      console.log('🏢 Rendering table:', table.name, 'at bounds:', table.bounds);
      this.renderTable(table, viewport.zoom, showComments);
    }
  }

  /**
   * Render a single table
   */
  private renderTable(table: TableRenderData, zoom: number, showComments: boolean = true): void {
    const { bounds, style, isSelected, isHovered } = table;
    const { x, y, width, height } = bounds;
    const tableNote = (table as any).note;
    
    if (table.name === 'users' || tableNote) {
      console.log('🔍 renderTable:', {
        name: table.name,
        note: tableNote,
        showComments,
        zoom,
        showDetails: zoom > 0.5
      });
    }

    // Get opacity from table (default to 1.0 if not set)
    const opacity = (table as any).opacity ?? 1.0;

    // Level of detail based on zoom
    const showDetails = zoom > 0.5;
    const showIcons = zoom > 0.8;

    // Draw table background with shadow
    this.ctx.save();

    // Apply opacity for dimming effect
    this.ctx.globalAlpha = opacity;

    // Shadow
    if (style.shadowBlur > 0) {
      this.ctx.shadowColor = style.shadowColor;
      this.ctx.shadowBlur = style.shadowBlur;
      this.ctx.shadowOffsetX = 2;
      this.ctx.shadowOffsetY = 2;
    }

    // Background
    this.ctx.fillStyle = style.backgroundColor;
    this.roundRect(x, y, width, height, style.borderRadius);
    this.ctx.fill();

    // Reset shadow
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;

    // Border
    if (isSelected) {
      this.ctx.strokeStyle = '#3b82f6'; // Blue selection
      this.ctx.lineWidth = 2;
    } else if (isHovered) {
      this.ctx.strokeStyle = '#6b7280'; // Gray hover
      this.ctx.lineWidth = 1.5;
    } else {
      this.ctx.strokeStyle = style.borderColor;
      this.ctx.lineWidth = style.borderWidth;
    }

    this.roundRect(x, y, width, height, style.borderRadius);
    this.ctx.stroke();

    // Header
    this.ctx.fillStyle = style.headerBackgroundColor;
    this.roundRect(x, y, width, style.headerHeight, style.borderRadius, true, false);
    this.ctx.fill();

    // Header text - zoom-level adaptive rendering
    if (showDetails) {
      // Normal zoom: left-aligned table name
      this.ctx.fillStyle = style.headerTextColor;
      this.ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      const headerY = y + style.headerHeight / 2;
      this.ctx.fillText(table.name, x + style.padding, headerY);

      // Table note (comment) if enabled and exists
      if (showComments && tableNote) {
        const noteY = y + style.headerHeight + 4;
        this.ctx.font = `normal ${style.fontSize - 2}px ${style.fontFamily}`;
        this.ctx.fillStyle = (style as any).noteTextColor || style.typeTextColor;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        // Wrap text if too long
        const maxWidth = width - style.padding * 2;
        const noteText = tableNote.length > 100 ? tableNote.substring(0, 97) + '...' : tableNote;
        this.ctx.fillText(noteText, x + style.padding, noteY, maxWidth);
      }
    } else {
      // Low zoom: centered, larger table name
      // Use appropriate text color based on theme background
      const isDark = this.currentTheme?.mode === 'dark';
      this.ctx.fillStyle = isDark ? '#f3f4f6' : '#1f2937'; // Light text for dark mode, dark text for light mode
      const largeFontSize = style.fontSize * 1.5;
      this.ctx.font = `bold ${largeFontSize}px ${style.fontFamily}`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      const centerY = y + height / 2;
      this.ctx.fillText(table.name, x + width / 2, centerY);
    }

    // Columns (only if details should be shown)
    if (showDetails) {
      let currentY = y + style.headerHeight;
      
      // Add space for table note if shown
      if (showComments && tableNote) {
        currentY += 20; // Extra space for note
      }

      for (const column of table.columns) {
        this.renderColumn(column, x, currentY, width, style, showIcons, showComments);
        currentY += style.rowHeight;
      }
    }

    this.ctx.restore();
  }

  /**
   * Render a table column
   */
  private renderColumn(
    column: any,
    x: number,
    y: number,
    width: number,
    style: TableStyle,
    showIcons: boolean,
    showComments: boolean = true
  ): void {
    const { isSelected, isHovered, isConnected } = column;

    // Row background
    if (isSelected) {
      this.ctx.fillStyle = style.selectedRowColor;
      this.ctx.fillRect(x, y, width, style.rowHeight);
    } else if (isHovered) {
      this.ctx.fillStyle = style.hoveredRowColor;
      this.ctx.fillRect(x, y, width, style.rowHeight);
    } else if (isConnected) {
      // 연결된 컬럼 하이라이트 (테마별 색상)
      this.ctx.fillStyle = (style as any).connectedRowColor || '#eff6ff';
      this.ctx.fillRect(x, y, width, style.rowHeight);

      // 왼쪽 테두리 강조 (테마별 색상)
      this.ctx.fillStyle = (style as any).connectedBorderColor || '#3b82f6';
      this.ctx.fillRect(x, y, 3, style.rowHeight);
    }

    let iconX = x + style.padding;

    // Icons (only at higher zoom levels)
    if (showIcons) {
      if (column.isPrimaryKey) {
        this.drawIcon('key', iconX, y + style.rowHeight / 2, style.iconSize);
        iconX += style.iconSize + style.iconSpacing;
      }

      if (column.isForeignKey) {
        this.drawIcon('link', iconX, y + style.rowHeight / 2, style.iconSize);
        iconX += style.iconSize + style.iconSpacing;
      }
    }

    // Column name
    this.ctx.fillStyle = style.textColor;
    this.ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';

    const textY = y + style.rowHeight / 2;
    this.ctx.fillText(column.name, iconX, textY);

    // Column note (comment) if enabled and exists
    if (showComments && column.note) {
      const columnNameWidth = this.ctx.measureText(column.name).width;
      const noteX = iconX + columnNameWidth + 8; // 8px gap
      this.ctx.font = `normal ${style.fontSize - 2}px ${style.fontFamily}`;
      this.ctx.fillStyle = (style as any).noteTextColor || style.typeTextColor;
      
      // Truncate note if too long
      const maxNoteWidth = width - (noteX - x) - style.padding - 60; // Reserve space for type
      let noteText = column.note;
      let noteWidth = this.ctx.measureText(noteText).width;
      
      if (noteWidth > maxNoteWidth) {
        while (noteWidth > maxNoteWidth && noteText.length > 3) {
          noteText = noteText.substring(0, noteText.length - 1);
          noteWidth = this.ctx.measureText(noteText + '...').width;
        }
        noteText = noteText + '...';
      }
      
      this.ctx.fillText(noteText, noteX, textY);
    }

    // Data type (right-aligned)
    this.ctx.fillStyle = style.typeTextColor;
    this.ctx.font = `normal ${style.fontSize - 1}px ${style.fontFamily}`;
    this.ctx.textAlign = 'right';

    const typeText = column.type;
    this.ctx.fillText(typeText, x + width - style.padding, textY);
  }

  /**
   * Render relationships
   */
  private renderRelationships(relationships: RelationshipRenderData[], viewport: ViewportState): void {
    for (const relationship of relationships) {
      this.renderRelationship(relationship);
    }
  }

  /**
   * Render a single relationship
   */
  private renderRelationship(relationship: RelationshipRenderData): void {
    const { path, style, isSelected, isHovered } = relationship;

    this.ctx.save();

    // Line style
    let strokeColor = style.color;
    let lineWidth = style.width;

    if (isSelected) {
      strokeColor = style.selectedColor;
      lineWidth = style.width + 2; // Make highlighted relationships thicker
    } else if (isHovered) {
      strokeColor = style.hoveredColor;
      lineWidth = style.width + 1;
    }

    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = lineWidth;

    if (style.dashed) {
      this.ctx.setLineDash([5, 5]);
    }

    // Draw path
    this.ctx.beginPath();
    this.ctx.moveTo(path.start.x, path.start.y);

    if (path.controlPoints && path.controlPoints.length > 0) {
      // 🔄 Orthogonal routing: Draw straight line segments through waypoints
      for (const point of path.controlPoints) {
        this.ctx.lineTo(point.x, point.y);
      }
      this.ctx.lineTo(path.end.x, path.end.y);
    } else {
      // Straight line fallback
      this.ctx.lineTo(path.end.x, path.end.y);
    }

    this.ctx.stroke();

    // Reset line dash
    this.ctx.setLineDash([]);

    // Draw animated flowing dots along the line
    this.drawFlowingDots(path, strokeColor);

    // Draw arrow
    this.drawArrow(path.end, path.direction, style.arrowSize, strokeColor);

    // Draw label if present
    if (relationship.label) {
      this.drawRelationshipLabel(relationship.label, path.midpoint, style);
    }

    this.ctx.restore();
  }

  /**
   * Draw flowing dot animation along the relationship line
   */
  private drawFlowingDots(path: RelationshipRenderData['path'], color: string): void {
    const animationPeriod = 2000; // 2 seconds
    const dotCount = 5;
    const dotSize = 3;

    // Calculate animation progress (0 to 1)
    const progress = (this.animationTimestamp % animationPeriod) / animationPeriod;

    for (let i = 0; i < dotCount; i++) {
      // Distribute dots evenly along the path
      const offset = (progress + i / dotCount) % 1;

      let dotX: number, dotY: number;

      if (path.controlPoints && path.controlPoints.length > 0) {
        // 🔄 Orthogonal routing: Calculate position along multi-segment path
        // Build all points in the path
        const points = [
          path.start,
          ...path.controlPoints,
          path.end,
        ];

        // Calculate segment lengths
        const segmentLengths: number[] = [];
        let totalLength = 0;

        for (let j = 0; j < points.length - 1; j++) {
          const p1 = points[j];
          const p2 = points[j + 1];
          if (!p1 || !p2) continue;

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          segmentLengths.push(length);
          totalLength += length;
        }

        // Find which segment the dot should be on
        const targetDistance = offset * totalLength;
        let accumulatedLength = 0;
        let segmentIndex = 0;
        let segmentOffset = 0;

        for (let j = 0; j < segmentLengths.length; j++) {
          const segmentLength = segmentLengths[j] || 0;
          if (accumulatedLength + segmentLength >= targetDistance) {
            segmentIndex = j;
            segmentOffset = (targetDistance - accumulatedLength) / segmentLength;
            break;
          }
          accumulatedLength += segmentLength;
        }

        // Calculate position within the segment
        const p1 = points[segmentIndex];
        const p2 = points[segmentIndex + 1];

        if (p1 && p2) {
          dotX = p1.x + (p2.x - p1.x) * segmentOffset;
          dotY = p1.y + (p2.y - p1.y) * segmentOffset;
        } else {
          dotX = path.start.x;
          dotY = path.start.y;
        }
      } else {
        // Calculate position on straight line
        dotX = path.start.x + (path.end.x - path.start.x) * offset;
        dotY = path.start.y + (path.end.y - path.start.y) * offset;
      }

      // Draw dot
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  /**
   * Draw an arrow at the end of a relationship
   */
  private drawArrow(point: Position2D, direction: number, size: number, color: string): void {
    this.ctx.save();

    this.ctx.fillStyle = color;
    this.ctx.strokeStyle = color;

    const angle1 = direction + Math.PI + 0.3;
    const angle2 = direction + Math.PI - 0.3;

    this.ctx.beginPath();
    this.ctx.moveTo(point.x, point.y);
    this.ctx.lineTo(
      point.x + size * Math.cos(angle1),
      point.y + size * Math.sin(angle1)
    );
    this.ctx.lineTo(
      point.x + size * Math.cos(angle2),
      point.y + size * Math.sin(angle2)
    );
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  /**
   * Draw a relationship label
   */
  private drawRelationshipLabel(
    label: string,
    position: Position2D,
    style: RelationshipStyle
  ): void {
    this.ctx.save();

    // Measure text
    this.ctx.font = `${style.labelFontSize}px ${DEFAULT_TABLE_STYLE.fontFamily}`;
    const textMetrics = this.ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = style.labelFontSize;

    // Background
    const padding = style.labelPadding;
    const bgX = position.x - textWidth / 2 - padding;
    const bgY = position.y - textHeight / 2 - padding;
    const bgWidth = textWidth + padding * 2;
    const bgHeight = textHeight + padding * 2;

    this.ctx.fillStyle = style.labelBackgroundColor;
    this.roundRect(bgX, bgY, bgWidth, bgHeight, 4);
    this.ctx.fill();

    // Text
    this.ctx.fillStyle = style.labelTextColor;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(label, position.x, position.y);

    this.ctx.restore();
  }

  /**
   * Draw an icon (simplified implementation)
   */
  private drawIcon(type: string, x: number, y: number, size: number): void {
    this.ctx.save();

    const halfSize = size / 2;
    const centerX = x;
    const centerY = y;

    this.ctx.strokeStyle = '#6b7280';
    this.ctx.lineWidth = 1.5;

    switch (type) {
      case 'key':
        // Draw a simple key icon
        this.ctx.beginPath();
        this.ctx.arc(centerX - halfSize / 2, centerY, halfSize / 3, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY);
        this.ctx.lineTo(centerX + halfSize, centerY);
        this.ctx.moveTo(centerX + halfSize / 2, centerY - halfSize / 4);
        this.ctx.lineTo(centerX + halfSize, centerY);
        this.ctx.moveTo(centerX + halfSize / 2, centerY + halfSize / 4);
        this.ctx.lineTo(centerX + halfSize, centerY);
        this.ctx.stroke();
        break;

      case 'link':
        // Draw a simple link icon
        this.ctx.beginPath();
        this.ctx.arc(centerX - halfSize / 2, centerY - halfSize / 2, halfSize / 3, 0, Math.PI * 2);
        this.ctx.arc(centerX + halfSize / 2, centerY + halfSize / 2, halfSize / 3, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(centerX - halfSize / 4, centerY - halfSize / 4);
        this.ctx.lineTo(centerX + halfSize / 4, centerY + halfSize / 4);
        this.ctx.stroke();
        break;
    }

    this.ctx.restore();
  }

  /**
   * Render grid background
   */
  private renderGrid(viewport: ViewportState, theme?: ThemeConfig): void {
    if (viewport.zoom < 0.5) return; // Don't show grid at low zoom

    const gridSize = 20;

    this.ctx.save();
    this.ctx.strokeStyle = theme?.colors.border || '#e5e7eb';
    this.ctx.lineWidth = 0.5 / viewport.zoom; // Adjust line width for zoom level
    this.ctx.globalAlpha = 0.3;

    // Convert screen space bounds to world space coordinates
    // This accounts for pan and zoom transformations
    const worldBounds = {
      x: -viewport.pan.x / viewport.zoom,
      y: -viewport.pan.y / viewport.zoom,
      width: viewport.bounds.width / viewport.zoom,
      height: viewport.bounds.height / viewport.zoom,
    };

    // Calculate visible area with some padding for smooth panning
    const padding = gridSize * 2;
    const minX = worldBounds.x - padding;
    const maxX = worldBounds.x + worldBounds.width + padding;
    const minY = worldBounds.y - padding;
    const maxY = worldBounds.y + worldBounds.height + padding;

    // Vertical lines
    const startX = Math.floor(minX / gridSize) * gridSize;
    for (let x = startX; x <= maxX; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, minY);
      this.ctx.lineTo(x, maxY);
      this.ctx.stroke();
    }

    // Horizontal lines
    const startY = Math.floor(minY / gridSize) * gridSize;
    for (let y = startY; y <= maxY; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(minX, y);
      this.ctx.lineTo(maxX, y);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Apply viewport transformation
   *
   * Transform order:
   * 1. Scale by devicePixelRatio (for high-DPI displays)
   * 2. Translate by pan offset
   * 3. Scale by zoom level
   */
  private applyViewport(viewport: ViewportState): void {
    console.log('🔧 CanvasRenderer: applyViewport() called');
    console.log('🔧 Viewport zoom:', viewport.zoom, 'pan:', viewport.pan);
    console.log('🔧 Device pixel ratio:', this.devicePixelRatio);

    // Reset to identity matrix first
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Apply devicePixelRatio for high-DPI displays
    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);

    // Apply pan (translation)
    this.ctx.translate(viewport.pan.x, viewport.pan.y);

    // Apply zoom (scale)
    this.ctx.scale(viewport.zoom, viewport.zoom);

    console.log('🔧 Transform applied: translate(', viewport.pan.x, ',', viewport.pan.y, ') scale(', viewport.zoom, ')');
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    // Reset to identity matrix for clearing
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Clear entire canvas (in device pixels)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Setup canvas with proper DPI scaling
   */
  private setupCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();

    // Set actual canvas size with device pixel ratio
    this.canvas.width = rect.width * this.devicePixelRatio;
    this.canvas.height = rect.height * this.devicePixelRatio;

    // Scale CSS size back to original
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    // Don't scale here - we'll do it in applyViewport() to avoid double scaling
    // this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);

    // Improve text rendering
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  /**
   * Setup SVG overlay for text and interactive elements
   */
  private setupSVGOverlay(): void {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';

    this.canvas.parentElement?.appendChild(svg);
    this.svgOverlay = svg;
  }

  /**
   * Setup layered rendering for complex scenes
   */
  private setupLayers(): void {
    // Background layer for grid and static elements
    this.backgroundLayer = document.createElement('canvas');

    // Table layer for table rendering
    this.tableLayer = document.createElement('canvas');

    // Relationship layer for connections
    this.relationshipLayer = document.createElement('canvas');
  }

  /**
   * Draw rounded rectangle
   */
  private roundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    topOnly = false,
    bottomOnly = false
  ): void {
    this.ctx.beginPath();

    if (topOnly) {
      this.ctx.moveTo(x, y + height);
      this.ctx.lineTo(x, y + radius);
      this.ctx.arcTo(x, y, x + radius, y, radius);
      this.ctx.lineTo(x + width - radius, y);
      this.ctx.arcTo(x + width, y, x + width, y + radius, radius);
      this.ctx.lineTo(x + width, y + height);
    } else if (bottomOnly) {
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x, y + height - radius);
      this.ctx.arcTo(x, y + height, x + radius, y + height, radius);
      this.ctx.lineTo(x + width - radius, y + height);
      this.ctx.arcTo(x + width, y + height, x + width, y + height - radius, radius);
      this.ctx.lineTo(x + width, y);
    } else {
      this.ctx.moveTo(x + radius, y);
      this.ctx.lineTo(x + width - radius, y);
      this.ctx.arcTo(x + width, y, x + width, y + radius, radius);
      this.ctx.lineTo(x + width, y + height - radius);
      this.ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
      this.ctx.lineTo(x + radius, y + height);
      this.ctx.arcTo(x, y + height, x, y + height - radius, radius);
      this.ctx.lineTo(x, y + radius);
      this.ctx.arcTo(x, y, x + radius, y, radius);
    }

    this.ctx.closePath();
  }

  /**
   * Check if rectangle is visible in viewport
   *
   * CRITICAL: rect is in WORLD coordinates, viewport.bounds is in SCREEN coordinates
   * We must transform rect to screen space before comparison
   */
  private isRectangleVisible(rect: Rectangle2D, viewport: ViewportState): boolean {
    // Transform world rectangle to screen rectangle
    const screenRect = {
      x: rect.x * viewport.zoom + viewport.pan.x,
      y: rect.y * viewport.zoom + viewport.pan.y,
      width: rect.width * viewport.zoom,
      height: rect.height * viewport.zoom,
    };

    // Check if screen rectangle intersects with viewport bounds
    return !(
      screenRect.x + screenRect.width < 0 ||
      screenRect.x > viewport.bounds.width ||
      screenRect.y + screenRect.height < 0 ||
      screenRect.y > viewport.bounds.height
    );
  }

  /**
   * Check if two viewports are equal (with tolerance for small changes)
   */
  private viewportEquals(a?: ViewportState, b?: ViewportState): boolean {
    if (!a || !b) return false;

    const tolerance = 0.001; // Small tolerance for floating point comparison

    return (
      Math.abs(a.zoom - b.zoom) < tolerance &&
      Math.abs(a.pan.x - b.pan.x) < tolerance &&
      Math.abs(a.pan.y - b.pan.y) < tolerance &&
      a.bounds.x === b.bounds.x &&
      a.bounds.y === b.bounds.y &&
      a.bounds.width === b.bounds.width &&
      a.bounds.height === b.bounds.height
    );
  }

  /**
   * Mark as dirty to force re-render
   */
  invalidate(): void {
    this.isDirty = true;
    // Clear cache to force full re-render
    this.lastViewport = undefined;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stopAnimationLoop();
    this.renderCache.clear();
    if (this.svgOverlay) {
      this.svgOverlay.remove();
    }
  }
}