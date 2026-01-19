'use client';

import { Key, Link2, Lock, FileWarning } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterTabsProps {
  filterFK: boolean;
  filterRelations: boolean;
  filterPII: boolean;
  showPIIReport: boolean;
  onFilterFKChange: (value: boolean) => void;
  onFilterRelationsChange: (value: boolean) => void;
  onFilterPIIChange: (value: boolean) => void;
  onTogglePIIReport: () => void;
}

export function FilterTabs({
  filterFK,
  filterRelations,
  filterPII,
  showPIIReport,
  onFilterFKChange,
  onFilterRelationsChange,
  onFilterPIIChange,
  onTogglePIIReport,
}: FilterTabsProps) {
  return (
    <div className="p-3 border-b space-y-2">
      <div className="text-xs font-medium text-muted-foreground mb-2">Quick Filters</div>
      
      {/* Toggle Button Group */}
      <div className="flex flex-wrap gap-1.5">
        <FilterButton
          active={filterFK}
          onClick={() => onFilterFKChange(!filterFK)}
          icon={<Key className="h-3 w-3" />}
          label="FK"
        />
        <FilterButton
          active={filterRelations}
          onClick={() => onFilterRelationsChange(!filterRelations)}
          icon={<Link2 className="h-3 w-3" />}
          label="Relations"
        />
        <FilterButton
          active={filterPII}
          onClick={() => onFilterPIIChange(!filterPII)}
          icon={<Lock className="h-3 w-3" />}
          label="PII"
        />
      </div>

      {/* PII Report Button */}
      <Button
        variant={showPIIReport ? 'default' : 'outline'}
        size="sm"
        className="w-full mt-2 h-8 text-xs"
        onClick={onTogglePIIReport}
      >
        <FileWarning className="h-3.5 w-3.5 mr-1.5" />
        {showPIIReport ? 'Hide' : 'View'} PII Report
      </Button>
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function FilterButton({ active, onClick, icon, label }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
        'border hover:border-primary/50',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
