'use client';

import { ChevronDown, ChevronRight, Table, Columns, Link2, Lock, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExtendedSummary } from '@/types/table-center';

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

interface TableListProps {
  tablesBySchema: Map<string, ExtendedSummary[]>;
  expandedSchemas: Set<string>;
  selectedTable: string | null;
  searchQuery: string;
  onToggleSchema: (schema: string) => void;
  onSelectTable: (tableName: string) => void;
}

export function TableList({
  tablesBySchema,
  expandedSchemas,
  selectedTable,
  searchQuery,
  onToggleSchema,
  onSelectTable,
}: TableListProps) {
  const sortedSchemas = Array.from(tablesBySchema.entries()).sort(([a], [b]) => {
    if (a === 'No Schema') return 1;
    if (b === 'No Schema') return -1;
    return a.localeCompare(b);
  });

  if (sortedSchemas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
          <Table className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No tables found</p>
        <p className="text-xs text-muted-foreground mt-1">
          {searchQuery ? 'Try a different search term' : 'Create a diagram in the editor first'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {sortedSchemas.map(([schema, tables]) => {
        if (tables.length === 0) return null;
        const isExpanded = expandedSchemas.has(schema);

        return (
          <div key={schema} className="border-b last:border-b-0">
            {/* Schema Header */}
            <button
              onClick={() => onToggleSchema(schema)}
              className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-sm sticky top-0 bg-background z-10"
            >
              <div className="flex items-center gap-2">
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
                <span className="font-medium">{schema}</span>
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {tables.length}
                </span>
              </div>
            </button>

            {/* Tables */}
            {isExpanded && (
              <div className="pb-2">
                {tables.map((summary) => {
                  const pureTableName = summary.tableName.includes('.')
                    ? summary.tableName.split('.').slice(1).join('.')
                    : summary.tableName;
                  const isSelected = selectedTable === summary.tableName;

                  return (
                    <button
                      key={summary.id}
                      onClick={() => onSelectTable(summary.tableName)}
                      className={cn(
                        'w-full text-left px-4 py-3 mx-2 rounded-lg transition-all',
                        'hover:bg-muted/50',
                        isSelected && 'bg-primary/10 border border-primary/20'
                      )}
                      style={{ width: 'calc(100% - 16px)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-sm">
                            {searchQuery.trim() ? highlightText(pureTableName, searchQuery) : pureTableName}
                          </div>
                          {summary.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {searchQuery.trim()
                                ? highlightText(summary.description, searchQuery)
                                : summary.description}
                            </p>
                          )}
                          
                          {/* Highlights from search */}
                          {summary.highlights && summary.highlights.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {summary.highlights.slice(0, 2).map((h, idx) => (
                                <div key={idx} className="text-xs text-blue-600 dark:text-blue-400 truncate">
                                  {h.field === 'column' && `Column: ${h.text}`}
                                  {h.field === 'description' && `Match: ${h.text}`}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Stats */}
                          <div className="flex items-center gap-3 mt-2">
                            <StatBadge icon={<Columns className="h-3 w-3" />} value={summary.columnCount} />
                            <StatBadge icon={<Link2 className="h-3 w-3" />} value={summary.relationshipCount} />
                            {summary.piiCount !== undefined && summary.piiCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                                <Lock className="h-3 w-3" />
                                {summary.piiCount}
                              </span>
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

function StatBadge({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {icon}
      {value}
    </span>
  );
}
