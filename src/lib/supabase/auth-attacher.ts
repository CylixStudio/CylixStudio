import { createMiddleware } from "@tanstack/react-start";

import { isMissingViewerSession } from "./sessionError";
import { isUserJwt, writeSessionCookie } from "./sessionCookie";
import { supabase } from "./client";

async function readBrowserAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error && !isMissingViewerSession(error)) throw error;
    const token = data.session?.access_token;
    if (!isUserJwt(token)) {
      writeSessionCookie(null);
      return null;
    }
    writeSessionCookie(token, data.session?.expires_at ?? null);
    return token;
  } catch (error) {
    if (isMissingViewerSession(error)) {
      writeSessionCookie(null);
      return null;
    }
    throw error;
  }
}

// Must be registered as a global `functionMiddleware` in `src/start.ts`; otherwise
// the browser never attaches the bearer token to serverFn RPCs.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = await readBrowserAccessToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
