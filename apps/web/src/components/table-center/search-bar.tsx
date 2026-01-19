'use client';

import { Search, ArrowUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SortBy, SortOrder } from '@/types/table-center';

interface SearchBarProps {
  sortBy: SortBy;
  onSortByChange: (value: SortBy) => void;
  sortOrder: SortOrder;
  onSortOrderToggle: () => void;
  onOpenSearch: () => void;
}

export function SearchBar({
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderToggle,
  onOpenSearch,
}: SearchBarProps) {
  return (
    <div className="p-4 border-b space-y-3">
      {/* Search Trigger */}
      <button
        onClick={onOpenSearch}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted rounded-lg border border-transparent hover:border-border transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search tables, columns...</span>
        <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Sort Controls */}
      <div className="flex gap-2">
        <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortBy)}>
          <SelectTrigger className="flex-1 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort by Name</SelectItem>
            <SelectItem value="columnCount">Sort by Columns</SelectItem>
            <SelectItem value="relationshipCount">Sort by Relations</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onSortOrderToggle}
          title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        >
          <ArrowUpDown className={`h-3.5 w-3.5 transition-transform ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
        </Button>
      </div>
    </div>
  );
}
