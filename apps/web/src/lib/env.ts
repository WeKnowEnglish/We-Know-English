export function getEnv() {
  const publishableFallback =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? "";

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? publishableFallback,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: publishableFallback,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
    CRON_SECRET: process.env.CRON_SECRET ?? "",
    LLM_API_KEY: process.env.LLM_API_KEY ?? "",
    LLM_MODEL: process.env.LLM_MODEL ?? "gpt-4o-mini",
  };

  return env;
}

/** True when URL and anon key are set (required for any Supabase client). */
export function isSupabaseConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}
