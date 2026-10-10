import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { CounterPlatform } from "@/lib/liveCounter.functions";
import type { Database } from "@/lib/supabase/types";

const PLATFORMS = new Set(["KICK", "TWITCH", "X", "TIKTOK", "YOUTUBE", "ALL"]);

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
 * Authenticated proxy for live channel stats. The browser only talks to this
 * route; Kick, Twitch, YouTube, and X are fetched on the server.
 */
export const Route = createFileRoute("/api/live-counter/lookup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await userIdFromBearer(request);
        if (!userId) {
          return Response.json({ error: "unauthorized", message: "Unauthorized" }, { status: 401 });
        }

        let body: { platform?: unknown; username?: unknown };
        try {
          body = (await request.json()) as { platform?: unknown; username?: unknown };
        } catch {
          return Response.json({ error: "invalid_body", message: "Invalid JSON" }, { status: 400 });
        }

        const platform = typeof body.platform === "string" ? body.platform : "ALL";
        const username = typeof body.username === "string" ? body.username : "";
        const compare = (body as { compare?: unknown }).compare === true;
        if (compare) {
          const { supabaseAdmin } = await import("@/lib/supabase/client.server");
          const { userHasActivePro } = await import("@/lib/subscription.server");
          if (!(await userHasActivePro(supabaseAdmin, userId))) {
            return Response.json({ error: "pro_required", message: "pro_required" }, { status: 403 });
          }
        }
        if (!PLATFORMS.has(platform)) {
          return Response.json({ error: "invalid_platform", message: "Unknown platform" }, { status: 400 });
        }

        try {
          const { resolveChannelSnapshot } = await import("@/lib/liveCounter.functions");
          const snapshot = await resolveChannelSnapshot({
            userId,
            platform: platform as CounterPlatform,
            username,
          });
          return Response.json(snapshot, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Channel Not Found";
          const status = message.startsWith("Channel Not Found") ? 404 : 400;
          return Response.json({ error: "lookup_failed", message }, { status, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
