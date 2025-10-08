'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DiagramEngine } from '@biagram/diagram-engine';
import type { TableRenderData, RelationshipRenderData, ThemeConfig } from '@biagram/shared';
import { useDiagramEngine } from '@/contexts/diagram-context';
import { useTheme } from '@/contexts/theme-context';

interface DiagramCanvasProps {
  schema: any | null;
  className?: string;
}

/**
 * 새로운 아키텍처:
 * 1. React가 데이터(tables, relationships) 완전 소유
 * 2. DiagramEngine은 순수 렌더러로만 동작
 * 3. 리사이즈/뷰포트 변경 시에도 데이터는 React에 안전하게 보관
 * 4. 모든 렌더링은 React의 현재 데이터를 사용
 */
export function DiagramCanvas({ schema, className }: DiagramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DiagramEngine | null>(null);

  // 핵심: 데이터를 React가 소유
  const tablesRef = useRef<TableRenderData[]>([]);
  const relationshipsRef = useRef<RelationshipRenderData[]>([]);
  const schemaRef = useRef<any>(null); // 원본 스키마 저장 (관계선 재계산용)
  const hasZoomedToFitRef = useRef(false); // zoomToFit 실행 여부 추적

  const [isReady, setIsReady] = useState(false);
  const diagramContext = useDiagramEngine();
  const { setEngine, showGrid } = diagramContext || { setEngine: () => {}, showGrid: true };
  const { theme } = useTheme();
  const themeRef = useRef(theme);

  // 테마 ref 항상 최신 상태 유지
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  // 안전한 렌더링 함수 - 항상 최신 데이터 사용
  const safeRender = useCallback(() => {
    console.log('🎨 safeRender called');
    if (!engineRef.current) {
      console.log('⚠️ safeRender: engine not ready');
      return;
    }

    // 테마 설정 생성 (ref에서 가져오기)
    const themeConfig: ThemeConfig = themeRef.current === 'dark' ? {
      mode: 'dark',
      colors: {
        primary: '#3b82f6',
        secondary: '#6b7280',
        background: '#111827',  // 다크 모드 배경
        surface: '#1f2937',
        text: '#e5e7eb',
        textSecondary: '#9ca3af',
        border: '#374151',
        accent: '#60a5fa',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      typography: {
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
      },
    } : {
      mode: 'light',
      colors: {
        primary: '#3b82f6',
        secondary: '#6b7280',
        background: '#ffffff',  // 라이트 모드 배경
        surface: '#f9fafb',
        text: '#374151',
        textSecondary: '#6b7280',
        border: '#e5e7eb',
        accent: '#3b82f6',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      typography: {
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
      },
    };

    // React가 소유한 최신 데이터로 렌더링
    console.log('🎨 safeRender: calling engine.updateData');
    engineRef.current.updateData(
      tablesRef.current,
      relationshipsRef.current,
      themeConfig
    );
    console.log('🎨 safeRender: engine.updateData completed');
  }, []); // 빈 dependency - safeRender는 항상 안정적

  // 캔버스 리사이즈 핸들러
  const handleCanvasResize = useCallback((width: number, height: number) => {
    if (!canvasRef.current || !engineRef.current) return;

    const dpr = window.devicePixelRatio || 1;

    // 캔버스 크기 설정
    canvasRef.current.width = width * dpr;
    canvasRef.current.height = height * dpr;
    canvasRef.current.style.width = `${width}px`;
    canvasRef.current.style.height = `${height}px`;

    // 뷰포트 업데이트 후 데이터 다시 렌더링
    engineRef.current.getViewportManager().updateCanvasSize();

    // 중요: 데이터 다시 적용
    safeRender();
  }, [safeRender]);

  // 엔진 초기화 - 한 번만 실행
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    console.log('🎨 [NEW] DiagramCanvas 엔진 초기화');

    try {
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

      // 뷰포트 변경 시 항상 현재 데이터로 재렌더링
      engine.getViewportManager().onViewportChanged(() => {
        console.log('📡 viewport changed listener triggered');
        safeRender();
      });

      // 초기 캔버스 설정
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        handleCanvasResize(width, height);
      }

      // ResizeObserver 설정
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;

        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          handleCanvasResize(width, height);
        }
      });

      resizeObserver.observe(containerRef.current);

      // 마우스 이벤트 설정
      const canvas = canvasRef.current;

      const handleWheel = (e: WheelEvent) => {
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
      };

      let isDraggingCanvas = false;
      let isDraggingTable = false;
      let draggedTableId: string | null = null;
      let lastMousePos = { x: 0, y: 0 };

      // 테이블 히트 테스트
      const findTableAtPosition = (canvasX: number, canvasY: number): string | null => {
        const viewport = engine.getViewportManager().getViewport();

        // 스크린 좌표를 월드 좌표로 변환
        const worldX = (canvasX - viewport.pan.x) / viewport.zoom;
        const worldY = (canvasY - viewport.pan.y) / viewport.zoom;

        // 역순으로 검사 (위에 있는 테이블이 우선)
        for (let i = tablesRef.current.length - 1; i >= 0; i--) {
          const table = tablesRef.current[i];
          if (!table) continue;

          const { x, y, width, height } = table.bounds;

          if (worldX >= x && worldX <= x + width &&
              worldY >= y && worldY <= y + height) {
            return table.id;
          }
        }
        return null;
      };

      const handleMouseDown = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // 테이블 클릭 확인
        const tableId = findTableAtPosition(canvasX, canvasY);

        if (tableId && !e.ctrlKey && !e.metaKey && e.button === 0) {
          // 테이블 드래그 시작
          isDraggingTable = true;
          draggedTableId = tableId;
          lastMousePos = { x: e.clientX, y: e.clientY };
          canvas.style.cursor = 'move';
          e.preventDefault();
        } else if (e.button === 0 || e.button === 1 || e.ctrlKey || e.metaKey) {
          // 캔버스 팬 시작
          isDraggingCanvas = true;
          lastMousePos = { x: e.clientX, y: e.clientY };
          canvas.style.cursor = 'grabbing';
          e.preventDefault();
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (isDraggingTable && draggedTableId) {
          // 테이블 드래그: 스크린 delta를 월드 delta로 변환
          const deltaX = e.clientX - lastMousePos.x;
          const deltaY = e.clientY - lastMousePos.y;

          const viewport = engine.getViewportManager().getViewport();
          const worldDeltaX = deltaX / viewport.zoom;
          const worldDeltaY = deltaY / viewport.zoom;

          // tablesRef에서 해당 테이블 찾아서 위치 업데이트
          const tableIndex = tablesRef.current.findIndex(t => t.id === draggedTableId);
          if (tableIndex !== -1 && tablesRef.current[tableIndex]) {
            tablesRef.current[tableIndex]!.bounds.x += worldDeltaX;
            tablesRef.current[tableIndex]!.bounds.y += worldDeltaY;

            // 이 테이블과 연결된 관계선 업데이트
            if (schemaRef.current?.relationships) {
              const tablePositions = new Map<string, any>();
              tablesRef.current.forEach(table => {
                tablePositions.set(table.id, table.bounds);
              });

              // 컬럼 위치 계산을 위한 헬퍼 함수
              const getColumnY = (table: any, columnName: string, tableBounds: any): number => {
                if (!table || !tableBounds) return 0;

                const columnIndex = table.columns?.findIndex((col: any) => col.name === columnName);
                if (columnIndex === -1 || columnIndex === undefined) {
                  return tableBounds.y + tableBounds.height / 2;
                }

                const headerHeight = 32;
                const rowHeight = 24;
                return tableBounds.y + headerHeight + (columnIndex * rowHeight) + (rowHeight / 2);
              };

              relationshipsRef.current = schemaRef.current.relationships.map((schemaRel: any, index: number) => {
                const fromTableBounds = tablePositions.get(schemaRel.fromTable);
                const toTableBounds = tablePositions.get(schemaRel.toTable);

                const fromTable = (schemaRef.current.tables || []).find((t: any) => t.name === schemaRel.fromTable);
                const toTable = (schemaRef.current.tables || []).find((t: any) => t.name === schemaRel.toTable);

                const startX = fromTableBounds ? fromTableBounds.x + fromTableBounds.width : 150;
                const startY = fromTableBounds ? getColumnY(fromTable, schemaRel.fromColumn, fromTableBounds) : 100;
                const endX = toTableBounds ? toTableBounds.x : 300;
                const endY = toTableBounds ? getColumnY(toTable, schemaRel.toColumn, toTableBounds) : 100;

                return {
                  id: schemaRel.id || `rel-${index}`,
                  type: schemaRel.type || 'one-to-many',
                  fromColumn: schemaRel.fromColumn,
                  toColumn: schemaRel.toColumn,
                  path: {
                    start: { x: startX, y: startY },
                    end: { x: endX, y: endY },
                    midpoint: { x: (startX + endX) / 2, y: (startY + endY) / 2 },
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
                  label: `${schemaRel.fromTable}.${schemaRel.fromColumn} → ${schemaRel.toTable}.${schemaRel.toColumn}`,
                };
              });
            }

            // 엔진에 업데이트된 데이터 전달
            safeRender();
          }

          lastMousePos = { x: e.clientX, y: e.clientY };
        } else if (isDraggingCanvas) {
          // 캔버스 팬: 기존 방식
          const deltaX = e.clientX - lastMousePos.x;
          const deltaY = e.clientY - lastMousePos.y;
          const rect = canvas.getBoundingClientRect();

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

          lastMousePos = { x: e.clientX, y: e.clientY };
        }
      };

      const handleMouseUp = () => {
        if (isDraggingTable) {
          isDraggingTable = false;
          draggedTableId = null;
          canvas.style.cursor = 'default';
        } else if (isDraggingCanvas) {
          isDraggingCanvas = false;
          canvas.style.cursor = 'default';
        }
      };

      canvas.addEventListener('wheel', handleWheel, { passive: false });
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mouseleave', handleMouseUp);

      setIsReady(true);
      console.log('✅ [NEW] DiagramCanvas 준비 완료');

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
      console.error('❌ [NEW] 엔진 초기화 실패:', error);
    }
  }, [setEngine, handleCanvasResize, safeRender]);

  // 스키마 변경 시 데이터 업데이트
  useEffect(() => {
    if (!schema || !isReady || !engineRef.current) return;

    console.log('📊 [NEW] 스키마 업데이트:', {
      tables: schema.tables?.length || 0,
      relationships: schema.relationships?.length || 0,
    });

    try {
      // 원본 스키마 저장
      schemaRef.current = schema;

      // 연결된 컬럼 정보 수집
      const connectedColumns = new Map<string, Set<string>>(); // tableName -> Set<columnName>
      (schema.relationships || []).forEach((rel: any) => {
        if (!connectedColumns.has(rel.fromTable)) {
          connectedColumns.set(rel.fromTable, new Set());
        }
        if (!connectedColumns.has(rel.toTable)) {
          connectedColumns.set(rel.toTable, new Set());
        }
        connectedColumns.get(rel.fromTable)?.add(rel.fromColumn);
        connectedColumns.get(rel.toTable)?.add(rel.toColumn);
      });

      // 테이블 데이터 생성
      const tables: TableRenderData[] = (schema.tables || []).map((table: any, index: number) => ({
        id: table.name,
        name: table.name,
        bounds: {
          x: 50 + (index % 3) * 250,
          y: 50 + Math.floor(index / 3) * 200,
          width: 200,
          height: Math.max(100, (table.columns?.length || 0) * 25 + 50),
        },
        columns: (table.columns || []).map((column: any) => {
          const isConnected = connectedColumns.get(table.name)?.has(column.name) || false;
          return {
            id: column.name,
            name: column.name,
            type: column.type || 'string',
            isPrimaryKey: column.isPrimaryKey || column.primaryKey || false,
            isForeignKey: column.isForeignKey || column.foreignKey || false,
            isConnected: isConnected, // 관계선 연결 정보
            isSelected: false,
            isHovered: false,
          };
        }),
        style: theme === 'dark' ? {
          backgroundColor: '#1f2937',
          borderColor: '#374151',
          borderWidth: 1,
          borderRadius: 8,
          headerBackgroundColor: '#111827',
          headerTextColor: '#f3f4f6',
          headerHeight: 32,
          textColor: '#e5e7eb',
          typeTextColor: '#9ca3af',
          padding: 12,
          rowHeight: 24,
          fontSize: 14,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          fontWeight: 'normal',
          selectedRowColor: '#1e40af',
          hoveredRowColor: '#374151',
          connectedRowColor: '#1e3a8a',  // 다크 모드: 진한 파란색 배경
          connectedBorderColor: '#60a5fa',  // 다크 모드: 밝은 파란색 테두리
          iconSize: 16,
          iconSpacing: 8,
          shadowColor: '#00000040',
          shadowBlur: 4,
        } : {
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
          connectedRowColor: '#eff6ff',  // 라이트 모드: 연한 파란색 배경
          connectedBorderColor: '#3b82f6',  // 라이트 모드: 파란색 테두리
          iconSize: 16,
          iconSpacing: 8,
          shadowColor: '#00000020',
          shadowBlur: 4,
        },
        isSelected: false,
        isHovered: false,
      }));

      // 관계 데이터 생성
      const tablePositions = new Map();
      tables.forEach(table => {
        tablePositions.set(table.id, table.bounds);
      });

      const relationships: RelationshipRenderData[] = (schema.relationships || []).map((rel: any, index: number) => {
        const fromTableBounds = tablePositions.get(rel.fromTable);
        const toTableBounds = tablePositions.get(rel.toTable);

        // 컬럼 위치 계산을 위한 헬퍼 함수
        const getColumnY = (table: any, columnName: string, tableBounds: any): number => {
          if (!table || !tableBounds) return 0;

          const columnIndex = table.columns?.findIndex((col: any) => col.name === columnName);
          if (columnIndex === -1 || columnIndex === undefined) {
            // 컬럼을 찾지 못하면 테이블 중앙
            return tableBounds.y + tableBounds.height / 2;
          }

          // Y = 테이블Y + 헤더높이 + (컬럼인덱스 * 행높이) + (행높이/2)
          const headerHeight = 32;
          const rowHeight = 24;
          return tableBounds.y + headerHeight + (columnIndex * rowHeight) + (rowHeight / 2);
        };

        // fromTable과 toTable 찾기
        const fromTable = (schema.tables || []).find((t: any) => t.name === rel.fromTable);
        const toTable = (schema.tables || []).find((t: any) => t.name === rel.toTable);

        // 시작점: fromTable의 오른쪽, fromColumn의 Y 위치
        const startX = fromTableBounds ? fromTableBounds.x + fromTableBounds.width : 150;
        const startY = fromTableBounds ? getColumnY(fromTable, rel.fromColumn, fromTableBounds) : 100;

        // 끝점: toTable의 왼쪽, toColumn의 Y 위치
        const endX = toTableBounds ? toTableBounds.x : 300;
        const endY = toTableBounds ? getColumnY(toTable, rel.toColumn, toTableBounds) : 100;

        return {
          id: rel.id || `rel-${index}`,
          type: rel.type || 'one-to-many',
          fromColumn: rel.fromColumn, // 하이라이트용
          toColumn: rel.toColumn,     // 하이라이트용
          path: {
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            midpoint: { x: (startX + endX) / 2, y: (startY + endY) / 2 },
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

      // React가 데이터 소유 - ref에 저장
      tablesRef.current = tables;
      relationshipsRef.current = relationships;

      // 엔진에 데이터 전달
      safeRender();

      // Zoom to fit - 최초 1회만 실행
      if (tables.length > 0 && !hasZoomedToFitRef.current) {
        setTimeout(() => {
          engineRef.current?.zoomToFit(50);
          hasZoomedToFitRef.current = true;
        }, 100);
      }

      console.log('✅ [NEW] 데이터 업데이트 완료');
    } catch (error) {
      console.error('❌ [NEW] 데이터 업데이트 실패:', error);
    }
  }, [schema, isReady, safeRender]);

  // 테마 변경 시에만 스타일 업데이트 및 렌더링 (줌 상태 유지)
  useEffect(() => {
    if (isReady && engineRef.current && tablesRef.current.length > 0) {
      console.log('🎨 Theme changed, updating table styles');

      // 테이블 스타일 업데이트
      const darkStyle = {
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        borderWidth: 1,
        borderRadius: 8,
        headerBackgroundColor: '#111827',
        headerTextColor: '#f3f4f6',
        headerHeight: 32,
        textColor: '#e5e7eb',
        typeTextColor: '#9ca3af',
        padding: 12,
        rowHeight: 24,
        fontSize: 14,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontWeight: 'normal' as const,
        selectedRowColor: '#1e40af',
        hoveredRowColor: '#374151',
        connectedRowColor: '#1e3a8a',
        connectedBorderColor: '#60a5fa',
        iconSize: 16,
        iconSpacing: 8,
        shadowColor: '#00000040',
        shadowBlur: 4,
      };

      const lightStyle = {
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
        fontWeight: 'normal' as const,
        selectedRowColor: '#dbeafe',
        hoveredRowColor: '#f3f4f6',
        connectedRowColor: '#eff6ff',
        connectedBorderColor: '#3b82f6',
        iconSize: 16,
        iconSpacing: 8,
        shadowColor: '#00000020',
        shadowBlur: 4,
      };

      // 모든 테이블의 스타일 업데이트
      tablesRef.current = tablesRef.current.map(table => ({
        ...table,
        style: theme === 'dark' ? darkStyle : lightStyle,
      }));

      // 렌더링
      safeRender();
    }
  }, [theme, isReady, safeRender]);

  // showGrid 변경 시 엔진에 전달
  useEffect(() => {
    if (isReady && engineRef.current) {
      console.log('🔲 Grid visibility changed:', showGrid);
      engineRef.current.setShowGrid(showGrid);
    }
  }, [showGrid, isReady]);

  return (
    <div
      ref={containerRef}
      className={className || `relative w-full h-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}
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
