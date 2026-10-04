import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

export type PinInput = {
  widgetId: string;
  platform?: string | null;
  author?: string | null;
  color?: string | null;
  text: string;
  badges?: string[];
  badgeImages?: { label: string; imageUrl: string | null }[];
  isReply?: boolean;
  replyQuote?: string | null;
  appearedAt?: string | null;
};

const clip = (value: unknown, max: number, fallback = "") =>
  typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, max) : fallback;

/**
 * Pins one chat message to the creator's Chat Spotlight overlay. The message
 * is stored on the widget row (so an OBS refresh keeps showing it) and pushed
 * over Realtime so the browser source updates instantly.
 */
export const pinSpotlightMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PinInput) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");

    const { data: widget } = await supabaseAdmin
      .from("widgets")
      .select("id, user_id, type")
      .eq("id", data.widgetId)
      .maybeSingle();
    if (!widget || widget.user_id !== context.userId) throw new Error("Widget not found");

    const text = clip(data.text, 400);
    if (!text) throw new Error("Empty message");

    const spotlight = {
      id: `pin-${crypto.randomUUID()}`,
      platform: clip(data.platform, 20, "TWITCH").toUpperCase(),
      author: clip(data.author, 40, "Viewer"),
      color: clip(data.color, 20) || null,
      text,
      badges: (data.badges ?? [])
        .filter((badge): badge is string => typeof badge === "string")
        .slice(0, 12),
      badgeImages: (data.badgeImages ?? [])
        .filter((badge) => badge && typeof badge === "object")
        .map((badge) => ({
          label: clip(badge.label, 40, "badge"),
          imageUrl: clip(badge.imageUrl, 400) || null,
        }))
        .slice(0, 12),
      pinnedAt: new Date().toISOString(),
      nonce: Date.now(),
      isReply: data.isReply === true,
      replyQuote: data.isReply ? clip(data.replyQuote, 160) || null : null,
      appearedAt: data.isReply ? clip(data.appearedAt, 40) || new Date().toISOString() : undefined,
    };

    const { error } = await supabaseAdmin
      .from("widgets")
      .update({ state: { spotlight } as never })
      .eq("id", widget.id);
    if (error) throw new Error(error.message);

    const { broadcastToWidgets } = await import("@/lib/realtime.server");
    await broadcastToWidgets([widget.id], "refresh", { reason: "spotlight" });

    return { ok: true as const, spotlight };
  });

/** Removes the pinned message from the Chat Spotlight overlay. */
export const clearSpotlightMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { widgetId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");

    const { data: widget } = await supabaseAdmin
      .from("widgets")
      .select("id, user_id")
      .eq("id", data.widgetId)
      .maybeSingle();
    if (!widget || widget.user_id !== context.userId) throw new Error("Widget not found");

    const { error } = await supabaseAdmin
      .from("widgets")
      .update({ state: {} as never })
      .eq("id", widget.id);
    if (error) throw new Error(error.message);

    const { broadcastToWidgets } = await import("@/lib/realtime.server");
    await broadcastToWidgets([widget.id], "refresh", { reason: "spotlight_clear" });

    return { ok: true as const };
  });
