import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createSupabaseFetch } from "./fetch";
import { isMissingViewerSession } from "./sessionError";
import { accessTokenFromRequest } from "./sessionCookie";

/** Thrown (or returned) so Start/Nitro surfaces a clean 401 JSON body. */
export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  readonly code = "unauthorized";

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }

  toResponse(): Response {
    return new Response(JSON.stringify({ error: this.code, message: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }
}

function unauthorized(reason: string): never {
  console.info(`[auth] unauthorized: ${reason}`);
  // Throw a Response so TanStack Start / Nitro return 401 JSON (not a 500 HTML page).
  throw new UnauthorizedError().toResponse();
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
    const SUPABASE_PUBLISHABLE_KEY =
      process.env["SUPABASE_PUBLISHABLE_KEY"] ||
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
      process.env["SUPABASE_ANON_KEY"] ||
      process.env["VITE_SUPABASE_ANON_KEY"];

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set them in .env (see .env.example).`;
      console.error(`[Supabase] ${message}`);
      throw new Error(message);
    }

    const request = getRequest();

    if (!request?.headers) unauthorized("no_request_headers");

    // Bearer from the client middleware, or the session cookie the browser sends.
    const token = accessTokenFromRequest(request);
    if (!token) unauthorized("missing_authorization");

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let data: Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"];
    let error: Awaited<ReturnType<typeof supabase.auth.getClaims>>["error"];
    try {
      const claims = await supabase.auth.getClaims(token);
      data = claims.data;
      error = claims.error;
    } catch (caught) {
      if (isMissingViewerSession(caught)) unauthorized("missing_session");
      throw caught;
    }
    if (isMissingViewerSession(error)) unauthorized("missing_session");
    if (error || !data?.claims) unauthorized("invalid_token");
    if (!data.claims.sub) unauthorized("missing_sub");

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);
