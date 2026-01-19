/**
 * Fuzzy Search Hook
 * Fuse.js 기반 클라이언트 사이드 검색
 */

import { useMemo, useState, useCallback } from 'react';
import Fuse, { type IFuseOptions, type FuseResult } from 'fuse.js';
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
  // 검색용 통합 텍스트
  searchText: string;
  // 원본 데이터 참조
  spec: TableSpecification;
}

// 검색 결과 그룹
export interface SearchResultGroup {
  type: 'table' | 'column' | 'comment';
  label: string;
  icon: string;
  results: Array<FuseResult<SearchableItem>>;
}

// 훅 옵션
interface UseFuzzySearchOptions {
  threshold?: number; // 0.0 = 완전 일치, 1.0 = 모든 것 매칭
  limit?: number;
}

/**
 * 테이블 명세에서 검색 가능한 아이템 목록 생성
 */
function buildSearchableItems(specifications: TableSpecification[]): SearchableItem[] {
  const items: SearchableItem[] = [];

  for (const spec of specifications) {
    // 1. 테이블 자체
    items.push({
      id: `table:${spec.tableName}`,
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
      searchText: [spec.tableName, spec.schemaName, spec.description].filter(Boolean).join(' '),
      spec,
    });

    // 2. 각 컬럼
    for (const column of spec.columns) {
      // FK 정보: { referencedTable, referencedColumn }
      const fk = column.foreignKey;
      const fkRef = fk
        ? `${fk.referencedTable}.${fk.referencedColumn}`
        : undefined;

      items.push({
        id: `column:${spec.tableName}.${column.name}`,
        type: 'column',
        tableName: spec.tableName,
        schemaName: spec.schemaName,
        tableDescription: undefined,
        columnName: column.name,
        columnType: column.type,
        columnDescription: column.description,
        isPrimaryKey: column.primaryKey,
        isForeignKey: !!fk, // FK 객체가 있으면 true
        foreignKeyRef: fkRef,
        searchText: [column.name, column.type, column.description].filter(Boolean).join(' '),
        spec,
      });

      // 3. 컬럼에 설명이 있으면 comment로도 추가
      if (column.description && column.description.length > 5) {
        items.push({
          id: `comment:${spec.tableName}.${column.name}`,
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
          searchText: column.description,
          spec,
        });
      }
    }

    // 4. 테이블 설명도 comment로 추가
    if (spec.description && spec.description.length > 5) {
      items.push({
        id: `comment:${spec.tableName}:table`,
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
        searchText: spec.description,
        spec,
      });
    }
  }

  return items;
}

/**
 * Fuse.js 기반 퍼지 검색 훅
 */
export function useFuzzySearch(
  specifications: TableSpecification[],
  options: UseFuzzySearchOptions = {}
) {
  const { threshold = 0.3, limit = 50 } = options;
  const [query, setQuery] = useState('');

  // 검색 가능한 아이템 목록 생성
  const searchableItems = useMemo(
    () => buildSearchableItems(specifications),
    [specifications]
  );

  // Fuse 인스턴스 생성
  const fuse = useMemo(() => {
    const fuseOptions: IFuseOptions<SearchableItem> = {
      keys: [
        { name: 'tableName', weight: 2.0 },
        { name: 'columnName', weight: 1.5 },
        { name: 'searchText', weight: 1.0 },
        { name: 'columnType', weight: 0.5 },
        { name: 'schemaName', weight: 0.3 },
      ],
      threshold,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 1,
      ignoreLocation: true, // 위치 무시 (어디서든 매칭)
      useExtendedSearch: true,
    };

    return new Fuse(searchableItems, fuseOptions);
  }, [searchableItems, threshold]);

  // 검색 수행
  const results = useMemo(() => {
    if (!query.trim()) {
      return [];
    }
    return fuse.search(query, { limit });
  }, [fuse, query, limit]);

  // 타입별로 그룹핑
  const groupedResults = useMemo((): SearchResultGroup[] => {
    const groups: Record<string, FuseResult<SearchableItem>[]> = {
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
    isEmpty: query.trim() !== '' && results.length === 0,
    isSearching: query.trim() !== '',
  };
}
