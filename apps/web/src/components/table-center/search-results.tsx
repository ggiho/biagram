'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type SearchResult, SearchCategory, CATEGORY_NAMES, CATEGORY_ICONS } from '@/types/table-center';

// 텍스트 하이라이트 헬퍼
function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/60 text-foreground rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

interface SearchResultsProps {
  groupedResults: Record<SearchCategory, SearchResult[]>;
  expandedCategories: Set<SearchCategory>;
  selectedTable: string | null;
  selectedResultIndex: number;
  searchQuery: string;
  onToggleCategory: (category: SearchCategory) => void;
  onSelectTable: (tableName: string) => void;
}

export function SearchResults({
  groupedResults,
  expandedCategories,
  selectedTable,
  selectedResultIndex,
  searchQuery,
  onToggleCategory,
  onSelectTable,
}: SearchResultsProps) {
  // 전체 결과 인덱스 계산용
  let globalIndex = 0;

  return (
    <div className="divide-y">
      {Object.entries(groupedResults).map(([category, results]) => {
        const cat = category as SearchCategory;
        const isExpanded = expandedCategories.has(cat);

        return (
          <div key={category}>
            {/* Category Header */}
            <button
              onClick={() => onToggleCategory(cat)}
              className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{CATEGORY_ICONS[cat]}</span>
                <span className="font-medium">{CATEGORY_NAMES[cat]}</span>
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                  {results.length}
                </span>
              </div>
              <div className={cn(
                'flex h-5 w-5 items-center justify-center rounded transition-colors',
                isExpanded ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </div>
            </button>

            {/* Results */}
            {isExpanded && (
              <div className="pb-2 pl-4">
                {results.map((result) => {
                  const currentIndex = globalIndex++;
                  const isKeyboardSelected = currentIndex === selectedResultIndex;
                  const isSelected = selectedTable === result.tableName;

                  return (
                    <button
                      key={result.id}
                      onClick={() => onSelectTable(result.tableName)}
                      className={cn(
                        'w-full text-left px-4 py-3 mx-2 rounded-lg transition-all',
                        'hover:bg-muted/50',
                        isSelected && 'bg-primary/10 border border-primary/20',
                        isKeyboardSelected && !isSelected && 'ring-2 ring-primary/50 ring-inset'
                      )}
                      style={{ width: 'calc(100% - 24px)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-sm">
                            {highlightText(result.tableName, searchQuery)}
                          </div>
                          {result.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {highlightText(result.description, searchQuery)}
                            </p>
                          )}
                          {result.matchContext && (
                            <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400 truncate">
                              {result.matchContext}
                            </p>
                          )}

                          {/* Relevance & Related */}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <span
                                className={cn(
                                  'font-medium',
                                  result.relevance >= 80 && 'text-green-600 dark:text-green-400',
                                  result.relevance >= 50 && result.relevance < 80 && 'text-yellow-600 dark:text-yellow-400',
                                  result.relevance < 50 && 'text-muted-foreground'
                                )}
                              >
                                {result.relevance}%
                              </span>
                              <span>match</span>
                            </span>
                            {result.relatedTables && result.relatedTables.length > 0 && (
                              <span>{result.relatedTables.length} related</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
