import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { EventType, Platform } from "@/lib/webhooks/ingest.server";

const PLATFORMS = [
  "TWITCH",
  "KICK",
  "YOUTUBE",
  "TIKTOK",
  "STREAMLABS",
  "STREAMELEMENTS",
  "MANUAL",
] as const;

const EVENT_TYPES = [
  "FOLLOW",
  "SUBSCRIPTION",
  "GIFT_SUB",
  "BITS",
  "DONATION",
  "RAID",
  "LIKE",
] as const;

/** Current goal bars for the signed-in creator. */
export const getLiveTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { listTargetStatus } = await import("@/lib/targets.server");
    const targets = await listTargetStatus(supabaseAdmin, context.userId);
    return { targets };
  });

/**
 * Authenticated ingest for platforms that do not push a native webhook yet
 * (YouTube, TikTok) and for a bot running as the creator.
 */
export const ingestLivePlatformEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      platform: (typeof PLATFORMS)[number];
      eventType: (typeof EVENT_TYPES)[number];
      actorName?: string | null;
      amount?: number | null;
      currency?: string | null;
      quantity?: number | null;
      providerEventId?: string | null;
    }) => {
      if (!PLATFORMS.includes(input?.platform)) throw new Error("Unsupported platform");
      if (!EVENT_TYPES.includes(input?.eventType)) throw new Error("Unsupported event type");
      return {
        platform: input.platform,
        eventType: input.eventType,
        actorName: (input.actorName ?? "Viewer").slice(0, 80),
        amount:
          input.amount === null || input.amount === undefined || Number.isNaN(Number(input.amount))
            ? null
            : Number(input.amount),
        currency: (input.currency ?? "").slice(0, 10) || null,
        quantity: Math.min(Math.max(Math.floor(Number(input.quantity) || 1), 1), 100000),
        providerEventId: (input.providerEventId ?? "").slice(0, 200) || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { receivePlatformEvent } = await import("@/lib/webhooks/ingest.server");
    const result = await receivePlatformEvent(supabaseAdmin, context.userId, {
      platform: data.platform as Platform,
      eventType: data.eventType as EventType,
      providerEventId: data.providerEventId ?? `live-${crypto.randomUUID()}`,
      actorName: data.actorName,
      actorPlatformId: null,
      amount: data.amount,
      currency: data.currency,
      quantity: data.quantity,
      rawPayload: { source: "live_ingest" },
    });
    return result;
  });
