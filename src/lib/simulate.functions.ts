import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

export type SimulateInput = {
  widgetId: string;
  platform: "TWITCH" | "KICK" | "STREAMLABS" | "TIKTOK" | "MANUAL";
  eventType: "FOLLOW" | "SUBSCRIPTION" | "GIFT_SUB" | "BITS" | "DONATION" | "RAID" | "LIKE";
  amount?: number | null;
  actorName?: string | null;
  quantity?: number | null;
};

/**
 * Runs a synthetic event through the exact production ingest pipeline
 * (rule evaluation -> event row -> timer/goal update -> Realtime broadcast),
 * so the dashboard can verify an OBS source without waiting for real viewers.
 */
export const simulateStreamEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SimulateInput) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { receivePlatformEvent } = await import("@/lib/webhooks/ingest.server");

    const { data: widget } = await supabaseAdmin
      .from("widgets")
      .select("id, user_id")
      .eq("id", data.widgetId)
      .maybeSingle();
    if (!widget || widget.user_id !== userId) throw new Error("Widget not found");

    const amount =
      data.eventType === "DONATION"
        ? (data.amount ?? 5)
        : data.eventType === "BITS"
          ? (data.amount ?? 100)
          : null;

    const result = await receivePlatformEvent(supabaseAdmin, userId, {
        platform: data.platform,
        eventType: data.eventType,
        providerEventId: `sim-${crypto.randomUUID()}`,
        actorName: data.actorName ?? "TestViewer",
        actorPlatformId: null,
        amount,
        currency: data.eventType === "DONATION" ? "USD" : null,
        quantity: Math.max(1, Math.round(data.quantity ?? 1)),
        isTest: true,
        rawPayload: { simulated: true, isTest: true },
    });

    return { ok: true as const, result };
  });

/** Pushes a synthetic chat message straight onto the widget's Realtime topic. */
export const sendTestChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { widgetId: string; text?: string; author?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: widget } = await supabaseAdmin
      .from("widgets")
      .select("id, user_id")
      .eq("id", data.widgetId)
      .maybeSingle();
    if (!widget || widget.user_id !== context.userId) throw new Error("Widget not found");

    const { broadcastToWidgets } = await import("@/lib/realtime.server");
    await broadcastToWidgets([widget.id], "chat", {
      id: `test-${crypto.randomUUID()}`,
      platform: "twitch",
      author: data.author?.slice(0, 40) || "TestViewer",
      color: "#A78BFA",
      badges: ["broadcaster"],
      text: data.text?.slice(0, 200) || "Hello from the CylixStudio test suite! 🎉",
    });

    return { ok: true as const };
  });

export type TestEventInput = {
  platform: "TWITCH" | "KICK" | "TIKTOK" | "YOUTUBE" | "X" | "STREAMLABS" | "STREAMELEMENTS" | "MANUAL";
  eventType: "FOLLOW" | "SUBSCRIPTION" | "GIFT_SUB" | "BITS" | "DONATION" | "RAID" | "LIKE";
  amount?: number | null;
  actorName?: string | null;
  message?: string | null;
  quantity?: number | null;
};

/**
 * Developer test harness: fires one synthetic event for any platform through
 * the production ingest pipeline (source routing -> rules -> event row ->
 * timer/goal update), so every widget and the Activity Feed can be verified
 * without waiting for a real viewer.
 */
export const fireTestEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TestEventInput) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { receivePlatformEvent, isAllowedEventSource } = await import(
      "@/lib/webhooks/ingest.server"
    );

    if (!isAllowedEventSource(data.platform, data.eventType)) {
      return {
        ok: false as const,
        error: `${data.platform} never reports ${data.eventType} events — blocked by source routing.`,
      };
    }

    const amount =
      data.eventType === "DONATION"
        ? (data.amount ?? 5)
        : data.eventType === "BITS"
          ? (data.amount ?? 100)
          : null;

    const message = data.message?.trim().slice(0, 400) || null;
    const quantity = Math.max(1, Math.round(data.quantity ?? 1));

    const result = await receivePlatformEvent(supabaseAdmin, userId, {
      platform: data.platform,
      eventType: data.eventType,
      providerEventId: `test-${crypto.randomUUID()}`,
      actorName: data.actorName?.trim() || `Test${data.platform.slice(0, 1)}${Math.floor(Math.random() * 900 + 100)}`,
      actorPlatformId: null,
      amount,
      currency: data.eventType === "DONATION" ? "USD" : null,
      quantity,
      isTest: true,
      rawPayload: {
        test_harness: true,
        isTest: true,
        platform: data.platform,
        ...(message ? { message } : {}),
      },
    });

    return { ok: true as const, result };
  });
