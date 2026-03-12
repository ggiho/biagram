'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  Save,
  Settings,
  Share,
  Upload,
  FileText,
  ChevronLeft,
  ChevronRight,
  Database,
  ChevronDown,
  FileDown,
  FileUp,
  Image as ImageIcon,
  FileCode,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CodeMirrorEditor,
  type CodeMirrorEditorRef,
} from '@/components/codemirror-editor';
// Keep old editor as fallback
// import { CodeEditor, type CodeEditorRef } from '@/components/code-editor';
import DiagramCanvas from '@/components/diagram-canvas';
import { DiagramToolbar } from '@/components/diagram-toolbar';
import { DiagramSidebar } from '@/components/diagram-sidebar';
import { DDLImportDialog } from '@/components/ddl-import-dialog';
import { DBImportDialog } from '@/components/db-import-dialog';
import { ExportDialog } from '@/components/export-dialog';
import { DiagramProvider, useDiagramEngine } from '@/contexts/diagram-context';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/hooks/use-toast';
import { saveDraft, loadDraft } from '@/lib/storage';
import { TableRenameDialog } from '@/components/table-rename-dialog';

const SAMPLE_DBML = `// Sample database schema
Table users {
  id integer [primary key, note: '사용자 고유 ID']
  username varchar [note: '사용자 이름']
  role varchar [note: '사용자 역할']
  created_at timestamp
  
  Note: '사용자 정보를 저장하는 테이블'
}

Table posts {
  id integer [primary key]
  title varchar [note: '포스트 제목']
  body text [note: '포스트 본문 내용']
  user_id integer
  status varchar
  created_at timestamp
  
  Note: '블로그 포스트 정보'
}

Table follows {
  following_user_id integer [note: '팔로우하는 사용자']
  followed_user_id integer [note: '팔로우되는 사용자']
  created_at timestamp

  indexes {
    (following_user_id, followed_user_id) [pk] // composite primary key
  }
  
  Note: '사용자 간 팔로우 관계 정보'
}

Ref: user_posts: posts.user_id > users.id // many-to-one
Ref: user_following: follows.following_user_id > users.id // many-to-one
Ref: user_followed: follows.followed_user_id > users.id // many-to-one
`;

// Use any type to match DiagramCanvas expectations
type ParsedSchema = any;

function DiagramEditorContent() {
  const [code, setCode] = useState(SAMPLE_DBML);
  const [parsedSchema, setParsedSchema] = useState<ParsedSchema | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [tableToRename, setTableToRename] = useState<string | null>(null);
  const [vimMode, setVimMode] = useState(false);
  const parseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isParsingRef = useRef(false);
  const codeEditorRef = useRef<CodeMirrorEditorRef>(null);

  // Undo/Redo history
  const [history, setHistory] = useState<string[]>([SAMPLE_DBML]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false);

  // Table positions for caching
  const [tablePositions, setTablePositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const { toast } = useToast();
  const parseDBML = trpc.diagrams.parseDBML.useMutation();
  const parseDBMLMutateAsync = parseDBML.mutateAsync;
  const {
    engine,
    selectedEntityId,
    setSelectedEntityId,
    setHighlightedRelationshipId,
  } = useDiagramEngine();

  // 테이블 이름 변경 핸들러
  const handleTableDoubleClick = useCallback((tableName: string) => {
    setTableToRename(tableName);
    setRenameDialogOpen(true);
  }, []);

  const handleTableRename = useCallback(
    (newCode: string, newTableName: string) => {
      setCode(newCode);
      toast({
        title: '✅ Table Renamed',
        description: `Successfully renamed to ${newTableName}`,
      });
    },
    [toast]
  );

  const handleCodeChange = useCallback(
    (value: string) => {
      setCode(value);

      // Add to history if not from undo/redo
      if (!isUndoRedoRef.current) {
        setHistory(prev => {
          // Remove any future history if we're not at the end
          const newHistory = prev.slice(0, historyIndex + 1);
          // Add new state
          newHistory.push(value);
          // Limit history to 50 states
          if (newHistory.length > 50) {
            newHistory.shift();
            setHistoryIndex(prev => prev); // Keep index the same since we shifted
            return newHistory;
          }
          setHistoryIndex(newHistory.length - 1);
          return newHistory;
        });
      }
      isUndoRedoRef.current = false;
    },
    [historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoRef.current = true;
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const prevCode = history[newIndex];
      if (prevCode !== undefined) {
        setCode(prevCode);
      }
    }
  }, [historyIndex, history]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoRef.current = true;
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const nextCode = history[newIndex];
      if (nextCode !== undefined) {
        setCode(nextCode);
      }
    }
  }, [historyIndex, history]);

  // Draft restoration on component mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setCode(draft.code);
      setHistory(draft.history);
      setHistoryIndex(draft.historyIndex);
      if (draft.tablePositions) {
        setTablePositions(draft.tablePositions);
      }

      // Show user feedback
      toast({
        title: 'Draft Restored',
        description: 'Your previous work has been restored from cache',
      });
    }
  }, [toast]); // Run only once on mount

  // Auto-save with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveDraft({
        code,
        history,
        historyIndex,
        tablePositions,
      });
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [code, history, historyIndex, tablePositions]);

  const handleSave = useCallback(async () => {
    // TODO: Implement save functionality
    toast({
      title: 'Save',
      description: 'Save functionality coming soon',
    });
  }, [toast]);

  const handleExport = useCallback(() => {
    setExportDialogOpen(true);
  }, []);

  const handleShare = useCallback(async () => {
    // TODO: Implement share functionality
    toast({
      title: 'Share',
      description: 'Share functionality coming soon',
    });
  }, [toast]);

  const handleImportSuccess = useCallback(
    (dbml: string, mode: 'replace' | 'append') => {
      if (mode === 'append') {
        // Append with separator
        const separator = '\n\n// ===== Imported DDL =====\n';
        setCode(code + separator + dbml);
      } else {
        // Replace
        setCode(dbml);
        // 새 스키마로 교체했으므로 테이블 위치 초기화
        setTablePositions({});
      }

      toast({
        title: 'Import Successful',
        description: `DDL converted to DBML successfully (${mode === 'replace' ? 'Replaced' : 'Appended'})`,
      });
    },
    [code, toast]
  );

  const handleDBImport = useCallback(
    (dbml: string) => {
      setCode(dbml);
      // 새 스키마를 가져왔으므로 테이블 위치 초기화 (새로 레이아웃 계산)
      setTablePositions({});
      toast({
        title: 'Database Imported',
        description: 'Schema successfully imported from database',
      });
    },
    [toast]
  );

  // Track if the last selection change came from code editor
  const lastSelectionFromCodeRef = useRef(false);

  // BIDIRECTIONAL SYNC: Canvas → Code
  // When a table is selected in the canvas, scroll the code editor to that table
  useEffect(() => {
    // Only scroll code editor if selection came from canvas (not from code cursor movement)
    if (
      selectedEntityId &&
      codeEditorRef.current &&
      !lastSelectionFromCodeRef.current
    ) {
      codeEditorRef.current.scrollToTable(selectedEntityId);
    }
    // Reset flag
    lastSelectionFromCodeRef.current = false;
  }, [selectedEntityId]);

  // BIDIRECTIONAL SYNC: Code → Canvas
  // When cursor moves in code editor, select the corresponding table in canvas
  const handleCursorPositionChange = useCallback(
    (line: number, column: number, tableName: string | null) => {
      if (tableName && tableName !== selectedEntityId) {
        lastSelectionFromCodeRef.current = true; // Mark that this selection came from code
        setSelectedEntityId(tableName);
        setHighlightedRelationshipId(null); // 관계 하이라이트 초기화

        // Auto-pan canvas to the selected table
        if (engine) {
          engine.panToTable(tableName, true); // true = with animation
        }
      }
      // Don't deselect or pan when cursor is outside tables - this prevents unwanted jumps
    },
    [
      selectedEntityId,
      setSelectedEntityId,
      setHighlightedRelationshipId,
      engine,
    ]
  );

  // AUTO-PARSE FUNCTIONALITY

  useEffect(() => {
    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current);
    }

    parseTimeoutRef.current = setTimeout(async () => {
      if (parseDBMLMutateAsync && code?.trim() && !isParsingRef.current) {
        isParsingRef.current = true;
        setIsLoading(true);

        try {
          const payload = { content: code.trim() };
          const result = await parseDBMLMutateAsync(payload);

          if (result?.success && result?.schema) {
            setParsedSchema(result.schema);
            setParseError(null);
          } else {
            const errorMsg =
              (result as { error?: string })?.error || 'Failed to parse DBML';
            setParsedSchema(null);
            setParseError(errorMsg);
          }
        } catch (error) {
          console.error('DBML parse error:', error);
          setParsedSchema(null);
          setParseError(
            error instanceof Error ? error.message : 'Unknown parsing error'
          );
        } finally {
          setIsLoading(false);
          isParsingRef.current = false;
        }
      }
    }, 500); // 500ms debounce
  }, [code, parseDBMLMutateAsync]);

  // DB Import state (lifted from DBImportDialog for dropdown integration)
  const [dbImportDialogOpen, setDbImportDialogOpen] = useState(false);
  const tableCount = parsedSchema?.tables?.length || 0;
  const relationshipCount = parsedSchema?.relationships?.length || 0;
  const codeLineCount = code.split('\n').length;
  const isSchemaPending = isLoading && tableCount === 0 && !parseError;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-[radial-gradient(circle_at_top_left,_rgba(79,70,229,0.10),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(37,99,235,0.10),_transparent_24%)] bg-background">
        {/* Header - Improved visual hierarchy */}
        <header className="flex h-16 items-center justify-between border-b border-border/70 bg-background/85 px-5 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            {/* Biagram 로고 - 현재 페이지 */}
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 px-3 py-2 shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-indigo-500 to-violet-500 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20">
                Bi
              </div>
              <div className="leading-tight">
                <h1 className="text-sm font-semibold tracking-tight">
                  Biagram
                </h1>
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  Diagram Workspace
                </p>
              </div>
            </div>

            {/* Table Center Link */}
            <Link
              href="/table-center"
              className="hidden items-center gap-2 rounded-2xl border border-border/70 bg-card/70 px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent/60 hover:text-foreground md:flex"
            >
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-semibold">Table Center</span>
            </Link>

            <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm dark:text-slate-400 xl:flex">
              {isSchemaPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Parsing Schema</span>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span>{codeLineCount} Lines</span>
                </>
              ) : (
                <>
                  <span>{tableCount} Tables</span>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span>{relationshipCount} Links</span>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span>{codeLineCount} Lines</span>
                </>
              )}
            </div>
          </div>

          {/* Actions - Grouped with dropdowns */}
          <div className="flex items-center gap-2">
            {/* Import Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 rounded-2xl border-border/70 bg-card/80 px-3 shadow-sm"
                >
                  <FileUp className="h-4 w-4" />
                  <span className="hidden sm:inline">Import</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Import From</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  DDL File
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDbImportDialogOpen(true)}>
                  <Database className="mr-2 h-4 w-4" />
                  Database Connection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 rounded-2xl border-border/70 bg-card/80 px-3 shadow-sm"
                >
                  <FileDown className="h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Export As</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExport}>
                  <FileCode className="mr-2 h-4 w-4" />
                  DBML / DDL
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport}>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  PNG / SVG Image
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="h-6 w-px bg-border" />

            {/* Primary Actions */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  className="gap-2 rounded-2xl px-3 shadow-lg shadow-primary/20"
                >
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">Save</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save diagram (Ctrl+S)</TooltipContent>
            </Tooltip>

            {/* Share */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShare}
                  className="h-9 w-9 rounded-2xl border border-transparent bg-card/60 text-muted-foreground shadow-sm hover:border-border/70 hover:bg-card/90 hover:text-foreground"
                >
                  <Share className="h-4 w-4" />
                  <span className="sr-only">Share</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Share diagram</TooltipContent>
            </Tooltip>

            {/* Settings */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className={`h-9 w-9 rounded-2xl border shadow-sm ${sidebarOpen ? 'border-primary/15 bg-primary/10 text-primary' : 'border-transparent bg-card/60 text-muted-foreground hover:border-border/70 hover:bg-card/90 hover:text-foreground'}`}
                >
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {sidebarOpen ? 'Hide' : 'Show'} sidebar
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden p-3 pt-2">
          <PanelGroup direction="horizontal">
            {/* Code Editor Panel */}
            {editorOpen && (
              <>
                <Panel defaultSize={25} minSize={15}>
                  <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background/85 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                          Schema Source
                        </p>
                        <h3 className="text-sm font-semibold text-foreground">
                          DBML Code
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="hidden rounded-full border border-border/70 bg-card/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground lg:inline-flex">
                          {codeLineCount} lines
                        </span>
                        <Button
                          variant={vimMode ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setVimMode(!vimMode)}
                          className={`h-8 rounded-xl px-2.5 text-xs shadow-sm ${vimMode ? 'shadow-primary/20' : 'border border-transparent bg-card/60 text-muted-foreground hover:border-border/70 hover:bg-card/90 hover:text-foreground'}`}
                          title={
                            vimMode ? 'Disable Vim Mode' : 'Enable Vim Mode'
                          }
                        >
                          Vim
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditorOpen(false)}
                          className="h-8 w-8 rounded-xl border border-transparent bg-card/60 p-0 text-muted-foreground shadow-sm hover:border-border/70 hover:bg-card/90 hover:text-foreground"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="relative flex-1 bg-background/70">
                      <CodeMirrorEditor
                        ref={codeEditorRef}
                        value={code}
                        onChange={handleCodeChange}
                        onCursorPositionChange={handleCursorPositionChange}
                        language="dbml"
                        vimMode={vimMode}
                      />
                    </div>

                    {/* Status bar with error/success feedback */}
                    <div className="border-t border-border/70 bg-background/70 backdrop-blur-xl">
                      {isLoading ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Parsing DBML...</span>
                        </div>
                      ) : parseError ? (
                        <div className="flex items-start gap-2 px-3 py-2 bg-destructive/10 border-l-2 border-destructive">
                          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-destructive">
                              Parse Error
                            </p>
                            <p
                              className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-destructive/80"
                              title={parseError}
                            >
                              {parseError}
                            </p>
                          </div>
                        </div>
                      ) : parsedSchema && parsedSchema.tables?.length > 0 ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          <span>
                            {parsedSchema.tables.length} table
                            {parsedSchema.tables.length > 1 ? 's' : ''},{' '}
                            {parsedSchema.relationships?.length || 0}{' '}
                            relationship
                            {(parsedSchema.relationships?.length || 0) !== 1
                              ? 's'
                              : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                          <span>Ready to parse</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Panel>

                <PanelResizeHandle className="group relative mx-1 w-2">
                  <div className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 rounded-full bg-border/80 transition-colors group-hover:bg-primary/30" />
                  <div className="absolute left-1/2 top-1/2 h-16 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/80 transition-colors group-hover:bg-primary/40" />
                </PanelResizeHandle>
              </>
            )}

            {/* Code Editor Collapsed Button */}
            {!editorOpen && (
              <div className="mr-3 flex w-14 flex-col items-center rounded-[24px] border border-border/70 bg-background/80 py-4 shadow-sm backdrop-blur-xl">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditorOpen(true)}
                  className="h-9 w-9 rounded-2xl border border-transparent bg-card/60 p-0 text-muted-foreground shadow-sm hover:border-border/70 hover:bg-card/90 hover:text-foreground"
                  title="Show Code Editor"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="mt-4 writing-mode-vertical-rl text-xs text-muted-foreground">
                  DBML Code
                </div>
              </div>
            )}

            {/* Diagram Panel */}
            <Panel
              defaultSize={
                editorOpen ? (sidebarOpen ? 55 : 75) : sidebarOpen ? 80 : 100
              }
              minSize={30}
            >
              <div className="flex h-full flex-col overflow-hidden rounded-[32px] border border-border/70 bg-background/80 shadow-[0_32px_100px_-40px_rgba(15,23,42,0.5)] backdrop-blur-xl">
                <DiagramToolbar />
                <div className="relative flex-1 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent)]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/30 to-transparent" />
                  <DiagramCanvas
                    schema={parsedSchema}
                    parseError={parseError}
                    isLoading={isLoading}
                    className="absolute inset-0 w-full h-full"
                    initialTablePositions={tablePositions}
                    onTablePositionsChange={setTablePositions}
                    onTableDoubleClick={handleTableDoubleClick}
                  />
                </div>
              </div>
            </Panel>

            {/* Sidebar Panel */}
            {sidebarOpen && (
              <>
                <PanelResizeHandle className="group relative mx-1 w-2">
                  <div className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 rounded-full bg-border/80 transition-colors group-hover:bg-primary/30" />
                  <div className="absolute left-1/2 top-1/2 h-16 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/80 transition-colors group-hover:bg-primary/40" />
                </PanelResizeHandle>
                <Panel defaultSize={20} minSize={15} maxSize={30}>
                  <div className="h-full overflow-hidden rounded-[28px] border border-border/70 bg-background/85 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                    <DiagramSidebar
                      schema={parsedSchema}
                      isLoading={isLoading}
                    />
                  </div>
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>

        {/* Import DDL Dialog */}
        <DDLImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImportSuccess={handleImportSuccess}
        />

        {/* Export Dialog */}
        <ExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          code={code}
          schema={parsedSchema}
        />

        {/* Table Rename Dialog */}
        {tableToRename && (
          <TableRenameDialog
            open={renameDialogOpen}
            onOpenChange={setRenameDialogOpen}
            currentTableName={tableToRename}
            dbmlCode={code}
            onRename={handleTableRename}
          />
        )}

        {/* DB Import Dialog (controlled from header dropdown) */}
        <DBImportDialog
          open={dbImportDialogOpen}
          onOpenChange={setDbImportDialogOpen}
          onImport={handleDBImport}
        />
      </div>
    </TooltipProvider>
  );
}

export function DiagramEditor() {
  return (
    <DiagramProvider>
      <DiagramEditorContent />
    </DiagramProvider>
  );
}
