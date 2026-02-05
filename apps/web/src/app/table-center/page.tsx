'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTableCenter } from '@/hooks/use-table-center';
import {
  TableCenterHeader,
  SearchBar,
  FilterTabs,
  TableList,
  TableDetail,
  PIIReport,
  EmptyState,
  TableListSkeleton,
} from '@/components/table-center';
import { SearchCommand } from '@/components/table-center/search-command';

export default function TableCenterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const {
    // 데이터
    summaries,
    tablesBySchema,
    sortedSpecifications,
    selectedSpec,

    // 상태
    isLoading,
    selectedTable,
    sortBy,
    sortOrder,
    filterPII,
    showPIIReport,
    expandedSchemas,

    // 액션
    setSortBy,
    setSortOrder,
    setFilterPII,
    handleDBImport,
    handleSelectTable: _handleSelectTable,
    toggleSchema,
    togglePIIReport,
  } = useTableCenter();

  const [isSearchCommandOpen, setIsSearchCommandOpen] = useState(false);
  const isInitialUrlLoad = useRef(true);
  
  // URL과 동기화된 테이블 선택 핸들러
  const handleSelectTable = useCallback((tableName: string) => {
    _handleSelectTable(tableName);
    // URL 업데이트 (히스토리에 추가)
    const params = new URLSearchParams(searchParams.toString());
    params.set('table', tableName);
    router.push(`/table-center?${params.toString()}`);
  }, [_handleSelectTable, router, searchParams]);
  
  // URL에서 테이블 파라미터 읽어서 선택 (초기 로드 & 뒤로가기/앞으로가기)
  useEffect(() => {
    const tableFromUrl = searchParams.get('table');
    if (sortedSpecifications.length > 0) {
      if (tableFromUrl) {
        // URL에 테이블이 있으면 선택 (현재 선택과 다를 때만)
        if (tableFromUrl !== selectedTable) {
          _handleSelectTable(tableFromUrl);
        }
      } else if (selectedTable && !isInitialUrlLoad.current) {
        // URL에 테이블이 없고, 현재 선택된 테이블이 있으면 초기화 (뒤로가기로 초기 상태로 돌아온 경우)
        _handleSelectTable('');
      }
    }
    isInitialUrlLoad.current = false;
  }, [searchParams, sortedSpecifications, selectedTable, _handleSelectTable]);

  // Cmd+K 단축키로 검색 Command 열기
  const handleOpenSearch = useCallback(() => {
    setIsSearchCommandOpen(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleOpenSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpenSearch]);


  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Search Command (Spotlight-style) */}
      <SearchCommand
        open={isSearchCommandOpen}
        onOpenChange={setIsSearchCommandOpen}
        specifications={sortedSpecifications}
        onSelectTable={handleSelectTable}
      />

      {/* Header */}
      <TableCenterHeader onDBImport={handleDBImport} />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Table List */}
        <aside className="w-80 border-r flex flex-col bg-background">
          {/* Search & Sort Controls */}
          <SearchBar
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortOrder={sortOrder}
            onSortOrderToggle={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            onOpenSearch={handleOpenSearch}
          />

          {/* Filter Tabs */}
          <FilterTabs
            filterPII={filterPII}
            showPIIReport={showPIIReport}
            onFilterPIIChange={setFilterPII}
            onTogglePIIReport={togglePIIReport}
          />

          {/* Table List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <TableListSkeleton />
            ) : (
              <TableList
                tablesBySchema={tablesBySchema}
                expandedSchemas={expandedSchemas}
                selectedTable={selectedTable}
                onToggleSchema={toggleSchema}
                onSelectTable={handleSelectTable}
              />
            )}
          </div>
        </aside>

        {/* Right Panel - Table Detail or PII Report */}
        <main className="flex-1 overflow-y-auto">
          {showPIIReport ? (
            <PIIReport
              specifications={sortedSpecifications}
              onSelectTable={handleSelectTable}
            />
          ) : selectedSpec ? (
            <TableDetail spec={selectedSpec} onSelectTable={handleSelectTable} />
          ) : (
            <EmptyState type={isLoading ? 'loading' : summaries.length === 0 ? 'no-data' : 'no-selection'} />
          )}
        </main>
      </div>
    </div>
  );
}
