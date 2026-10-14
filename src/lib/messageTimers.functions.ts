import { createServerFn } from "@tanstack/react-start";

import type { ChatCommandPlatform } from "@/lib/customCommands";
import {
  sanitizeIntervalMinutes,
  sanitizeTimerMessage,
  type MessageTimer,
  type MessageTimerInput,
} from "@/lib/messageTimers";
import { FREE_PLAN_LIMITS } from "@/lib/plans";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { userHasActivePro } from "@/lib/subscription.server";

const PLATFORMS: ChatCommandPlatform[] = ["KICK", "TWITCH"];

function mapTimer(row: {
  id: string;
  message: string;
  interval_minutes: number;
  enabled: boolean;
  platforms: string[];
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
}): MessageTimer {
  const platforms = row.platforms.filter((platform): platform is ChatCommandPlatform =>
    PLATFORMS.includes(platform as ChatCommandPlatform),
  );
  return {
    id: row.id,
    message: row.message,
    intervalMinutes: row.interval_minutes,
    enabled: row.enabled,
    platforms: platforms.length ? platforms : ["KICK"],
    lastSentAt: row.last_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeInput(input: MessageTimerInput): MessageTimerInput | { error: string } {
  const message = sanitizeTimerMessage(input.message);
  if (!message) return { error: "message_required" };
  const platforms = input.platforms.filter((platform) => PLATFORMS.includes(platform));
  const normalized: MessageTimerInput = {
    message,
    intervalMinutes: sanitizeIntervalMinutes(input.intervalMinutes),
    enabled: Boolean(input.enabled),
    platforms: platforms.length ? platforms : ["KICK"],
  };
  if (input.id) normalized.id = input.id;
  return normalized;
}

export const listMessageTimers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MessageTimer[]> => {
    const { data } = await context.supabase
      .from("message_timers")
      .select("id, message, interval_minutes, enabled, platforms, last_sent_at, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return (data ?? []).map(mapTimer);
  });

export const upsertMessageTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: MessageTimerInput) => input)
  .handler(async ({ data, context }) => {
    const normalized = normalizeInput(data);
    if ("error" in normalized) return { ok: false as const, error: normalized.error };

    // Free plan: block creating beyond the soft cap (edits of existing rows still allowed).
    if (!normalized.id) {
      const isPro = await userHasActivePro(context.supabase, context.userId);
      if (!isPro) {
        const { count, error: countError } = await context.supabase
          .from("message_timers")
          .select("id", { count: "exact", head: true })
          .eq("user_id", context.userId);
        if (countError) return { ok: false as const, error: countError.message };
        if ((count ?? 0) >= FREE_PLAN_LIMITS.messageTimers) {
          return { ok: false as const, error: "free_limit_timers" };
        }
      }
    }

    const payload = {
      user_id: context.userId,
      message: normalized.message,
      interval_minutes: normalized.intervalMinutes,
      enabled: normalized.enabled,
      platforms: normalized.platforms,
    };
    const query = normalized.id
      ? context.supabase.from("message_timers").update(payload).eq("id", normalized.id).eq("user_id", context.userId)
      : context.supabase.from("message_timers").insert(payload);
    const { error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const setMessageTimerEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_timers")
      .update({ enabled: Boolean(data.enabled) })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: !error, error: error?.message };
  });

export const deleteMessageTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_timers")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: !error };
  });

/** Kept so an open commands page cannot post. Only the Worker schedule sends. */
export const tickMessageTimers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { ok: true as const, fired: 0 };
  });
