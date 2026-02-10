'use client';

import { Lock, FileWarning, LayoutGrid } from 'lucide-react';
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
    <div className="px-4 py-2.5 border-b">
      {/* 필터 토글 그룹 */}
      <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
        <button
          onClick={() => onFilterPIIChange(!filterPII)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            filterPII
              ? 'bg-background text-red-600 shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Lock className="h-3 w-3" />
          PII
        </button>

        <button
          onClick={() => onFilterPartitionChange(!filterPartition)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            filterPartition
              ? 'bg-background text-violet-600 shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LayoutGrid className="h-3 w-3" />
          Partition
        </button>

        <div className="w-px h-5 bg-border mx-0.5" />

        <button
          onClick={onTogglePIIReport}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
            showPIIReport
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileWarning className="h-3 w-3" />
          PII Report
        </button>
      </div>
    </div>
  );
}
