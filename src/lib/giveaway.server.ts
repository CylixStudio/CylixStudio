import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export type GiveawayPlatform = "KICK" | "TWITCH" | "YOUTUBE" | "TIKTOK";

export type EntryInput = {
  platform: GiveawayPlatform;
  username: string;
  text: string;
  isSubscriber: boolean;
};

export type EntryResult =
  | { status: "ignored"; reason: string }
  | { status: "entered"; entries: number };

type Admin = SupabaseClient<Database>;

/**
 * Registers a chat viewer into the creator's live participant list when the
 * message matches the configured keyword. Shared by every chat source
 * (Kick/Twitch/YouTube/TikTok) so all platforms behave identically.
 */
export async function captureGiveawayEntry(
  admin: Admin,
  userId: string,
  input: EntryInput,
): Promise<EntryResult> {
  const { data: settings } = await admin
    .from("giveaway_settings")
    .select("keyword, sub_multiplier, subs_only, is_open")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings) return { status: "ignored", reason: "giveaway_not_configured" };
  if (!settings.is_open) return { status: "ignored", reason: "giveaway_closed" };

  const keyword = (settings.keyword || "+1").trim().toLowerCase();
  const text = input.text.trim().toLowerCase();
  if (!keyword || !text.includes(keyword)) return { status: "ignored", reason: "no_keyword" };
  if (settings.subs_only && !input.isSubscriber) {
    return { status: "ignored", reason: "subscribers_only" };
  }

  const username = input.username.trim().slice(0, 60);
  if (!username) return { status: "ignored", reason: "no_username" };

  const multiplier = Math.max(Number(settings.sub_multiplier) || 1, 1);
  const entries = input.isSubscriber ? multiplier : 1;

  const { error } = await admin.from("giveaway_participants").upsert(
    {
      user_id: userId,
      platform: input.platform,
      username,
      entries,
      is_subscriber: input.isSubscriber,
    },
    { onConflict: "user_id,platform,username" },
  );
  if (error) return { status: "ignored", reason: error.message };

  return { status: "entered", entries };
}

export type GiveawayPendingWinner = {
  username: string;
  platform: string;
  at: string;
};

export type StoredGiveawayDraw = {
  phase: "idle" | "shuffling" | "revealing" | "settled";
  winner: { username: string; platform: string } | null;
  claimState: "pending" | "confirmed" | "expired";
  claimUntil: string | null;
  keyword: string;
  pending_winner: GiveawayPendingWinner | null;
  confirmed_at: string | null;
  confirm_nonce: string | null;
  overlayLayout: "glass" | "direct" | "bold";
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function field(record: Record<string, unknown> | null, key: string): unknown {
  return record ? record[key] : undefined;
}

export function readGiveawayDraw(raw: unknown): StoredGiveawayDraw {
  const value = asRecord(raw);
  const pending = asRecord(field(value, "pending_winner"));
  const winner = asRecord(field(value, "winner"));
  const phase = field(value, "phase");
  const claim = field(value, "claimState");
  const winnerName = field(winner, "username");
  const pendingName = field(pending, "username");
  const claimUntil = field(value, "claimUntil");
  const keyword = field(value, "keyword");
  const confirmedAt = field(value, "confirmed_at");
  const nonce = field(value, "confirm_nonce");
  const winnerPlatform = field(winner, "platform");
  const pendingPlatform = field(pending, "platform");
  const pendingAt = field(pending, "at");
  return {
    phase:
      phase === "shuffling" || phase === "revealing" || phase === "settled" || phase === "idle"
        ? phase
        : "idle",
    winner:
      typeof winnerName === "string"
        ? {
            username: winnerName,
            platform: typeof winnerPlatform === "string" ? winnerPlatform : "",
          }
        : null,
    claimState: claim === "confirmed" || claim === "expired" || claim === "pending" ? claim : "pending",
    claimUntil: typeof claimUntil === "string" ? claimUntil : null,
    keyword: typeof keyword === "string" ? keyword : "",
    pending_winner:
      typeof pendingName === "string"
        ? {
            username: pendingName,
            platform: typeof pendingPlatform === "string" ? pendingPlatform : "",
            at: typeof pendingAt === "string" ? pendingAt : "",
          }
        : null,
    confirmed_at: typeof confirmedAt === "string" ? confirmedAt : null,
    confirm_nonce: typeof nonce === "string" ? nonce : null,
    overlayLayout: field(value, "overlayLayout") === "direct" || field(value, "overlayLayout") === "bold" ? (field(value, "overlayLayout") as "direct" | "bold") : "glass",
  };
}

export type ConfirmInput = {
  username: string;
  text: string;
  isTest?: boolean;
};

export type ConfirmResult =
  | { status: "confirmed"; confirmedAt: string }
  | { status: "ignored"; reason: string };

/**
 * A pending winner confirms they are present by sending a chat message that
 * equals the giveaway keyword. Any other chatter, or a test event, is ignored.
 * The chat reply is sent once, by whichever caller wins the nonce.
 */
export async function confirmGiveawayPresence(
  admin: Admin,
  userId: string,
  input: ConfirmInput,
): Promise<ConfirmResult> {
  if (input.isTest) return { status: "ignored", reason: "test" };

  const username = input.username.trim();
  const text = input.text.trim();
  if (!username || !text) return { status: "ignored", reason: "empty" };

  const { data: row } = await admin
    .from("giveaway_settings")
    .select("keyword, draw_state")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return { status: "ignored", reason: "no_settings" };

  const draw = readGiveawayDraw(row.draw_state);
  const pending = draw.pending_winner;
  if (!pending) return { status: "ignored", reason: "no_pending" };
  if (draw.confirmed_at) return { status: "ignored", reason: "already_confirmed" };
  if (pending.username.trim().toLowerCase() !== username.toLowerCase()) {
    return { status: "ignored", reason: "not_winner" };
  }
  if (draw.claimUntil) {
    const until = new Date(draw.claimUntil).getTime();
    if (Number.isFinite(until) && until < Date.now()) {
      return { status: "ignored", reason: "claim_expired" };
    }
  }

  const keyword = (draw.keyword || row.keyword || "").trim();
  if (!keyword || text.toLowerCase() !== keyword.toLowerCase()) {
    return { status: "ignored", reason: "keyword_mismatch" };
  }

  const confirmedAt = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const next: StoredGiveawayDraw = {
    ...draw,
    phase: "settled",
    claimState: "confirmed",
    winner: draw.winner ?? { username: pending.username, platform: pending.platform },
    pending_winner: pending,
    confirmed_at: confirmedAt,
    confirm_nonce: nonce,
  };

  const { error } = await admin
    .from("giveaway_settings")
    .update({ draw_state: next as never, updated_at: confirmedAt })
    .eq("user_id", userId);
  if (error) return { status: "ignored", reason: error.message };

  const { data: saved } = await admin
    .from("giveaway_settings")
    .select("draw_state")
    .eq("user_id", userId)
    .maybeSingle();
  const stored = readGiveawayDraw(saved?.draw_state);
  if (stored.confirm_nonce !== nonce) {
    return { status: "confirmed", confirmedAt: stored.confirmed_at ?? confirmedAt };
  }

  try {
    const { sendKickChatMessage } = await import("@/lib/kickChat.server");
    await sendKickChatMessage(
      userId,
      "",
      `✅ @${pending.username} أكّد الحضور بكلمة السحب. مبروك!`,
    );
  } catch (error) {
    console.error("[giveaway] confirm reply failed", error);
  }

  return { status: "confirmed", confirmedAt };
}
