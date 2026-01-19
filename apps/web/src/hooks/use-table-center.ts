/**
 * Table Center Custom Hook
 * 테이블 센터 상태 관리 및 데이터 로직
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/hooks/use-toast';
import { loadDraft } from '@/lib/storage';
import {
  type SortBy,
  type SortOrder,
  type ExtendedSummary,
  type TableSpecification,
  type SearchResult,
  SearchCategory,
  CATEGORY_ORDER,
} from '@/types/table-center';

export function useTableCenter() {
  // 기본 상태
  const [dbmlContent, setDbmlContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fullSpecifications, setFullSpecifications] = useState<TableSpecification[]>([]);

  // 검색 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);

  // 정렬 상태
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // 필터 상태
  const [filterFK, setFilterFK] = useState(false);
  const [filterRelations, setFilterRelations] = useState(false);
  const [filterPII, setFilterPII] = useState(false);

  // 뷰 상태
  const [showPIIReport, setShowPIIReport] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<SearchCategory>>(
    new Set(Object.values(SearchCategory))
  );

  const { toast } = useToast();

  // 검색 디바운스 (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Draft 로드
  useEffect(() => {
    const draft = loadDraft();
    if (draft?.code) {
      setDbmlContent(draft.code);
    } else {
      toast({
        title: 'No Diagram Found',
        description: 'Please create a diagram in the editor first',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // tRPC mutations/queries
  const generateSpecifications = trpc.specifications.generate.useMutation({
    onSuccess: (data) => {
      setFullSpecifications(data.specifications || []);
      setIsLoading(false);
    },
    onError: (error) => {
      setIsLoading(false);
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate table specifications',
        variant: 'destructive',
      });
    },
  });

  // 스펙 생성 트리거
  useEffect(() => {
    if (dbmlContent) {
      setIsLoading(true);
      generateSpecifications.mutate({ content: dbmlContent });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbmlContent]);

  // 검색 쿼리
  const { data: searchData, isLoading: isSearching } = trpc.specifications.search.useQuery(
    { q: searchDebounced, content: dbmlContent },
    { enabled: !!dbmlContent && !!searchDebounced.trim() }
  );

  const searchResults = searchData?.results || [];

  // 정렬된 스펙
  const sortedSpecifications = useMemo(() => {
    if (fullSpecifications.length === 0) return [];

    return [...fullSpecifications].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.tableName.localeCompare(b.tableName);
          break;
        case 'columnCount':
          comparison = a.stats.columnCount - b.stats.columnCount;
          break;
        case 'relationshipCount':
          comparison = a.stats.relationshipCount - b.stats.relationshipCount;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [fullSpecifications, sortBy, sortOrder]);

  // Summary 생성 (PII 카운트 포함)
  const summaries = useMemo((): ExtendedSummary[] => {
    return sortedSpecifications.map((spec) => {
      const piiCount = spec.columns.filter((col: any) => col.description?.startsWith('*')).length;
      return {
        id: spec.id,
        tableName: spec.tableName,
        schemaName: spec.schemaName,
        description: spec.description,
        columnCount: spec.stats.columnCount,
        relationshipCount: spec.stats.relationshipCount,
        hasIndexes: spec.stats.indexCount > 0,
        hasForeignKeys: spec.stats.foreignKeyCount > 0,
        tags: spec.tags,
        category: spec.category,
        updatedAt: spec.updatedAt,
        piiCount,
      };
    });
  }, [sortedSpecifications]);

  // 필터링된 Summary
  const filteredSummaries = useMemo((): ExtendedSummary[] => {
    // 검색 시 검색 결과 기반
    if (searchDebounced.trim() && searchResults.length > 0) {
      return searchResults
        .map((result) => {
          const summary = summaries.find((s) => s.tableName === result.tableName);
          if (!summary) return null;
          if (filterFK && !summary.hasForeignKeys) return null;
          if (filterRelations && summary.relationshipCount === 0) return null;
          if (filterPII && (!summary.piiCount || summary.piiCount === 0)) return null;
          return { ...summary, highlights: result.highlights };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
    }

    // 일반 필터링
    return summaries.filter((summary) => {
      if (filterFK && !summary.hasForeignKeys) return false;
      if (filterRelations && summary.relationshipCount === 0) return false;
      if (filterPII && (!summary.piiCount || summary.piiCount === 0)) return false;
      return true;
    });
  }, [summaries, searchDebounced, searchResults, filterFK, filterRelations, filterPII]);

  // 스키마별 그룹핑
  const tablesBySchema = useMemo(() => {
    const grouped = new Map<string, ExtendedSummary[]>();

    filteredSummaries.forEach((summary) => {
      let schema = summary.schemaName;
      if (!schema && summary.tableName.includes('.')) {
        schema = summary.tableName.split('.')[0];
      }
      schema = schema || 'No Schema';

      if (!grouped.has(schema)) {
        grouped.set(schema, []);
      }
      grouped.get(schema)!.push(summary);
    });

    return grouped;
  }, [filteredSummaries]);

  // 카테고리별 검색 결과 그룹핑
  const groupedResults = useMemo(() => {
    if (!searchDebounced.trim() || searchResults.length === 0) return null;

    const groups = searchResults.reduce((acc, result) => {
      if (!acc[result.category]) {
        acc[result.category] = [];
      }
      acc[result.category].push(result);
      return acc;
    }, {} as Record<SearchCategory, SearchResult[]>);

    // 카테고리 우선순위로 정렬된 엔트리 반환
    const sortedEntries = CATEGORY_ORDER
      .filter((cat) => groups[cat])
      .map((cat) => [cat, groups[cat]] as const);

    return Object.fromEntries(sortedEntries) as Record<SearchCategory, SearchResult[]>;
  }, [searchDebounced, searchResults]);

  // 선택된 테이블 스펙
  const selectedSpec = useMemo(() => {
    if (!selectedTable || sortedSpecifications.length === 0) return null;
    const spec = sortedSpecifications.find((s) => s.tableName === selectedTable);
    if (!spec) return null;

    // 스키마 추출
    if (!spec.schemaName && spec.tableName.includes('.')) {
      spec.schemaName = spec.tableName.split('.')[0];
    }

    return spec;
  }, [selectedTable, sortedSpecifications]);

  // 토글 함수들
  const toggleSchema = useCallback((schema: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schema)) {
        next.delete(schema);
      } else {
        next.add(schema);
      }
      return next;
    });
  }, []);

  const toggleCategory = useCallback((category: SearchCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // DB 임포트 핸들러
  const handleDBImport = useCallback(
    (dbml: string) => {
      setDbmlContent(dbml);
      toast({
        title: 'Database Imported',
        description: 'Schema successfully imported from database',
      });
    },
    [toast]
  );

  // 테이블 선택 핸들러
  const handleSelectTable = useCallback((tableName: string) => {
    setSelectedTable(tableName);
    setShowPIIReport(false);
  }, []);

  // PII 리포트 토글
  const togglePIIReport = useCallback(() => {
    setShowPIIReport((prev) => {
      if (!prev) setSelectedTable(null);
      return !prev;
    });
  }, []);

  // 키보드 네비게이션
  const handleKeyboardNavigation = useCallback(
    (e: KeyboardEvent) => {
      if (!groupedResults) return;

      const allResults = Object.values(groupedResults).flat();
      if (allResults.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedResultIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedResultIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          e.preventDefault();
          const selected = allResults[selectedResultIndex];
          if (selected) handleSelectTable(selected.tableName);
          break;
        case 'Escape':
          e.preventDefault();
          setSearchQuery('');
          setSelectedResultIndex(0);
          break;
      }
    },
    [groupedResults, selectedResultIndex, handleSelectTable]
  );

  // 키보드 이벤트 등록
  useEffect(() => {
    window.addEventListener('keydown', handleKeyboardNavigation);
    return () => window.removeEventListener('keydown', handleKeyboardNavigation);
  }, [handleKeyboardNavigation]);

  return {
    // 데이터
    dbmlContent,
    summaries,
    filteredSummaries,
    sortedSpecifications,
    tablesBySchema,
    groupedResults,
    searchResults,
    selectedSpec,

    // 상태
    isLoading,
    isSearching,
    searchQuery,
    selectedTable,
    selectedResultIndex,
    sortBy,
    sortOrder,
    filterFK,
    filterRelations,
    filterPII,
    showPIIReport,
    expandedSchemas,
    expandedCategories,

    // 액션
    setSearchQuery,
    setSortBy,
    setSortOrder,
    setFilterFK,
    setFilterRelations,
    setFilterPII,
    setSelectedResultIndex,
    handleDBImport,
    handleSelectTable,
    toggleSchema,
    toggleCategory,
    togglePIIReport,
  };
}
