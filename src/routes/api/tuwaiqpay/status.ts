import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

async function userIdFromBearer(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.split(".").length !== 3) return null;

  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"];
  if (!url || !key) return null;

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

/**
 * Authenticated TuwaiqPay readiness check.
 * Verifies merchant credentials and that an access token can be acquired.
 * The token itself is never returned.
 */
export const Route = createFileRoute("/api/tuwaiqpay/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await userIdFromBearer(request);
        if (!userId) {
          return Response.json({ error: "unauthorized", message: "Unauthorized" }, { status: 401 });
        }

        const { probeTuwaiqGateway } = await import("@/lib/tuwaiqpay.server");
        const status = await probeTuwaiqGateway();
        return Response.json(status, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
