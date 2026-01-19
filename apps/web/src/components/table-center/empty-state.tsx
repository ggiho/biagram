'use client';

import { FileText, Database, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  type: 'no-selection' | 'loading' | 'no-data';
}

export function EmptyState({ type }: EmptyStateProps) {
  const configs = {
    'no-selection': {
      icon: FileText,
      title: 'Select a table',
      description: 'Choose a table from the list to view its specification',
      iconClass: 'text-muted-foreground',
      bgClass: 'bg-muted',
    },
    loading: {
      icon: Loader2,
      title: 'Loading specifications...',
      description: 'Please wait while we analyze your schema',
      iconClass: 'text-primary animate-spin',
      bgClass: 'bg-primary/10',
    },
    'no-data': {
      icon: Database,
      title: 'No diagram found',
      description: 'Create a diagram in the editor or import from a database',
      iconClass: 'text-muted-foreground',
      bgClass: 'bg-muted',
    },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-in fade-in duration-300">
      <div className={cn('flex h-16 w-16 items-center justify-center rounded-full mb-4', config.bgClass)}>
        <Icon className={cn('h-8 w-8', config.iconClass)} />
      </div>
      <p className="text-lg font-medium">{config.title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">{config.description}</p>
    </div>
  );
}

// Loading Skeleton for table list
export function TableListSkeleton() {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-muted rounded" />
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-8 bg-muted rounded-full" />
          </div>
          <div className="pl-7 space-y-2">
            {[1, 2].map((j) => (
              <div key={j} className="p-3 rounded-lg border border-muted">
                <div className="h-4 w-32 bg-muted rounded mb-2" />
                <div className="flex gap-4">
                  <div className="h-3 w-16 bg-muted rounded" />
                  <div className="h-3 w-16 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
