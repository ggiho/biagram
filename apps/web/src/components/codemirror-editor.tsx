'use client';

import { useEffect, useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorView, keymap, KeyBinding } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import { vim, Vim } from '@replit/codemirror-vim';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { history } from '@codemirror/commands';
import { lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { catppuccinMocha } from '@catppuccin/codemirror';
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import { useTheme } from '@/contexts/theme-context';

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCursorPositionChange?: (line: number, column: number, tableName: string | null) => void;
  language?: string;
  height?: string | number;
  vimMode?: boolean;
}

export interface CodeMirrorEditorRef {
  scrollToTable: (tableName: string) => void;
  getEditorInstance: () => EditorView | null;
}

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorRef, CodeMirrorEditorProps>(({
  value,
  onChange,
  onCursorPositionChange,
  language = 'dbml',
  height = '100%',
  vimMode = false,
}, ref) => {
  const { theme } = useTheme();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isClient, setIsClient] = useState(false);

  useImperativeHandle(ref, () => ({
    scrollToTable: (tableName: string) => {
      const view = viewRef.current;
      if (!view) return;

      const content = view.state.doc.toString();
      const lines = content.split('\n');

      // Find the line with "Table tableName" or "table tableName"
      const escapedName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Try exact match first (e.g., "PII.AGREEMENT")
      let tableRegex = new RegExp(
        `^\\s*[Tt]able\\s+(?:"${escapedName}"|${escapedName})\\s*{`,
        'i'
      );
      let lineNumber = lines.findIndex(line => tableRegex.test(line));
      
      // If not found and tableName contains schema, try just table name
      if (lineNumber === -1 && tableName.includes('.')) {
        const tableNameOnly = tableName.split('.').pop()!;
        const escapedTableOnly = tableNameOnly.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        tableRegex = new RegExp(
          `^\\s*[Tt]able\\s+(?:"${escapedTableOnly}"|${escapedTableOnly})\\s*{`,
          'i'
        );
        lineNumber = lines.findIndex(line => tableRegex.test(line));
        console.log('🔍 Trying without schema:', tableNameOnly, '→ found:', lineNumber !== -1);
      }

      if (lineNumber !== -1) {
        console.log('📜 Scrolling to table:', tableName, 'at line', lineNumber + 1);
        
        // Calculate position in document
        let pos = 0;
        for (let i = 0; i < lineNumber; i++) {
          pos += lines[i].length + 1; // +1 for newline
        }
        
        // Scroll to position and set cursor
        view.dispatch({
          selection: { anchor: pos, head: pos },
          scrollIntoView: true,
        });
        view.focus();
      } else {
        console.warn('📜 Table not found:', tableName);
      }
    },
    getEditorInstance: () => viewRef.current,
  }), []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !editorRef.current) return;

    console.log('🎨 Initializing CodeMirror editor, Vim mode:', vimMode);

    // Vim Ctrl+D/U keymap with HIGHEST priority
    const vimScrollKeymap = vimMode ? Prec.highest(keymap.of([
      {
        key: 'Ctrl-d',
        run: (view) => {
          const scroller = view.scrollDOM;
          const halfPage = scroller.clientHeight / 2;
          scroller.scrollTop += halfPage;
          console.log('🔽 Ctrl+D: scrolled down', halfPage);
          return true;
        },
      },
      {
        key: 'Ctrl-u',
        run: (view) => {
          const scroller = view.scrollDOM;
          const halfPage = scroller.clientHeight / 2;
          scroller.scrollTop -= halfPage;
          console.log('🔼 Ctrl+U: scrolled up', halfPage);
          return true;
        },
      },
    ])) : [];

    // Basic setup extensions (manually defined instead of using deprecated basicSetup)
    const basicExtensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion({
        activateOnTyping: true,
        closeOnBlur: true,
        maxRenderedOptions: 20,
      }),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      // Add keymap BEFORE Vim mode (lower priority)
      // This ensures Vim keys will override default keys when Vim is enabled
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      ...(vimMode ? [vimScrollKeymap] : []), // Add Vim scroll keymap FIRST
    ];

    // Create extensions array
    const extensions = [
      ...basicExtensions,
      sql(), // Use SQL highlighting as base (closest to DBML)
      EditorView.lineWrapping,
      // CRITICAL: Fix scrolling by constraining scroller height
      EditorView.theme({
        '&': {
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        },
        '.cm-scroller': {
          overflow: 'auto !important',
          flex: '1 1 0',
          minHeight: '0',
        },
        '.cm-content, .cm-gutter': {
          minHeight: '0',
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          onChange(newValue);
        }

        // Debug selection changes
        if (update.selectionSet) {
          const selection = update.state.selection.main;
          const selectedText = update.state.sliceDoc(selection.from, selection.to);
          if (selectedText.length > 0) {
            console.log('📝 Selection:', selectedText.substring(0, 30), '(length:', selectedText.length, ')');
          }
        }

        // Cursor position tracking
        if (update.selectionSet && onCursorPositionChange) {
          const cursor = update.state.selection.main.head;
          const line = update.state.doc.lineAt(cursor);
          const lineNumber = line.number;
          const column = cursor - line.from + 1;

          // Try to find table name from current line or search backward
          let tableName: string | null = null;
          const lineText = line.text;
          const tableMatch = lineText.match(/^\s*[Tt]able\s+["']?([a-zA-Z0-9_.]+)["']?\s*{/);
          
          if (tableMatch) {
            tableName = tableMatch[1];
          } else {
            // Search backwards for the enclosing table
            for (let i = line.number - 1; i >= 1; i--) {
              const prevLine = update.state.doc.line(i);
              const prevTableMatch = prevLine.text.match(/^\s*[Tt]able\s+["']?([a-zA-Z0-9_.]+)["']?\s*{/);
              if (prevTableMatch) {
                tableName = prevTableMatch[1];
                break;
              }
              // Stop if we hit a closing brace at the start (end of previous table)
              if (prevLine.text.match(/^}/)) {
                break;
              }
            }
          }

          onCursorPositionChange(lineNumber, column, tableName);
        }
      }),
    ];

    // Add theme first (before Vim to ensure proper styling)
    // Blue-themed light mode (Monaco-inspired)
    const monacoBlueLight = createTheme({
      theme: 'light',
      settings: {
        background: '#ffffff',
        foreground: '#000000',
        caret: '#6c6c6c', // Gray cursor
        selection: '#add6ff',
        selectionMatch: '#add6ff',
        lineHighlight: '#f0f0f0',
        gutterBackground: '#f5f5f5',
        gutterForeground: '#237893',
        gutterBorder: '#e0e0e0',
      },
      styles: [
        { tag: t.comment, color: '#008000' }, // Green comments
        { tag: [t.keyword], color: '#0000ff' }, // Blue keywords (Table, Ref, Enum, etc.)
        { tag: [t.string, t.special(t.brace), t.regexp], color: '#a31515' }, // Red strings
        { tag: t.number, color: '#098658' }, // Green numbers
        { tag: [t.operator, t.punctuation, t.modifier, t.bool, t.null, t.atom, t.constant(t.name)], color: '#000000' }, // Black (not null, default, CURRENT_TIMESTAMP, etc.)
        { tag: [t.variableName, t.propertyName], color: '#001080' }, // Dark blue variables (table names)
        { tag: t.function(t.variableName), color: '#795e26' }, // Brown functions
        { tag: t.typeName, color: '#008080' }, // Teal types (varchar, integer, etc.) - Monaco 청록색
        { tag: t.className, color: '#008080' }, // Teal class names
      ],
    });
    
    const selectedTheme = theme === 'dark' ? catppuccinMocha : monacoBlueLight;
    // Theme can be a nested array of extensions, need to flatten it
    const flattenTheme = (ext: any): any[] => {
      if (Array.isArray(ext)) {
        return ext.flatMap(flattenTheme);
      }
      return [ext];
    };
    const themeExtensions = flattenTheme(selectedTheme);
    extensions.push(...themeExtensions);
    console.log('🎨 Theme selected:', theme === 'dark' ? 'Catppuccin Mocha' : 'Monaco Blue Light', '(extensions:', themeExtensions.length, ')');
    
    // Add Vim mode if enabled
    if (vimMode) {
      // Add Vim extension (Ctrl+D/U already handled above)
      extensions.push(vim());
      
      // Update Vim status indicator and cursor position
      extensions.push(
        EditorView.updateListener.of((update) => {
          const statusBar = document.getElementById('vim-mode-indicator');
          const cursorPos = document.getElementById('cursor-position');
          
          // Update Vim mode
          if (statusBar) {
            const vimState = (update.view.state as any).vim;
            if (vimState) {
              const mode = vimState.mode;
              if (mode === 'insert') {
                statusBar.textContent = '-- INSERT --';
                statusBar.style.color = 'hsl(var(--primary))';
              } else if (mode === 'visual') {
                statusBar.textContent = '-- VISUAL --';
                statusBar.style.color = 'hsl(var(--accent-foreground))';
              } else {
                statusBar.textContent = '-- NORMAL --';
                statusBar.style.color = 'hsl(var(--muted-foreground))';
              }
            }
          }
          
          // Update cursor position
          if (cursorPos && update.selectionSet) {
            const cursor = update.state.selection.main.head;
            const line = update.state.doc.lineAt(cursor);
            const lineNum = line.number;
            const colNum = cursor - line.from + 1;
            cursorPos.textContent = `Ln ${lineNum}, Col ${colNum}`;
          }
        })
      );
      
      console.log('⌨️  Vim mode enabled with status bar');
    }

    // Create editor state
    const startState = EditorState.create({
      doc: value,
      extensions,
    });

    // Create editor view
    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    viewRef.current = view;
    console.log('✅ CodeMirror editor initialized');

    return () => {
      console.log('🧹 Destroying CodeMirror editor');
      view.destroy();
      viewRef.current = null;
    };
  }, [isClient, vimMode, theme]); // Recreate on vim/theme change

  // Update document when value changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  if (!isClient) {
    return (
      <div 
        style={{ 
          height: typeof height === 'number' ? `${height}px` : height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Loading editor...
      </div>
    );
  }

  return (
    <div style={{ height: typeof height === 'number' ? `${height}px` : height, display: 'flex', flexDirection: 'column' }}>
      <div 
        ref={editorRef}
        style={{ flex: 1, overflow: 'hidden' }}
        className="codemirror-editor-wrapper"
      />
      {vimMode && (
        <div 
          id="vim-status-bar"
          style={{
            height: '24px',
            padding: '2px 8px',
            fontSize: '12px',
            borderTop: '1px solid hsl(var(--border))',
            backgroundColor: 'hsl(var(--muted))',
            color: 'hsl(var(--muted-foreground))',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span id="vim-mode-indicator">-- NORMAL --</span>
          <span id="cursor-position" style={{ fontSize: '11px', opacity: 0.7 }}>Ln 1, Col 1</span>
        </div>
      )}
    </div>
  );
});

CodeMirrorEditor.displayName = 'CodeMirrorEditor';
