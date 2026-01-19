'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';

import { DBImportDialog } from '@/components/db-import-dialog';

interface TableCenterHeaderProps {
  onDBImport: (dbml: string) => void;
}

export function TableCenterHeader({ onDBImport }: TableCenterHeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Table Center</h1>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Biagram 로고 - Editor로 이동 */}
        <Link 
          href="/editor" 
          className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            B
          </div>
          <span className="font-bold text-lg">Biagram</span>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <DBImportDialog onImport={onDBImport} />
      </div>
    </header>
  );
}
