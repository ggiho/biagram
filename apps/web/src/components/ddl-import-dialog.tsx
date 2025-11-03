'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/hooks/use-toast';

interface DDLImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess: (dbml: string, mode: 'replace' | 'append') => void;
}

export function DDLImportDialog({ open, onOpenChange, onImportSuccess }: DDLImportDialogProps) {
  const [ddl, setDdl] = useState('');
  const [dialect, setDialect] = useState<'mysql' | 'postgresql' | 'auto'>('auto');
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
  const { toast } = useToast();
  const convertDDL = trpc.diagrams.convertDDL.useMutation();

  const handleImport = async () => {
    if (!ddl.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter DDL code',
        variant: 'destructive',
      });
      return;
    }

    try {
      console.log('🔄 Converting DDL with dialect:', dialect);
      const result = await convertDDL.mutateAsync({ ddl, dialect });

      if (!result.success || !result.dbml) {
        toast({
          title: 'Conversion Failed',
          description: result.errors?.join('\n') || 'Failed to convert DDL',
          variant: 'destructive',
        });
        return;
      }

      // Show warnings if any
      if (result.warnings && result.warnings.length > 0) {
        toast({
          title: 'Conversion Warnings',
          description: result.warnings.join('\n'),
        });
      }

      console.log('✅ DDL converted successfully, mode:', importMode);
      toast({
        title: 'Success',
        description: `DDL converted to DBML successfully (${importMode === 'replace' ? 'Replaced' : 'Appended'})`,
      });

      onImportSuccess(result.dbml, importMode);
      onOpenChange(false);
      setDdl(''); // Clear input
    } catch (error) {
      console.error('❌ DDL conversion error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to convert DDL',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import DDL</DialogTitle>
          <DialogDescription>
            Paste your MySQL or PostgreSQL DDL code below to convert it to DBML
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dialect Selection */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">SQL Dialect:</label>
            <select
              value={dialect}
              onChange={(e) => setDialect(e.target.value as any)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="auto">Auto Detect</option>
              <option value="mysql">MySQL</option>
              <option value="postgresql">PostgreSQL</option>
            </select>
          </div>

          {/* Import Mode Selection */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Import Mode:</label>
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as any)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="replace">Replace</option>
              <option value="append">Append</option>
            </select>
          </div>

          {/* DDL Input */}
          <div>
            <label className="text-sm font-medium">DDL Code:</label>
            <textarea
              value={ddl}
              onChange={(e) => setDdl(e.target.value)}
              placeholder="CREATE TABLE users (&#10;  id INT PRIMARY KEY AUTO_INCREMENT,&#10;  username VARCHAR(50) NOT NULL,&#10;  email VARCHAR(100) UNIQUE&#10;);"
              className="mt-1.5 h-80 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          {/* Example DDL */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Show example DDL</summary>
            <pre className="mt-2 rounded bg-muted p-2">
{`CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  user_id INT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`}
            </pre>
          </details>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={convertDDL.isLoading}>
            {convertDDL.isLoading ? 'Converting...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
