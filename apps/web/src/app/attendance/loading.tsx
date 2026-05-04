export default function AttendanceLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-16">
      <div className="h-8 w-56 animate-pulse rounded-md bg-muted" aria-hidden />
      <div className="h-24 animate-pulse rounded-lg bg-muted" aria-hidden />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-20 animate-pulse rounded-lg bg-muted" aria-hidden />
        <div className="h-20 animate-pulse rounded-lg bg-muted" aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground">Loading attendance…</p>
    </main>
  );
}
