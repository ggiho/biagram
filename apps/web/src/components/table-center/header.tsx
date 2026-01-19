'use client';

import Link from 'next/link';
import { FileText, ArrowLeft, Command } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DBImportDialog } from '@/components/db-import-dialog';

interface TableCenterHeaderProps {
  tableCount: number;
  onDBImport: (dbml: string) => void;
  onOpenSearch?: () => void;
}

export function TableCenterHeader({ tableCount, onDBImport, onOpenSearch }: TableCenterHeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-none">Table Center</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tableCount} {tableCount === 1 ? 'table' : 'tables'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Quick Search Shortcut Hint */}
        {onOpenSearch && (
          <Button
            variant="outline"
            size="sm"
            className="hidden md:flex gap-2 text-muted-foreground"
            onClick={onOpenSearch}
          >
            <span>Quick Search</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <Command className="h-3 w-3" />K
            </kbd>
          </Button>
        )}

        <DBImportDialog onImport={onDBImport} />

        <Button variant="outline" size="sm" asChild>
          <Link href="/editor">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Editor
          </Link>
        </Button>
      </div>
    </header>
  );
}
