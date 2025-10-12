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
import { DiagramProvider, useDiagramEngine } from '@/contexts/diagram-context';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/hooks/use-toast';

const SAMPLE_DBML = `// Sample database schema
Table users {
  id integer [primary key]
  username varchar
  role varchar
  created_at timestamp
}

Table posts {
  id integer [primary key]
  title varchar
  body text [note: 'Content of the post']
  user_id integer
  status varchar
  created_at timestamp
}

Table follows {
  following_user_id integer
  followed_user_id integer
  created_at timestamp

  indexes {
    (following_user_id, followed_user_id) [pk] // composite primary key
  }
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
  const parseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isParsingRef = useRef(false);
  const codeEditorRef = useRef<CodeEditorRef>(null);

  // Undo/Redo history
  const [history, setHistory] = useState<string[]>([SAMPLE_DBML]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false);

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



  const handleSave = useCallback(async () => {
    // TODO: Implement save functionality
    toast({
      title: 'Save',
      description: 'Save functionality coming soon',
    });
  }, [toast]);

  const handleExport = useCallback(async () => {
    // TODO: Implement export functionality
    toast({
      title: 'Export',
      description: 'Export functionality coming soon',
    });
  }, [toast]);

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
                  <DiagramCanvas schema={parsedSchema} className="absolute inset-0 w-full h-full" />
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