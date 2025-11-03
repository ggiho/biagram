/**
 * DBML Language Definition for CodeMirror 6
 * Based on Monaco Editor's DBML tokenizer
 */

import { StreamLanguage } from '@codemirror/language';
import { StringStream } from '@codemirror/language';

interface DBMLState {
  inString: boolean;
  inComment: boolean;
  inBracket: boolean;
}

const dbmlLanguage = StreamLanguage.define<DBMLState>({
  startState: () => ({
    inString: false,
    inComment: false,
    inBracket: false,
  }),

  token: (stream: StringStream, state: DBMLState) => {
    // Handle whitespace
    if (stream.eatSpace()) {
      return null;
    }

    // Comments
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    if (stream.match('/*')) {
      state.inComment = true;
      return 'comment';
    }

    if (state.inComment) {
      if (stream.match('*/')) {
        state.inComment = false;
      } else {
        stream.next();
      }
      return 'comment';
    }

    // Strings
    if (stream.match(/^["']/)) {
      state.inString = true;
      while (state.inString && !stream.eol()) {
        if (stream.next() === stream.current()[0] && stream.current()[stream.current().length - 2] !== '\\') {
          state.inString = false;
        }
      }
      return 'string';
    }

    // Brackets [] - treat content as attributes (black)
    if (stream.match('[')) {
      state.inBracket = true;
      return 'punctuation';
    }

    if (state.inBracket) {
      if (stream.match(']')) {
        state.inBracket = false;
        return 'punctuation';
      }
      
      // Inside brackets: treat keywords as normal attributes
      // Check for specific patterns
      if (stream.match(/^(note|ref|pk|primary key|unique|increment|not null|null|default)/i, false)) {
        const match = stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
        return 'meta'; // Use 'meta' for attributes (will be styled as black)
      }
      
      if (stream.match(':')) {
        return 'punctuation';
      }
      
      if (stream.match(',')) {
        return 'punctuation';
      }
      
      // Numbers in brackets
      if (stream.match(/^\d+/)) {
        return 'number';
      }
      
      // Strings in brackets
      if (stream.match(/^["'][^"']*["']/)) {
        return 'string';
      }
      
      // Everything else in brackets is meta (black)
      stream.next();
      return 'meta';
    }

    // Keywords (only outside brackets)
    if (stream.match(/^(Table|Ref|Enum|Project|Note|TableGroup|Indexes|indexes)\b/)) {
      return 'keyword';
    }

    // Data types
    if (stream.match(/^(varchar|int|integer|bigint|smallint|decimal|numeric|float|double|real|boolean|bool|date|datetime|timestamp|time|text|json|uuid|serial|bigserial|binary|char|tinyint|mediumint)\b/i)) {
      return 'typeName';
    }

    // Relationship operators
    if (stream.match(/^[<>-]/)) {
      return 'operator';
    }

    // Braces and parentheses
    if (stream.match(/^[{}()]/)) {
      return 'punctuation';
    }

    // Commas, colons, dots
    if (stream.match(/^[,:\.]/)) {
      return 'punctuation';
    }

    // Numbers
    if (stream.match(/^\d+/)) {
      return 'number';
    }

    // Variable names (table names, column names, etc.)
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      return 'variableName';
    }

    // Default: consume one character
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', '"', "'"] },
  },
});

export default dbmlLanguage;
