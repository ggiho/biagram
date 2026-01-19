'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Save, Settings, Download, Share, Upload, FileText, ChevronLeft, ChevronRight, Database } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { CodeMirrorEditor, type CodeMirrorEditorRef } from '@/components/codemirror-editor';
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
  const [tablePositions, setTablePositions] = useState<Record<string, { x: number; y: number }>>({});

  const { toast } = useToast();
  const parseDBML = trpc.diagrams.parseDBML.useMutation();
  const { engine, selectedEntityId, setSelectedEntityId, setHighlightedRelationshipId } = useDiagramEngine();

  // 테이블 이름 변경 핸들러
  const handleTableDoubleClick = useCallback((tableName: string) => {
    console.log('🎯 Opening rename dialog for:', tableName);
    setTableToRename(tableName);
    setRenameDialogOpen(true);
  }, []);

  const handleTableRename = useCallback((newCode: string, newTableName: string) => {
    console.log('✅ Applying renamed code');
    setCode(newCode);
    toast({
      title: '✅ Table Renamed',
      description: `Successfully renamed to ${newTableName}`,
    });
  }, [toast]);

  const handleCodeChange = useCallback((value: string) => {
    console.log('Code changed, new length:', value.length);
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
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoRef.current = true;
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const prevCode = history[newIndex];
      if (prevCode !== undefined) {
        setCode(prevCode);
      }
      console.log('Undo to index:', newIndex);
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
      console.log('Redo to index:', newIndex);
    }
  }, [historyIndex, history]);

  // Draft restoration on component mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      console.log('📂 Restoring draft from localStorage');
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

  const handleImportSuccess = useCallback((dbml: string, mode: 'replace' | 'append') => {
    console.log('📥 DDL imported successfully, mode:', mode);

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
  }, [code, toast]);

  const handleDBImport = useCallback((dbml: string) => {
    console.log('📥 DB Import received:', dbml.length, 'characters');
    setCode(dbml);
    // 새 스키마를 가져왔으므로 테이블 위치 초기화 (새로 레이아웃 계산)
    setTablePositions({});
    toast({
      title: 'Database Imported',
      description: 'Schema successfully imported from database',
    });
  }, [toast]);

  // Track if the last selection change came from code editor
  const lastSelectionFromCodeRef = useRef(false);

  // BIDIRECTIONAL SYNC: Canvas → Code
  // When a table is selected in the canvas, scroll the code editor to that table
  useEffect(() => {
    // Only scroll code editor if selection came from canvas (not from code cursor movement)
    if (selectedEntityId && codeEditorRef.current && !lastSelectionFromCodeRef.current) {
      console.log('🔄 Canvas selected:', selectedEntityId, '→ scrolling code editor');
      codeEditorRef.current.scrollToTable(selectedEntityId);
    }
    // Reset flag
    lastSelectionFromCodeRef.current = false;
  }, [selectedEntityId]);

  // BIDIRECTIONAL SYNC: Code → Canvas
  // When cursor moves in code editor, select the corresponding table in canvas
  const handleCursorPositionChange = useCallback((line: number, column: number, tableName: string | null) => {
    if (tableName && tableName !== selectedEntityId) {
      console.log('🔄 Code cursor in table:', tableName, '→ selecting in canvas');
      lastSelectionFromCodeRef.current = true; // Mark that this selection came from code
      setSelectedEntityId(tableName);
      setHighlightedRelationshipId(null); // 관계 하이라이트 초기화

      // Auto-pan canvas to the selected table
      if (engine) {
        console.log('🎯 Auto-panning canvas to table:', tableName);
        engine.panToTable(tableName, true); // true = with animation
      }
    }
    // Don't deselect or pan when cursor is outside tables - this prevents unwanted jumps
  }, [selectedEntityId, setSelectedEntityId, setHighlightedRelationshipId, engine]);

  // AUTO-PARSE FUNCTIONALITY
  console.log('✅ AUTO-PARSE: Enabled with working tRPC');

  useEffect(() => {
    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current);
    }

    parseTimeoutRef.current = setTimeout(async () => {
      if (parseDBML?.mutateAsync && code?.trim() && !isParsingRef.current) {
        isParsingRef.current = true;
        setIsLoading(true);

        try {
          const payload = { content: code.trim() };
          console.log('✅ AUTO-PARSE: Parsing DBML...', payload);
          console.log('✅ AUTO-PARSE: Code length:', code.trim().length);
          console.log('✅ AUTO-PARSE: Code preview:', code.trim().substring(0, 200));

          const result = await parseDBML.mutateAsync(payload);
          console.log('✅ AUTO-PARSE: SUCCESS!', result);
          console.log('✅ AUTO-PARSE: Result type:', typeof result);
          console.log('✅ AUTO-PARSE: Result keys:', result ? Object.keys(result) : 'null');

          if (result?.success && result?.schema) {
            console.log('✅ AUTO-PARSE: Setting schema with', result.schema.tables?.length || 0, 'tables');
            console.log('✅ AUTO-PARSE: Tables:', result.schema.tables?.map((t: any) => t.name).join(', '));
            setParsedSchema(result.schema);
            setParseError(null); // 성공 시 에러 초기화
          } else {
            const errorMsg = (result as any)?.error || 'Failed to parse DBML';
            console.log('✅ AUTO-PARSE: Parse failed', errorMsg);
            console.log('✅ AUTO-PARSE: Full result:', JSON.stringify(result, null, 2));
            setParsedSchema(null);
            setParseError(errorMsg); // 에러 메시지 저장
          }
        } catch (error) {
          console.error('✅ AUTO-PARSE: ERROR:', error);
          console.error('✅ AUTO-PARSE: Error type:', error?.constructor?.name);
          console.error('✅ AUTO-PARSE: Error message:', error instanceof Error ? error.message : String(error));
          console.error('✅ AUTO-PARSE: Error stack:', error instanceof Error ? error.stack : 'no stack');
          setParsedSchema(null);
          setParseError(error instanceof Error ? error.message : 'Unknown parsing error');
        } finally {
          setIsLoading(false);
          isParsingRef.current = false;
        }
      }
    }, 500); // 500ms debounce
  }, [code, parseDBML?.mutateAsync]); // Trigger on code changes and when tRPC becomes available


  return (
    <div className="flex h-screen flex-col bg-background">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Biagram</h1>
            <span className="text-sm text-muted-foreground">Untitled Diagram</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <Link href="/table-center">
                <FileText className="mr-2 h-4 w-4" />
                Table Center
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
            >
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              Import DDL
            </Button>
            <DBImportDialog onImport={handleDBImport} />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
            >
              <Share className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          <PanelGroup direction="horizontal">
            {/* Code Editor Panel */}
            {editorOpen && (
              <>
                <Panel defaultSize={25} minSize={15}>
                  <div className="flex h-full flex-col">
                    <div className="border-b p-2 flex items-center justify-between">
                      <h3 className="text-sm font-medium">DBML Code</h3>
                      <div className="flex items-center gap-1">
                        <Button
                          variant={vimMode ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setVimMode(!vimMode)}
                          className="h-6 px-2 text-xs"
                          title={vimMode ? "Disable Vim Mode" : "Enable Vim Mode"}
                        >
                          Vim
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditorOpen(false)}
                          className="h-6 w-6 p-0"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1">
                      <CodeMirrorEditor
                        ref={codeEditorRef}
                        value={code}
                        onChange={handleCodeChange}
                        onCursorPositionChange={handleCursorPositionChange}
                        language="dbml"
                        vimMode={vimMode}
                      />
                    </div>
                  </div>
                </Panel>

                <PanelResizeHandle className="w-2 bg-border hover:bg-muted" />
              </>
            )}

            {/* Code Editor Collapsed Button */}
            {!editorOpen && (
              <div className="w-12 border-r bg-muted/30 flex flex-col items-center py-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditorOpen(true)}
                  className="h-8 w-8 p-0"
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
            <Panel defaultSize={editorOpen ? (sidebarOpen ? 55 : 75) : (sidebarOpen ? 80 : 100)} minSize={30}>
              <div className="flex h-full flex-col">
                <DiagramToolbar />
                <div className="flex-1 bg-gray-50 dark:bg-gray-900 relative">
                  <DiagramCanvas
                    schema={parsedSchema}
                    parseError={parseError}
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
                <PanelResizeHandle className="w-2 bg-border hover:bg-muted" />
                <Panel defaultSize={20} minSize={15} maxSize={30}>
                  <DiagramSidebar schema={parsedSchema} />
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
      </div>
  );
}

export function DiagramEditor() {
  return (
    <DiagramProvider>
      <DiagramEditorContent />
    </DiagramProvider>
  );
}