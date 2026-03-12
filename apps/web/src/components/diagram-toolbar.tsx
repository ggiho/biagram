'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid,
  Move,
  MousePointer,
  RotateCcw,
  RotateCw,
  Home,
  Moon,
  Sun,
  MessageSquare,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useDiagramEngine } from '@/contexts/diagram-context';
import { useTheme } from '@/contexts/theme-context';

export function DiagramToolbar() {
  const [currentZoom, setCurrentZoom] = useState(100);
  const [mounted, setMounted] = useState(false);
  const {
    engine,
    selectedTool,
    setSelectedTool,
    showGrid,
    setShowGrid,
    showComments,
    setShowComments,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
  } = useDiagramEngine();
  const { theme, toggleTheme } = useTheme();

  // Prevent hydration mismatch for theme icon
  useEffect(() => {
    setMounted(true);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    if (!engine) return;

    try {
      console.log('🔍 Zoom In clicked');
      const viewportManager = engine.getViewportManager();
      const currentViewport = viewportManager.getViewport();
      const newZoom = Math.min(currentViewport.zoom * 1.2, 5.0);
      viewportManager.zoomTo(newZoom, true);
    } catch (error) {
      console.error('❌ Zoom in error:', error);
    }
  }, [engine]);

  const handleZoomOut = useCallback(() => {
    if (!engine) return;

    try {
      console.log('🔍 Zoom Out clicked');
      const viewportManager = engine.getViewportManager();
      const currentViewport = viewportManager.getViewport();
      const newZoom = Math.max(currentViewport.zoom * 0.8, 0.1);
      viewportManager.zoomTo(newZoom, true);
    } catch (error) {
      console.error('❌ Zoom out error:', error);
    }
  }, [engine]);

  const handleZoomToFit = useCallback(() => {
    if (!engine) return;

    try {
      console.log('🔍 Zoom to Fit clicked');
      engine.zoomToFit(50);
    } catch (error) {
      console.error('❌ Zoom to fit error:', error);
    }
  }, [engine]);

  const handleResetView = useCallback(() => {
    if (!engine) return;

    try {
      console.log('🔍 Reset View clicked');
      const viewportManager = engine.getViewportManager();
      viewportManager.reset(true);
    } catch (error) {
      console.error('❌ Reset view error:', error);
    }
  }, [engine]);

  // Update zoom display when viewport changes
  useEffect(() => {
    if (!engine) return;

    const viewportManager = engine.getViewportManager();
    const updateZoom = (viewport: any) => {
      setCurrentZoom(Math.round(viewport.zoom * 100));
    };

    viewportManager.onViewportChanged(updateZoom);

    // Initial zoom value
    const initialViewport = viewportManager.getViewport();
    setCurrentZoom(Math.round(initialViewport.zoom * 100));
  }, [engine]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Input/Textarea 등 입력 요소에 포커스가 있으면 단축키 무시
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute('contenteditable') === 'true';

      if (isInputFocused) {
        return;
      }

      // Zoom shortcuts: Cmd/Ctrl + Plus/Minus
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        handleZoomIn();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        handleZoomOut();
      } else if (e.shiftKey && e.key === '!') {
        // Shift+1 for zoom to fit
        e.preventDefault();
        handleZoomToFit();
      } else if (e.shiftKey && e.key === ')') {
        // Shift+0 for reset view
        e.preventDefault();
        handleResetView();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleZoomIn, handleZoomOut, handleZoomToFit, handleResetView]);

  const handleUndo = useCallback(() => {
    if (onUndo) {
      onUndo();
    } else {
      console.log('Undo handler not available');
    }
  }, [onUndo]);

  const handleRedo = useCallback(() => {
    if (onRedo) {
      onRedo();
    } else {
      console.log('Redo handler not available');
    }
  }, [onRedo]);

  return (
    <div className="flex h-14 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {/* Tool Selection - Commented out: clicking canvas already pans, dragging objects moves them */}
        {/* <div className="flex rounded-md border">
          <Button
            variant={selectedTool === 'select' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool('select')}
            className="rounded-r-none"
            aria-label="Select tool"
            title="Select tool - Click to select and interact with diagram elements"
          >
            <MousePointer className="h-4 w-4" />
          </Button>
          <Button
            variant={selectedTool === 'move' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool('move')}
            className="rounded-l-none"
            aria-label="Move tool"
            title="Move tool - Click and drag to pan the diagram"
          >
            <Move className="h-4 w-4" />
          </Button>
        </div> */}

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-card/80 px-2 py-1 shadow-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            aria-label="Zoom out"
            title="Zoom out - Decrease diagram zoom level"
            className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span
            className="min-w-[3.75rem] text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
            aria-label={`Current zoom level: ${currentZoom}%`}
          >
            {currentZoom}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            aria-label="Zoom in"
            title="Zoom in - Increase diagram zoom level"
            className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomToFit}
            aria-label="Zoom to fit"
            title="Zoom to fit - Auto-adjust zoom to fit all diagram elements (Shift+1)"
            className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <Maximize className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetView}
            aria-label="Reset view"
            title="Reset view - Return to default zoom and position (Shift+0)"
            className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Undo/Redo */}
        <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-card/80 px-2 py-1 shadow-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo - Undo the last action (Cmd/Ctrl+Z)"
            className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo - Redo the last undone action (Cmd/Ctrl+Shift+Z)"
            className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Grid Toggle */}
        <Button
          variant={showGrid ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setShowGrid(!showGrid)}
          aria-label={showGrid ? 'Hide grid' : 'Show grid'}
          title={showGrid ? 'Hide grid' : 'Show grid'}
          className="h-9 rounded-2xl px-3 shadow-sm"
        >
          <Grid className="h-4 w-4" />
        </Button>

        {/* Comments Toggle */}
        <Button
          variant={showComments ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setShowComments(!showComments)}
          aria-label={showComments ? 'Hide comments' : 'Show comments'}
          title={showComments ? 'Hide comments' : 'Show comments'}
          className="h-9 rounded-2xl px-3 shadow-sm"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          aria-label={
            mounted && theme === 'dark'
              ? 'Switch to light mode'
              : 'Switch to dark mode'
          }
          title={
            mounted && theme === 'dark'
              ? 'Switch to light mode'
              : 'Switch to dark mode'
          }
          className="h-9 w-9 rounded-2xl border border-border/70 bg-card/80 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground"
        >
          {mounted ? (
            theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )
          ) : (
            <div className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
