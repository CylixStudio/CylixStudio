import {
  buildScheduleIcs,
  publicSchedulePayload,
  type ScheduleSlot,
  type ScheduleState,
} from "@/lib/schedule";
import { supabaseAdmin } from "@/lib/supabase/client.server";

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

export async function loadPublicSchedule(token: string): Promise<ScheduleState | null> {
  if (!token) return null;
  const { data: settings } = await supabaseAdmin
    .from("stream_schedule_settings")
    .select("user_id, share_token, timezone, title, reminder_note")
    .eq("share_token", token)
    .maybeSingle();
  if (!settings) return null;
  const { userHasActivePro } = await import("@/lib/subscription.server");
  const ownerPro = await userHasActivePro(supabaseAdmin, settings.user_id);
  const { data: slots } = await supabaseAdmin
    .from("stream_schedule_slots")
    .select(
      "id, weekday, occurs_on, start_minutes, duration_minutes, game, title, notes, cover_url, enabled, created_at, updated_at",
    )
    .eq("user_id", settings.user_id)
    .eq("enabled", true)
    .order("weekday", { ascending: true })
    .order("start_minutes", { ascending: true });
  return {
    settings: {
      shareToken: settings.share_token,
      timezone: settings.timezone,
      title: settings.title,
      reminderNote: ownerPro ? settings.reminder_note : "",
    },
    slots: (slots ?? []).map((row) => {
      const slot = mapSlot(row);
      return ownerPro ? slot : { ...slot, coverUrl: "" };
    }),
  };
}

export async function publicScheduleJson(token: string) {
  const state = await loadPublicSchedule(token);
  if (!state) return null;
  return publicSchedulePayload(state);
}

export async function publicScheduleIcs(token: string, origin: string) {
  const state = await loadPublicSchedule(token);
  if (!state) return null;
  return buildScheduleIcs(state, origin);
}

const COVER_BUCKET = "schedule-covers";

function parseCoverDataUrl(dataUrl: string): { mime: string; ext: string; bytes: Uint8Array } | null {
  const match = dataUrl.trim().match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/]+=*)$/i);
  const mimePart = match?.[1];
  const payload = match?.[2];
  if (!mimePart || !payload) return null;
  const rawMime = mimePart.toLowerCase();
  const mime = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
  const binary = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
  if (binary.byteLength < 24 || binary.byteLength > 220_000) return null;
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return { mime, ext, bytes: new Uint8Array(binary) };
}

function scheduleObjectPath(userId: string, url: string): string | null {
  const marker = `/storage/v1/object/public/${COVER_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = decodeURIComponent(url.slice(idx + marker.length));
  if (!path.startsWith(`${userId}/`) || path.includes("..")) return null;
  return path;
}

export async function storeScheduleCover(userId: string, dataUrl: string): Promise<string | null> {
  const parsed = parseCoverDataUrl(dataUrl);
  if (!parsed) return null;
  try {
    const path = `${userId}/${crypto.randomUUID()}.${parsed.ext}`;
    const { error } = await supabaseAdmin.storage.from(COVER_BUCKET).upload(path, parsed.bytes, {
      contentType: parsed.mime,
      upsert: true,
    });
    if (error) return null;
    const { data } = supabaseAdmin.storage.from(COVER_BUCKET).getPublicUrl(path);
    return data.publicUrl || null;
  } catch {
    return null;
  }
}

export async function deleteScheduleCover(userId: string, url: string): Promise<void> {
  const path = scheduleObjectPath(userId, url);
  if (!path) return;
  try {
    await supabaseAdmin.storage.from(COVER_BUCKET).remove([path]);
  } catch {
    /* ignore missing bucket/object */
  }
}
