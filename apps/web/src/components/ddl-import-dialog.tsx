'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { CheckCircle2, FileUp, Link2, Loader2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/hooks/use-toast';

interface DDLImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess: (dbml: string, mode: 'replace' | 'append') => void;
  currentContent: string;
}

interface InferredRelationship {
  fromSchema: string;
  fromTable: string;
  fromColumn: string;
  toSchema: string;
  toTable: string;
  toColumn: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export function DDLImportDialog({
  open,
  onOpenChange,
  onImportSuccess,
  currentContent,
}: DDLImportDialogProps) {
  const [ddl, setDdl] = useState('');
  const [dialect, setDialect] = useState<'mysql' | 'postgresql' | 'auto'>(
    'auto'
  );
  const [step, setStep] = useState<'edit' | 'infer'>('edit');
  const [importMode, setImportMode] = useState<'replace' | 'append'>('append');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [convertedDbml, setConvertedDbml] = useState('');
  const [inferredRelationships, setInferredRelationships] = useState<
    InferredRelationship[]
  >([]);
  const [selectedRelationships, setSelectedRelationships] = useState<
    Set<string>
  >(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const convertDDL = trpc.diagrams.convertDDL.useMutation();
  const inferDBMLRelationships =
    trpc.diagrams.inferDBMLRelationships.useMutation();

  const resetState = useCallback(() => {
    setDdl('');
    setDialect('auto');
    setImportMode('append');
    setIsDraggingFile(false);
    setConvertedDbml('');
    setInferredRelationships([]);
    setSelectedRelationships(new Set());
    setStep('edit');
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const readDDLFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();

        if (!text.trim()) {
          toast({
            title: 'Empty file',
            description: 'The selected DDL file is empty.',
            variant: 'destructive',
          });
          return;
        }

        setDdl(text);
        toast({
          title: 'File loaded',
          description: `${file.name} was loaded into the DDL editor.`,
        });
      } catch (error) {
        toast({
          title: 'File read failed',
          description:
            error instanceof Error
              ? error.message
              : 'Failed to read the selected file.',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      await readDDLFile(file);
      event.target.value = '';
    },
    [readDDLFile]
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDraggingFile(false);

      const file = event.dataTransfer.files?.[0];
      if (!file) return;

      await readDDLFile(file);
    },
    [readDDLFile]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
  }, []);

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
      setConvertedDbml(result.dbml);

      const inferenceResult = await inferDBMLRelationships.mutateAsync({
        existingContent: currentContent,
        importedContent: result.dbml,
        importMode,
        minConfidence: 'low',
      });

      if (!inferenceResult.success && inferenceResult.error) {
        toast({
          title: 'Relationship inference skipped',
          description: inferenceResult.error,
        });
      }

      const relationships = (inferenceResult.relationships ||
        []) as InferredRelationship[];

      if (relationships.length === 0) {
        toast({
          title: 'Success',
          description: `DDL converted to DBML successfully (${importMode === 'replace' ? 'Replaced' : 'Appended'})`,
        });

        onImportSuccess(result.dbml, importMode);
        onOpenChange(false);
        return;
      }

      const highConfidence = new Set(
        relationships
          .filter(relationship => relationship.confidence === 'high')
          .map(
            relationship =>
              `${relationship.fromSchema}.${relationship.fromTable}.${relationship.fromColumn}->${relationship.toSchema}.${relationship.toTable}.${relationship.toColumn}`
          )
      );

      setInferredRelationships(relationships);
      setSelectedRelationships(highConfidence);
      setStep('infer');

      toast({
        title: 'Relationships inferred',
        description: `Found ${relationships.length} potential relationships (${highConfidence.size} high-confidence preselected)`,
      });
    } catch (error) {
      console.error('❌ DDL conversion error:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to convert DDL',
        variant: 'destructive',
      });
    }
  };

  const handleToggleRelationship = useCallback((key: string) => {
    setSelectedRelationships(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleSelectAllByConfidence = useCallback(
    (confidence: 'high' | 'medium' | 'low', select: boolean) => {
      setSelectedRelationships(prev => {
        const next = new Set(prev);
        inferredRelationships
          .filter(relationship => relationship.confidence === confidence)
          .forEach(relationship => {
            const key = `${relationship.fromSchema}.${relationship.fromTable}.${relationship.fromColumn}->${relationship.toSchema}.${relationship.toTable}.${relationship.toColumn}`;
            if (select) {
              next.add(key);
            } else {
              next.delete(key);
            }
          });
        return next;
      });
    },
    [inferredRelationships]
  );

  const handleApplyRelationships = useCallback(() => {
    const selectedRefs = inferredRelationships
      .filter(relationship => {
        const key = `${relationship.fromSchema}.${relationship.fromTable}.${relationship.fromColumn}->${relationship.toSchema}.${relationship.toTable}.${relationship.toColumn}`;
        return selectedRelationships.has(key);
      })
      .map(relationship => {
        const fromTable =
          relationship.fromSchema !== 'public' &&
          relationship.fromSchema !== 'dbo'
            ? `${relationship.fromSchema}.${relationship.fromTable}`
            : relationship.fromTable;
        const toTable =
          relationship.toSchema !== 'public' && relationship.toSchema !== 'dbo'
            ? `${relationship.toSchema}.${relationship.toTable}`
            : relationship.toTable;
        return `Ref: ${fromTable}.${relationship.fromColumn} > ${toTable}.${relationship.toColumn} // inferred (${relationship.confidence})`;
      });

    const finalDbml =
      selectedRefs.length > 0
        ? `${convertedDbml}\n\n// Inferred Relationships\n${selectedRefs.join('\n')}`
        : convertedDbml;

    onImportSuccess(finalDbml, importMode);
    toast({
      title: 'Import complete',
      description: `DDL converted and ${selectedRefs.length} inferred relationships added`,
    });
    onOpenChange(false);
  }, [
    convertedDbml,
    importMode,
    inferredRelationships,
    onImportSuccess,
    onOpenChange,
    selectedRelationships,
    toast,
  ]);

  const handleSkipInference = useCallback(() => {
    onImportSuccess(convertedDbml, importMode);
    toast({
      title: 'Import complete',
      description: 'DDL converted without inferred relationships',
    });
    onOpenChange(false);
  }, [convertedDbml, importMode, onImportSuccess, onOpenChange, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          step === 'infer' && inferredRelationships.length > 0
            ? 'max-w-3xl'
            : 'max-w-2xl'
        }
      >
        <DialogHeader>
          <DialogTitle>
            {step === 'edit' ? 'Import DDL' : 'Review Inferred Relationships'}
          </DialogTitle>
          <DialogDescription>
            {step === 'edit'
              ? 'Paste your MySQL or PostgreSQL DDL code below to convert it to DBML'
              : 'Review inferred relationships for the imported tables before applying them'}
          </DialogDescription>
        </DialogHeader>

        {step === 'edit' && (
          <div className="space-y-4">
            {/* Dialect Selection */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">SQL Dialect:</label>
              <select
                value={dialect}
                onChange={e => setDialect(e.target.value as any)}
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
                onChange={e => setImportMode(e.target.value as any)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="append">Append</option>
                <option value="replace">Replace</option>
              </select>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium">DDL File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sql,.ddl,.txt,.dbml"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="h-4 w-4" />
                  Attach file
                </Button>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`rounded-lg border border-dashed px-4 py-4 text-sm transition-colors ${
                  isDraggingFile
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-muted/20'
                }`}
              >
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      Drag and drop a DDL file here
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supports .sql, .ddl, .txt, and .dbml files. You can also
                      attach a file and edit the loaded content below.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* DDL Input */}
            <div>
              <label className="text-sm font-medium">DDL Code:</label>
              <textarea
                value={ddl}
                onChange={e => setDdl(e.target.value)}
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
        )}

        {step === 'infer' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Found {inferredRelationships.length} potential relationships
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedRelationships.size} selected
              </p>
            </div>

            <div className="flex gap-2 text-xs">
              {(['high', 'medium', 'low'] as const).map(confidence => {
                const count = inferredRelationships.filter(
                  relationship => relationship.confidence === confidence
                ).length;
                if (count === 0) return null;
                return (
                  <Button
                    key={confidence}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      handleSelectAllByConfidence(confidence, true)
                    }
                  >
                    Select all {confidence} ({count})
                  </Button>
                );
              })}
            </div>

            <div className="max-h-[420px] overflow-y-auto rounded-md border p-2">
              <div className="space-y-2">
                {inferredRelationships.map(relationship => {
                  const key = `${relationship.fromSchema}.${relationship.fromTable}.${relationship.fromColumn}->${relationship.toSchema}.${relationship.toTable}.${relationship.toColumn}`;
                  const isSelected = selectedRelationships.has(key);
                  const confidenceColor = {
                    high: 'bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400',
                    medium:
                      'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400',
                    low: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
                  }[relationship.confidence];

                  return (
                    <div
                      key={key}
                      className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
                        isSelected
                          ? 'border-primary/30 bg-primary/5'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => handleToggleRelationship(key)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleToggleRelationship(key);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                    >
                      <Checkbox
                        checked={isSelected}
                        onClick={event => event.stopPropagation()}
                        onCheckedChange={() => handleToggleRelationship(key)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="rounded bg-muted px-1 py-0.5 text-xs">
                            {relationship.fromTable}.
                            <span className="text-primary">
                              {relationship.fromColumn}
                            </span>
                          </code>
                          <span className="text-muted-foreground">→</span>
                          <code className="rounded bg-muted px-1 py-0.5 text-xs">
                            {relationship.toTable}.
                            <span className="text-primary">
                              {relationship.toColumn}
                            </span>
                          </code>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${confidenceColor}`}
                          >
                            {relationship.confidence}
                          </span>
                          <span className="truncate text-[10px] text-muted-foreground">
                            {relationship.reason}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'edit' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  convertDDL.isLoading || inferDBMLRelationships.isLoading
                }
              >
                {convertDDL.isLoading || inferDBMLRelationships.isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Import
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleSkipInference}>
                Skip All
              </Button>
              <Button onClick={handleApplyRelationships}>
                <Link2 className="mr-2 h-4 w-4" />
                Apply {selectedRelationships.size} Relationships
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
