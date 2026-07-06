-- telegram-cursor-bot KV replacement (Supabase Postgres)
-- Run once via Management API or SQL Editor

CREATE TABLE IF NOT EXISTS public.bot_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_kv_key_prefix_idx ON public.bot_kv (key text_pattern_ops);
CREATE INDEX IF NOT EXISTS bot_kv_expires_at_idx ON public.bot_kv (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.bot_kv ENABLE ROW LEVEL SECURITY;

-- Worker uses service_role key (bypasses RLS). Block anon/authenticated.
REVOKE ALL ON public.bot_kv FROM anon, authenticated;
