'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, FileText, Table, ArrowLeft, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/hooks/use-toast';
import { loadDraft } from '@/lib/storage';
import { SearchCategory, type TableSpecification, type SpecificationSummary, type SearchResult } from '@biagram/shared';

// Helper function to highlight matched text
function highlightText(text: string, query: string) {
  if (!query.trim()) return text;

  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-900 text-foreground">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// Get category display name in Korean
function getCategoryName(category: SearchCategory): string {
  const names: Record<SearchCategory, string> = {
    [SearchCategory.EXACT_TABLE]: '정확히 일치',
    [SearchCategory.TABLE_PARTIAL]: '테이블명 포함',
    [SearchCategory.COLUMN_NAME]: '컬럼명 매칭',
    [SearchCategory.DESCRIPTION]: '설명 매칭',
    [SearchCategory.RELATED_TABLE]: '관련 테이블',
  };
  return names[category];
}

// Get category emoji icon
function getCategoryIcon(category: SearchCategory): string {
  const icons: Record<SearchCategory, string> = {
    [SearchCategory.EXACT_TABLE]: '🎯',
    [SearchCategory.TABLE_PARTIAL]: '📋',
    [SearchCategory.COLUMN_NAME]: '🔤',
    [SearchCategory.DESCRIPTION]: '📝',
    [SearchCategory.RELATED_TABLE]: '🔗',
  };
  return icons[category];
}

export default function TableCenterPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [dbmlContent, setDbmlContent] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'columnCount' | 'relationshipCount'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filterFK, setFilterFK] = useState(false);
  const [filterRelations, setFilterRelations] = useState(false);

  // Category collapse states
  const [expandedCategories, setExpandedCategories] = useState<Set<SearchCategory>>(
    new Set(Object.values(SearchCategory))
  );

  // Keyboard navigation
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  // Load DBML from draft
  useEffect(() => {
    const draft = loadDraft();
    console.log('🔍 Table Center: Checking localStorage for draft:', draft ? 'FOUND' : 'NOT FOUND');
    if (draft?.code) {
      console.log('📂 Loading DBML from draft for specification generation');
      console.log('📝 DBML content length:', draft.code.length);
      setDbmlContent(draft.code);
    } else {
      console.log('❌ No draft found in localStorage');
      toast({
        title: 'No Diagram Found',
        description: 'Please create a diagram in the editor first',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Generate specifications from DBML
  const [specificationsData, setSpecificationsData] = useState<any>(null);
  const [fullSpecifications, setFullSpecifications] = useState<TableSpecification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const generateSpecifications = trpc.specifications.generate.useMutation({
    onSuccess: (data) => {
      console.log('✅ Specifications generated successfully:', data.specifications?.length || 0);
      setFullSpecifications(data.specifications || []);
      setSpecificationsData({ summaries: data.summary || [] });
      setIsLoading(false);
    },
    onError: (error) => {
      console.error('❌ Failed to generate specifications:', error);
      setIsLoading(false);
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate table specifications',
        variant: 'destructive',
      });
    },
  });

  // Trigger specification generation when DBML content changes
  useEffect(() => {
    if (dbmlContent) {
      console.log('🔄 Generating specifications...');
      setIsLoading(true);
      generateSpecifications.mutate({
        content: dbmlContent,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbmlContent]);

  // Search when query is provided
  const { data: searchData } = trpc.specifications.search.useQuery(
    {
      q: searchQuery,
      content: dbmlContent,
    },
    {
      enabled: !!dbmlContent && !!searchQuery.trim(),
    }
  );

  // Sort specifications in memory
  const sortedSpecifications = useMemo(() => {
    if (fullSpecifications.length === 0) return [];

    const sorted = [...fullSpecifications].sort((a, b) => {
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

    return sorted;
  }, [fullSpecifications, sortBy, sortOrder]);

  // Generate summaries from sorted specifications
  const summaries = useMemo(() => {
    return sortedSpecifications.map((spec): SpecificationSummary => ({
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
    }));
  }, [sortedSpecifications]);

  const searchResults = searchData?.results || [];

  // Debug logging
  useEffect(() => {
    if (searchQuery.trim()) {
      console.log('🔍 Search query:', searchQuery);
      console.log('📊 Search data:', searchData);
      console.log('📋 Search results count:', searchResults.length);
      if (searchResults.length > 0) {
        console.log('✅ First result:', searchResults[0]);
      }
    }
  }, [searchQuery, searchData, searchResults]);

  // Filter specifications by search query and filters
  const filteredSummaries = (() => {
    // When searching, use search results
    if (searchQuery.trim() && searchResults.length > 0) {
      return searchResults
        .map((result) => {
          const summary = summaries.find((s: SpecificationSummary) => s.tableName === result.tableName);
          if (!summary) return null;

          // Apply additional filters (using summary data only)
          if (filterFK && !summary.hasForeignKeys) return null;
          if (filterRelations && summary.relationshipCount === 0) return null;

          // Attach highlights to summary for display
          return { ...summary, highlights: result.highlights };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
    }

    // When not searching, use client-side filtering
    return summaries.filter((summary: SpecificationSummary) => {
      // Foreign key filter
      if (filterFK) {
        if (!summary.hasForeignKeys) return false;
      }

      // Relationships filter
      if (filterRelations) {
        if (summary.relationshipCount === 0) return false;
      }

      return true;
    });
  })();

  // Group search results by category
  const groupedResults = (() => {
    if (!searchQuery.trim() || searchResults.length === 0) {
      return null;
    }

    const groups = searchResults.reduce((acc, result) => {
      if (!acc[result.category]) {
        acc[result.category] = [];
      }
      acc[result.category].push(result);
      return acc;
    }, {} as Record<SearchCategory, SearchResult[]>);

    return groups;
  })();

  // Toggle category expansion
  const toggleCategory = useCallback((category: SearchCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!groupedResults) return;

      const allResults = Object.values(groupedResults).flat();
      if (allResults.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedResultIndex(prev =>
            prev < allResults.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedResultIndex(prev => prev > 0 ? prev - 1 : prev);
          break;
        case 'Enter':
          e.preventDefault();
          const selected = allResults[selectedResultIndex];
          if (selected) {
            setSelectedTable(selected.tableName);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setSearchQuery('');
          setSelectedResultIndex(0);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [groupedResults, selectedResultIndex]);

  // Get selected table specification from cached data
  const selectedSpec = useMemo(() => {
    if (!selectedTable || sortedSpecifications.length === 0) return null;
    return sortedSpecifications.find(spec => spec.tableName === selectedTable) || null;
  }, [selectedTable, sortedSpecifications]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Table Center</h1>
          <span className="text-sm text-muted-foreground">
            {summaries.length} tables
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/editor">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Editor
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Table List */}
        <div className="w-80 border-r flex flex-col">
          {/* Search Bar */}
          <div className="p-4 border-b space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Sort Controls */}
            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="columnCount">Columns</SelectItem>
                  <SelectItem value="relationshipCount">Relations</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>

            {/* Filter Controls */}
            <div className="space-y-2 pt-2 border-t">
              <div className="text-xs font-medium text-muted-foreground">Filters</div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-fk"
                  checked={filterFK}
                  onCheckedChange={(checked) => setFilterFK(checked === true)}
                />
                <label
                  htmlFor="filter-fk"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Has Foreign Keys
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-relations"
                  checked={filterRelations}
                  onCheckedChange={(checked) => setFilterRelations(checked === true)}
                />
                <label
                  htmlFor="filter-relations"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Has Relationships
                </label>
              </div>
            </div>
          </div>

          {/* Table List */}
          <div className="flex-1 overflow-y-auto" ref={listRef}>
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="text-sm text-muted-foreground">
                  Loading specifications...
                </div>
              </div>
            ) : groupedResults ? (
              /* Categorized Search Results */
              <div className="divide-y">
                {Object.entries(groupedResults)
                  .sort(([catA], [catB]) => {
                    // Sort by category priority
                    const order = [
                      SearchCategory.EXACT_TABLE,
                      SearchCategory.TABLE_PARTIAL,
                      SearchCategory.COLUMN_NAME,
                      SearchCategory.DESCRIPTION,
                      SearchCategory.RELATED_TABLE,
                    ];
                    return order.indexOf(catA as SearchCategory) - order.indexOf(catB as SearchCategory);
                  })
                  .map(([category, results]) => (
                    <div key={category}>
                      {/* Category Header */}
                      <button
                        onClick={() => toggleCategory(category as SearchCategory)}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors font-medium text-sm border-b"
                      >
                        <div className="flex items-center gap-2">
                          <span>{getCategoryIcon(category as SearchCategory)}</span>
                          <span>{getCategoryName(category as SearchCategory)}</span>
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {results.length}
                          </span>
                        </div>
                        {expandedCategories.has(category as SearchCategory) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      {/* Category Results */}
                      {expandedCategories.has(category as SearchCategory) && (
                        <div>
                          {results.map((result) => {
                            const allResults = Object.values(groupedResults).flat();
                            const globalIndex = allResults.findIndex(r => r.id === result.id);
                            const isKeyboardSelected = globalIndex === selectedResultIndex;

                            return (
                              <button
                                key={result.id}
                                onClick={() => setSelectedTable(result.tableName)}
                                className={`w-full text-left p-4 pl-8 hover:bg-muted/50 transition-colors ${
                                  selectedTable === result.tableName ? 'bg-muted' : ''
                                } ${isKeyboardSelected ? 'ring-2 ring-primary ring-inset' : ''}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">
                                      {highlightText(result.tableName, searchQuery)}
                                    </div>
                                    {result.description && (
                                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                        {highlightText(result.description, searchQuery)}
                                      </div>
                                    )}
                                    {result.matchContext && (
                                      <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 truncate">
                                        {result.matchContext}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                      <span className="inline-flex items-center gap-1">
                                        <span className="font-medium">{result.relevance}%</span>
                                        <span>relevance</span>
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
                  ))}
              </div>
            ) : filteredSummaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <Table className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm font-medium">No tables found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {searchQuery
                    ? 'Try a different search term'
                    : 'Create a diagram in the editor first'}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredSummaries.map((summary: SpecificationSummary) => {
                  const summaryWithHighlights = summary as typeof summary & { highlights?: Array<{ field: string; text: string }> };
                  const hasHighlights = summaryWithHighlights.highlights && summaryWithHighlights.highlights.length > 0;

                  return (
                    <button
                      key={summary.id}
                      onClick={() => setSelectedTable(summary.tableName)}
                      className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
                        selectedTable === summary.tableName ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {searchQuery.trim() ? highlightText(summary.tableName, searchQuery) : summary.tableName}
                          </div>
                          {summary.description && (
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {searchQuery.trim() ? highlightText(summary.description, searchQuery) : summary.description}
                            </div>
                          )}
                          {hasHighlights && (
                            <div className="mt-2 space-y-1">
                              {summaryWithHighlights.highlights!.slice(0, 2).map((highlight: { field: string; text: string }, idx: number) => (
                                <div key={idx} className="text-xs text-blue-600 dark:text-blue-400">
                                  {highlight.field === 'column' && `Column: ${highlight.text}`}
                                  {highlight.field === 'description' && `Match in description`}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span>{summary.columnCount} columns</span>
                            <span>{summary.relationshipCount} relations</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Table Detail */}
        <div className="flex-1 overflow-y-auto">
          {selectedSpec ? (
            <div className="p-6">
              {/* Table Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold">{selectedSpec.tableName}</h2>
                {selectedSpec.schemaName && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Schema: {selectedSpec.schemaName}
                  </p>
                )}
                {selectedSpec.description && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {selectedSpec.description}
                  </p>
                )}
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">
                    {selectedSpec.stats.columnCount}
                  </div>
                  <div className="text-xs text-muted-foreground">Columns</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">
                    {selectedSpec.stats.relationshipCount}
                  </div>
                  <div className="text-xs text-muted-foreground">Relations</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">
                    {selectedSpec.stats.primaryKeyCount}
                  </div>
                  <div className="text-xs text-muted-foreground">Primary Keys</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">
                    {selectedSpec.stats.foreignKeyCount}
                  </div>
                  <div className="text-xs text-muted-foreground">Foreign Keys</div>
                </div>
              </div>

              {/* Columns */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Columns</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium text-sm">Name</th>
                        <th className="text-left p-3 font-medium text-sm">Type</th>
                        <th className="text-left p-3 font-medium text-sm">Constraints</th>
                        <th className="text-left p-3 font-medium text-sm">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedSpec.columns.map((column: import('@biagram/shared').ColumnSpecification) => (
                        <tr key={column.name} className="hover:bg-muted/30">
                          <td className="p-3 font-mono text-sm">{column.name}</td>
                          <td className="p-3 text-sm">{column.type}</td>
                          <td className="p-3 text-sm">
                            <div className="flex flex-wrap gap-1">
                              {column.primaryKey && (
                                <span className="inline-block px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                                  PK
                                </span>
                              )}
                              {column.foreignKey && (
                                <span className="inline-block px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                                  FK
                                </span>
                              )}
                              {column.unique && (
                                <span className="inline-block px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                                  UNIQUE
                                </span>
                              )}
                              {!column.nullable && (
                                <span className="inline-block px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 rounded">
                                  NOT NULL
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {column.description || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Relationships */}
              {(selectedSpec.relationships.incoming.length > 0 ||
                selectedSpec.relationships.outgoing.length > 0) && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Relationships</h3>

                  {selectedSpec.relationships.incoming.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium mb-2">Incoming</h4>
                      <div className="space-y-2">
                        {selectedSpec.relationships.incoming.map((rel: { fromTable: string; fromColumn: string; type: string }, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 border rounded-lg text-sm"
                          >
                            <span className="font-mono">{rel.fromTable}</span>
                            <span className="text-muted-foreground mx-2">→</span>
                            <span className="font-mono">{selectedSpec.tableName}</span>
                            <span className="text-muted-foreground ml-2">
                              ({rel.fromColumn})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedSpec.relationships.outgoing.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Outgoing</h4>
                      <div className="space-y-2">
                        {selectedSpec.relationships.outgoing.map((rel: { toTable: string; toColumn: string; type: string }, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 border rounded-lg text-sm"
                          >
                            <span className="font-mono">{selectedSpec.tableName}</span>
                            <span className="text-muted-foreground mx-2">→</span>
                            <span className="font-mono">{rel.toTable}</span>
                            <span className="text-muted-foreground ml-2">
                              ({rel.toColumn})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Select a table</p>
              <p className="text-sm text-muted-foreground mt-1">
                Choose a table from the list to view its specification
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
