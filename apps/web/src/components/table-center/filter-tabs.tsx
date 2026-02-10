'use client';

import { Lock, FileWarning, LayoutGrid } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterTabsProps {
  filterPII: boolean;
  filterPartition: boolean;
  showPIIReport: boolean;
  onFilterPIIChange: (value: boolean) => void;
  onFilterPartitionChange: (value: boolean) => void;
  onTogglePIIReport: () => void;
}

export function FilterTabs({
  filterPII,
  filterPartition,
  showPIIReport,
  onFilterPIIChange,
  onFilterPartitionChange,
  onTogglePIIReport,
}: FilterTabsProps) {
  return (
    <div className="px-4 py-3 border-b">
      <div className="flex items-center gap-2">
        {/* PII Filter Toggle */}
        <button
          onClick={() => onFilterPIIChange(!filterPII)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
            'border',
            filterPII
              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700'
              : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-border'
          )}
        >
          <Lock className="h-3 w-3" />
          PII Only
        </button>

        {/* Partition Filter Toggle */}
        <button
          onClick={() => onFilterPartitionChange(!filterPartition)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
            'border',
            filterPartition
              ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700'
              : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-border'
          )}
        >
          <LayoutGrid className="h-3 w-3" />
          Partitioned
        </button>

        {/* PII Report Button */}
        <Button
          variant={showPIIReport ? 'default' : 'ghost'}
          size="sm"
          className="h-7 text-xs"
          onClick={onTogglePIIReport}
        >
          <FileWarning className="h-3.5 w-3.5 mr-1.5" />
          PII Report
        </Button>
      </div>
    </div>
  );
}
