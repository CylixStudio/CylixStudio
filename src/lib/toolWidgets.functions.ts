import { createServerFn } from "@tanstack/react-start";

import { parseSpinConfig, parseViewerCounterConfig, pickWeightedPrize } from "@/lib/widgets";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readToken(input: unknown): { publicToken: string } {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const publicToken = typeof record["publicToken"] === "string" ? record["publicToken"].trim() : "";
  if (!TOKEN.test(publicToken)) throw new Error("invalid_token");
  return { publicToken };
}

export type OverlayViewerResult =
  | {
      ok: true;
      count: number | null;
      note: string | null;
      displayName: string;
      platform: string;
      isLive: boolean;
    }
  | { ok: false; message: string };

/** Public overlay lookup. TikTok stays the real coming-soon error. */
export const readOverlayViewers = createServerFn({ method: "POST" })
  .inputValidator(readToken)
  .handler(async ({ data }): Promise<OverlayViewerResult> => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: widget } = await supabaseAdmin
      .from("widgets")
      .select("type, config, is_enabled, user_id")
      .eq("public_token", data.publicToken)
      .maybeSingle();
    if (!widget || !widget.is_enabled || widget.type !== "VIEWER_COUNTER") {
      return { ok: false, message: "overlay_not_found" };
    }
    const config = parseViewerCounterConfig(widget.config);
    if (!config.channel) return { ok: false, message: "channel_missing" };
    if (config.platform === "TIKTOK") {
      return {
        ok: false,
        message: "TikTok live counters are Coming Soon until TikTok OAuth is ready.",
      };
    }
    try {
      const { resolveChannelSnapshot } = await import("@/lib/liveCounter.functions");
      const snapshot = await resolveChannelSnapshot({
        userId: widget.user_id,
        platform: config.platform,
        username: config.channel,
      });
      const count = config.metric === "followers" ? snapshot.followers : snapshot.viewers;
      return {
        ok: true,
        count,
        note: snapshot.note,
        displayName: snapshot.displayName,
        platform: snapshot.platform,
        isLive: snapshot.isLive,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "lookup_failed";
      return { ok: false, message };
    }
  });

/** Spins the saved prize list for this overlay token. No external random service. */
export const spinPublicWheel = createServerFn({ method: "POST" })
  .inputValidator(readToken)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: widget } = await supabaseAdmin
      .from("widgets")
      .select("id, type, config, is_enabled")
      .eq("public_token", data.publicToken)
      .maybeSingle();
    if (!widget || !widget.is_enabled || widget.type !== "SPIN_WHEEL") {
      return { ok: false as const, message: "overlay_not_found" };
    }
    const prizes = parseSpinConfig(widget.config).prizes;
    const result = pickWeightedPrize(prizes);
    if (!result) return { ok: false as const, message: "no_prizes" };
    const nonce = Date.now();
    const spunAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("widgets")
      .update({ state: { spin: { result, spunAt, nonce } } })
      .eq("id", widget.id);
    if (error) return { ok: false as const, message: "save_failed" };
    return { ok: true as const, result, spunAt, nonce };
  });
