'use client';

import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useTheme } from '@/contexts/theme-context';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  options?: any;
  height?: string | number;
}

// Monaco Editor with proper SSR support using @monaco-editor/react
export function CodeEditor({
  value,
  onChange,
  language = 'sql',
  options = {},
  height = '100%',
}: CodeEditorProps) {
  const [isClient, setIsClient] = useState(false);
  const { theme } = useTheme();

  // Monaco themes: 'vs-light' for light mode, 'vs-dark' for dark mode
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs-light';

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Configure Monaco Editor before it mounts
  const handleEditorWillMount = (monaco: typeof import('monaco-editor')) => {
    // Define DBML language if not already defined
    const languages = monaco.languages.getLanguages();
    const dbmlExists = languages.some(lang => lang.id === 'dbml');

    if (!dbmlExists) {
      // Register DBML language
      monaco.languages.register({ id: 'dbml' });

      // Set up DBML syntax highlighting
      monaco.languages.setMonarchTokensProvider('dbml', {
        tokenizer: {
          root: [
            // Keywords
            [/\b(Table|Ref|Enum|Project|Note|TableGroup|Indexes)\b/, 'keyword'],

            // Data types
            [/\b(varchar|int|integer|bigint|smallint|decimal|numeric|float|double|real|boolean|bool|date|datetime|timestamp|time|text|json|uuid|serial|bigserial)\b/i, 'type'],

            // Modifiers
            [/\b(primary key|pk|not null|null|unique|increment|default)\b/i, 'keyword.modifier'],

            // Relationships
            [/[<>-]/, 'operator'],

            // Strings
            [/"([^"\\]|\\.)*"/, 'string'],
            [/'([^'\\]|\\.)*'/, 'string'],

            // Numbers
            [/\d+/, 'number'],

            // Comments
            [/\/\/.*$/, 'comment'],
            [/\/\*/, 'comment', '@comment'],

            // Identifiers
            [/[a-zA-Z_]\w*/, 'identifier'],

            // Delimiters
            [/[{}()\[\]]/, 'delimiter.bracket'],
            [/[,;]/, 'delimiter'],
          ],

          comment: [
            [/[^\/*]+/, 'comment'],
            [/\*\//, 'comment', '@pop'],
            [/[\/*]/, 'comment'],
          ],
        },
      });

      // Define DBML language configuration
      monaco.languages.setLanguageConfiguration('dbml', {
        comments: {
          lineComment: '//',
          blockComment: ['/*', '*/'],
        },
        brackets: [
          ['{', '}'],
          ['[', ']'],
          ['(', ')'],
        ],
        autoClosingPairs: [
          { open: '{', close: '}' },
          { open: '[', close: ']' },
          { open: '(', close: ')' },
          { open: '"', close: '"' },
          { open: "'", close: "'" },
        ],
        surroundingPairs: [
          { open: '{', close: '}' },
          { open: '[', close: ']' },
          { open: '(', close: ')' },
          { open: '"', close: '"' },
          { open: "'", close: "'" },
        ],
      });
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    onChange(value || '');
  };

  // Server-side rendering fallback
  if (!isClient) {
    return (
      <div className="w-full h-full border border-gray-300 rounded bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span>Loading editor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full border border-gray-300 rounded overflow-hidden">
      <Editor
        height={height}
        value={value}
        language={language === 'dbml' ? 'dbml' : language}
        onChange={handleEditorChange}
        beforeMount={handleEditorWillMount}
        loading={
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span>Loading Monaco Editor...</span>
            </div>
          </div>
        }
        options={{
          fontSize: 14,
          lineNumbers: 'on',
          roundedSelection: false,
          scrollBeyondLastLine: false,
          readOnly: false,
          minimap: { enabled: false },
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          padding: { top: 10, bottom: 10 },
          smoothScrolling: true,
          cursorBlinking: 'blink',
          renderLineHighlight: 'line',
          selectOnLineNumbers: true,
          ...options,
        }}
        theme={monacoTheme}
      />
    </div>
  );
}