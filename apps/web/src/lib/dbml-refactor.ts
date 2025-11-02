/**
 * DBML 리팩토링 유틸리티
 * 테이블 이름 변경 시 관련된 모든 참조를 자동으로 업데이트
 */

export interface RefactorPreview {
  lineNumber: number;
  oldText: string;
  newText: string;
  type: 'table' | 'reference' | 'column';
}

export interface RefactorResult {
  newCode: string;
  changes: RefactorPreview[];
  success: boolean;
  error?: string;
}

/**
 * 테이블 이름 변경 시 영향받는 모든 위치 찾기
 */
export function findTableReferences(
  code: string,
  oldTableName: string
): { line: number; column: number; text: string }[] {
  const references: { line: number; column: number; text: string }[] = [];
  const lines = code.split('\n');

  // 스키마 분리 (schema.table 형식 처리)
  const [oldSchema, oldTable] = oldTableName.includes('.')
    ? oldTableName.split('.')
    : [null, oldTableName];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // 1. Table 선언: Table users { ... }
    const tableMatch = line.match(/^\s*Table\s+["']?(\w+\.?\w*)["']?\s*{/i);
    if (tableMatch) {
      const tableName = tableMatch[1];
      if (tableName === oldTableName || tableName === oldTable) {
        references.push({
          line: lineNumber,
          column: line.indexOf(tableName),
          text: line,
        });
      }
    }

    // 2. Ref 참조: Ref: posts.user_id > users.id
    // 패턴: table.column 형식
    const refPattern = new RegExp(
      `\\b(${escapeRegex(oldTableName)}|${escapeRegex(oldTable || '')})\\.(\\w+)`,
      'g'
    );
    let match;
    while ((match = refPattern.exec(line)) !== null) {
      references.push({
        line: lineNumber,
        column: match.index,
        text: line,
      });
    }
  });

  return references;
}

/**
 * 테이블 이름 변경 리팩토링 수행
 */
export function refactorTableName(
  code: string,
  oldTableName: string,
  newTableName: string
): RefactorResult {
  try {
    const changes: RefactorPreview[] = [];
    const lines = code.split('\n');
    
    // 스키마 분리
    const [oldSchema, oldTable] = oldTableName.includes('.')
      ? oldTableName.split('.')
      : [null, oldTableName];
    
    const [newSchema, newTable] = newTableName.includes('.')
      ? newTableName.split('.')
      : [null, newTableName];

    // 각 라인 처리
    const newLines = lines.map((line, index) => {
      const lineNumber = index + 1;
      let newLine = line;

      // 1. Table 선언 변경
      const tableMatch = line.match(/^(\s*Table\s+)["']?(\w+\.?\w*)["']?(\s*{)/i);
      if (tableMatch) {
        const [, prefix, tableName, suffix] = tableMatch;
        if (tableName === oldTableName || tableName === oldTable) {
          newLine = `${prefix}${newTableName}${suffix}`;
          changes.push({
            lineNumber,
            oldText: line,
            newText: newLine,
            type: 'table',
          });
        }
      }

      // 2. Ref 참조 변경
      // 패턴: oldTable.column → newTable.column
      const refPattern = new RegExp(
        `\\b(${escapeRegex(oldTableName)}|${escapeRegex(oldTable || '')})\\.`,
        'g'
      );
      
      if (refPattern.test(line)) {
        const originalLine = newLine;
        newLine = newLine.replace(refPattern, `${newTableName}.`);
        
        if (originalLine !== newLine) {
          changes.push({
            lineNumber,
            oldText: line,
            newText: newLine,
            type: 'reference',
          });
        }
      }

      return newLine;
    });

    return {
      newCode: newLines.join('\n'),
      changes,
      success: true,
    };
  } catch (error) {
    return {
      newCode: code,
      changes: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 정규식 특수문자 이스케이프
 */
function escapeRegex(str: string): string {
  if (!str) return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 변경사항 요약 생성
 */
export function getRefactorSummary(changes: RefactorPreview[]): string {
  const tableChanges = changes.filter(c => c.type === 'table').length;
  const refChanges = changes.filter(c => c.type === 'reference').length;
  
  const parts: string[] = [];
  
  if (tableChanges > 0) {
    parts.push(`${tableChanges}개의 테이블 선언`);
  }
  
  if (refChanges > 0) {
    parts.push(`${refChanges}개의 참조`);
  }
  
  return parts.length > 0 
    ? `${parts.join(', ')}이(가) 업데이트됩니다.`
    : '변경사항이 없습니다.';
}
