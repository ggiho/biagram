'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DiagramEngine } from '@biagram/diagram-engine';
import type { TableRenderData, RelationshipRenderData, ThemeConfig } from '@biagram/shared';
import { useDiagramEngine } from '@/contexts/diagram-context';
import { useTheme } from '@/contexts/theme-context';

interface DiagramCanvasProps {
  schema: any | null;
  className?: string;
  initialTablePositions?: Record<string, { x: number; y: number }>;
  onTablePositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
}

/**
 * 새로운 아키텍처:
 * 1. React가 데이터(tables, relationships) 완전 소유
 * 2. DiagramEngine은 순수 렌더러로만 동작
 * 3. 리사이즈/뷰포트 변경 시에도 데이터는 React에 안전하게 보관
 * 4. 모든 렌더링은 React의 현재 데이터를 사용
 */
export function DiagramCanvas({ schema, className, initialTablePositions, onTablePositionsChange }: DiagramCanvasProps) {
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
  const { setEngine, showGrid, showComments, selectedEntityId, setSelectedEntityId, highlightedRelationshipId, setHighlightedRelationshipId } = diagramContext || {
    setEngine: () => {},
    showGrid: true,
    showComments: true,
    selectedEntityId: null,
    setSelectedEntityId: () => {},
    highlightedRelationshipId: null,
    setHighlightedRelationshipId: () => {},
  };
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

    // 실제 렌더링 수행
    console.log('🎯 DiagramEngine viewport listener called');
    engineRef.current.render();
  }, []); // 빈 dependency - safeRender는 항상 안정적

  // showGrid 변경 시 엔진에 반영
  useEffect(() => {
    if (engineRef.current) {
      console.log('🔲 Updating showGrid:', showGrid);
      engineRef.current.setShowGrid(showGrid);
    }
  }, [showGrid]);

  // showComments 변경 시 엔진에 반영
  useEffect(() => {
    if (engineRef.current) {
      console.log('💬 Updating showComments:', showComments);
      engineRef.current.setShowComments(showComments);
    }
  }, [showComments]);

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
        disableInteractionManager: true, // DiagramCanvas handles all interactions
        initialViewport: {
          zoom: 1,
          pan: { x: 0, y: 0 },
        },
      });

      engineRef.current = engine;
      if (setEngine && typeof setEngine === 'function') {
        setEngine(engine);
      }

      // Expose engine to window for testing
      if (typeof window !== 'undefined') {
        (window as any).__diagramEngine = engine;
      }

      // 뷰포트 변경 시 항상 현재 데이터로 재렌더링
      engine.getViewportManager().onViewportChanged(() => {
        console.log('📡 viewport changed listener triggered');
        // Trigger engine render for viewport changes
        engine.render();
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
      let mouseDownPos = { x: 0, y: 0 };
      let mouseDownTableId: string | null = null;
      let mouseDownRelationshipId: string | null = null;
      let hasMoved = false;
      const DRAG_THRESHOLD = 5; // pixels

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

      // 관계선 히트 테스트 - 클릭 지점이 관계선 근처인지 확인
      const findRelationshipAtPosition = (canvasX: number, canvasY: number): string | null => {
        const viewport = engine.getViewportManager().getViewport();

        // 스크린 좌표를 월드 좌표로 변환
        const worldX = (canvasX - viewport.pan.x) / viewport.zoom;
        const worldY = (canvasY - viewport.pan.y) / viewport.zoom;

        // 클릭 허용 거리 (월드 좌표 기준)
        const hitThreshold = 10 / viewport.zoom; // 줌에 따라 조정

        // 점과 선분 사이의 거리 계산 (수학적 거리 공식)
        const distanceToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const lengthSquared = dx * dx + dy * dy;

          if (lengthSquared === 0) {
            // 선분이 점인 경우
            return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
          }

          // 선분 상의 가장 가까운 점의 매개변수 t (0 ≤ t ≤ 1)
          let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
          t = Math.max(0, Math.min(1, t));

          // 가장 가까운 점의 좌표
          const nearestX = x1 + t * dx;
          const nearestY = y1 + t * dy;

          // 거리 계산
          return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
        };

        // 모든 관계선 검사
        for (const rel of relationshipsRef.current) {
          if (!rel || !rel.path) continue;

          const { start, end } = rel.path;
          const distance = distanceToSegment(worldX, worldY, start.x, start.y, end.x, end.y);

          if (distance <= hitThreshold) {
            console.log('🔗 Relationship hit detected:', rel.id, 'distance:', distance);
            return rel.id;
          }
        }

        return null;
      };

      const handleMouseDown = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // 테이블 클릭 확인 (테이블 우선)
        const tableId = findTableAtPosition(canvasX, canvasY);

        // 테이블이 없으면 관계선 클릭 확인
        const relationshipId = tableId ? null : findRelationshipAtPosition(canvasX, canvasY);

        // 초기 상태 기록
        mouseDownPos = { x: e.clientX, y: e.clientY };
        mouseDownTableId = tableId;
        mouseDownRelationshipId = relationshipId;
        lastMousePos = { x: e.clientX, y: e.clientY };
        hasMoved = false;

        if (tableId && !e.ctrlKey && !e.metaKey && e.button === 0) {
          // 테이블 위에서 마우스다운 - 아직 드래그인지 클릭인지 모름
          e.preventDefault();
        } else if (relationshipId && !e.ctrlKey && !e.metaKey && e.button === 0) {
          // 관계선 위에서 마우스다운 - 클릭으로 처리 (드래그 안 함)
          e.preventDefault();
        } else if (e.button === 0 || e.button === 1 || e.ctrlKey || e.metaKey) {
          // 캔버스 팬 시작 (테이블도 관계선도 아님)
          isDraggingCanvas = true;
          console.log(`🔍 DiagramCanvas handleMouseDown: isDraggingCanvas set to TRUE, button=${e.button}`);
          canvas.style.cursor = 'grabbing';
          e.preventDefault();
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        console.log(`🔍 DiagramCanvas handleMouseMove called, isDraggingCanvas=${isDraggingCanvas}, mouseDownTableId=${mouseDownTableId}`);

        // 드래그 임계값 체크
        if (!hasMoved && mouseDownTableId) {
          const dx = e.clientX - mouseDownPos.x;
          const dy = e.clientY - mouseDownPos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > DRAG_THRESHOLD) {
            // 임계값을 넘었으므로 드래그 시작
            hasMoved = true;
            isDraggingTable = true;
            draggedTableId = mouseDownTableId;
            canvas.style.cursor = 'move';
          }
        }

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
                  fromTable: schemaRel.fromTable,   // 하이라이트용
                  toTable: schemaRel.toTable,       // 하이라이트용
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
          // Canvas panning (InteractionManager disabled, DiagramCanvas handles all events)
          hasMoved = true;
          const deltaX = e.clientX - lastMousePos.x;
          const deltaY = e.clientY - lastMousePos.y;
          const rect = canvas.getBoundingClientRect();

          console.log(`🔍 DiagramCanvas handleMouseMove: canvas pan, delta=(${deltaX}, ${deltaY})`);

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
        // 클릭인 경우 (드래그하지 않음) - 테이블 선택
        if (!hasMoved && mouseDownTableId) {
          console.log('📌 Table clicked:', mouseDownTableId);
          setSelectedEntityId(mouseDownTableId);
          setHighlightedRelationshipId(null); // 관계 하이라이트 초기화

          // isSelected 업데이트하고 재렌더링
          tablesRef.current = tablesRef.current.map(table => ({
            ...table,
            isSelected: table.id === mouseDownTableId,
          }));
          safeRender();
        } else if (!hasMoved && mouseDownRelationshipId) {
          // 관계선 클릭 - 관계선 선택 (특별한 ID 형식 사용)
          console.log('🔗 Relationship clicked:', mouseDownRelationshipId);
          setSelectedEntityId(`rel:${mouseDownRelationshipId}`);
          setHighlightedRelationshipId(mouseDownRelationshipId); // 사이드바와 동기화

          // 선택된 관계선 찾기
          const selectedRel: any = relationshipsRef.current.find((rel: any) => rel.id === mouseDownRelationshipId);

          // 관계와 연결된 테이블들만 하이라이트
          if (selectedRel) {
            console.log('🔗 Highlighting tables:', selectedRel.fromTable, selectedRel.toTable);
            tablesRef.current = tablesRef.current.map(table => ({
              ...table,
              isSelected: table.id === selectedRel.fromTable || table.id === selectedRel.toTable,
            }));
          } else {
            // 관계를 찾지 못한 경우 모든 테이블 선택 해제
            tablesRef.current = tablesRef.current.map(table => ({
              ...table,
              isSelected: false,
            }));
          }

          // 클릭된 관계선만 선택
          relationshipsRef.current = relationshipsRef.current.map((rel: any) => ({
            ...rel,
            isSelected: rel.id === mouseDownRelationshipId,
          }));
          safeRender();
        } else if (!hasMoved && !mouseDownTableId && !mouseDownRelationshipId) {
          // 배경 클릭 - 선택 해제
          console.log('📌 Background clicked - deselect');
          setSelectedEntityId(null);
          setHighlightedRelationshipId(null); // 관계 하이라이트도 초기화

          // 모든 테이블 선택 해제
          tablesRef.current = tablesRef.current.map(table => ({
            ...table,
            isSelected: false,
          }));

          // 모든 관계선 선택 해제
          relationshipsRef.current = relationshipsRef.current.map((rel: any) => ({
            ...rel,
            isSelected: false,
          }));
          safeRender();
        }

        // 드래그 상태 초기화
        if (isDraggingTable) {
          isDraggingTable = false;
          draggedTableId = null;
          canvas.style.cursor = 'default';

          // 테이블 위치 저장 (드래그 종료 시)
          if (onTablePositionsChange) {
            const positions: Record<string, { x: number; y: number }> = {};
            tablesRef.current.forEach(table => {
              positions[table.id] = { x: table.bounds.x, y: table.bounds.y };
            });
            onTablePositionsChange(positions);
            console.log('📍 Table positions saved to localStorage');
          }
        } else if (isDraggingCanvas) {
          isDraggingCanvas = false;
          canvas.style.cursor = 'default';
        }

        // 상태 리셋
        mouseDownTableId = null;
        hasMoved = false;
      };

      // 마우스가 캔버스를 벗어날 때 - 드래그만 종료하고 선택은 유지
      const handleMouseLeave = () => {
        console.log('🔄 Mouse left canvas - cleaning up drag state only');

        // 드래그 상태 초기화 (선택 상태는 유지)
        if (isDraggingTable) {
          isDraggingTable = false;
          draggedTableId = null;
          canvas.style.cursor = 'default';
        } else if (isDraggingCanvas) {
          isDraggingCanvas = false;
          canvas.style.cursor = 'default';
        }

        // 드래그 관련 상태만 리셋 (선택은 유지하므로 mouseDownTableId는 리셋하지 않음)
        hasMoved = false;
      };

      canvas.addEventListener('wheel', handleWheel, { passive: false });
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mouseleave', handleMouseLeave);

      setIsReady(true);
      console.log('✅ [NEW] DiagramCanvas 준비 완료');

      return () => {
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
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

      // 텍스트 너비를 측정하는 헬퍼 함수
      const measureTextWidth = (text: string, fontSize: number, fontFamily: string, fontWeight: string = 'normal'): number => {
        if (!canvasRef.current) return text.length * 8; // fallback
        
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return text.length * 8;
        
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        return ctx.measureText(text).width;
      };

      // 스키마별 색상 할당
      const schemaColors = new Map<string, string>();
      const colorPalette = [
        '#3b82f6', // blue
        '#10b981', // green  
        '#f59e0b', // amber
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#14b8a6', // teal
        '#f97316', // orange
        '#6366f1', // indigo
      ];
      
      let colorIndex = 0;
      (schema.tables || []).forEach((table: any) => {
        if (!table.name) return;
        const parts = table.name.split('.');
        if (parts.length > 1) {
          const schemaName = parts[0];
          if (schemaName && !schemaColors.has(schemaName)) {
            const color = colorPalette[colorIndex % colorPalette.length];
            if (color) {
              schemaColors.set(schemaName, color);
              colorIndex++;
            }
          }
        }
      });

      // 테이블 데이터 생성
      const tables: TableRenderData[] = (schema.tables || []).map((table: any, index: number) => {
        // 저장된 위치가 있으면 사용, 없으면 기본 레이아웃 적용
        const savedPosition = initialTablePositions?.[table.name];
        const defaultX = 50 + (index % 3) * 300; // 간격 증가
        const defaultY = 50 + Math.floor(index / 3) * 200;

        if (savedPosition) {
          console.log(`📍 Restoring position for table ${table.name}:`, savedPosition);
        }

        // 동적 너비 계산
        const fontSize = 14;
        const fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
        const padding = 12;
        
        // 테이블 이름 너비 (bold)
        const tableNameWidth = measureTextWidth(table.name, fontSize, fontFamily, 'bold');
        
        // 모든 컬럼의 최대 너비 계산
        let maxColumnWidth = tableNameWidth;
        (table.columns || []).forEach((column: any) => {
          // 컬럼명 + 타입 문자열
          const columnText = `${column.name} ${column.type || ''}`;
          const columnWidth = measureTextWidth(columnText, fontSize, fontFamily);
          maxColumnWidth = Math.max(maxColumnWidth, columnWidth);
        });
        
        // 패딩과 아이콘 공간 추가 (좌우 패딩 + 아이콘 영역)
        const calculatedWidth = Math.max(180, maxColumnWidth + padding * 2 + 40);

        // Parse schema.table notation
        const tableParts = table.name.split('.');
        const tableSchema = tableParts.length > 1 ? tableParts[0] : undefined;
        const tableName = tableParts.length > 1 ? tableParts[1] : table.name;
        const schemaColor = tableSchema ? schemaColors.get(tableSchema) : undefined;
        
        return {
          id: table.name,
          name: table.name,
          schema: tableSchema,
          displayName: table.name, // Full name with schema
          note: table.note,
          bounds: {
            x: savedPosition?.x ?? defaultX,
            y: savedPosition?.y ?? defaultY,
            width: calculatedWidth,
            // Add extra height for note if it exists
            height: Math.max(100, (table.columns?.length || 0) * 25 + 50 + (table.note ? 24 : 0)),
          },
          columns: (table.columns || []).map((column: any) => {
            const isConnected = connectedColumns.get(table.name)?.has(column.name) || false;
            return {
              id: column.name,
              name: column.name,
              type: column.type || 'string',
              note: column.note,
              isPrimaryKey: column.isPrimaryKey || column.primaryKey || false,
              isForeignKey: column.isForeignKey || column.foreignKey || false,
              isConnected: isConnected, // 관계선 연결 정보
              isSelected: false,
              isHovered: false,
            };
          }),
        style: theme === 'dark' ? {
          backgroundColor: '#1f2937',
          borderColor: schemaColor || '#374151',
          borderWidth: schemaColor ? 2 : 1,
          borderRadius: 8,
          headerBackgroundColor: schemaColor || '#111827',
          headerTextColor: '#f3f4f6',
          headerHeight: 32,
          textColor: '#e5e7eb',
          typeTextColor: '#9ca3af',
          noteTextColor: '#6b7280',
          padding: 12,
          rowHeight: 24,
          fontSize: 14,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          fontWeight: 'normal',
          selectedRowColor: '#1e40af',
          hoveredRowColor: '#374151',
          connectedRowColor: '#1e3a8a',
          connectedBorderColor: '#60a5fa',
          iconSize: 16,
          iconSpacing: 8,
          shadowColor: '#00000040',
          shadowBlur: 4,
          schemaColor: schemaColor,
        } : {
          backgroundColor: '#ffffff',
          borderColor: schemaColor || '#e5e7eb',
          borderWidth: schemaColor ? 2 : 1,
          borderRadius: 8,
          headerBackgroundColor: schemaColor || '#f9fafb',
          headerTextColor: schemaColor ? '#ffffff' : '#374151',
          headerHeight: 32,
          textColor: '#374151',
          typeTextColor: '#6b7280',
          noteTextColor: '#9ca3af',
          padding: 12,
          rowHeight: 24,
          fontSize: 14,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          fontWeight: 'normal',
          selectedRowColor: '#dbeafe',
          hoveredRowColor: '#f3f4f6',
          connectedRowColor: '#eff6ff',
          connectedBorderColor: '#3b82f6',
          iconSize: 16,
          iconSpacing: 8,
          shadowColor: '#00000020',
          shadowBlur: 4,
          schemaColor: schemaColor,
        },
        isSelected: false,
        isHovered: false,
      };
    });

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
          fromTable: rel.fromTable,   // 하이라이트용 - 어느 테이블에서 시작
          toTable: rel.toTable,       // 하이라이트용 - 어느 테이블로 끝
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

  // selectedEntityId 변경 시 isSelected 업데이트
  useEffect(() => {
    if (!isReady || !engineRef.current || tablesRef.current.length === 0) return;

    console.log('📌 selectedEntityId changed:', selectedEntityId);

    // 관계선 선택인지 테이블 선택인지 구분
    const isRelationshipSelection = selectedEntityId?.startsWith('rel:');
    const relationshipId = isRelationshipSelection && selectedEntityId ? selectedEntityId.replace('rel:', '') : null;

    if (isRelationshipSelection && relationshipId) {
      // 관계선 선택: 해당 관계선의 fromTable과 toTable 모두 하이라이트
      const selectedRel = relationshipsRef.current.find((r: any) => r.id === relationshipId) as any;

      if (selectedRel && selectedRel.fromTable && selectedRel.toTable) {
        console.log('🔗 Relationship selected, highlighting tables:',
          selectedRel.fromTable, '←→', selectedRel.toTable);

        // 연결된 테이블들 하이라이트
        tablesRef.current = tablesRef.current.map(table => ({
          ...table,
          isSelected: table.id === selectedRel.fromTable || table.id === selectedRel.toTable,
        }));

        // 선택된 관계선만 하이라이트
        relationshipsRef.current = relationshipsRef.current.map((rel: any) => ({
          ...rel,
          isSelected: rel.id === relationshipId,
        }));
      }
    } else {
      // 테이블 선택: 기존 로직
      tablesRef.current = tablesRef.current.map(table => ({
        ...table,
        isSelected: table.id === selectedEntityId,
      }));

      // 선택된 테이블과 연결된 관계선 하이라이트
      relationshipsRef.current = relationshipsRef.current.map((rel: any) => ({
        ...rel,
        isSelected: selectedEntityId ?
          (rel.fromTable === selectedEntityId || rel.toTable === selectedEntityId) :
          false,
      }));

      console.log('🔗 Highlighted relationships:',
        relationshipsRef.current.filter((r: any) => r.isSelected).length);
    }

    safeRender();
  }, [selectedEntityId, isReady, safeRender]);

  // highlightedRelationshipId 변경 시 관련 없는 테이블 dim 처리
  useEffect(() => {
    if (!isReady || !engineRef.current || tablesRef.current.length === 0) return;

    console.log('🔦 highlightedRelationshipId changed:', highlightedRelationshipId);

    if (highlightedRelationshipId) {
      // 하이라이트된 관계선 찾기
      const highlightedRel: any = relationshipsRef.current.find((r: any) => r.id === highlightedRelationshipId);

      if (highlightedRel) {
        console.log('🔦 Dimming tables not connected to:', highlightedRel.fromTable, '↔', highlightedRel.toTable);

        // 연결된 테이블 ID 세트
        const connectedTableIds = new Set([highlightedRel.fromTable, highlightedRel.toTable]);

        // 모든 테이블에 opacity 속성 추가 (연결되지 않은 테이블은 0.3)
        tablesRef.current = tablesRef.current.map(table => ({
          ...table,
          // @ts-ignore - Adding opacity property not in schema
          opacity: connectedTableIds.has(table.id) ? 1.0 : 0.3,
        }));

        // 하이라이트된 관계선만 선택 상태로 표시
        relationshipsRef.current = relationshipsRef.current.map((rel: any) => ({
          ...rel,
          isSelected: rel.id === highlightedRelationshipId,
        }));
      }
    } else {
      // 하이라이트 해제: 모든 테이블 opacity 복원
      console.log('🔦 Restoring all tables to full opacity');
      tablesRef.current = tablesRef.current.map(table => ({
        ...table,
        // @ts-ignore - Removing opacity property
        opacity: 1.0,
      }));

      // 모든 관계선 선택 해제
      relationshipsRef.current = relationshipsRef.current.map((rel: any) => ({
        ...rel,
        isSelected: false,
      }));
    }

    safeRender();
  }, [highlightedRelationshipId, isReady, safeRender]);

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
