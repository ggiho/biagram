'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DiagramEngine } from '@biagram/diagram-engine';
import type { TableRenderData, ThemeConfig, Table, Relationship } from '@biagram/shared';
import { useDiagramEngine } from '@/contexts/diagram-context';
import { useTheme } from '@/contexts/theme-context';
import {
  useRelationshipRouting,
  useTableLayout,
  useCanvasInteraction,
  useCanvasSelection,
  type ExtendedRelationshipRenderData,
} from '@/hooks';
import { calculateOrthogonalRoute } from '@/lib/edge-routing';

// Schema type that can come from parser or API
interface ParsedSchema {
  tables: Table[];
  relationships: Relationship[];
  enums?: Array<{ name: string; values: Array<{ name: string; note?: string }> }>;
}

interface DiagramCanvasProps {
  schema: ParsedSchema | null;
  parseError?: string | null;
  className?: string;
  initialTablePositions?: Record<string, { x: number; y: number }>;
  onTablePositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
  onTableDoubleClick?: (tableName: string) => void;
}

/**
 * 스키마.테이블 형식을 정확히 매칭하는 헬퍼 함수
 * 같은 이름의 테이블이 여러 스키마에 있을 때 정확히 구분
 */
function matchesTableName(table: TableRenderData, targetName: string): boolean {
  // 1. id로 정확히 매칭
  if (table.id === targetName) return true;

  // 2. name으로 정확히 매칭
  if (table.name === targetName) return true;

  // 3. 스키마 분리해서 매칭
  const targetParts = targetName.includes('.') ? targetName.split('.') : [undefined, targetName];
  const targetSchema = targetParts.length > 1 ? targetParts[0] : undefined;
  const targetTable = targetParts.length > 1 ? targetParts[1] : targetParts[0];

  const tableParts = table.name.includes('.') ? table.name.split('.') : [undefined, table.name];
  const tableSchema = table.schema || (tableParts.length > 1 ? tableParts[0] : undefined);
  const tableName = tableParts.length > 1 ? tableParts[1] : tableParts[0];

  // 스키마와 테이블명 모두 일치해야 함
  if (targetSchema && tableSchema) {
    return tableSchema === targetSchema && tableName === targetTable;
  }

  // 스키마가 없으면 테이블명만 비교
  return tableName === targetTable;
}

function matchesRelationshipTableName(
  relationshipTableName: string,
  targetName: string
): boolean {
  if (relationshipTableName === targetName) return true;

  const relationshipParts = relationshipTableName.includes('.') ? relationshipTableName.split('.') : [undefined, relationshipTableName];
  const relationshipSchema = relationshipParts.length > 1 ? relationshipParts[0] : undefined;
  const relationshipTable = relationshipParts.length > 1 ? relationshipParts[1] : relationshipParts[0];

  const targetParts = targetName.includes('.') ? targetName.split('.') : [undefined, targetName];
  const targetSchema = targetParts.length > 1 ? targetParts[0] : undefined;
  const targetTable = targetParts.length > 1 ? targetParts[1] : targetParts[0];

  if (relationshipSchema && targetSchema) {
    return relationshipSchema === targetSchema && relationshipTable === targetTable;
  }

  return relationshipTable === targetTable;
}

function getCombinedTableBounds(
  firstTable: TableRenderData,
  secondTable: TableRenderData
): { x: number; y: number; width: number; height: number } {
  const minX = Math.min(firstTable.bounds.x, secondTable.bounds.x);
  const minY = Math.min(firstTable.bounds.y, secondTable.bounds.y);
  const maxX = Math.max(firstTable.bounds.x + firstTable.bounds.width, secondTable.bounds.x + secondTable.bounds.width);
  const maxY = Math.max(firstTable.bounds.y + firstTable.bounds.height, secondTable.bounds.y + secondTable.bounds.height);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}


/**
 * 새로운 아키텍처:
 * 1. React가 데이터(tables, relationships) 완전 소유
 * 2. DiagramEngine은 순수 렌더러로만 동작
 * 3. 리사이즈/뷰포트 변경 시에도 데이터는 React에 안전하게 보관
 * 4. 모든 렌더링은 React의 현재 데이터를 사용
 */
export function DiagramCanvas({ schema, parseError, className, initialTablePositions, onTablePositionsChange, onTableDoubleClick }: DiagramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DiagramEngine | null>(null);

  // 핵심: 데이터를 React가 소유
  const tablesRef = useRef<TableRenderData[]>([]);
  const relationshipsRef = useRef<any[]>([]); // ExtendedRelationshipRenderData
  const schemaRef = useRef<ParsedSchema | null>(null); // 원본 스키마 저장 (관계선 재계산용)
  const hasZoomedToFitRef = useRef(false); // zoomToFit 실행 여부 추적

  // 🔄 Custom Hooks
  const { calculateAllRelationships, findTableDataByName, findTableByName } = useRelationshipRouting();
  const { measureTextWidth, getTableDimensions, assignSchemaColors, calculateGridPositions, collectConnectedColumns, getTableStyle } = useTableLayout();
  const canvasInteraction = useCanvasInteraction();
  const canvasSelection = useCanvasSelection();

  // 🚀 성능 최적화: 텍스트 너비 측정 캐싱 (useTableLayout으로 대체 가능하지만 호환성 유지)
  const textWidthCacheRef = useRef<Map<string, number>>(new Map());

  // 🚀 성능 최적화: 청크 렌더링 상태
  const [isProcessing, setIsProcessing] = useState(false);
  const processingAbortRef = useRef<(() => void) | null>(null);

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
  
  // 관계 선택 시 뷰포트 저장 (복원용)
  const savedViewportRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const selectedEntityIdRef = useRef<string | null>(selectedEntityId);
  const highlightedRelationshipIdRef = useRef<string | null>(highlightedRelationshipId);

  // 테마 ref 항상 최신 상태 유지
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    selectedEntityIdRef.current = selectedEntityId;
  }, [selectedEntityId]);

  useEffect(() => {
    highlightedRelationshipIdRef.current = highlightedRelationshipId;
  }, [highlightedRelationshipId]);

  // 안전한 렌더링 함수 - 항상 최신 데이터 사용
  const safeRender = useCallback(() => {
    // console.log('🎨 safeRender called');
    if (!engineRef.current) {
      // console.log('⚠️ safeRender: engine not ready');
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
    // console.log('🎨 safeRender: calling engine.updateData');
    engineRef.current.updateData(
      tablesRef.current,
      relationshipsRef.current,
      themeConfig
    );
    // console.log('🎨 safeRender: engine.updateData completed');

    // 실제 렌더링 수행
    // console.log('🎯 DiagramEngine viewport listener called');
    engineRef.current.render();
  }, []); // 빈 dependency - safeRender는 항상 안정적

  // 🔄 관계선 재계산 헬퍼 함수 (중복 코드 제거)
  const recalculateRelationships = useCallback((options?: {
    selectedId?: string | null;
    highlightedId?: string | null;
  }) => {
    if (!schemaRef.current?.relationships) return;

    const selectedRelationshipId =
      options?.selectedId !== undefined
        ? options.selectedId
        : (selectedEntityIdRef.current?.startsWith('rel:')
            ? selectedEntityIdRef.current.replace('rel:', '')
            : null);
    const highlightedId =
      options?.highlightedId !== undefined
        ? options.highlightedId
        : highlightedRelationshipIdRef.current;

    relationshipsRef.current = calculateAllRelationships(
      schemaRef.current.relationships,
      tablesRef.current,
      schemaRef.current.tables || [],
      {
        selectedId: selectedRelationshipId,
        highlightedId,
      }
    );
  }, [calculateAllRelationships]);

  // showGrid 변경 시 엔진에 반영
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setShowGrid(showGrid);
    }
  }, [showGrid]);

  // showComments 변경 시 엔진에 반영
  useEffect(() => {
    if (engineRef.current) {
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
        // console.log('📡 viewport changed listener triggered');
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
            return table.id; // Use table.id (fullTableName with schema) for sidebar matching
          }
        }
        return null;
      };

      // 관계선 히트 테스트 - Orthogonal routing 지원
      const findRelationshipAtPosition = (canvasX: number, canvasY: number): string | null => {
        const viewport = engine.getViewportManager().getViewport();

        // 스크린 좌표를 월드 좌표로 변환
        const worldX = (canvasX - viewport.pan.x) / viewport.zoom;
        const worldY = (canvasY - viewport.pan.y) / viewport.zoom;

        // Zoom-adjusted hit width (줄인 값)
        const hitWidth = 10 / viewport.zoom;


        // 모든 관계선에 대해 hit test
        for (const rel of relationshipsRef.current) {
          const relData = rel as any;

          // 관계선의 모든 세그먼트 구성
          const points: Array<{ x: number; y: number }> = [
            relData.path.start,
            ...(relData.path.controlPoints || []),
            relData.path.end,
          ];

          // 각 세그먼트에 대해 거리 계산
          for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            // 점이 유효한지 확인
            if (!p1 || !p2) continue;

            // 점과 선분 사이의 최단 거리 계산
            const distance = distanceToSegment(worldX, worldY, p1.x, p1.y, p2.x, p2.y);

            if (distance <= hitWidth) {
              return relData.id;
            }
          }
        }

        return null;
      };

      // 점과 선분 사이의 최단 거리 계산 (helper function)
      const distanceToSegment = (
        px: number, py: number,
        x1: number, y1: number,
        x2: number, y2: number
      ): number => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;

        if (lengthSquared === 0) {
          // 선분의 시작점과 끝점이 같은 경우
          return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
        }

        // 선분 위의 가장 가까운 점 찾기
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t)); // 0~1 범위로 제한 (선분 내부)

        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;

        // 점과 가장 가까운 점 사이의 거리
        return Math.sqrt((px - closestX) * (px - closestX) + (py - closestY) * (py - closestY));
      };

      const handleMouseDown = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;


        // 관계선 클릭 확인 (먼저 체크)
        const relationshipId = findRelationshipAtPosition(canvasX, canvasY);

        // 관계선이 없으면 테이블 클릭 확인
        const tableId = relationshipId ? null : findTableAtPosition(canvasX, canvasY);

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
          // console.log(`🔍 DiagramCanvas handleMouseDown: isDraggingCanvas set to TRUE, button=${e.button}`);
          canvas.style.cursor = 'grabbing';
          e.preventDefault();
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        // console.log(`🔍 DiagramCanvas handleMouseMove called, isDraggingCanvas=${isDraggingCanvas}, mouseDownTableId=${mouseDownTableId}`);

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

            // 🔄 이 테이블과 연결된 관계선 업데이트 (Hook 사용)
            recalculateRelationships();

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

          // console.log(`🔍 DiagramCanvas handleMouseMove: canvas pan, delta=(${deltaX}, ${deltaY})`);

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
          setSelectedEntityId(mouseDownTableId);
          setHighlightedRelationshipId(null); // 관계 하이라이트 초기화
          
          // 🎯 저장된 뷰포트가 있으면 복원 (관계 선택 해제 시)
          if (savedViewportRef.current) {
            const viewportManager = engine.getViewportManager();
            // panTo로 위치 이동 후 zoomTo로 줌 복원
            const centerX = (viewportManager.getViewport().bounds.width / 2 - savedViewportRef.current.pan.x) / savedViewportRef.current.zoom;
            const centerY = (viewportManager.getViewport().bounds.height / 2 - savedViewportRef.current.pan.y) / savedViewportRef.current.zoom;
            viewportManager.panTo({ x: centerX, y: centerY }, false);
            viewportManager.zoomTo(savedViewportRef.current.zoom, true);
            savedViewportRef.current = null;
          }

          // isSelected 업데이트하고 재렌더링
          tablesRef.current = tablesRef.current.map(table => ({
            ...table,
            isSelected: table.id === mouseDownTableId,
          }));
          safeRender();
        } else if (!hasMoved && mouseDownRelationshipId) {
          // 관계선 클릭 - 관계선 선택 (특별한 ID 형식 사용)
          setSelectedEntityId(`rel:${mouseDownRelationshipId}`);
          setHighlightedRelationshipId(mouseDownRelationshipId); // 사이드바와 동기화

          // 선택된 관계선 찾기
          const selectedRel: any = relationshipsRef.current.find((rel: any) => rel.id === mouseDownRelationshipId);

          // 관계와 연결된 테이블들만 하이라이트
          if (selectedRel) {
            // 🎯 현재 뷰포트 저장 (복원용)
            const viewportManager = engine.getViewportManager();
            const currentViewport = viewportManager.getViewport();
            if (!savedViewportRef.current) {
              savedViewportRef.current = {
                zoom: currentViewport.zoom,
                pan: { x: currentViewport.pan.x, y: currentViewport.pan.y }
              };
            }

            const fromTable = tablesRef.current.find(t => matchesTableName(t, selectedRel.fromTable));
            const toTable = tablesRef.current.find(t => matchesTableName(t, selectedRel.toTable));
            
            tablesRef.current = tablesRef.current.map(table => ({
              ...table,
              isSelected: matchesTableName(table, selectedRel.fromTable) || matchesTableName(table, selectedRel.toTable),
            }));

            recalculateRelationships({ selectedId: mouseDownRelationshipId, highlightedId: mouseDownRelationshipId });

            if (fromTable && toTable) {
              viewportManager.fitToRect(getCombinedTableBounds(fromTable, toTable), 120, true);
            }
          } else {
            // 관계를 찾지 못한 경우 모든 테이블 선택 해제
            tablesRef.current = tablesRef.current.map(table => ({
              ...table,
              isSelected: false,
            }));
          }
          safeRender();
        } else if (!hasMoved && !mouseDownTableId && !mouseDownRelationshipId) {
          // 배경 클릭 - 선택 해제
          setSelectedEntityId(null);
          setHighlightedRelationshipId(null); // 관계 하이라이트도 초기화
          
          // 🎯 저장된 뷰포트가 있으면 복원
          if (savedViewportRef.current) {
            const viewportManager = engine.getViewportManager();
            // panTo로 위치 이동 후 zoomTo로 줌 복원
            const centerX = (viewportManager.getViewport().bounds.width / 2 - savedViewportRef.current.pan.x) / savedViewportRef.current.zoom;
            const centerY = (viewportManager.getViewport().bounds.height / 2 - savedViewportRef.current.pan.y) / savedViewportRef.current.zoom;
            viewportManager.panTo({ x: centerX, y: centerY }, false);
            viewportManager.zoomTo(savedViewportRef.current.zoom, true);
            savedViewportRef.current = null;
          }

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
        // console.log('🔄 Mouse left canvas - cleaning up drag state only');

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

      // 더블클릭으로 테이블 이름 변경
      const handleDoubleClick = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // 월드 좌표로 변환
        const viewport = engine.getViewportManager().getViewport();
        const worldX = (canvasX - viewport.pan.x) / viewport.zoom;
        const worldY = (canvasY - viewport.pan.y) / viewport.zoom;

        // 테이블 찾기
        const clickedTable = tablesRef.current.find(table => {
          return (
            worldX >= table.bounds.x &&
            worldX <= table.bounds.x + table.bounds.width &&
            worldY >= table.bounds.y &&
            worldY <= table.bounds.y + table.bounds.height
          );
        });

        if (clickedTable && onTableDoubleClick) {
          onTableDoubleClick(clickedTable.name);
          e.preventDefault();
        }
      };

      canvas.addEventListener('wheel', handleWheel, { passive: false });
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mouseleave', handleMouseLeave);
      canvas.addEventListener('dblclick', handleDoubleClick);

      setIsReady(true);

      return () => {
        canvas.removeEventListener('wheel', handleWheel);
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
        canvas.removeEventListener('dblclick', handleDoubleClick);
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

  // 🚀 스키마 변경 시 데이터 업데이트 (청크 기반 최적화)
  useEffect(() => {
    if (!schema || !isReady || !engineRef.current) return;

    const tableCount = schema.tables?.length || 0;
    console.log('📊 [OPTIMIZED] 스키마 업데이트:', {
      tables: tableCount,
      relationships: schema.relationships?.length || 0,
    });

    // 이전 처리 중단
    if (processingAbortRef.current) {
      processingAbortRef.current();
      processingAbortRef.current = null;
    }

    try {
      // 원본 스키마 저장
      schemaRef.current = schema;

      // 연결된 컬럼 정보 수집
      const connectedColumns = new Map<string, Set<string>>(); // tableName -> Set<columnName>
      // 🔗 Ref로 연결된 FK 컬럼 추적 (fromColumn은 논리적 FK) + 참조 테이블 정보
      const fkColumnRefs = new Map<string, Map<string, string>>(); // tableName -> Map<columnName, refTableName>
      
      (schema.relationships || []).forEach((rel: any) => {
        if (!connectedColumns.has(rel.fromTable)) {
          connectedColumns.set(rel.fromTable, new Set());
        }
        if (!connectedColumns.has(rel.toTable)) {
          connectedColumns.set(rel.toTable, new Set());
        }
        connectedColumns.get(rel.fromTable)?.add(rel.fromColumn);
        connectedColumns.get(rel.toTable)?.add(rel.toColumn);
        
        // Ref의 fromColumn은 논리적 FK로 표시 + 참조 테이블 저장
        if (!fkColumnRefs.has(rel.fromTable)) {
          fkColumnRefs.set(rel.fromTable, new Map());
        }
        fkColumnRefs.get(rel.fromTable)?.set(rel.fromColumn, rel.toTable);
      });

      // 🚀 텍스트 너비를 측정하는 헬퍼 함수 (캐싱 최적화)
      const measureTextWidth = (text: string, fontSize: number, fontFamily: string, fontWeight: string = 'normal'): number => {
        if (!canvasRef.current) return text.length * 8; // fallback

        // 캐시 키 생성
        const cacheKey = `${text}-${fontSize}-${fontFamily}-${fontWeight}`;

        // 캐시 확인
        const cached = textWidthCacheRef.current.get(cacheKey);
        if (cached !== undefined) {
          return cached; // ✅ 캐시 히트 (80-90% 성능 향상)
        }

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return text.length * 8;

        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        const width = ctx.measureText(text).width;

        // 캐시에 저장 (최대 1000개까지만 저장해서 메모리 관리)
        if (textWidthCacheRef.current.size < 1000) {
          textWidthCacheRef.current.set(cacheKey, width);
        }

        return width;
      };

      // 스키마별 색상 할당
      const schemaColors = new Map<string, string>();
      const colorPalette = [
        '#3b82f6', // blue
        '#10b981', // green (emerald)
        '#f59e0b', // amber
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#14b8a6', // teal
        '#f97316', // orange
        '#6366f1', // indigo
        '#ef4444', // red
        '#84cc16', // lime
        '#06b6d4', // cyan
        '#a855f7', // purple
        '#22c55e', // green
        '#eab308', // yellow
        '#0ea5e9', // sky
        '#d946ef', // fuchsia
        '#64748b', // slate
        '#78716c', // stone
        '#f43f5e', // rose
        '#0d9488', // teal darker
      ];
      
      let colorIndex = 0;
      (schema.tables || []).forEach((table: any) => {
        if (!table.name) return;
        // Use table.schema if available, otherwise try to extract from name
        const schemaName = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : undefined);
        if (schemaName && !schemaColors.has(schemaName)) {
          const color = colorPalette[colorIndex % colorPalette.length];
          if (color) {
            schemaColors.set(schemaName, color);
            colorIndex++;
          }
        }
      });

      // 🚀 청크 기반 테이블 데이터 생성 (대량 테이블 최적화)
      const processTablesInChunks = async () => {
        const allTables = schema.tables || [];
        const CHUNK_SIZE = 20; // 한 번에 20개씩 처리
        const totalChunks = Math.ceil(allTables.length / CHUNK_SIZE);

        setIsProcessing(true);

        let aborted = false;
        processingAbortRef.current = () => { aborted = true; };

        // 🎯 스키마별 테이블 그룹핑 및 초기 위치 계산
        const tablesBySchema = new Map<string, any[]>();
        const noSchemaKey = '__no_schema__';
        
        allTables.forEach((table: any) => {
          const schemaName = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : undefined);
          const key = schemaName || noSchemaKey;
          if (!tablesBySchema.has(key)) {
            tablesBySchema.set(key, []);
          }
          tablesBySchema.get(key)!.push(table);
        });

        // 각 테이블의 예상 크기 계산 (실제 렌더링 크기와 일치하도록)
        const getTableDimensions = (table: any) => {
          const columnCount = table.columns?.length || 0;
          // 실제 렌더링: headerHeight(32) + rowHeight(24) * columnCount + padding(12)
          const height = 32 + (columnCount * 24) + 12;
          
          // 테이블명 길이 기반 동적 너비
          const tableSchema = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : undefined);
          const tName = table.name.includes('.') ? table.name.split('.')[1] : table.name;
          const fullName = tableSchema ? `${tableSchema}.${tName}` : tName;
          
          // 대략적인 텍스트 너비 계산 (캔버스 없이)
          // 실제 렌더링: maxColumnWidth + padding * 2 + 50, padding = 12
          const estimatedNameWidth = fullName.length * 9; // 평균 문자 너비
          const maxColWidth = Math.max(...(table.columns || []).map((c: any) => 
            (`${c.name} ${typeof c.type === 'string' ? c.type : c.type?.name || ''}`).length * 8
          ), 0);
          
          // 실제 렌더링 공식과 유사하게: max(200, maxWidth + 24 + 50)
          const width = Math.max(200, Math.max(estimatedNameWidth, maxColWidth) + 74);
          return { width, height };
        };

        // 스키마별로 테이블 위치 미리 계산 (저장된 위치 없는 것만)
        // 🎯 가로로 넓게 펼치는 그리드 레이아웃
        const precomputedPositions = new Map<string, { x: number; y: number }>();
        const TABLE_GAP_X = 100; // 테이블 간 가로 여백 (넉넉하게)
        const TABLE_GAP_Y = 80; // 테이블 간 세로 여백 (넉넉하게)
        const START_X = 50;
        const START_Y = 50;
        const MAX_ROW_WIDTH = 3500; // 최대 행 너비 (이후 줄바꿈)

        // 모든 테이블을 하나의 그리드로 배치 (스키마별 세로 구분 제거)
        // 대신 스키마 순서대로 정렬하여 같은 스키마 테이블이 근처에 배치되도록
        const sortedTables: any[] = [];
        const schemaKeys = Array.from(tablesBySchema.keys()).sort((a, b) => {
          if (a === noSchemaKey) return 1;
          if (b === noSchemaKey) return -1;
          return a.localeCompare(b);
        });

        for (const schemaKey of schemaKeys) {
          const tables = tablesBySchema.get(schemaKey) || [];
          sortedTables.push(...tables);
        }

        let currentX = START_X;
        let currentY = START_Y;
        let rowMaxHeight = 0;

        // 저장된 위치가 없는 테이블만 필터링하여 배치
        const tablesToLayout = sortedTables.filter((table: any) => {
          const tableName = table.name;
          return !initialTablePositions?.[tableName];
        });

        for (const table of tablesToLayout) {
          const tableName = table.name;
          const { width, height } = getTableDimensions(table);

          // 새 행 시작 조건: 최대 행 너비 초과 시
          if (currentX + width > MAX_ROW_WIDTH && currentX > START_X) {
            currentY += rowMaxHeight + TABLE_GAP_Y;
            currentX = START_X;
            rowMaxHeight = 0;
          }

          precomputedPositions.set(tableName, { x: currentX, y: currentY });
          
          currentX += width + TABLE_GAP_X;
          rowMaxHeight = Math.max(rowMaxHeight, height);
        }


        const allProcessedTables: TableRenderData[] = [];

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          if (aborted) {
            break;
          }

          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, allTables.length);
          const chunk = allTables.slice(start, end);


          // 청크 처리를 비동기로 (브라우저에 제어권 반환)
          await new Promise(resolve => setTimeout(resolve, 0));

          const processedChunk: TableRenderData[] = chunk.map((table: any, localIndex: number) => {
            const index = start + localIndex;
        // 저장된 위치가 있으면 사용, 없으면 미리 계산된 위치 사용
        const savedPosition = initialTablePositions?.[table.name];
        const precomputedPosition = precomputedPositions.get(table.name);
        
        // 위치 결정: 저장된 위치 > 미리 계산된 위치 > 폴백
        const defaultX = precomputedPosition?.x ?? (50 + (index % 4) * 320);
        const defaultY = precomputedPosition?.y ?? (50 + Math.floor(index / 4) * 200);

        if (savedPosition) {
        }

        // Parse schema.table notation first (needed for width calculation)
        const tableSchema = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : undefined);
        const tableName = table.name.includes('.') ? table.name.split('.')[1] : table.name;
        const fullTableName = tableSchema ? `${tableSchema}.${tableName}` : tableName;

        // 동적 너비 계산
        const fontSize = 14;
        const fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';
        const padding = 12;
        
        // 테이블 이름 너비 (bold) - 전체 이름(스키마.테이블) 사용
        const tableNameWidth = measureTextWidth(fullTableName, fontSize, fontFamily, 'bold');
        
        // 테이블 코멘트가 있으면 헤더에 표시되므로 헤더 너비 계산에 포함
        const noteText = table.note ? ` ${table.note}` : '';
        const headerWidth = measureTextWidth(fullTableName + noteText, fontSize - 1, fontFamily);
        
        // 모든 컬럼의 최대 너비 계산
        let maxColumnWidth = Math.max(tableNameWidth, headerWidth);
        (table.columns || []).forEach((column: any) => {
          // 컬럼명 + 타입 문자열 + 아이콘/note 공간
          const columnText = `${column.name} ${column.type || ''}`;
          const columnWidth = measureTextWidth(columnText, fontSize, fontFamily);
          maxColumnWidth = Math.max(maxColumnWidth, columnWidth);
        });
        
        // 패딩과 아이콘 공간 추가 (좌우 패딩 + 아이콘 영역)
        const calculatedWidth = Math.max(200, maxColumnWidth + padding * 2 + 50);
        const schemaColor = tableSchema ? schemaColors.get(tableSchema) : undefined;
        
        return {
          id: fullTableName, // Use full name with schema for relationship matching
          name: fullTableName,
          schema: tableSchema,
          displayName: fullTableName, // Full name with schema
          note: table.note,
          bounds: {
            x: savedPosition?.x ?? defaultX,
            y: savedPosition?.y ?? defaultY,
            width: calculatedWidth,
            // headerHeight(32) + rowHeight(24) * columnCount + bottomPadding(12)
            height: 32 + ((table.columns?.length || 0) * 24) + 12,
          },
          columns: (table.columns || []).map((column: any) => {
            const isConnected = connectedColumns.get(table.name)?.has(column.name) || false;
            // FK 판단: 1) column 자체 FK 속성 2) Ref로 연결된 fromColumn (논리적 FK)
            const refTable = fkColumnRefs.get(table.name)?.get(column.name) || 
                             fkColumnRefs.get(fullTableName)?.get(column.name);
            const isRefFk = !!refTable;
            
            // FK가 참조하는 테이블의 스키마 컬러 찾기
            let fkRefColor: string | undefined;
            if (isRefFk && refTable) {
              const refSchema = refTable.includes('.') ? refTable.split('.')[0] : undefined;
              fkRefColor = refSchema ? schemaColors.get(refSchema) : undefined;
            }
            
            return {
              id: column.name,
              name: column.name,
              type: column.type || 'string',
              note: column.note,
              isPrimaryKey: column.isPrimaryKey || column.primaryKey || false,
              isForeignKey: column.isForeignKey || column.foreignKey || isRefFk,
              fkRefColor: fkRefColor, // 참조 테이블의 스키마 컬러
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

          // 청크 처리 결과 누적
          allProcessedTables.push(...processedChunk);

          // 중간 렌더링 (진행 상황 표시)
          tablesRef.current = allProcessedTables;

          // 🔄 관계선도 중간 업데이트 (Hook 사용)
          recalculateRelationships();

          // 중간 렌더링 수행
          safeRender();

        }

        return allProcessedTables;
      };

      // 청크 기반 처리 시작
      processTablesInChunks().then(tables => {
        if (!tables || tables.length === 0) {
          setIsProcessing(false);
          return;
        }


        // 최종 렌더링
        safeRender();

        // 🚀 zoomToFit - 모든 데이터 처리 완료 후 실행 (타이밍 최적화)
        if (!hasZoomedToFitRef.current) {
          // 약간의 딜레이를 두어 마지막 렌더링이 완료되도록 보장
          setTimeout(() => {
            if (engineRef.current) {
              engineRef.current.zoomToFit(50);
              hasZoomedToFitRef.current = true;
              // console.log('🎯 zoomToFit executed after all processing');
            }
          }, 50);
        }

        setIsProcessing(false);
        processingAbortRef.current = null;
      }).catch(error => {
        console.error('❌ [OPTIMIZED] 청크 처리 실패:', error);
        setIsProcessing(false);
        processingAbortRef.current = null;
      });
    } catch (error) {
      console.error('❌ [NEW] 데이터 업데이트 실패:', error);
    }
  }, [schema, isReady, safeRender]);

  // 테마 변경 시에만 스타일 업데이트 및 렌더링 (줌 상태 유지)
  useEffect(() => {
    if (isReady && engineRef.current && tablesRef.current.length > 0) {

      // 모든 테이블의 스타일 업데이트 (schemaColor 유지)
      tablesRef.current = tablesRef.current.map(table => {
        const schemaColor = table.style.schemaColor;
        
        const baseStyle = theme === 'dark' ? {
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
          fontWeight: 'normal' as const,
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
          fontWeight: 'normal' as const,
          selectedRowColor: '#dbeafe',
          hoveredRowColor: '#f3f4f6',
          connectedRowColor: '#eff6ff',
          connectedBorderColor: '#3b82f6',
          iconSize: 16,
          iconSpacing: 8,
          shadowColor: '#00000020',
          shadowBlur: 4,
          schemaColor: schemaColor,
        };
        
        return {
          ...table,
          style: baseStyle,
        };
      });

      // 렌더링
      safeRender();
    }
  }, [theme, isReady, safeRender]);

  // showGrid 변경 시 엔진에 전달
  useEffect(() => {
    if (isReady && engineRef.current) {
      engineRef.current.setShowGrid(showGrid);
    }
  }, [showGrid, isReady]);

  // selectedEntityId 변경 시 isSelected 업데이트
  useEffect(() => {
    if (!isReady || !engineRef.current || tablesRef.current.length === 0) return;


    // 관계선 선택인지 테이블 선택인지 구분
    const isRelationshipSelection = selectedEntityId?.startsWith('rel:');
    const relationshipId = isRelationshipSelection && selectedEntityId ? selectedEntityId.replace('rel:', '') : null;

    if (isRelationshipSelection && relationshipId) {
      // 관계선 선택: 해당 관계선의 fromTable과 toTable 모두 하이라이트
      const selectedRel = relationshipsRef.current.find((r: any) => r.id === relationshipId) as any;

      if (selectedRel && selectedRel.fromTable && selectedRel.toTable) {
        const fromTable = tablesRef.current.find((table) => matchesTableName(table, selectedRel.fromTable));
        const toTable = tablesRef.current.find((table) => matchesTableName(table, selectedRel.toTable));

        // 연결된 테이블들 하이라이트
        tablesRef.current = tablesRef.current.map(table => ({
          ...table,
          isSelected: matchesTableName(table, selectedRel.fromTable) || matchesTableName(table, selectedRel.toTable),
        }));

        // 선택된 관계선만 하이라이트
        relationshipsRef.current = relationshipsRef.current.map((rel: any) => ({
          ...rel,
          isSelected: rel.id === relationshipId,
        }));

        if (fromTable && toTable && engineRef.current) {
          const viewportManager = engineRef.current.getViewportManager();
          if (!savedViewportRef.current) {
            const currentViewport = viewportManager.getViewport();
            savedViewportRef.current = {
              zoom: currentViewport.zoom,
              pan: { x: currentViewport.pan.x, y: currentViewport.pan.y },
            };
          }
          viewportManager.fitToRect(getCombinedTableBounds(fromTable, toTable), 120, true);
        }
      }
    } else {
      // 테이블 선택: 기존 로직
      tablesRef.current = tablesRef.current.map(table => ({
        ...table,
        isSelected: selectedEntityId ? matchesTableName(table, selectedEntityId) : false,
      }));

      // 선택된 테이블과 연결된 관계선 하이라이트
      relationshipsRef.current = relationshipsRef.current.map((rel: any) => ({
        ...rel,
        isSelected: selectedEntityId ?
          (
            matchesRelationshipTableName(rel.fromTable, selectedEntityId) ||
            matchesRelationshipTableName(rel.toTable, selectedEntityId)
          ) :
          false,
      }));

      // 🎯 선택된 테이블로 화면 이동 (pan to table)
      if (selectedEntityId && engineRef.current) {
        // DiagramEngine의 panToTable 메서드 사용
        engineRef.current.panToTable(selectedEntityId, true);
      }
    }

    safeRender();
  }, [selectedEntityId, isReady, safeRender]);

  // highlightedRelationshipId 변경 시 관련 없는 테이블 dim 처리 및 뷰포트 이동
  useEffect(() => {
    if (!isReady || !engineRef.current || tablesRef.current.length === 0) return;


    if (highlightedRelationshipId) {
      // 하이라이트된 관계선 찾기
      const highlightedRel: any = relationshipsRef.current.find((r: any) => r.id === highlightedRelationshipId);

      if (highlightedRel) {
        const fromTable = tablesRef.current.find(t => matchesTableName(t, highlightedRel.fromTable));
        const toTable = tablesRef.current.find(t => matchesTableName(t, highlightedRel.toTable));

        const viewportManager = engineRef.current.getViewportManager();
        if (!savedViewportRef.current && !selectedEntityId?.startsWith('rel:')) {
          const currentViewport = viewportManager.getViewport();
          savedViewportRef.current = {
            zoom: currentViewport.zoom,
            pan: { x: currentViewport.pan.x, y: currentViewport.pan.y }
          };
        }
        // 다른 테이블들은 dim 처리 (geometry는 유지)
        tablesRef.current = tablesRef.current.map(table => ({
          ...table,
          // @ts-ignore - opacity used by renderer
          opacity:
            matchesTableName(table, highlightedRel.fromTable) || matchesTableName(table, highlightedRel.toTable)
              ? 1.0
              : 0.3,
        }));

        recalculateRelationships({ highlightedId: highlightedRelationshipId });

        relationshipsRef.current = relationshipsRef.current.map((rel: any) => ({
          ...rel,
          // @ts-ignore - opacity used by renderer
          opacity: rel.id === highlightedRelationshipId ? 1.0 : 0.15,
        }));

        if (fromTable && toTable) {
          viewportManager.fitToRect(getCombinedTableBounds(fromTable, toTable), 120, true);
        }
      }
    } else {
      // 하이라이트 해제: 모든 테이블 opacity 복원

      // 🎯 저장된 뷰포트가 있으면 복원
      if (savedViewportRef.current && engineRef.current && !selectedEntityId?.startsWith('rel:')) {
        const viewportManager = engineRef.current.getViewportManager();
        const centerX = (viewportManager.getViewport().bounds.width / 2 - savedViewportRef.current.pan.x) / savedViewportRef.current.zoom;
        const centerY = (viewportManager.getViewport().bounds.height / 2 - savedViewportRef.current.pan.y) / savedViewportRef.current.zoom;
        viewportManager.panTo({ x: centerX, y: centerY }, false);
        viewportManager.zoomTo(savedViewportRef.current.zoom, true);
        savedViewportRef.current = null;
      }
      
      tablesRef.current = tablesRef.current.map(table => ({
        ...table,
        // @ts-ignore - Removing opacity property
        opacity: 1.0,
      }));

      // 모든 관계선 선택 해제 및 opacity 복원
      relationshipsRef.current = relationshipsRef.current.map((rel: any) => ({
        ...rel,
        isSelected:
          selectedEntityId?.startsWith('rel:')
            ? rel.id === selectedEntityId.replace('rel:', '')
            : selectedEntityId
              ? (
                  matchesRelationshipTableName(rel.fromTable, selectedEntityId) ||
                  matchesRelationshipTableName(rel.toTable, selectedEntityId)
                )
              : false,
        // @ts-ignore - Restoring opacity
        opacity: 1.0,
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
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75">
          <div className="text-center">
            <div className="text-gray-400 text-lg mb-2">🔄 Loading diagram engine...</div>
          </div>
        </div>
      )}

      {/* 🚀 청크 처리 진행 중 표시 */}
      {isProcessing && (
        <div className="absolute top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          <span className="text-sm font-medium">Processing tables...</span>
        </div>
      )}

      {/* 🚨 파싱 에러 표시 */}
      {parseError && isReady && !isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center max-w-md">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
              <div className="text-red-600 dark:text-red-400 text-lg font-semibold mb-2">
                ❌ DBML Parsing Error
              </div>
              <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                Failed to parse the DBML code. Please check the syntax:
              </p>
              <div className="bg-white dark:bg-gray-800 rounded p-3 text-left">
                <code className="text-xs text-red-800 dark:text-red-200 break-words whitespace-pre-wrap">
                  {parseError}
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📊 빈 스키마 표시 (에러가 없을 때만) */}
      {!parseError && isReady && !isProcessing && (!schema || !schema.tables || schema.tables.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <div className="text-lg mb-2">📊 No tables to display</div>
            <p className="text-sm">Add some DBML code to see your diagram</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default DiagramCanvas;
;
