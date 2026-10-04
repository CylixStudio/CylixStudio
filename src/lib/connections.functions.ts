import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

/** Builds a signed OAuth start URL that links the provider to the signed-in user. */
export const startPlatformLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: "twitch" | "kick" | "streamlabs" | "tiktok" }) => {
    if (!["twitch", "kick", "streamlabs", "tiktok"].includes(data?.provider)) {
      throw new Error("Unsupported provider");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { signLinkState } = await import("@/lib/oauth.server");
    try {
      const state = signLinkState(context.userId);
      return { url: `/api/auth/${data.provider}/start?link=${encodeURIComponent(state)}` };
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Account linking is not configured (set OAUTH_LINK_SECRET or SUPABASE_SERVICE_ROLE_KEY)",
      );
    }
  });

/** Verifies a StreamElements account JWT and stores it for the signed-in user. */
export const connectStreamElements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string }) => {
    const token = (data?.token ?? "").trim();
    if (!token) throw new Error("Token is required");
    return { token };
  })
  .handler(async ({ data, context }) => {
    const { verifyStreamElementsToken, saveStreamElementsConnection, normalizeJwt } = await import(
      "@/lib/connections.server"
    );
    const token = normalizeJwt(data.token);
    const channel = await verifyStreamElementsToken(token);
    if (!channel) return { ok: false as const };
    await saveStreamElementsConnection(context.supabase, context.userId, token, channel);
    return { ok: true as const, username: channel.username };
  });

/**
 * Reports whether a StreamElements JWT is stored (never returns the JWT itself —
 * tips should flow via webhooks; browser sockets would require exposing the secret).
 */
export const getStreamElementsToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("platform_connections")
      .select("id")
      .eq("user_id", context.userId)
      .eq("platform", "STREAMELEMENTS")
      .eq("is_active", true)
      .limit(1);
    return { configured: Boolean(data?.[0]?.id), token: null as string | null };
  });

/** Ingests one parsed StreamElements realtime event through the shared pipeline. */
export const ingestStreamElementsEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      eventType: "DONATION" | "SUBSCRIPTION" | "GIFT_SUB" | "BITS" | "FOLLOW" | "RAID" | "LIKE";
      providerEventId: string | null;
      actorName: string;
      amount: number | null;
      currency: string | null;
      quantity: number;
      message: string | null;
      origin?: string | null;
    }) => {
      const allowed = ["DONATION", "SUBSCRIPTION", "GIFT_SUB", "BITS", "FOLLOW", "RAID", "LIKE"];
      if (!allowed.includes(data?.eventType)) throw new Error("Unsupported event type");
      return {
        eventType: data.eventType,
        origin: (data.origin ?? "").slice(0, 40) || null,
        providerEventId: (data.providerEventId ?? "").slice(0, 200) || null,
        actorName: (data.actorName ?? "Anonymous").slice(0, 80) || "Anonymous",
        amount:
          data.amount === null || data.amount === undefined || Number.isNaN(Number(data.amount))
            ? null
            : Number(data.amount),
        currency: (data.currency ?? "").slice(0, 10) || null,
        quantity: Math.min(Math.max(Math.floor(Number(data.quantity) || 1), 1), 100000),
        message: (data.message ?? "").slice(0, 400) || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { receivePlatformEvent } = await import("@/lib/webhooks/ingest.server");
    const { resolveRelaySource } = await import("@/lib/platformEvents");
    const resolved = resolveRelaySource({
      relay: "STREAMELEMENTS",
      origin: data.origin,
      eventType: data.eventType,
    });
    if (!resolved) return { status: "ok" as const, result: { status: "ignored" as const, reason: "unsupported_type" } };
    const result = await receivePlatformEvent(supabaseAdmin, context.userId, {
      platform: resolved.platform,
      eventType: resolved.eventType,
      providerEventId: data.providerEventId,
      actorName: data.actorName,
      actorPlatformId: null,
      amount: data.amount,
      currency: data.currency,
      quantity: data.quantity,
      rawPayload: { source: "streamelements_socket", message: data.message },
    });
    return { status: "ok" as const, result };
  });

/** Reports whether Streamlabs OAuth credentials are usable, for UI fallback. */
export const streamlabsOAuthStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const clientId = process.env["STREAMLABS_CLIENT_ID"] ?? "";
    const clientSecret = process.env["STREAMLABS_CLIENT_SECRET"] ?? "";
    return { configured: clientId.trim().length > 0 && clientSecret.trim().length > 0 };
  });

/** Stores a Streamlabs Socket API token for the signed-in user. */
export const connectStreamlabsSocket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string }) => {
    const token = (data?.token ?? "").trim();
    if (!token) throw new Error("Token is required");
    return { token };
  })
  .handler(async ({ data, context }) => {
    const { isLikelySocketToken, saveStreamlabsSocketConnection } = await import(
      "@/lib/streamlabs.server"
    );
    if (!isLikelySocketToken(data.token)) return { ok: false as const };
    await saveStreamlabsSocketConnection(context.supabase, context.userId, data.token);
    return { ok: true as const };
  });

/**
 * Reports whether a Streamlabs socket connection is stored (never returns the
 * durable socket token to the browser — use Streamlabs webhooks for production tips).
 */
export const getStreamlabsSocketToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("platform_connections")
      .select("id, metadata")
      .eq("user_id", context.userId)
      .eq("platform", "STREAMLABS")
      .eq("is_active", true)
      .limit(5);
    const configured = (data ?? []).some((entry) => {
      const meta = entry.metadata as { source?: string; socket_token?: string } | null;
      return meta?.source === "socket_token" || Boolean(meta?.socket_token) || Boolean(entry.id);
    });
    return { configured, token: null as string | null };
  });

const SOCKET_EVENT_TYPES = [
  "DONATION",
  "SUBSCRIPTION",
  "GIFT_SUB",
  "BITS",
  "FOLLOW",
  "RAID",
  "LIKE",
] as const;

/** Ingests one parsed Streamlabs socket event through the shared pipeline. */
export const ingestStreamlabsSocketEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      eventType: (typeof SOCKET_EVENT_TYPES)[number];
      providerEventId: string | null;
      actorName: string;
      amount: number | null;
      currency: string | null;
      quantity: number;
      message: string | null;
      origin?: string | null;
    }) => {
      if (!SOCKET_EVENT_TYPES.includes(data?.eventType)) throw new Error("Unsupported event type");
      return {
        eventType: data.eventType,
        origin: (data.origin ?? "").slice(0, 40) || null,
        providerEventId: (data.providerEventId ?? "").slice(0, 200) || null,
        actorName: (data.actorName ?? "Anonymous").slice(0, 80) || "Anonymous",
        amount:
          data.amount === null || data.amount === undefined || Number.isNaN(Number(data.amount))
            ? null
            : Number(data.amount),
        currency: (data.currency ?? "").slice(0, 10) || null,
        quantity: Math.min(Math.max(Math.floor(Number(data.quantity) || 1), 1), 100000),
        message: (data.message ?? "").slice(0, 400) || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { receivePlatformEvent } = await import("@/lib/webhooks/ingest.server");
    const { resolveRelaySource } = await import("@/lib/platformEvents");
    const resolved = resolveRelaySource({
      relay: "STREAMLABS",
      origin: data.origin,
      eventType: data.eventType,
    });
    if (!resolved) return { status: "ok" as const, result: { status: "ignored" as const, reason: "unsupported_type" } };
    const result = await receivePlatformEvent(supabaseAdmin, context.userId, {
      platform: resolved.platform,
      eventType: resolved.eventType,
      providerEventId: data.providerEventId,
      actorName: data.actorName,
      actorPlatformId: null,
      amount: data.amount,
      currency: data.currency,
      quantity: data.quantity,
      rawPayload: { source: "streamlabs_socket", message: data.message },
    });
    return { status: "ok" as const, result };
  });
