'use client';

import { DatabaseZap, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function TableCenterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-lg rounded-3xl border border-border/70 bg-card/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <DatabaseZap className="h-6 w-6" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Table Center Error
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Table Center couldn’t open
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Retry the page load. If the problem persists, go back to the editor
          and re-open Table Center.
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
            className="rounded-2xl"
            onClick={() => window.location.assign('/editor')}
          >
            Back to editor
          </Button>
        </div>
      </div>
    </div>
  );
}
