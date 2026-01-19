'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Table, Columns, MessageSquare, Key, Link2, ArrowRight, Command, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFuzzySearch, type SearchResultGroup, type SearchableItem } from '@/hooks/use-fuzzy-search';
import type { TableSpecification } from '@biagram/shared';
import type { FuseResult } from 'fuse.js';

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specifications: TableSpecification[];
  onSelectTable: (tableName: string) => void;
}

// 하이라이트 헬퍼
function highlightMatches(text: string, indices?: readonly [number, number][]) {
  if (!indices || indices.length === 0) return text;

  const result: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const [start, end] of indices) {
    if (start > lastIndex) {
      result.push(text.substring(lastIndex, start));
    }
    result.push(
      <mark key={start} className="bg-yellow-200 dark:bg-yellow-800/60 text-foreground rounded-sm px-0.5">
        {text.substring(start, end + 1)}
      </mark>
    );
    lastIndex = end + 1;
  }

  if (lastIndex < text.length) {
    result.push(text.substring(lastIndex));
  }

  return result;
}

// 결과 아이템 컴포넌트
function ResultItem({
  result,
  isSelected,
  onClick,
}: {
  result: FuseResult<SearchableItem>;
  isSelected: boolean;
  onClick: () => void;
}) {
  const item = result.item;
  const matches = result.matches || [];

  // 매칭된 필드에서 하이라이트 인덱스 찾기
  const getHighlightIndices = (key: string) => {
    const match = matches.find((m) => m.key === key);
    return match?.indices;
  };

  if (item.type === 'table') {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
          'hover:bg-muted/80',
          isSelected && 'bg-primary/10 ring-1 ring-primary/30'
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
          <Table className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {highlightMatches(item.tableName, getHighlightIndices('tableName'))}
          </div>
          {item.schemaName && (
            <div className="text-xs text-muted-foreground truncate">
              Schema: {item.schemaName}
            </div>
          )}
          {item.tableDescription && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {item.tableDescription.substring(0, 60)}
              {item.tableDescription.length > 60 && '...'}
            </div>
          )}
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </button>
    );
  }

  if (item.type === 'column') {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
          'hover:bg-muted/80',
          isSelected && 'bg-primary/10 ring-1 ring-primary/30'
        )}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400">
          <Columns className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{item.tableName}.</span>
            <span className="font-medium text-sm">
              {highlightMatches(item.columnName || '', getHighlightIndices('columnName'))}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{item.columnType}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {item.isPrimaryKey && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                <Key className="h-2.5 w-2.5" />
                PK
              </span>
            )}
            {item.isForeignKey && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
                <Link2 className="h-2.5 w-2.5" />
                FK{item.foreignKeyRef && ` → ${item.foreignKeyRef}`}
              </span>
            )}
            {item.isPII && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-red-600 dark:text-red-400">
                <Lock className="h-2.5 w-2.5" />
                PII
              </span>
            )}
            {item.columnDescription && (
              <span className="text-xs text-muted-foreground truncate">
                {/* PII 컬럼은 *로 시작하므로 제거 */}
                {item.isPII 
                  ? item.columnDescription.substring(1).trim().substring(0, 40)
                  : item.columnDescription.substring(0, 40)}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  }

  // comment
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
        'hover:bg-muted/80',
        isSelected && 'bg-primary/10 ring-1 ring-primary/30'
      )}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400">
        <MessageSquare className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {item.tableName}
            {item.columnName && `.${item.columnName}`}
          </span>
        </div>
        <div className="text-sm text-foreground truncate">
          {highlightMatches(item.columnDescription || item.tableDescription || '', getHighlightIndices('searchText'))}
        </div>
      </div>
    </button>
  );
}

// 그룹 헤더 컴포넌트
function GroupHeader({ group }: { group: SearchResultGroup }) {
  const IconComponent = {
    table: Table,
    column: Columns,
    comment: MessageSquare,
  }[group.type];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {IconComponent && <IconComponent className="h-3.5 w-3.5" />}
      <span>{group.label}</span>
      <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
        {group.results.length}
      </span>
    </div>
  );
}

export function SearchCommand({
  open,
  onOpenChange,
  specifications,
  onSelectTable,
}: SearchCommandProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeFilter, setActiveFilter] = useState<'all' | 'table' | 'column' | 'comment'>('all');

  const { query, search, clear, groupedResults, totalCount, isEmpty } = useFuzzySearch(
    specifications,
    { threshold: 0.2, limit: 30 } // 0.2 = 더 정확한 매칭만 허용
  );

  // 필터링된 결과
  const filteredGroups =
    activeFilter === 'all'
      ? groupedResults
      : groupedResults.filter((g) => g.type === activeFilter);

  // 전체 결과 배열 (선택용)
  const allResults = filteredGroups.flatMap((g) => g.results);

  // 열릴 때 포커스
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    }
  }, [open]);

  // 선택 인덱스 범위 조정
  useEffect(() => {
    if (selectedIndex >= allResults.length) {
      setSelectedIndex(Math.max(0, allResults.length - 1));
    }
  }, [allResults.length, selectedIndex]);

  // 선택된 아이템으로 스크롤
  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // 아이템 선택 핸들러
  const handleSelect = useCallback(
    (item: SearchableItem) => {
      onSelectTable(item.tableName);
      onOpenChange(false);
      clear();
    },
    [onSelectTable, onOpenChange, clear]
  );

  // 키보드 핸들러
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, allResults.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (allResults[selectedIndex]) {
            handleSelect(allResults[selectedIndex].item);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onOpenChange(false);
          clear();
          break;
        case 'Tab':
          e.preventDefault();
          // 필터 순환
          const filters = ['all', 'table', 'column', 'comment'] as const;
          const currentIdx = filters.indexOf(activeFilter);
          const nextFilter = filters[(currentIdx + 1) % filters.length] ?? 'all';
          setActiveFilter(nextFilter);
          break;
      }
    },
    [allResults, selectedIndex, handleSelect, onOpenChange, clear, activeFilter]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => {
          onOpenChange(false);
          clear();
        }}
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-[15%] -translate-x-1/2 w-full max-w-2xl px-4">
        <div
          className="bg-background border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200"
          onKeyDown={handleKeyDown}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search tables, columns, comments..."
              className="flex-1 bg-transparent outline-none text-base placeholder:text-muted-foreground"
            />
            {query && (
              <button
                onClick={clear}
                className="p-1 hover:bg-muted rounded-md transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs text-muted-foreground">
              <Command className="h-3 w-3" />K
            </kbd>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30">
            <button
              onClick={() => setActiveFilter('all')}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                activeFilter === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              All
            </button>
            <button
              onClick={() => setActiveFilter('table')}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1',
                activeFilter === 'table'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Table className="h-3.5 w-3.5" />
              Tables
            </button>
            <button
              onClick={() => setActiveFilter('column')}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1',
                activeFilter === 'column'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Columns className="h-3.5 w-3.5" />
              Columns
            </button>
            <button
              onClick={() => setActiveFilter('comment')}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1',
                activeFilter === 'comment'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Comments
            </button>
            <span className="ml-auto text-xs text-muted-foreground">
              Tab to switch
            </span>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-[400px] overflow-y-auto p-2"
          >
            {!query.trim() ? (
              <div className="py-12 text-center">
                <Search className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Start typing to search tables, columns, and comments
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use Tab to filter by type
                </p>
              </div>
            ) : isEmpty ? (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No results found for "{query}"
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try a different search term
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredGroups.map((group) => (
                  <div key={group.type}>
                    <GroupHeader group={group} />
                    <div className="space-y-0.5">
                      {group.results.map((result, idx) => {
                        // 전체 인덱스 계산
                        let globalIndex = 0;
                        for (const g of filteredGroups) {
                          if (g.type === group.type) break;
                          globalIndex += g.results.length;
                        }
                        globalIndex += idx;

                        return (
                          <div
                            key={result.item.id}
                            data-selected={selectedIndex === globalIndex}
                          >
                            <ResultItem
                              result={result}
                              isSelected={selectedIndex === globalIndex}
                              onClick={() => handleSelect(result.item)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">↑↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">Enter</kbd>
                Select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd>
                Close
              </span>
            </div>
            {totalCount > 0 && <span>{totalCount} results</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
