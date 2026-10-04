import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { EventType, NormalizedEvent } from "@/lib/webhooks/ingest.server";

const SlMessageSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    _id: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    from: z.string().optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    currency: z.string().optional(),
    months: z.number().optional(),
    message: z.string().optional(),
    subscriber_id: z.string().optional(),
    created_at: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const SlPayloadSchema = z
  .object({
    type: z.string().optional(),
    for: z.string().optional(),
    event_id: z.union([z.string(), z.number()]).optional(),
    message: z.union([SlMessageSchema, z.array(SlMessageSchema)]).optional(),
    created_at: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const MIN_TOKEN_LENGTH = 16;
const SKEW_MS = 10 * 60 * 1000;

function isFreshTimestamp(value: string | number | undefined | null): boolean {
  if (value == null) return true; // Streamlabs often omits timestamps — don't hard-fail.
  const sent = typeof value === "number" ? (value < 1e12 ? value * 1000 : value) : Date.parse(String(value));
  if (Number.isNaN(sent)) return false;
  return Math.abs(Date.now() - sent) <= SKEW_MS;
}

export const Route = createFileRoute("/api/public/webhooks/streamlabs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { jsonResponse, receivePlatformEvent, resolveUserByToken } = await import(
          "@/lib/webhooks/ingest.server"
        );
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
            request.headers.get("x-streamlabs-secret") ??
            url.searchParams.get("secret") ??
            "";
          if (!provided || !safeEqual(provided, sharedSecret)) {
            return jsonResponse({ error: "unauthorized" }, 401);
          }
        }

        const rawBody = await request.text();
        let parsed: z.infer<typeof SlPayloadSchema>;
        try {
          parsed = SlPayloadSchema.parse(JSON.parse(rawBody));
        } catch {
          return jsonResponse({ error: "invalid_json" }, 400);
        }

        const stamp =
          parsed.created_at ??
          (Array.isArray(parsed.message)
            ? parsed.message[0]?.created_at
            : parsed.message?.created_at);
        if (!isFreshTimestamp(stamp ?? null)) {
          return jsonResponse({ error: "stale_timestamp" }, 403);
        }

        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const userId = await resolveUserByToken(supabaseAdmin, "STREAMLABS", token);
        if (!userId) {
          return jsonResponse({ error: "unauthorized" }, 401);
        }

        const type = (parsed.type ?? "").toLowerCase();
        const eventType: EventType | null =
          type === "donation" || type === "superchat" || type === "merch"
            ? "DONATION"
            : type === "follow"
              ? "FOLLOW"
              : type === "subscription" || type === "resub" || type === "membership"
                ? "SUBSCRIPTION"
                : null;
        if (!eventType) return jsonResponse({ status: "ignored", reason: "unsupported_type" });
        const origin =
          (typeof parsed.for === "string" ? parsed.for : null) ??
          (type === "superchat" || type === "membership" ? "youtube" : null);

        const messages = Array.isArray(parsed.message)
          ? parsed.message
          : parsed.message
            ? [parsed.message]
            : [];
        if (!messages.length) return jsonResponse({ status: "ignored", reason: "empty_payload" });

        const results = [];
        for (const [index, msg] of messages.entries()) {
          const providerId =
            msg.id != null
              ? String(msg.id)
              : msg._id != null
                ? String(msg._id)
                : parsed.event_id != null
                  ? `${parsed.event_id}:${index}`
                  : null;
          const resolved = resolveRelaySource({ relay: "STREAMLABS", origin, eventType });
          if (!resolved) continue;
          const normalized: NormalizedEvent = {
            platform: resolved.platform,
            eventType: resolved.eventType,
            providerEventId: providerId,
            actorName: msg.from ?? msg.name ?? "Anonymous",
            actorPlatformId: msg.subscriber_id ?? null,
            amount: Number(msg.amount ?? 0) || 0,
            currency: msg.currency ?? null,
            quantity: 1,
            rawPayload: msg,
          };
          results.push(await receivePlatformEvent(supabaseAdmin, userId, normalized));
        }

        return jsonResponse({ processed: results.length, results });
      },
    },
  },
});
