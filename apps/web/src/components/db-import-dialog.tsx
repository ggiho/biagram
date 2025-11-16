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
import { Database, Loader2, CheckCircle2, XCircle } from 'lucide-react';
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

interface DBImportDialogProps {
  onImport?: (dbml: string) => void;
  trigger?: React.ReactNode;
}

export function DBImportDialog({ onImport, trigger }: DBImportDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'connect' | 'import'>('connect');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(
    'idle'
  );
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

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
        toast({
          title: 'Import successful',
          description: `Imported ${data.stats?.tableCount || 0} tables, ${data.stats?.relationshipCount || 0} relationships`,
        });

        // Call parent callback with DBML
        if (onImport) {
          onImport(data.dbml);
        }

        // Close dialog
        setOpen(false);

        // Reset form
        resetForm();
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

      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {step === 'connect' ? 'Connect to Database' : 'Import Schema'}
          </DialogTitle>
          <DialogDescription>
            {step === 'connect'
              ? 'Enter your database connection details to import schema'
              : 'Click Import to fetch and convert your database schema to DBML'}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
