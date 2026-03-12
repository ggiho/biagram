'use client';

import { AlertTriangle, Home, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="w-full max-w-xl rounded-3xl border border-border/70 bg-card p-8 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Global Error
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Biagram hit a fatal error
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Refresh the app or go back to a safe entry point.
            </p>
            {error?.message ? (
              <div className="mt-4 rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-xs text-muted-foreground">
                {error.message}
              </div>
            ) : null}
            <div className="mt-6 flex gap-3">
              <Button onClick={reset} className="gap-2 rounded-2xl">
                <RefreshCcw className="h-4 w-4" />
                Retry
              </Button>
              <Button
                variant="outline"
                className="gap-2 rounded-2xl"
                onClick={() => window.location.assign('/')}
              >
                <Home className="h-4 w-4" />
                Home
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
