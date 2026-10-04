import { createFileRoute } from "@tanstack/react-router";

import type { EventType, NormalizedEvent } from "@/lib/webhooks/ingest.server";

type TwitchPayload = {
  subscription?: { id?: string; type?: string };
  challenge?: string;
  event?: Record<string, unknown>;
};

const TIER_MULTIPLIER: Record<string, number> = { "1000": 1, "2000": 2, "3000": 6 };

function normalize(type: string, messageId: string, ev: Record<string, unknown>): NormalizedEvent | null {
  const str = (k: string) => (typeof ev[k] === "string" ? (ev[k] as string) : null);
  const num = (k: string) => (typeof ev[k] === "number" ? (ev[k] as number) : null);
  const base = {
    platform: "TWITCH" as const,
    providerEventId: messageId,
    rawPayload: ev,
    currency: null as string | null,
  };

  switch (type) {
    case "channel.follow":
      return {
        ...base,
        eventType: "FOLLOW" as EventType,
        actorName: str("user_name") ?? str("user_login"),
        actorPlatformId: str("user_id"),
        amount: null,
        quantity: 1,
      };
    case "channel.subscribe":
      return {
        ...base,
        eventType: "SUBSCRIPTION" as EventType,
        actorName: str("user_name"),
        actorPlatformId: str("user_id"),
        amount: null,
        quantity: TIER_MULTIPLIER[str("tier") ?? "1000"] ?? 1,
        isGiftedSubscription: ev["is_gift"] === true,
      };
    case "channel.subscription.message":
      // Resubs already arrive as channel.subscribe. This message is the chat
      // text for that same sub, not a second subscription.
      return null;
    case "channel.subscription.gift":
      return {
        ...base,
        eventType: "GIFT_SUB" as EventType,
        actorName: ev["is_anonymous"] === true ? "Anonymous" : str("user_name"),
        actorPlatformId: str("user_id"),
        amount: null,
        quantity: Math.max(num("total") ?? 1, 1) * (TIER_MULTIPLIER[str("tier") ?? "1000"] ?? 1),
      };
    case "channel.cheer":
      return {
        ...base,
        eventType: "BITS" as EventType,
        actorName: ev["is_anonymous"] === true ? "Anonymous" : str("user_name"),
        actorPlatformId: str("user_id"),
        amount: num("bits") ?? 0,
        quantity: 1,
      };
    case "channel.raid":
      return {
        ...base,
        eventType: "RAID" as EventType,
        actorName: str("from_broadcaster_user_name"),
        actorPlatformId: str("from_broadcaster_user_id"),
        amount: null,
        quantity: 1,
      };
    default:
      return null;
  }
}


export const Route = createFileRoute("/api/public/webhooks/twitch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { jsonResponse, receivePlatformEvent, resolveUserByPlatformUser } = await import(
          "@/lib/webhooks/ingest.server"
        );
        const { verifyTwitchSignature } = await import("@/lib/webhooks/verify.server");

        const secret = process.env["TWITCH_EVENTSUB_SECRET"];
        if (!secret) return jsonResponse({ error: "twitch_webhook_not_configured" }, 503);

        const rawBody = await request.text();
        const ok = verifyTwitchSignature({
          secret,
          messageId: request.headers.get("twitch-eventsub-message-id"),
          timestamp: request.headers.get("twitch-eventsub-message-timestamp"),
          signature: request.headers.get("twitch-eventsub-message-signature"),
          rawBody,
        });
        if (!ok) return new Response("Invalid signature", { status: 403 });

        let payload: TwitchPayload;
        try {
          payload = JSON.parse(rawBody) as TwitchPayload;
        } catch {
          return jsonResponse({ error: "invalid_json" }, 400);
        }

        const messageType = request.headers.get("twitch-eventsub-message-type");
        if (messageType === "webhook_callback_verification") {
          return new Response(payload.challenge ?? "", {
            status: 200,
            headers: { "content-type": "text/plain" },
          });
        }
        if (messageType === "revocation") return new Response(null, { status: 204 });

        const messageId = request.headers.get("twitch-eventsub-message-id") ?? "";
        const type = payload.subscription?.type ?? "";
        const ev = payload.event ?? {};
        // Native Twitch pins drive the Chat Spotlight overlay directly.
        if (type === "channel.chat.message_pinned") {
          const { supabaseAdmin } = await import("@/lib/supabase/client.server");
          const broadcaster =
            typeof ev["broadcaster_user_id"] === "string" ? (ev["broadcaster_user_id"] as string) : null;
          if (!broadcaster) return jsonResponse({ status: "ignored", reason: "no_broadcaster" });

          const { data: connection } = await supabaseAdmin
            .from("platform_connections")
            .select("user_id")
            .eq("platform", "TWITCH")
            .eq("platform_user_id", broadcaster)
            .eq("is_active", true)
            .maybeSingle();
          if (!connection) return jsonResponse({ status: "ignored", reason: "no_connection" });

          const message = ev["message"] as { text?: string } | undefined;
          const text = typeof message?.text === "string" ? message.text.slice(0, 400) : "";
          if (!text) return jsonResponse({ status: "ignored", reason: "empty_message" });

          const spotlight = {
            id: `pin-${messageId || crypto.randomUUID()}`,
            platform: "TWITCH",
            author:
              typeof ev["chatter_user_name"] === "string" ? (ev["chatter_user_name"] as string) : "Viewer",
            color: null,
            text,
            badges: [] as string[],
            badgeImages: [] as { label: string; imageUrl: string | null }[],
            pinnedAt: new Date().toISOString(),
            nonce: Date.now(),
          };

          const { data: widgets } = await supabaseAdmin
            .from("widgets")
            .select("id")
            .eq("user_id", connection.user_id)
            .eq("type", "CHAT_SPOTLIGHT");

          const ids = (widgets ?? []).map((row) => row.id);
          if (ids.length > 0) {
            await supabaseAdmin
              .from("widgets")
              .update({ state: { spotlight } as never })
              .in("id", ids);
            const { broadcastToWidgets } = await import("@/lib/realtime.server");
            await broadcastToWidgets(ids, "refresh", { reason: "spotlight" });
          }
          return jsonResponse({ status: "accepted", widgets: ids.length });
        }

        const normalized = normalize(type, messageId, ev);
        if (!normalized) return jsonResponse({ status: "ignored", reason: "unsupported_type" });

        const broadcasterId =
          typeof ev["broadcaster_user_id"] === "string" ? (ev["broadcaster_user_id"] as string) : null;
        if (!broadcasterId) return jsonResponse({ status: "ignored", reason: "no_broadcaster" });

        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const userId = await resolveUserByPlatformUser(supabaseAdmin, "TWITCH", broadcasterId);
        if (!userId) return jsonResponse({ status: "ignored", reason: "no_connection" });

        const result = await receivePlatformEvent(supabaseAdmin, userId, normalized);
        return jsonResponse(result);
      },
    },
  },
});
