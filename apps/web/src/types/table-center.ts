/**
 * Table Center Types
 * 테이블 센터 UI에서 사용하는 타입 정의
 */

import { SearchCategory, type TableSpecification, type SpecificationSummary, type SearchResult } from '@biagram/shared';

// 정렬 기준
export type SortBy = 'name' | 'columnCount' | 'relationshipCount';
export type SortOrder = 'asc' | 'desc';

// 확장된 Summary (PII, 파티션 정보 포함)
export interface ExtendedSummary extends SpecificationSummary {
  piiCount?: number;
  partitionCount?: number;
  highlights?: Array<{ field: string; text: string }>;
}

// 필터 상태
export interface FilterState {
  filterFK: boolean;
  filterRelations: boolean;
  filterPII: boolean;
}

// 뷰 상태
export interface ViewState {
  showPIIReport: boolean;
  selectedTable: string | null;
  expandedSchemas: Set<string>;
  expandedCategories: Set<SearchCategory>;
}

// 검색 상태
export interface SearchState {
  query: string;
  isSearching: boolean;
  selectedResultIndex: number;
}

// 카테고리 정보
export interface CategoryInfo {
  name: string;
  icon: string;
}

// 카테고리 이름 매핑
export const CATEGORY_NAMES: Record<SearchCategory, string> = {
  [SearchCategory.EXACT_TABLE]: '정확히 일치',
  [SearchCategory.TABLE_PARTIAL]: '테이블명 포함',
  [SearchCategory.COLUMN_NAME]: '컬럼명 매칭',
  [SearchCategory.DESCRIPTION]: '설명 매칭',
  [SearchCategory.RELATED_TABLE]: '관련 테이블',
};

// 카테고리 아이콘 매핑
export const CATEGORY_ICONS: Record<SearchCategory, string> = {
  [SearchCategory.EXACT_TABLE]: '🎯',
  [SearchCategory.TABLE_PARTIAL]: '📋',
  [SearchCategory.COLUMN_NAME]: '🔤',
  [SearchCategory.DESCRIPTION]: '📝',
  [SearchCategory.RELATED_TABLE]: '🔗',
};

// 카테고리 정렬 우선순위
export const CATEGORY_ORDER = [
  SearchCategory.EXACT_TABLE,
  SearchCategory.TABLE_PARTIAL,
  SearchCategory.COLUMN_NAME,
  SearchCategory.DESCRIPTION,
  SearchCategory.RELATED_TABLE,
];

// 테이블 통계 카드 정보
export interface StatCardInfo {
  label: string;
  value: number;
  icon: string;
  colorClass: string;
}

// Re-export shared types
export type { TableSpecification, SpecificationSummary, SearchResult };
export { SearchCategory };
