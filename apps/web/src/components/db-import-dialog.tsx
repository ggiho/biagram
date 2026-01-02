'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Database, Loader2, CheckCircle2, XCircle, Link2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type DatabaseType = 'mysql' | 'postgresql';

interface ConnectionForm {
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
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

interface DBImportDialogProps {
  onImport?: (dbml: string) => void;
  trigger?: React.ReactNode;
}

export function DBImportDialog({ onImport, trigger }: DBImportDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'connect' | 'import' | 'infer'>('connect');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(
    'idle'
  );
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [importedDbml, setImportedDbml] = useState<string>('');
  const [inferredRelationships, setInferredRelationships] = useState<InferredRelationship[]>([]);
  const [selectedRelationships, setSelectedRelationships] = useState<Set<string>>(new Set());

  const [form, setForm] = useState<ConnectionForm>({
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    database: '',
    username: '',
    password: '',
    ssl: false,
  });

  // Mutations
  const testConnectionMutation = trpc.database.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setConnectionStatus('success');
        setStep('import');
        // Store sessionId for later use
        if (data.sessionId) {
          setSessionId(data.sessionId);
        }
        toast({
          title: 'Connection successful',
          description: `Found ${data.stats?.schemaCount || 0} schema(s), ${data.stats?.tableCount || 0} table(s)`,
        });
      } else {
        setConnectionStatus('error');
        toast({
          title: 'Connection failed',
          description: data.error || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      setConnectionStatus('error');
      toast({
        title: 'Connection failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const introspectMutation = trpc.database.introspect.useMutation({
    onSuccess: (data) => {
      if (data.success && data.dbml) {
        const relationshipCount = data.stats?.relationshipCount || 0;
        setImportedDbml(data.dbml);

        // FK가 없으면 관계 추론 단계로, 있으면 바로 완료
        if (relationshipCount === 0) {
          toast({
            title: 'Schema imported',
            description: `Imported ${data.stats?.tableCount || 0} tables. No foreign keys found - you can infer relationships.`,
          });
          setStep('infer');
        } else {
          toast({
            title: 'Import successful',
            description: `Imported ${data.stats?.tableCount || 0} tables, ${relationshipCount} relationships`,
          });

          // Call parent callback with DBML
          if (onImport) {
            onImport(data.dbml);
          }

          // Close dialog
          setOpen(false);

          // Reset form
          resetForm();
        }
      } else {
        toast({
          title: 'Import failed',
          description: data.error || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const inferRelationshipsMutation = trpc.database.inferRelationships.useMutation({
    onSuccess: (data) => {
      if (data.success && data.relationships) {
        setInferredRelationships(data.relationships);
        // 기본적으로 high confidence만 선택
        const highConfidence = new Set(
          data.relationships
            .filter((r: InferredRelationship) => r.confidence === 'high')
            .map((r: InferredRelationship) => `${r.fromTable}.${r.fromColumn}->${r.toTable}.${r.toColumn}`)
        );
        setSelectedRelationships(highConfidence);

        toast({
          title: 'Relationships inferred',
          description: `Found ${data.stats?.totalInferred || 0} potential relationships (${data.stats?.highConfidence || 0} high confidence)`,
        });
      } else {
        toast({
          title: 'Inference failed',
          description: data.error || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Inference failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleTestConnection = () => {
    setConnectionStatus('testing');
    testConnectionMutation.mutate(form);
  };

  const handleImport = () => {
    introspectMutation.mutate({
      useStoredConnection: true,
      sessionId: sessionId,
    });
  };

  const handleInferRelationships = () => {
    inferRelationshipsMutation.mutate({
      sessionId: sessionId,
      minConfidence: 'low', // 모든 confidence 레벨 포함
    });
  };

  const handleToggleRelationship = (key: string) => {
    setSelectedRelationships((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const handleSelectAllByConfidence = (confidence: 'high' | 'medium' | 'low', select: boolean) => {
    setSelectedRelationships((prev) => {
      const newSet = new Set(prev);
      inferredRelationships
        .filter((r) => r.confidence === confidence)
        .forEach((r) => {
          const key = `${r.fromTable}.${r.fromColumn}->${r.toTable}.${r.toColumn}`;
          if (select) {
            newSet.add(key);
          } else {
            newSet.delete(key);
          }
        });
      return newSet;
    });
  };

  const handleApplyRelationships = () => {
    // 선택된 관계만 DBML Ref로 변환
    const selectedRefs = inferredRelationships
      .filter((r) => {
        const key = `${r.fromTable}.${r.fromColumn}->${r.toTable}.${r.toColumn}`;
        return selectedRelationships.has(key);
      })
      .map((r) => {
        const fromTable =
          r.fromSchema !== 'public' && r.fromSchema !== 'dbo'
            ? `${r.fromSchema}.${r.fromTable}`
            : r.fromTable;
        const toTable =
          r.toSchema !== 'public' && r.toSchema !== 'dbo'
            ? `${r.toSchema}.${r.toTable}`
            : r.toTable;
        return `Ref: ${fromTable}.${r.fromColumn} > ${toTable}.${r.toColumn}`;
      });

    // DBML에 관계 추가
    const finalDbml = selectedRefs.length > 0
      ? `${importedDbml}\n\n// Inferred Relationships\n${selectedRefs.join('\n')}`
      : importedDbml;

    if (onImport) {
      onImport(finalDbml);
    }

    toast({
      title: 'Import complete',
      description: `Added ${selectedRefs.length} inferred relationships`,
    });

    setOpen(false);
    resetForm();
  };

  const handleSkipInference = () => {
    if (onImport) {
      onImport(importedDbml);
    }
    setOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setForm({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      database: '',
      username: '',
      password: '',
      ssl: false,
    });
    setStep('connect');
    setConnectionStatus('idle');
    setSessionId(undefined);
    setImportedDbml('');
    setInferredRelationships([]);
    setSelectedRelationships(new Set());
  };

  const handleTypeChange = (type: DatabaseType) => {
    setForm({
      ...form,
      type,
      port: type === 'mysql' ? 3306 : 5432,
    });
  };

  const isFormValid = () => {
    return form.host && form.database && form.username;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Database className="mr-2 h-4 w-4" />
            Import from Database
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className={step === 'infer' && inferredRelationships.length > 0 ? 'sm:max-w-[700px] max-h-[80vh]' : 'sm:max-w-[500px]'}>
        <DialogHeader>
          <DialogTitle>
            {step === 'connect' && 'Connect to Database'}
            {step === 'import' && 'Import Schema'}
            {step === 'infer' && 'Infer Relationships'}
          </DialogTitle>
          <DialogDescription>
            {step === 'connect' && 'Enter your database connection details to import schema'}
            {step === 'import' && 'Click Import to fetch and convert your database schema to DBML'}
            {step === 'infer' && 'Review and select relationships to add to your schema'}
          </DialogDescription>
        </DialogHeader>

        {step === 'connect' && (
          <div className="grid gap-4 py-4">
            {/* Database Type */}
            <div className="space-y-2">
              <Label>Database Type</Label>
              <RadioGroup value={form.type} onValueChange={handleTypeChange}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="mysql" id="mysql" />
                  <Label htmlFor="mysql" className="font-normal">
                    MySQL
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="postgresql" id="postgresql" />
                  <Label htmlFor="postgresql" className="font-normal">
                    PostgreSQL
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Host and Port */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  placeholder="localhost"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 0 })}
                  placeholder={form.type === 'mysql' ? '3306' : '5432'}
                />
              </div>
            </div>

            {/* Database */}
            <div className="space-y-2">
              <Label htmlFor="database">Database Name</Label>
              <Input
                id="database"
                value={form.database}
                onChange={(e) => setForm({ ...form, database: e.target.value })}
                placeholder="my_database"
              />
            </div>

            {/* Username and Password */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="root"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* SSL */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="ssl"
                checked={form.ssl}
                onCheckedChange={(checked) => setForm({ ...form, ssl: checked as boolean })}
              />
              <Label htmlFor="ssl" className="font-normal">
                Use SSL connection
              </Label>
            </div>

            {/* Connection Status */}
            {connectionStatus !== 'idle' && (
              <div className="flex items-center space-x-2 text-sm">
                {connectionStatus === 'testing' && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Testing connection...</span>
                  </>
                )}
                {connectionStatus === 'success' && (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-green-600">Connection successful!</span>
                  </>
                )}
                {connectionStatus === 'error' && (
                  <>
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span className="text-red-600">Connection failed</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {step === 'import' && (
          <div className="py-8 text-center">
            <Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-2">
              Connection established successfully.
            </p>
            <p className="text-sm text-muted-foreground">
              Click Import to fetch your database schema and convert it to DBML.
            </p>
          </div>
        )}

        {step === 'infer' && (
          <div className="space-y-4">
            {inferredRelationships.length === 0 ? (
              <div className="py-6 text-center">
                <Link2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  No physical foreign keys were found.
                  <br />
                  Would you like to infer relationships based on column naming patterns?
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Found {inferredRelationships.length} potential relationships
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedRelationships.size} selected
                  </p>
                </div>

                {/* 신뢰도별 일괄 선택 */}
                <div className="flex gap-2 text-xs">
                  {(['high', 'medium', 'low'] as const).map((conf) => {
                    const count = inferredRelationships.filter((r) => r.confidence === conf).length;
                    if (count === 0) return null;
                    return (
                      <Button
                        key={conf}
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => handleSelectAllByConfidence(conf, true)}
                      >
                        Select all {conf} ({count})
                      </Button>
                    );
                  })}
                </div>

                <div className="h-[400px] overflow-y-auto rounded-md border p-2">
                  <div className="space-y-2">
                    {inferredRelationships.map((rel) => {
                      const key = `${rel.fromTable}.${rel.fromColumn}->${rel.toTable}.${rel.toColumn}`;
                      const isSelected = selectedRelationships.has(key);
                      const confidenceColor = {
                        high: 'text-green-600 bg-green-50',
                        medium: 'text-yellow-600 bg-yellow-50',
                        low: 'text-red-600 bg-red-50',
                      }[rel.confidence];

                      return (
                        <div
                          key={key}
                          className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => handleToggleRelationship(key)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleRelationship(key)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                {rel.fromTable}.<span className="text-primary">{rel.fromColumn}</span>
                              </code>
                              <span className="text-muted-foreground">→</span>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                {rel.toTable}.<span className="text-primary">{rel.toColumn}</span>
                              </code>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${confidenceColor}`}>
                                {rel.confidence}
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate">
                                {rel.reason}
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
          </div>
        )}

        <DialogFooter>
          {step === 'connect' && (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleTestConnection}
                disabled={!isFormValid() || connectionStatus === 'testing'}
              >
                {connectionStatus === 'testing' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>
            </>
          )}

          {step === 'import' && (
            <>
              <Button variant="outline" onClick={() => setStep('connect')}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={introspectMutation.isLoading}>
                {introspectMutation.isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  'Import'
                )}
              </Button>
            </>
          )}

          {step === 'infer' && (
            <>
              {inferredRelationships.length === 0 ? (
                <>
                  <Button variant="outline" onClick={handleSkipInference}>
                    Skip
                  </Button>
                  <Button
                    onClick={handleInferRelationships}
                    disabled={inferRelationshipsMutation.isLoading}
                  >
                    {inferRelationshipsMutation.isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Inferring...
                      </>
                    ) : (
                      <>
                        <Link2 className="mr-2 h-4 w-4" />
                        Infer Relationships
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
                    Apply {selectedRelationships.size} Relationships
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
