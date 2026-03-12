export default function TableCenterLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="rounded-3xl border border-border/70 bg-card/80 px-6 py-5 text-center shadow-xl backdrop-blur-xl">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm font-semibold text-foreground">
          Loading Table Center…
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bringing your schema catalog into view
        </p>
      </div>
    </div>
  );
}
