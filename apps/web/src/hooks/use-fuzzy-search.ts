/**
 * Search Hook
 * 정확한 substring 매칭 기반 클라이언트 사이드 검색
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { TableSpecification } from '@biagram/shared';

// 검색 결과 아이템 타입
export interface SearchableItem {
  id: string;
  type: 'table' | 'column' | 'comment';
  // 테이블 정보
  tableName: string;
  schemaName: string | undefined;
  tableDescription: string | undefined;
  // 컬럼 정보 (type이 'column'일 때)
  columnName: string | undefined;
  columnType: string | undefined;
  columnDescription: string | undefined;
  isPrimaryKey: boolean | undefined;
  isForeignKey: boolean | undefined;
  foreignKeyRef: string | undefined;
  isPII: boolean | undefined;
  // 검색용 통합 텍스트
  searchText: string;
  // 원본 데이터 참조
  spec: TableSpecification;
}

// 검색 결과 (FuseResult 호환 형태)
export interface SearchResult {
  item: SearchableItem;
  score: number;
  matches: Array<{
    key: string;
    indices: Array<[number, number]>;
    value: string;
  }>;
}

// 검색 결과 그룹
export interface SearchResultGroup {
  type: 'table' | 'column' | 'comment';
  label: string;
  icon: string;
  results: SearchResult[];
}

// 훅 옵션
interface UseSearchOptions {
  limit?: number;
}

/**
 * 테이블 명세에서 검색 가능한 아이템 목록 생성
 */
function buildSearchableItems(specifications: TableSpecification[]): SearchableItem[] {
  const items: SearchableItem[] = [];

  for (const spec of specifications) {
    const tableKey = spec.schemaName ? `${spec.schemaName}.${spec.tableName}` : spec.tableName;

    // 1. 테이블 자체
    items.push({
      id: `table:${tableKey}`,
      type: 'table',
      tableName: spec.tableName,
      schemaName: spec.schemaName,
      tableDescription: spec.description,
      columnName: undefined,
      columnType: undefined,
      columnDescription: undefined,
      isPrimaryKey: undefined,
      isForeignKey: undefined,
      foreignKeyRef: undefined,
      isPII: undefined,
      searchText: [spec.tableName, spec.schemaName, spec.description].filter(Boolean).join(' '),
      spec,
    });

    // 2. 각 컬럼
    for (const column of spec.columns) {
      const fk = column.foreignKey;
      const fkRef = fk ? `${fk.referencedTable}.${fk.referencedColumn}` : undefined;
      const isPII = column.description?.startsWith('*') ?? false;

      items.push({
        id: `column:${tableKey}.${column.name}`,
        type: 'column',
        tableName: spec.tableName,
        schemaName: spec.schemaName,
        tableDescription: undefined,
        columnName: column.name,
        columnType: column.type,
        columnDescription: column.description,
        isPrimaryKey: column.primaryKey,
        isForeignKey: !!fk,
        foreignKeyRef: fkRef,
        isPII,
        searchText: [column.name, column.type, column.description].filter(Boolean).join(' '),
        spec,
      });

      // 3. 컬럼에 설명이 있으면 comment로도 추가
      if (column.description && column.description.length > 5) {
        items.push({
          id: `comment:${tableKey}.${column.name}`,
          type: 'comment',
          tableName: spec.tableName,
          schemaName: spec.schemaName,
          tableDescription: undefined,
          columnName: column.name,
          columnType: undefined,
          columnDescription: column.description,
          isPrimaryKey: undefined,
          isForeignKey: undefined,
          foreignKeyRef: undefined,
          isPII,
          searchText: column.description,
          spec,
        });
      }
    }

    // 4. 테이블 설명도 comment로 추가
    if (spec.description && spec.description.length > 5) {
      items.push({
        id: `comment:${tableKey}:table`,
        type: 'comment',
        tableName: spec.tableName,
        schemaName: spec.schemaName,
        tableDescription: spec.description,
        columnName: undefined,
        columnType: undefined,
        columnDescription: undefined,
        isPrimaryKey: undefined,
        isForeignKey: undefined,
        foreignKeyRef: undefined,
        isPII: undefined,
        searchText: spec.description,
        spec,
      });
    }
  }

  return items;
}

/**
 * 문자열에서 검색어 위치 찾기
 */
function findMatchIndices(text: string, query: string): [number, number][] {
  const indices: [number, number][] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  let startIndex = 0;
  let index: number;
  
  while ((index = lowerText.indexOf(lowerQuery, startIndex)) !== -1) {
    indices.push([index, index + query.length - 1]);
    startIndex = index + 1;
  }
  
  return indices;
}

/**
 * 아이템 검색 및 점수 계산
 * - table 타입: 테이블명, 테이블 설명만 검색
 * - column 타입: 컬럼명만 검색 (테이블명 제외!)
 * - comment 타입: 설명만 검색
 */
function searchItem(item: SearchableItem, query: string): SearchResult | null {
  const lowerQuery = query.toLowerCase();
  const matches: SearchResult['matches'] = [];
  let bestScore = Infinity;

  // 타입별로 검색 대상 분리
  if (item.type === 'table') {
    // 테이블 타입: 테이블명, 스키마.테이블명으로 검색
    const lowerName = item.tableName.toLowerCase();
    const fullName = item.schemaName ? `${item.schemaName}.${item.tableName}` : item.tableName;
    const lowerFullName = fullName.toLowerCase();
    
    // 스키마.테이블명 전체로 검색
    if (lowerFullName.includes(lowerQuery)) {
      const indices = findMatchIndices(item.tableName, query);
      matches.push({ key: 'tableName', indices, value: item.tableName });
      if (lowerFullName === lowerQuery) {
        bestScore = 0;
      } else if (lowerFullName.startsWith(lowerQuery)) {
        bestScore = 0.05;
      } else if (lowerName === lowerQuery) {
        bestScore = 0;
      } else if (lowerName.startsWith(lowerQuery)) {
        bestScore = 0.1;
      } else {
        bestScore = 0.3;
      }
    }
    // 스키마명만으로도 검색
    else if (item.schemaName && item.schemaName.toLowerCase().includes(lowerQuery)) {
      matches.push({ key: 'schemaName', indices: findMatchIndices(item.schemaName, query), value: item.schemaName });
      bestScore = 0.4;
    }
    
    // 테이블 설명에서도 검색
    if (item.tableDescription) {
      const lowerDesc = item.tableDescription.toLowerCase();
      if (lowerDesc.includes(lowerQuery)) {
        const indices = findMatchIndices(item.tableDescription, query);
        matches.push({ key: 'tableDescription', indices, value: item.tableDescription });
        bestScore = Math.min(bestScore, 0.5);
      }
    }
  } else if (item.type === 'column') {
    // 컬럼 타입: 컬럼명 + 컬럼 설명 검색
    if (item.columnName) {
      const lowerName = item.columnName.toLowerCase();
      if (lowerName.includes(lowerQuery)) {
        const indices = findMatchIndices(item.columnName, query);
        matches.push({ key: 'columnName', indices, value: item.columnName });
        if (lowerName === lowerQuery) {
          bestScore = 0;
        } else if (lowerName.startsWith(lowerQuery)) {
          bestScore = 0.1;
        } else {
          bestScore = 0.3;
        }
      }
    }
    // 컬럼 설명에서도 검색
    if (item.columnDescription) {
      const lowerDesc = item.columnDescription.toLowerCase();
      if (lowerDesc.includes(lowerQuery)) {
        const indices = findMatchIndices(item.columnDescription, query);
        matches.push({ key: 'columnDescription', indices, value: item.columnDescription });
        bestScore = Math.min(bestScore, 0.5);
      }
    }
  } else if (item.type === 'comment') {
    // 코멘트 타입: 설명에서만 검색
    const description = item.columnDescription || item.tableDescription;
    if (description) {
      const lowerDesc = description.toLowerCase();
      if (lowerDesc.includes(lowerQuery)) {
        const key = item.columnDescription ? 'columnDescription' : 'tableDescription';
        const indices = findMatchIndices(description, query);
        matches.push({ key, indices, value: description });
        bestScore = 0.3;
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  return {
    item,
    score: bestScore,
    matches,
  };
}

/**
 * Substring 매칭 기반 검색 훅
 */
export function useFuzzySearch(
  specifications: TableSpecification[],
  options: UseSearchOptions = {}
) {
  const { limit = 50 } = options;
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // 디바운스: 타이핑 멈춘 후 150ms 대기
  useEffect(() => {
    // 타이핑 시작하면 즉시 isTyping = true
    if (query !== debouncedQuery) {
      setIsTyping(true);
    }
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setIsTyping(false);
    }, 150);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, debouncedQuery]);

  // 검색 가능한 아이템 목록 생성
  const searchableItems = useMemo(
    () => buildSearchableItems(specifications),
    [specifications]
  );

  // 검색 수행 (타이핑 중이면 빈 결과 반환)
  const results = useMemo(() => {
    // 타이핑 중이면 빈 배열 (이전 결과 숨김)
    if (isTyping) {
      return [];
    }
    
    const trimmedQuery = debouncedQuery.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      return [];
    }

    const matchedResults: SearchResult[] = [];

    for (const item of searchableItems) {
      const result = searchItem(item, trimmedQuery);
      if (result) {
        matchedResults.push(result);
      }
    }

    // 점수순 정렬 (낮을수록 좋음) 후 limit 적용
    return matchedResults
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);
  }, [searchableItems, debouncedQuery, limit, isTyping]);

  // 타입별로 그룹핑
  const groupedResults = useMemo((): SearchResultGroup[] => {
    const groups: Record<string, SearchResult[]> = {
      table: [],
      column: [],
      comment: [],
    };

    for (const result of results) {
      const type = result.item.type;
      if (groups[type]) {
        groups[type].push(result);
      }
    }

    const groupConfig = [
      { type: 'table' as const, label: 'Tables', icon: '📋' },
      { type: 'column' as const, label: 'Columns', icon: '🔤' },
      { type: 'comment' as const, label: 'Comments', icon: '💬' },
    ];

    return groupConfig
      .map(({ type, label, icon }) => ({
        type,
        label,
        icon,
        results: groups[type] || [],
      }))
      .filter((group) => group.results.length > 0);
  }, [results]);

  // 총 결과 수
  const totalCount = results.length;

  // 검색어 변경 핸들러
  const search = useCallback((q: string) => {
    setQuery(q);
  }, []);

  // 검색 초기화
  const clear = useCallback(() => {
    setQuery('');
  }, []);

  return {
    query,
    search,
    clear,
    results,
    groupedResults,
    totalCount,
    isEmpty: query.trim().length >= 2 && results.length === 0,
    isSearching: query.trim().length >= 2,
  };
}
