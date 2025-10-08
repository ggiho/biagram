'use client';

import React, { useEffect, useRef, useState } from 'react';
import { DiagramEngine } from '@biagram/diagram-engine';
import type { TableRenderData, RelationshipRenderData } from '@biagram/shared';
import { useDiagramEngine } from '@/contexts/diagram-context';

interface DiagramCanvasProps {
  schema: any | null;
  className?: string;
}

export function DiagramCanvas({ schema, className }: DiagramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DiagramEngine | null>(null);
  const [isReady, setIsReady] = useState(false);
  const diagramContext = useDiagramEngine();
  const { selectedTool, setEngine } = diagramContext || { selectedTool: 'select', setEngine: () => {} };

  // Initialize diagram engine
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) {
      return;
    }

    try {
      // Create diagram engine
      const engine = new DiagramEngine(canvasRef.current, {
        enableSVGOverlay: false,
        initialViewport: {
          zoom: 1,
          pan: { x: 0, y: 0 },
        },
      });

      engineRef.current = engine;
      if (setEngine && typeof setEngine === 'function') {
        setEngine(engine);
      }

      // Set initial canvas size with devicePixelRatio
      const initialSetup = () => {
        if (canvasRef.current && containerRef.current) {
          const { width, height } = containerRef.current.getBoundingClientRect();

          if (width > 0 && height > 0) {
            // Get device pixel ratio for high-DPI displays
            const dpr = window.devicePixelRatio || 1;

            // Set canvas size in device pixels
            canvasRef.current.width = width * dpr;
            canvasRef.current.height = height * dpr;

            // Set CSS size to actual display size
            canvasRef.current.style.width = `${width}px`;
            canvasRef.current.style.height = `${height}px`;
          }
        }
      };

      // Try immediate setup
      initialSetup();

      // Retry with longer delays to ensure container has size
      setTimeout(initialSetup, 50);
      setTimeout(initialSetup, 150);
      setTimeout(initialSetup, 300);

      setIsReady(true);

      // Setup mouse and touch event listeners for interactions
      const canvas = canvasRef.current;

      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const position = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };

        const event = {
          type: 'wheel' as const,
          position,
          delta: { x: e.deltaX, y: e.deltaY },
          button: 0,
          modifiers: {
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            alt: e.altKey,
            meta: e.metaKey,
          },
        };

        engine.getViewportManager().handleEvent(event);
      };

      let isDragging = false;
      let lastMousePos = { x: 0, y: 0 };

      const handleMouseDown = (e: MouseEvent) => {
        // Mouse down detected

        // Enable panning for:
        // 1. Middle button (always)
        // 2. Ctrl/Cmd + left click (always)
        // 3. Left click (default behavior for better UX)
        const shouldPan = e.button === 1 || // Middle button
                         e.ctrlKey || e.metaKey || // Ctrl/Cmd + click
                         e.button === 0; // Left click (always enabled for better UX)

        // Check if should pan

        if (shouldPan) {
          isDragging = true;
          lastMousePos = { x: e.clientX, y: e.clientY };
          canvas.style.cursor = 'grabbing';
          e.preventDefault();
          // Drag started
        } else {
          // Drag not enabled for this event
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
          const deltaX = e.clientX - lastMousePos.x;
          const deltaY = e.clientY - lastMousePos.y;

          // Get canvas-relative position
          const rect = canvas.getBoundingClientRect();
          const canvasX = e.clientX - rect.left;
          const canvasY = e.clientY - rect.top;

          // Mouse is dragging - send delta to viewport manager

          const event = {
            type: 'drag' as const,
            position: { x: canvasX, y: canvasY },
            delta: { x: deltaX, y: deltaY },
            button: e.button,
            modifiers: {
              ctrl: e.ctrlKey,
              shift: e.shiftKey,
              alt: e.altKey,
              meta: e.metaKey,
            },
          };

          // Send drag event to viewport manager
          engine.getViewportManager().handleEvent(event);
          lastMousePos = { x: e.clientX, y: e.clientY };
        } else {
          // console.log('🖱️ MouseMove but isDragging is false');
        }
      };

      const handleMouseUp = () => {
        if (isDragging) {
          isDragging = false;
          canvas.style.cursor = 'default';
          // Mouse drag ended
        }
      };

      canvas.addEventListener('wheel', handleWheel, { passive: false });
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mouseleave', handleMouseUp);

      // Handle canvas resize
      const resizeObserver = new ResizeObserver(() => {
        if (canvasRef.current && containerRef.current && engineRef.current) {
          const { width, height } = containerRef.current.getBoundingClientRect();

          if (width > 0 && height > 0) {
            // Get device pixel ratio for high-DPI displays
            const dpr = window.devicePixelRatio || 1;

            // Set canvas size in device pixels
            canvasRef.current.width = width * dpr;
            canvasRef.current.height = height * dpr;

            // Set CSS size to actual display size
            canvasRef.current.style.width = `${width}px`;
            canvasRef.current.style.height = `${height}px`;

            // Update viewport bounds and re-render with existing data
            engineRef.current.getViewportManager().updateCanvasSize();
          }
        }
      });

      resizeObserver.observe(containerRef.current);

      return () => {
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('mouseleave', handleMouseUp);
        resizeObserver.disconnect();
        engine.dispose();
        engineRef.current = null;
        if (setEngine && typeof setEngine === 'function') {
          setEngine(null);
        }
      };
    } catch (error) {
      console.error('Failed to initialize diagram engine:', error);
    }
  }, []); // Remove selectedTool from dependencies - engine should only be created once

  // Update diagram data when schema changes
  useEffect(() => {
    if (!engineRef.current || !schema || !isReady) {
      return;
    }

    try {
      // Convert schema to render data
      const tables: TableRenderData[] = (schema.tables || []).map((table: any, index: number) => ({
        id: table.name,
        name: table.name,
        bounds: {
          x: 50 + (index % 3) * 250,
          y: 50 + Math.floor(index / 3) * 200,
          width: 200,
          height: Math.max(100, (table.columns?.length || 0) * 25 + 50),
        },
        columns: (table.columns || []).map((column: any) => ({
          id: column.name,
          name: column.name,
          type: column.type || 'string',
          isPrimaryKey: column.isPrimaryKey || column.primaryKey || false,
          isForeignKey: column.isForeignKey || column.foreignKey || false,
          isSelected: false,
          isHovered: false,
        })),
        style: {
          backgroundColor: '#ffffff',
          borderColor: '#e5e7eb',
          borderWidth: 1,
          borderRadius: 8,
          headerBackgroundColor: '#f9fafb',
          headerTextColor: '#374151',
          headerHeight: 32,
          textColor: '#374151',
          typeTextColor: '#6b7280',
          padding: 12,
          rowHeight: 24,
          fontSize: 14,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          fontWeight: 'normal',
          selectedRowColor: '#dbeafe',
          hoveredRowColor: '#f3f4f6',
          iconSize: 16,
          iconSpacing: 8,
          shadowColor: '#00000020',
          shadowBlur: 4,
        },
        isSelected: false,
        isHovered: false,
      }));

      // Create a lookup map for table positions
      const tablePositions = new Map();
      tables.forEach(table => {
        tablePositions.set(table.id, table.bounds);
      });

      const relationships: RelationshipRenderData[] = (schema.relationships || []).map((rel: any, index: number) => {
        // Find source and target table positions
        const fromTableBounds = tablePositions.get(rel.fromTable);
        const toTableBounds = tablePositions.get(rel.toTable);

        // Calculate connection points (center-right of from table to center-left of to table)
        const startX = fromTableBounds ? fromTableBounds.x + fromTableBounds.width : 150;
        const startY = fromTableBounds ? fromTableBounds.y + fromTableBounds.height / 2 : 100;
        const endX = toTableBounds ? toTableBounds.x : 300;
        const endY = toTableBounds ? toTableBounds.y + toTableBounds.height / 2 : 100;
        const midpointX = (startX + endX) / 2;
        const midpointY = (startY + endY) / 2;

        return {
          id: rel.id || `rel-${index}`,
          type: rel.type || 'one-to-many',
          path: {
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            midpoint: { x: midpointX, y: midpointY },
            direction: 0,
          },
          style: {
            color: '#6b7280',
            width: 2,
            selectedColor: '#3b82f6',
            hoveredColor: '#4b5563',
            dashed: false,
            arrowSize: 8,
            hitWidth: 8,
            labelFontSize: 12,
            labelPadding: 4,
            labelBackgroundColor: '#ffffff',
            labelTextColor: '#374151',
          },
          isSelected: false,
          isHovered: false,
          label: `${rel.fromTable}.${rel.fromColumn} → ${rel.toTable}.${rel.toColumn}`,
        };
      });

      // Update engine with new data
      engineRef.current.updateData(tables, relationships);

      // Zoom to fit content
      if (tables.length > 0) {
        setTimeout(() => {
          engineRef.current?.zoomToFit(50);
        }, 100);
      }
    } catch (error) {
      console.error('Failed to update diagram data:', error);
    }
  }, [schema, isReady]);

  return (
    <div
      ref={containerRef}
      className={className || 'bg-white relative w-full h-full'}
      style={{ minHeight: '400px' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />

      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
          <div className="text-center">
            <div className="text-gray-400 text-lg mb-2">🔄 Loading diagram engine...</div>
          </div>
        </div>
      )}

      {isReady && (!schema || !schema.tables || schema.tables.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-gray-500">
            <div className="text-lg mb-2">📊 No tables to display</div>
            <p className="text-sm">Add some DBML code to see your diagram</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default DiagramCanvas;
