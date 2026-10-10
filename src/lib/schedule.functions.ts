import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { userHasActivePro } from "@/lib/subscription.server";
import type { Database } from "@/lib/supabase/types";
import {
  clampDuration,
  clampStartMinutes,
  clampWeekday,
  DEFAULT_SCHEDULE_SETTINGS,
  isCoverDataUrl,
  sanitizeCoverUrl,
  sanitizeOccursOn,
  weekdayFromIso,
  type ScheduleSettings,
  type ScheduleSlot,
  type ScheduleSlotInput,
  type ScheduleState,
} from "@/lib/schedule";

type SlotRow = {
  id: string;
  weekday: number;
  occurs_on: string | null;
  start_minutes: number;
  duration_minutes: number;
  game: string;
  title: string;
  notes: string;
  cover_url: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

function mapSlot(row: SlotRow): ScheduleSlot {
  return {
    id: row.id,
    weekday: row.weekday,
    occursOn: row.occurs_on,
    startMinutes: row.start_minutes,
    durationMinutes: row.duration_minutes,
    game: row.game,
    title: row.title,
    notes: row.notes,
    coverUrl: row.cover_url ?? "",
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SLOT_COLUMNS =
  "id, weekday, occurs_on, start_minutes, duration_minutes, game, title, notes, cover_url, enabled, created_at, updated_at";

type SettingsRow = {
  share_token: string;
  timezone: string;
  title: string;
  reminder_note: string;
};

async function ensureSettings(supabase: SupabaseClient<Database>, userId: string): Promise<SettingsRow> {
  const { data } = await supabase
    .from("stream_schedule_settings")
    .select("share_token, timezone, title, reminder_note")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data;
  const { data: created } = await supabase
    .from("stream_schedule_settings")
    .upsert({ user_id: userId }, { onConflict: "user_id" })
    .select("share_token, timezone, title, reminder_note")
    .maybeSingle();
  return (
    created ?? {
      share_token: "",
      timezone: DEFAULT_SCHEDULE_SETTINGS.timezone,
      title: DEFAULT_SCHEDULE_SETTINGS.title,
      reminder_note: "",
    }
  );
}

async function resolveCoverUrl(
  userId: string,
  coverUrl: string,
  previousUrl = "",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { storeScheduleCover, deleteScheduleCover } = await import("@/lib/schedule.server");
  if (isCoverDataUrl(coverUrl)) {
    let uploaded: string | null = null;
    try {
      uploaded = await storeScheduleCover(userId, coverUrl);
    } catch {
      uploaded = null;
    }
    const next = uploaded || sanitizeCoverUrl(coverUrl);
    if (!next) return { ok: false, error: "image_upload" };
    if (previousUrl && previousUrl !== next) {
      try {
        await deleteScheduleCover(userId, previousUrl);
      } catch {
        /* ignore stale file */
      }
    }
    return { ok: true, url: next };
  }
  const next = sanitizeCoverUrl(coverUrl, false) || sanitizeCoverUrl(coverUrl);
  if (previousUrl && previousUrl !== next) {
    try {
      await deleteScheduleCover(userId, previousUrl);
    } catch {
      /* ignore stale file */
    }
  }
  return { ok: true, url: next };
}

export const getScheduleState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ScheduleState> => {
    const settings = await ensureSettings(context.supabase, context.userId);
    const { data: slots } = await context.supabase
      .from("stream_schedule_slots")
      .select(SLOT_COLUMNS)
      .eq("user_id", context.userId)
      .order("weekday", { ascending: true })
      .order("start_minutes", { ascending: true });
    return {
      settings: {
        shareToken: settings.share_token,
        timezone: settings.timezone,
        title: settings.title,
        reminderNote: settings.reminder_note,
      },
      slots: (slots ?? []).map(mapSlot),
    };
  });

export const saveScheduleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Pick<ScheduleSettings, "timezone" | "title" | "reminderNote">) => input)
  .handler(async ({ data, context }) => {
    await ensureSettings(context.supabase, context.userId);
    const isPro = await userHasActivePro(context.supabase, context.userId);
    if (!isPro && data.reminderNote.trim()) return { ok: false as const, error: "pro_required" };
    const { error } = await context.supabase.from("stream_schedule_settings").upsert(
      {
        user_id: context.userId,
        timezone: data.timezone.trim().slice(0, 64) || "UTC",
        title: data.title.trim().slice(0, 80) || "Stream schedule",
        reminder_note: data.reminderNote.trim().slice(0, 280),
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const upsertScheduleSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ScheduleSlotInput) => input)
  .handler(async ({ data, context }) => {
    const title = data.title.trim().slice(0, 80);
    if (!title) return { ok: false as const, error: "title_required" };
    const isPro = await userHasActivePro(context.supabase, context.userId);
    if (!isPro && data.coverUrl.trim()) return { ok: false as const, error: "pro_required" };
    await ensureSettings(context.supabase, context.userId);
    const occursOn = sanitizeOccursOn(data.occursOn);
    const weekday = occursOn ? weekdayFromIso(occursOn) : clampWeekday(data.weekday);

    let previousCover = "";
    if (data.id) {
      const { data: existing } = await context.supabase
        .from("stream_schedule_slots")
        .select("cover_url")
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .maybeSingle();
      previousCover = existing?.cover_url ?? "";
    }

    const cover = await resolveCoverUrl(context.userId, data.coverUrl, previousCover);
    if (!cover.ok) return { ok: false as const, error: cover.error };

    const payload = {
      user_id: context.userId,
      weekday,
      occurs_on: occursOn,
      start_minutes: clampStartMinutes(data.startMinutes),
      duration_minutes: clampDuration(data.durationMinutes),
      game: data.game.trim().slice(0, 80),
      title,
      notes: data.notes.trim().slice(0, 280),
      cover_url: cover.url,
      enabled: Boolean(data.enabled),
    };
    const query = data.id
      ? context.supabase.from("stream_schedule_slots").update(payload).eq("id", data.id).eq("user_id", context.userId)
      : context.supabase.from("stream_schedule_slots").insert(payload);
    const { error } = await query;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const deleteScheduleSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("stream_schedule_slots")
      .select("cover_url")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { error } = await context.supabase
      .from("stream_schedule_slots")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (!error && existing?.cover_url) {
      try {
        const { deleteScheduleCover } = await import("@/lib/schedule.server");
        await deleteScheduleCover(context.userId, existing.cover_url);
      } catch {
        /* ignore stale file */
      }
    }
    return { ok: !error, error: error?.message };
  });
