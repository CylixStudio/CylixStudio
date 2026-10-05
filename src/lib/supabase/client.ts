import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createSupabaseFetch } from "./fetch";
import { getPublicSupabaseEnv } from "./env";
import { isUserJwt, writeSessionCookie } from "./sessionCookie";

type AppSupabaseClient = SupabaseClient<Database>;

function createSupabaseClient(): AppSupabaseClient {
  const env = getPublicSupabaseEnv();
  if (!env) {
    const message =
      "Missing Supabase public env. Set VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY) for Production + Build on your host, then redeploy.";
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  const client = createClient<Database>(env.url, env.key, {
    global: {
      fetch: createSupabaseFetch(env.key),
    },
    auth: {
      storage: typeof window === "undefined" ? undefined : localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  if (typeof window !== "undefined") {
    client.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token;
      writeSessionCookie(isUserJwt(token) ? token : null, session?.expires_at ?? null);
    });
  }

  return client;
}

let _supabase: AppSupabaseClient | undefined;

/** Lazy client — only constructed when credentials resolve. */
export const supabase = new Proxy({} as AppSupabaseClient, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase as object, prop, receiver);
  },
});
