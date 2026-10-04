import { createFileRoute } from "@tanstack/react-router";

import type { NormalizedEvent } from "@/lib/webhooks/ingest.server";
import { parseStreamElementsPayload } from "@/lib/relayEvents";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const Route = createFileRoute("/api/public/webhooks/streamelements")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { jsonResponse, receivePlatformEvent, listConnections } = await import(
          "@/lib/webhooks/ingest.server"
        );
        const { resolveRelaySource } = await import("@/lib/platformEvents");
        const { verifyStreamElementsJwt, safeEqual } = await import("@/lib/webhooks/verify.server");

        const rawBody = await request.text();
        let body: unknown;
        try {
          body = JSON.parse(rawBody) as unknown;
        } catch {
          return jsonResponse({ error: "invalid_json" }, 400);
        }

        const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        const bodyChannel = text(root["channel"]);

        // StreamElements authenticates with its channel JWT, either as the bearer
        // token itself or as the HMAC secret of a short-lived webhook JWT.
        const authHeader = request.headers.get("authorization") ?? "";
        const token =
          (authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : authHeader) ||
          new URL(request.url).searchParams.get("jwt") ||
          "";
        if (!token.trim()) return new Response("Missing token", { status: 401 });
        const presented = token.trim();

        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const connections = await listConnections(supabaseAdmin, "STREAMELEMENTS");

        let matched: { userId: string } | null = null;
        for (const connection of connections) {
          if (!connection.access_token) continue;
          const channelOk =
            !bodyChannel ||
            !connection.platform_user_id ||
            bodyChannel === connection.platform_user_id;
          if (!channelOk) continue;

          if (safeEqual(presented, connection.access_token)) {
            matched = { userId: connection.user_id };
            break;
          }

          const claims = verifyStreamElementsJwt(presented, connection.access_token);
          if (!claims) continue;
          const channelClaim = text(claims["channel"]);
          if (
            connection.platform_user_id &&
            channelClaim &&
            channelClaim !== connection.platform_user_id
          ) {
            continue;
          }
          if (bodyChannel && channelClaim && bodyChannel !== channelClaim) continue;
          matched = { userId: connection.user_id };
          break;
        }
        if (!matched) return new Response("Invalid token", { status: 401 });

        const event = parseStreamElementsPayload(body);
        if (!event) return jsonResponse({ status: "ignored", reason: "unsupported_type" });

        const resolved = resolveRelaySource({
          relay: "STREAMELEMENTS",
          origin: event.origin,
          eventType: event.eventType,
        });
        if (!resolved) return jsonResponse({ status: "ignored", reason: "unsupported_type" });

        const normalized: NormalizedEvent = {
          platform: resolved.platform,
          eventType: resolved.eventType,
          providerEventId: event.providerEventId,
          actorName: event.actorName,
          actorPlatformId: null,
          amount: event.amount,
          currency: event.currency,
          quantity: event.quantity,
          rawPayload: event.raw,
        };

        const result = await receivePlatformEvent(supabaseAdmin, matched.userId, normalized);
        return jsonResponse(result);
      },
    },
  },
});
