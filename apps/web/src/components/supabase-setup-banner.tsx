import { isSupabaseConfigured } from "@/lib/env";

export function SupabaseSetupBanner() {
  if (isSupabaseConfigured()) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-950 dark:text-amber-50"
    >
      <p className="font-medium">Supabase is not configured.</p>
      <p className="mt-1 text-balance text-amber-900/90 dark:text-amber-100/90">
        In <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">apps/web</code>, copy{" "}
        <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">.env.example</code> to{" "}
        <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">.env.local</code> and set{" "}
        <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
        (or{" "}
        <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
        </code>
        ) from your project&apos;s{" "}
        <a
          href="https://supabase.com/dashboard/project/_/settings/api"
          className="font-medium underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          API settings
        </a>
        . Restart <code className="font-mono text-xs">npm run dev</code> after saving.
      </p>
    </div>
  );
}
