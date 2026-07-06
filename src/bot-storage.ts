import type { Env } from "./types";

export interface BotStoragePutOptions {
  expirationTtl?: number;
}

/** KVNamespace bilan mos interfeys — Supabase yoki Cloudflare KV */
export interface BotStorage {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: BotStoragePutOptions,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}

function supabaseConfigured(env: Env): boolean {
  return Boolean(
    env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function supabaseHeaders(env: Env): HeadersInit {
  const key = env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function supabaseRest(env: Env, query = ""): string {
  const base = env.SUPABASE_URL!.trim().replace(/\/$/, "");
  return `${base}/rest/v1/bot_kv${query}`;
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function createSupabaseStorage(env: Env): BotStorage {
  return {
    async get(key: string): Promise<string | null> {
      const url = `${supabaseRest(env)}?key=eq.${encodeURIComponent(key)}&select=value,expires_at&limit=1`;
      const response = await fetch(url, { headers: supabaseHeaders(env) });
      if (!response.ok) {
        console.error("Supabase get failed:", response.status, await response.text());
        return null;
      }
      const rows = (await response.json()) as Array<{
        value: string;
        expires_at: string | null;
      }>;
      const row = rows[0];
      if (!row) return null;
      if (isExpired(row.expires_at)) {
        await this.delete(key);
        return null;
      }
      return row.value;
    },

    async put(
      key: string,
      value: string,
      options?: BotStoragePutOptions,
    ): Promise<void> {
      const expiresAt = options?.expirationTtl
        ? new Date(Date.now() + options.expirationTtl * 1000).toISOString()
        : null;

      const response = await fetch(supabaseRest(env), {
        method: "POST",
        headers: {
          ...supabaseHeaders(env),
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          key,
          value,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Supabase put failed: ${response.status} ${await response.text()}`);
      }
    },

    async delete(key: string): Promise<void> {
      const response = await fetch(
        `${supabaseRest(env)}?key=eq.${encodeURIComponent(key)}`,
        { method: "DELETE", headers: supabaseHeaders(env) },
      );
      if (!response.ok && response.status !== 404) {
        console.error("Supabase delete failed:", response.status, await response.text());
      }
    },

    async list(options: { prefix: string }): Promise<{ keys: { name: string }[] }> {
      const pattern = `${options.prefix}%`;
      const url = `${supabaseRest(env)}?select=key,expires_at&key=like.${encodeURIComponent(pattern)}&order=key`;
      const response = await fetch(url, { headers: supabaseHeaders(env) });
      if (!response.ok) {
        console.error("Supabase list failed:", response.status, await response.text());
        return { keys: [] };
      }

      const rows = (await response.json()) as Array<{
        key: string;
        expires_at: string | null;
      }>;
      const keys: { name: string }[] = [];
      for (const row of rows) {
        if (isExpired(row.expires_at)) {
          await this.delete(row.key);
          continue;
        }
        keys.push({ name: row.key });
      }
      return { keys };
    },
  };
}

export function getBotStorage(env: Env): BotStorage {
  if (supabaseConfigured(env)) {
    return createSupabaseStorage(env);
  }
  return env.SESSIONS;
}

export function usesSupabaseStorage(env: Env): boolean {
  return supabaseConfigured(env);
}
