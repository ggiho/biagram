'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Save, Settings, Download, Share, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CodeEditor, type CodeEditorRef } from '@/components/code-editor';
import DiagramCanvas from '@/components/diagram-canvas';
import { DiagramToolbar } from '@/components/diagram-toolbar';
import { DiagramSidebar } from '@/components/diagram-sidebar';
import { DDLImportDialog } from '@/components/ddl-import-dialog';
import { ExportDialog } from '@/components/export-dialog';
import { DiagramProvider, useDiagramEngine } from '@/contexts/diagram-context';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/hooks/use-toast';
import { saveDraft, loadDraft } from '@/lib/storage';

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

Ref: posts.user_id > users.id // many-to-one
Ref: follows.following_user_id > users.id // many-to-one
Ref: follows.followed_user_id > users.id // many-to-one
`;

// Use any type to match DiagramCanvas expectations
type ParsedSchema = any;

function DiagramEditorContent() {
  const [code, setCode] = useState(SAMPLE_DBML);
  const [parsedSchema, setParsedSchema] = useState<ParsedSchema | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const parseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isParsingRef = useRef(false);
  const codeEditorRef = useRef<CodeEditorRef>(null);

  // Undo/Redo history
  const [history, setHistory] = useState<string[]>([SAMPLE_DBML]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false);

  // Table positions for caching
  const [tablePositions, setTablePositions] = useState<Record<string, { x: number; y: number }>>({});

  const { toast } = useToast();
  const parseDBML = trpc.diagrams.parseDBML.useMutation();
  const { selectedEntityId, setSelectedEntityId, setHighlightedRelationshipId } = useDiagramEngine();

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

  const handleImportSuccess = useCallback((dbml: string) => {
    console.log('📥 DDL imported successfully, updating code');
    setCode(dbml);
    toast({
      title: 'Import Successful',
      description: 'DDL converted to DBML successfully',
    });
  }, [toast]);

  // BIDIRECTIONAL SYNC: Canvas → Code
  // When a table is selected in the canvas, scroll the code editor to that table
  useEffect(() => {
    if (selectedEntityId && codeEditorRef.current) {
      console.log('🔄 Canvas selected:', selectedEntityId, '→ scrolling code editor');
      codeEditorRef.current.scrollToTable(selectedEntityId);
    }
  }, [selectedEntityId]);

  // BIDIRECTIONAL SYNC: Code → Canvas
  // When cursor moves in code editor, select the corresponding table in canvas
  const handleCursorPositionChange = useCallback((line: number, column: number, tableName: string | null) => {
    if (tableName && tableName !== selectedEntityId) {
      console.log('🔄 Code cursor in table:', tableName, '→ selecting in canvas');
      setSelectedEntityId(tableName);
      setHighlightedRelationshipId(null); // 관계 하이라이트 초기화
    } else if (!tableName && selectedEntityId) {
      // Cursor is outside any table, deselect
      console.log('🔄 Code cursor outside tables → deselecting');
      setSelectedEntityId(null);
      setHighlightedRelationshipId(null); // 관계 하이라이트 초기화
    }
  }, [selectedEntityId, setSelectedEntityId, setHighlightedRelationshipId]);

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

          const result = await parseDBML.mutateAsync(payload);
          console.log('✅ AUTO-PARSE: SUCCESS!', result);

          if (result?.success && result?.schema) {
            console.log('✅ AUTO-PARSE: Setting schema with', result.schema.tables?.length || 0, 'tables');
            setParsedSchema(result.schema);
          } else {
            console.log('✅ AUTO-PARSE: Parse failed');
            setParsedSchema(null);
          }
        } catch (error) {
          console.error('✅ AUTO-PARSE: ERROR:', error);
          setParsedSchema(null);
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
              Import
            </Button>
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
            <Panel defaultSize={40} minSize={30}>
              <div className="flex h-full flex-col">
                <div className="border-b p-2">
                  <h3 className="text-sm font-medium">DBML Code</h3>
                </div>
                <div className="flex-1">
                  <CodeEditor
                    ref={codeEditorRef}
                    value={code}
                    onChange={handleCodeChange}
                    onCursorPositionChange={handleCursorPositionChange}
                    language="dbml"
                    options={{
                      minimap: { enabled: false },
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      automaticLayout: true,
                    }}
                  />
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="w-2 bg-border hover:bg-muted" />

            {/* Diagram Panel */}
            <Panel defaultSize={sidebarOpen ? 40 : 60} minSize={30}>
              <div className="flex h-full flex-col">
                <DiagramToolbar />
                <div className="flex-1 bg-gray-50 dark:bg-gray-900 relative">
                  <DiagramCanvas
                    schema={parsedSchema}
                    className="absolute inset-0 w-full h-full"
                    initialTablePositions={tablePositions}
                    onTablePositionsChange={setTablePositions}
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