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

    // console.log('🖼️ CanvasRenderer.render() called with:');
    // console.log('🖼️ Tables to render:', tables.length);
    // console.log('🖼️ First table bounds:', tables[0]?.bounds);
    // console.log('🖼️ Viewport:', viewport);
    // console.log('🖼️ Canvas dimensions:', this.canvas.width, 'x', this.canvas.height);

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
      // console.log('🖼️ Early exit - no changes detected');
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
    // console.log(`🖼️ Render completed in ${(endTime - startTime).toFixed(2)}ms`);

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
    // console.log('🏢 renderTables() called with:', tables.length, 'tables');

    // DISABLE CULLING: Always render all tables to ensure visibility
    // TODO: Fix frustum culling logic later when coordinate system is stable
    const visibleTables = tables;

    // console.log('🏢 Visible tables (culling DISABLED):', visibleTables.length);
    // console.log('🏢 First visible table:', visibleTables[0]?.bounds);

    for (const table of visibleTables) {
      // console.log('🏢 Rendering table:', table.name, 'at bounds:', table.bounds);
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

    // if (table.name === 'users' || tableNote) {
    //   console.log('🔍 renderTable:', {
    //     name: table.name,
    //     note: tableNote,
    //     showComments,
    //     zoom,
    //     showDetails: zoom > 0.5
    //   });
    // }

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
      // Normal zoom: left-aligned table name (2px larger than columns)
      this.ctx.fillStyle = style.headerTextColor;
      this.ctx.font = `bold ${style.fontSize + 2}px ${style.fontFamily}`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      const headerY = y + style.headerHeight / 2;
      this.ctx.fillText(table.name, x + style.padding, headerY);

      // Table note (comment) next to table name in header
      if (showComments && tableNote) {
        const tableNameWidth = this.ctx.measureText(table.name).width;
        const noteX = x + style.padding + tableNameWidth + 8; // 8px gap after table name
        const maxNoteWidth = width - style.padding * 2 - tableNameWidth - 12;
        
        if (maxNoteWidth > 30) { // Only show if there's enough space
          this.ctx.font = `normal ${style.fontSize - 1}px ${style.fontFamily}`;
          this.ctx.fillStyle = (style as any).noteTextColor || style.typeTextColor;
          
          // Truncate note if too long
          let noteText = tableNote;
          let noteWidth = this.ctx.measureText(noteText).width;
          
          if (noteWidth > maxNoteWidth) {
            while (noteWidth > maxNoteWidth && noteText.length > 3) {
              noteText = noteText.substring(0, noteText.length - 1);
              noteWidth = this.ctx.measureText(noteText + '...').width;
            }
            noteText = noteText + '...';
          }
          
          this.ctx.fillText(noteText, noteX, headerY);
        }
      }
    } else {
      // Low zoom: centered, larger table name
      // Use appropriate text color based on theme background
      const isDark = this.currentTheme?.mode === 'dark';
      this.ctx.fillStyle = isDark ? '#f3f4f6' : '#1f2937'; // Light text for dark mode, dark text for light mode
      const largeFontSize = (style.fontSize + 2) * 1.5;
      this.ctx.font = `bold ${largeFontSize}px ${style.fontFamily}`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      const centerY = y + height / 2;
      this.ctx.fillText(table.name, x + width / 2, centerY);
    }

    // Columns (only if details should be shown)
    if (showDetails) {
      let currentY = y + style.headerHeight;
      // Note is now in header, no extra space needed

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
    const { isSelected, isHovered, isConnected, isPrimaryKey, isForeignKey, fkRefColor } = column;
    const isDark = this.currentTheme?.mode === 'dark';

    // 🎨 PK 배경 하이라이트 색상
    const pkBgColor = isDark ? '#422006' : '#fef3c7'; // amber-50 / amber-900
    const pkBorderColor = isDark ? '#f59e0b' : '#d97706'; // amber-500 / amber-600
    
    // 🔗 FK 색상: 참조 테이블 스키마 컬러 또는 기본 하늘색
    const defaultFkBgColor = isDark ? '#083344' : '#e0f2fe'; // sky-50 / sky-950
    const defaultFkBorderColor = isDark ? '#38bdf8' : '#0284c7'; // sky-400 / sky-600
    
    // fkRefColor가 있으면 그 색상 기반으로, 없으면 기본 하늘색
    let fkBgColor = defaultFkBgColor;
    let fkBorderColor = defaultFkBorderColor;
    if (fkRefColor) {
      // 스키마 컬러를 기반으로 밝은/어두운 버전 생성
      fkBorderColor = fkRefColor;
      fkBgColor = this.lightenColor(fkRefColor, isDark ? 0.15 : 0.85);
    }

    // Row background - 우선순위: selected > hovered > connected > PK > FK
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
      // 왼쪽 테두리 강조
      this.ctx.fillStyle = (style as any).connectedBorderColor || '#3b82f6';
      this.ctx.fillRect(x, y, 3, style.rowHeight);
    } else if (isPrimaryKey) {
      // 🔑 PK 배경 하이라이트 (amber/gold)
      this.ctx.fillStyle = pkBgColor;
      this.ctx.fillRect(x, y, width, style.rowHeight);
      // 왼쪽 테두리 강조
      this.ctx.fillStyle = pkBorderColor;
      this.ctx.fillRect(x, y, 3, style.rowHeight);
    } else if (isForeignKey) {
      // 🔗 FK 배경 하이라이트 (참조 테이블 스키마 컬러 or 하늘색)
      this.ctx.fillStyle = fkBgColor;
      this.ctx.fillRect(x, y, width, style.rowHeight);
      // 왼쪽 테두리 강조
      this.ctx.fillStyle = fkBorderColor;
      this.ctx.fillRect(x, y, 3, style.rowHeight);
    }

    let iconX = x + style.padding;

    // Icons (only at higher zoom levels)
    // 아이콘과 텍스트 간격을 최소화 (2px 고정)
    const tightSpacing = 2;
    
    if (showIcons) {
      if (isPrimaryKey) {
        this.drawKeyIcon(iconX, y + style.rowHeight / 2, style.iconSize, pkBorderColor);
        iconX += style.iconSize + tightSpacing;
      }

      if (isForeignKey) {
        this.drawForeignKeyIcon(iconX, y + style.rowHeight / 2, style.iconSize, fkBorderColor);
        iconX += style.iconSize + tightSpacing;
      }
    }

    // Column name - PK는 bold 처리
    const fontWeight = isPrimaryKey ? 'bold' : style.fontWeight;
    this.ctx.fillStyle = style.textColor;
    this.ctx.font = `${fontWeight} ${style.fontSize}px ${style.fontFamily}`;
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
   * Render a single relationship with Crow's Foot notation
   */
  private renderRelationship(relationship: RelationshipRenderData): void {
    const { path, style, isSelected, isHovered, type } = relationship;

    this.ctx.save();

    // Line style
    let strokeColor = style.color;
    let lineWidth = style.width;

    if (isSelected) {
      strokeColor = style.selectedColor;
      lineWidth = style.width + 1.5;
    } else if (isHovered) {
      strokeColor = style.hoveredColor;
      lineWidth = style.width + 0.5;
    }

    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (style.dashed) {
      this.ctx.setLineDash([5, 5]);
    }

    // Draw path with rounded corners at control points
    this.ctx.beginPath();
    
    if (path.controlPoints && path.controlPoints.length >= 2) {
      // Draw orthogonal path with rounded corners
      this.drawRoundedOrthogonalPath(path, 8); // 8px corner radius
    } else if (path.controlPoints && path.controlPoints.length > 0) {
      // Simple path with control points
      this.ctx.moveTo(path.start.x, path.start.y);
      for (const point of path.controlPoints) {
        this.ctx.lineTo(point.x, point.y);
      }
      this.ctx.lineTo(path.end.x, path.end.y);
    } else {
      // Straight line
      this.ctx.moveTo(path.start.x, path.start.y);
      this.ctx.lineTo(path.end.x, path.end.y);
    }

    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Draw Crow's Foot notation at both ends
    const relType = type || 'one-to-many';
    this.drawCrowsFootNotation(path, relType, strokeColor, lineWidth);

    // Draw subtle animated indicator (only when selected/hovered)
    if (isSelected || isHovered) {
      this.drawFlowingDots(path, strokeColor);
    }

    this.ctx.restore();
  }

  /**
   * Draw orthogonal path with rounded corners
   */
  private drawRoundedOrthogonalPath(path: RelationshipRenderData['path'], cornerRadius: number): void {
    const points = [
      path.start,
      ...(path.controlPoints || []),
      path.end,
    ];

    if (points.length < 2 || !points[0]) return;

    this.ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      if (!prev || !curr || !next) continue;

      // Calculate distances to corner
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;

      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      // Limit corner radius to half of shortest segment
      const maxRadius = Math.min(len1, len2) / 2;
      const radius = Math.min(cornerRadius, maxRadius);

      if (radius > 0 && len1 > 0 && len2 > 0) {
        // Calculate points before and after corner
        const beforeCorner = {
          x: curr.x - (dx1 / len1) * radius,
          y: curr.y - (dy1 / len1) * radius,
        };
        const afterCorner = {
          x: curr.x + (dx2 / len2) * radius,
          y: curr.y + (dy2 / len2) * radius,
        };

        // Draw line to before corner, then arc to after corner
        this.ctx.lineTo(beforeCorner.x, beforeCorner.y);
        this.ctx.arcTo(curr.x, curr.y, afterCorner.x, afterCorner.y, radius);
      } else {
        this.ctx.lineTo(curr.x, curr.y);
      }
    }

    // Draw to end point
    const lastPoint = points[points.length - 1];
    if (lastPoint) {
      this.ctx.lineTo(lastPoint.x, lastPoint.y);
    }
  }

  /**
   * Draw Crow's Foot notation at relationship ends
   * 
   * Notation types:
   * - 'one': Single line (|)
   * - 'many': Crow's foot (⋀)
   * - 'zero-or-one': Circle + line (○|)
   * - 'one-or-many': Line + foot (|⋀)
   * - 'zero-or-many': Circle + foot (○⋀)
   */
  private drawCrowsFootNotation(
    path: RelationshipRenderData['path'],
    type: string,
    color: string,
    lineWidth: number
  ): void {
    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.lineWidth = lineWidth;

    // Parse relationship type
    let fromType: 'one' | 'many' | 'zero-one' | 'zero-many' = 'one';
    let toType: 'one' | 'many' | 'zero-one' | 'zero-many' = 'many';

    switch (type) {
      case 'one-to-one':
        fromType = 'one';
        toType = 'one';
        break;
      case 'one-to-many':
      case '>':
        fromType = 'one';
        toType = 'many';
        break;
      case 'many-to-one':
      case '<':
        fromType = 'many';
        toType = 'one';
        break;
      case 'many-to-many':
      case '<>':
        fromType = 'many';
        toType = 'many';
        break;
    }

    // Calculate direction at start
    const startDir = this.getPathDirectionAt(path, 'start');
    this.drawCrowsFootSymbol(path.start, startDir, fromType, color, lineWidth);

    // Calculate direction at end
    const endDir = this.getPathDirectionAt(path, 'end');
    this.drawCrowsFootSymbol(path.end, endDir, toType, color, lineWidth);

    this.ctx.restore();
  }

  /**
   * Get path direction at start or end
   */
  private getPathDirectionAt(path: RelationshipRenderData['path'], position: 'start' | 'end'): number {
    const points = [
      path.start,
      ...(path.controlPoints || []),
      path.end,
    ];

    if (points.length < 2) return 0;

    if (position === 'start') {
      const p1 = points[0];
      const p2 = points[1];
      if (p1 && p2) {
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
      }
    } else {
      const p1 = points[points.length - 2];
      const p2 = points[points.length - 1];
      if (p1 && p2) {
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
      }
    }

    return 0;
  }

  /**
   * Draw a single Crow's Foot symbol
   */
  private drawCrowsFootSymbol(
    point: Position2D,
    direction: number,
    type: 'one' | 'many' | 'zero-one' | 'zero-many',
    color: string,
    lineWidth: number
  ): void {
    const size = 12;
    const footSpread = 0.4; // Radians for crow's foot spread

    this.ctx.save();
    this.ctx.translate(point.x, point.y);
    this.ctx.rotate(direction);
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = this.currentTheme?.colors.background || '#ffffff';
    this.ctx.lineWidth = lineWidth;

    switch (type) {
      case 'one':
        // Single vertical line
        this.ctx.beginPath();
        this.ctx.moveTo(-size * 0.3, -size * 0.4);
        this.ctx.lineTo(-size * 0.3, size * 0.4);
        this.ctx.stroke();
        break;

      case 'many':
        // Crow's foot (three lines spreading out)
        this.ctx.beginPath();
        // Center line
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-size, 0);
        // Top line
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-size * 0.7, -size * 0.5);
        // Bottom line
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-size * 0.7, size * 0.5);
        this.ctx.stroke();
        break;

      case 'zero-one':
        // Circle + vertical line
        this.ctx.beginPath();
        this.ctx.arc(-size * 0.5, 0, size * 0.25, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        // Vertical line
        this.ctx.beginPath();
        this.ctx.moveTo(-size * 0.15, -size * 0.4);
        this.ctx.lineTo(-size * 0.15, size * 0.4);
        this.ctx.stroke();
        break;

      case 'zero-many':
        // Circle + crow's foot
        this.ctx.beginPath();
        this.ctx.arc(-size * 0.7, 0, size * 0.2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        // Crow's foot
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-size * 0.4, 0);
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-size * 0.35, -size * 0.35);
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(-size * 0.35, size * 0.35);
        this.ctx.stroke();
        break;
    }

    this.ctx.restore();
  }

  /**
   * Draw subtle flowing dot animation along the relationship line (only when selected/hovered)
   */
  private drawFlowingDots(path: RelationshipRenderData['path'], color: string): void {
    const animationPeriod = 1500; // 1.5 seconds for smoother flow
    const dotCount = 3;
    const dotSize = 2.5;

    // Calculate animation progress (0 to 1)
    const progress = (this.animationTimestamp % animationPeriod) / animationPeriod;

    const points = [
      path.start,
      ...(path.controlPoints || []),
      path.end,
    ];

    // Calculate total path length
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

    if (totalLength === 0) return;

    for (let i = 0; i < dotCount; i++) {
      const offset = (progress + i / dotCount) % 1;
      const targetDistance = offset * totalLength;
      
      let accumulatedLength = 0;
      let dotX = path.start.x;
      let dotY = path.start.y;

      for (let j = 0; j < segmentLengths.length; j++) {
        const segmentLength = segmentLengths[j] || 0;
        if (accumulatedLength + segmentLength >= targetDistance) {
          const segmentOffset = segmentLength > 0 
            ? (targetDistance - accumulatedLength) / segmentLength 
            : 0;
          const p1 = points[j];
          const p2 = points[j + 1];
          if (p1 && p2) {
            dotX = p1.x + (p2.x - p1.x) * segmentOffset;
            dotY = p1.y + (p2.y - p1.y) * segmentOffset;
          }
          break;
        }
        accumulatedLength += segmentLength;
      }

      // Draw dot with slight glow effect
      this.ctx.save();
      this.ctx.globalAlpha = 0.8 - (i * 0.2); // Fade trailing dots
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
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
   * Draw a Primary Key icon (🔑 golden key)
   */
  private drawKeyIcon(x: number, y: number, size: number, color: string): void {
    this.ctx.save();

    const halfSize = size / 2;
    const centerX = x;
    const centerY = y;

    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.lineWidth = 1.8;
    this.ctx.lineCap = 'round';

    // 열쇠 머리 (원형, 채움)
    this.ctx.beginPath();
    this.ctx.arc(centerX - halfSize * 0.3, centerY, halfSize * 0.35, 0, Math.PI * 2);
    this.ctx.fill();

    // 열쇠 머리 내부 구멍
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.arc(centerX - halfSize * 0.3, centerY, halfSize * 0.15, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // 열쇠 몸통
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY);
    this.ctx.lineTo(centerX + halfSize * 0.8, centerY);
    this.ctx.stroke();

    // 열쇠 이빨들
    this.ctx.beginPath();
    this.ctx.moveTo(centerX + halfSize * 0.5, centerY);
    this.ctx.lineTo(centerX + halfSize * 0.5, centerY + halfSize * 0.3);
    this.ctx.moveTo(centerX + halfSize * 0.7, centerY);
    this.ctx.lineTo(centerX + halfSize * 0.7, centerY + halfSize * 0.25);
    this.ctx.stroke();

    this.ctx.restore();
  }

  /**
   * Draw a Foreign Key icon (🔗 chain link)
   */
  private drawForeignKeyIcon(x: number, y: number, size: number, color: string): void {
    this.ctx.save();

    const halfSize = size / 2;
    const centerX = x;
    const centerY = y;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1.8;
    this.ctx.lineCap = 'round';

    // 첫 번째 링크 (왼쪽 위)
    const link1X = centerX - halfSize * 0.25;
    const link1Y = centerY - halfSize * 0.15;
    this.ctx.beginPath();
    this.ctx.ellipse(link1X, link1Y, halfSize * 0.35, halfSize * 0.22, -Math.PI / 4, 0, Math.PI * 2);
    this.ctx.stroke();

    // 두 번째 링크 (오른쪽 아래)
    const link2X = centerX + halfSize * 0.25;
    const link2Y = centerY + halfSize * 0.15;
    this.ctx.beginPath();
    this.ctx.ellipse(link2X, link2Y, halfSize * 0.35, halfSize * 0.22, -Math.PI / 4, 0, Math.PI * 2);
    this.ctx.stroke();

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
    // console.log('🔧 CanvasRenderer: applyViewport() called');
    // console.log('🔧 Viewport zoom:', viewport.zoom, 'pan:', viewport.pan);
    // console.log('🔧 Device pixel ratio:', this.devicePixelRatio);

    // Reset to identity matrix first
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Apply devicePixelRatio for high-DPI displays
    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);

    // Apply pan (translation)
    this.ctx.translate(viewport.pan.x, viewport.pan.y);

    // Apply zoom (scale)
    this.ctx.scale(viewport.zoom, viewport.zoom);

    // console.log('🔧 Transform applied: translate(', viewport.pan.x, ',', viewport.pan.y, ') scale(', viewport.zoom, ')');
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

  /**
   * Lighten or darken a hex color
   * @param hex - Hex color string (e.g., "#ff0000")
   * @param factor - 0 = original, 1 = white (for lighten), 0 = black (for darken)
   */
  private lightenColor(hex: string, factor: number): string {
    // Remove # if present
    const cleanHex = hex.replace('#', '');
    
    // Parse RGB
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    
    // Lighten: blend with white (255)
    const newR = Math.round(r + (255 - r) * factor);
    const newG = Math.round(g + (255 - g) * factor);
    const newB = Math.round(b + (255 - b) * factor);
    
    // Convert back to hex
    const toHex = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0');
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
  }
}