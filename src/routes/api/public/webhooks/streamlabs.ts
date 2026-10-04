import { createFileRoute } from "@tanstack/react-router";

import type { NormalizedEvent } from "@/lib/webhooks/ingest.server";
import { isFreshRelayTimestamp, parseStreamlabsPayload } from "@/lib/relayEvents";

const MIN_TOKEN_LENGTH = 16;

function payloadTimestamp(body: unknown): unknown {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  if (root["created_at"] != null && root["created_at"] !== "") return root["created_at"];
  const message = root["message"];
  const first = Array.isArray(message) ? message[0] : message;
  if (first && typeof first === "object") return (first as Record<string, unknown>)["created_at"];
  return null;
}

export const Route = createFileRoute("/api/public/webhooks/streamlabs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { jsonResponse, receivePlatformEvent, resolveUserByToken, listConnections } =
          await import("@/lib/webhooks/ingest.server");
        const { resolveRelaySource } = await import("@/lib/platformEvents");
        const { safeEqual } = await import("@/lib/webhooks/verify.server");

        const url = new URL(request.url);
        const authHeader = request.headers.get("authorization") ?? "";
        const headerToken =
          request.headers.get("x-streamlabs-token") ??
          (authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "");
        const queryToken = (url.searchParams.get("token") ?? "").trim();

        // Prefer Authorization / x-streamlabs-token. Query tokens still work for
        // legacy Streamlabs alert URL wiring, but must meet length + optional shared secret.
        const token = (headerToken || queryToken).trim();
        if (!token || token.length < MIN_TOKEN_LENGTH) {
          return jsonResponse({ error: "unauthorized" }, 401);
        }

        const sharedSecret = process.env["STREAMLABS_WEBHOOK_SECRET"]?.trim();
        if (sharedSecret) {
          const provided =
            request.headers.get("x-streamlabs-secret") ?? url.searchParams.get("secret") ?? "";
          if (!provided || !safeEqual(provided, sharedSecret)) {
            return jsonResponse({ error: "unauthorized" }, 401);
          }
        }

        const rawBody = await request.text();
        let body: unknown;
        try {
          body = JSON.parse(rawBody) as unknown;
        } catch {
          return jsonResponse({ error: "invalid_json" }, 400);
        }

        if (!isFreshRelayTimestamp(payloadTimestamp(body))) {
          return jsonResponse({ error: "stale_timestamp" }, 403);
        }

        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        let userId = await resolveUserByToken(supabaseAdmin, "STREAMLABS", token);
        if (!userId) {
          const connections = await listConnections(supabaseAdmin, "STREAMLABS");
          for (const connection of connections) {
            const meta = connection.metadata as { socket_token?: string } | null;
            const socketToken = meta?.socket_token;
            if (typeof socketToken === "string" && socketToken && safeEqual(socketToken, token)) {
              userId = connection.user_id;
              break;
            }
          }
        }
        if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

        const events = parseStreamlabsPayload(body);
        if (!events.length) return jsonResponse({ status: "ignored", reason: "unsupported_type" });

        const results = [];
        for (const event of events) {
          const resolved = resolveRelaySource({
            relay: "STREAMLABS",
            origin: event.origin,
            eventType: event.eventType,
          });
          if (!resolved) continue;
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
          results.push(await receivePlatformEvent(supabaseAdmin, userId, normalized));
        }

        if (!results.length) return jsonResponse({ status: "ignored", reason: "unsupported_type" });
        return jsonResponse({ processed: results.length, results });
      },
    },
  },
});
