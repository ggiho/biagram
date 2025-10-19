import type { Table, Column } from '@biagram/shared';

/**
 * Search Text Builder
 *
 * 테이블 정보를 기반으로 전문 검색용 텍스트를 생성합니다.
 * 테이블명, 컬럼명, 설명, 노트 등 모든 검색 가능한 텍스트를 하나로 통합합니다.
 */

export interface SearchTextOptions {
  includeTableName?: boolean;
  includeSchemaName?: boolean;
  includeColumnNames?: boolean;
  includeColumnTypes?: boolean;
  includeDescriptions?: boolean;
  includeNotes?: boolean;
  includeTags?: boolean;

  // 구분자
  separator?: string;

  // 대소문자 정규화
  normalize?: boolean;
}

const DEFAULT_OPTIONS: Required<SearchTextOptions> = {
  includeTableName: true,
  includeSchemaName: true,
  includeColumnNames: true,
  includeColumnTypes: true,
  includeDescriptions: true,
  includeNotes: true,
  includeTags: true,
  separator: ' ',
  normalize: true,
};

/**
 * 테이블에서 검색 가능한 텍스트 추출
 */
export function buildSearchText(
  table: Table,
  options: SearchTextOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const parts: string[] = [];

  // 1. 테이블 이름
  if (opts.includeTableName) {
    parts.push(table.name);

    if (table.alias) {
      parts.push(table.alias);
    }
  }

  // 2. 스키마 이름
  if (opts.includeSchemaName && table.schema) {
    parts.push(table.schema);
  }

  // 3. 테이블 설명/노트
  if (opts.includeDescriptions && table.note) {
    parts.push(table.note);
  }

  // 4. 컬럼 정보
  for (const column of table.columns) {
    if (opts.includeColumnNames) {
      parts.push(column.name);
    }

    if (opts.includeColumnTypes && column.type) {
      const typeStr = formatColumnType(column.type);
      parts.push(typeStr);
    }

    if (opts.includeDescriptions && column.note) {
      parts.push(column.note);
    }
  }

  // 5. 통합 및 정규화
  let searchText = parts.join(opts.separator);

  if (opts.normalize) {
    searchText = normalizeText(searchText);
  }

  return searchText;
}

/**
 * 텍스트 정규화
 * - 소문자 변환
 * - 다중 공백 제거
 * - 특수문자 제거 (알파벳, 숫자, 공백만 유지)
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ') // 다중 공백을 하나로
    .replace(/[^a-z0-9가-힣\s_-]/gi, ' ') // 특수문자 제거
    .trim();
}

/**
 * 컬럼 타입을 문자열로 포맷팅 (크기 정보 포함)
 */
function formatColumnType(type: Column['type']): string {
  if (typeof type === 'string') {
    return type;
  }

  if (!type || !type.name) {
    return 'unknown';
  }

  // 크기 정보를 모은다
  const parts: (number | string)[] = [];

  // size가 있으면 (예: varchar(100))
  if (type.size !== undefined) {
    parts.push(type.size);
  }

  // precision과 scale이 있으면 (예: decimal(18,2))
  if (type.precision !== undefined) {
    parts.push(type.precision);
    if (type.scale !== undefined) {
      parts.push(type.scale);
    }
  }

  // 기타 파라미터들
  if (type.parameters && type.parameters.length > 0) {
    parts.push(...type.parameters);
  }

  // 크기 정보가 있으면 포함
  if (parts.length > 0) {
    return `${type.name}(${parts.join(', ')})`;
  }

  return type.name;
}

/**
 * 컬럼별 검색 텍스트 생성
 */
export function buildColumnSearchText(column: Column): string {
  const parts: string[] = [column.name];

  if (column.type) {
    const typeStr = formatColumnType(column.type);
    parts.push(typeStr);
  }

  if (column.note) {
    parts.push(column.note);
  }

  return normalizeText(parts.join(' '));
}

/**
 * 검색어 토큰화
 * - 공백으로 분리
 * - 불용어 제거
 * - 최소 길이 필터링
 */
export function tokenize(
  text: string,
  minLength = 2
): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were',
    '이', '가', '을', '를', '의', '에', '와', '과', '도', '만',
  ]);

  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length >= minLength && !stopWords.has(token));
}

/**
 * 검색어 하이라이팅을 위한 위치 찾기
 */
export function findMatchPositions(
  text: string,
  searchTerm: string
): Array<{ start: number; end: number }> {
  const positions: Array<{ start: number; end: number }> = [];
  const normalizedText = normalizeText(text);
  const normalizedSearch = normalizeText(searchTerm);

  let startIndex = 0;
  while (true) {
    const index = normalizedText.indexOf(normalizedSearch, startIndex);
    if (index === -1) break;

    positions.push({
      start: index,
      end: index + normalizedSearch.length,
    });

    startIndex = index + 1;
  }

  return positions;
}

/**
 * 매칭된 텍스트 주변 컨텍스트 추출
 */
export function extractContext(
  text: string,
  matchPosition: { start: number; end: number },
  contextLength = 50
): string {
  const start = Math.max(0, matchPosition.start - contextLength);
  const end = Math.min(text.length, matchPosition.end + contextLength);

  let context = text.substring(start, end);

  // 앞뒤에 ... 추가
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';

  return context;
}

/**
 * HTML 하이라이트 마크업 생성
 */
export function highlightText(
  text: string,
  searchTerm: string,
  highlightClass = 'highlight'
): string {
  const positions = findMatchPositions(text, searchTerm);
  if (positions.length === 0) return text;

  let result = '';
  let lastIndex = 0;

  for (const pos of positions) {
    result += text.substring(lastIndex, pos.start);
    result += `<mark class="${highlightClass}">${text.substring(pos.start, pos.end)}</mark>`;
    lastIndex = pos.end;
  }

  result += text.substring(lastIndex);
  return result;
}

/**
 * Fuzzy matching (오타 허용 검색)
 * Levenshtein distance 기반
 */
export function fuzzyMatch(
  text: string,
  pattern: string,
  maxDistance = 2
): boolean {
  const distance = levenshteinDistance(
    normalizeText(text),
    normalizeText(pattern)
  );
  return distance <= maxDistance;
}

/**
 * Levenshtein distance 계산
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1,     // insertion
          matrix[i - 1]![j]! + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}
