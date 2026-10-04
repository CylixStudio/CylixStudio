import { createFileRoute } from "@tanstack/react-router";

import type { NormalizedEvent } from "@/lib/webhooks/ingest.server";

type SePayload = {
  _id?: string;
  type?: string;
  channel?: string;
  provider?: string;
  createdAt?: string;
  data?: {
    username?: string;
    displayName?: string;
    amount?: number;
    currency?: string;
    message?: string;
    tipId?: string;
    providerId?: string;
  };
};

export const Route = createFileRoute("/api/public/webhooks/streamelements")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { jsonResponse, receivePlatformEvent, listConnections } = await import(
          "@/lib/webhooks/ingest.server"
        );
        const { resolveRelaySource } = await import("@/lib/platformEvents");
        const { verifyStreamElementsJwt } = await import("@/lib/webhooks/verify.server");

        const rawBody = await request.text();
        let body: SePayload;
        try {
          body = JSON.parse(rawBody) as SePayload;
        } catch {
          return jsonResponse({ error: "invalid_json" }, 400);
        }

        // StreamElements authenticates with its channel JWT.
        const authHeader = request.headers.get("authorization") ?? "";
        const token =
          (authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : authHeader) ||
          new URL(request.url).searchParams.get("jwt") ||
          "";
        if (!token) return new Response("Missing token", { status: 401 });

        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const connections = await listConnections(supabaseAdmin, "STREAMELEMENTS");

        // The JWT must verify against a stored channel secret AND its channel
        // claim must match that same connection.
        let matched: { userId: string } | null = null;
        for (const connection of connections) {
          if (!connection.access_token) continue;
          const claims = verifyStreamElementsJwt(token, connection.access_token);
          if (!claims) continue;
          const channelClaim =
            typeof claims["channel"] === "string" ? (claims["channel"] as string) : null;
          if (
            connection.platform_user_id &&
            channelClaim &&
            channelClaim !== connection.platform_user_id
          ) {
            continue;
          }
          if (body.channel && channelClaim && body.channel !== channelClaim) continue;
          matched = { userId: connection.user_id };
          break;
        }
        if (!matched) return new Response("Invalid token", { status: 401 });

        const type = (body.type ?? "").toLowerCase();
        if (type !== "tip" && type !== "donation" && type !== "superchat") {
          return jsonResponse({ status: "ignored", reason: "unsupported_type" });
        }

        const resolved = resolveRelaySource({
          relay: "STREAMELEMENTS",
          origin: body.provider ?? (type === "superchat" ? "youtube" : null),
          eventType: "DONATION",
        });
        if (!resolved) return jsonResponse({ status: "ignored", reason: "unsupported_type" });

        const normalized: NormalizedEvent = {
          platform: resolved.platform,
          eventType: resolved.eventType,
          providerEventId: body._id ?? body.data?.tipId ?? null,
          actorName: body.data?.displayName ?? body.data?.username ?? "Anonymous",
          actorPlatformId: body.data?.providerId ?? null,
          amount: typeof body.data?.amount === "number" ? body.data.amount : 0,
          currency: body.data?.currency ?? null,
          quantity: 1,
          rawPayload: body,
        };

        const result = await receivePlatformEvent(supabaseAdmin, matched.userId, normalized);
        return jsonResponse(result);
      },
    },
  },
});
