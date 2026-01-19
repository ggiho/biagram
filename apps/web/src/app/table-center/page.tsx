'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useTableCenter } from '@/hooks/use-table-center';
import {
  TableCenterHeader,
  SearchBar,
  FilterTabs,
  TableList,
  SearchResults,
  TableDetail,
  PIIReport,
  EmptyState,
  TableListSkeleton,
} from '@/components/table-center';
import { SearchCommand } from '@/components/table-center/search-command';

export default function TableCenterPage() {
  const {
    // 데이터
    summaries,
    tablesBySchema,
    groupedResults,
    sortedSpecifications,
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
    handleDBImport,
    handleSelectTable,
    toggleSchema,
    toggleCategory,
    togglePIIReport,
  } = useTableCenter();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSearchCommandOpen, setIsSearchCommandOpen] = useState(false);

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

  // 스키마 자동 펼침 (검색 중이거나 첫 로드 시)
  useEffect(() => {
    if (!isLoading && tablesBySchema.size > 0 && expandedSchemas.size === 0) {
      // 첫 스키마 자동 펼침
      const firstSchema = Array.from(tablesBySchema.keys())[0];
      if (firstSchema) {
        toggleSchema(firstSchema);
      }
    }
  }, [isLoading, tablesBySchema, expandedSchemas.size, toggleSchema]);

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
      <TableCenterHeader
        tableCount={summaries.length}
        onDBImport={handleDBImport}
        onOpenSearch={handleOpenSearch}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Table List */}
        <aside className="w-80 border-r flex flex-col bg-background">
          {/* Search Bar */}
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortOrder={sortOrder}
            onSortOrderToggle={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            isSearching={isSearching}
            inputRef={searchInputRef}
          />

          {/* Filter Tabs */}
          <FilterTabs
            filterFK={filterFK}
            filterRelations={filterRelations}
            filterPII={filterPII}
            showPIIReport={showPIIReport}
            onFilterFKChange={setFilterFK}
            onFilterRelationsChange={setFilterRelations}
            onFilterPIIChange={setFilterPII}
            onTogglePIIReport={togglePIIReport}
          />

          {/* Table List / Search Results */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <TableListSkeleton />
            ) : groupedResults ? (
              <SearchResults
                groupedResults={groupedResults}
                expandedCategories={expandedCategories}
                selectedTable={selectedTable}
                selectedResultIndex={selectedResultIndex}
                searchQuery={searchQuery}
                onToggleCategory={toggleCategory}
                onSelectTable={handleSelectTable}
              />
            ) : (
              <TableList
                tablesBySchema={tablesBySchema}
                expandedSchemas={expandedSchemas}
                selectedTable={selectedTable}
                searchQuery={searchQuery}
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
            <TableDetail spec={selectedSpec} />
          ) : (
            <EmptyState type={isLoading ? 'loading' : summaries.length === 0 ? 'no-data' : 'no-selection'} />
          )}
        </main>
      </div>
    </div>
  );
}
