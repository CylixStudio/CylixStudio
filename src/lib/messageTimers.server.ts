import { sendKickChatMessage } from "@/lib/kickChat.server";
import { timerIsDue, type MessageTimer } from "@/lib/messageTimers";
import { supabaseAdmin } from "@/lib/supabase/client.server";

/**
 * Fires due repeating Kick chat messages.
 * There is no server cron: this runs when Studio calls `tickMessageTimers`
 * (the /custom-commands page polls every 30s while open). Twitch is stored
 * but not sent — Kick-only, same as other bot replies.
 */
export async function fireDueMessageTimers(userId: string): Promise<number> {
  const { data: rows } = await supabaseAdmin
    .from("message_timers")
    .select("id, message, interval_minutes, enabled, platforms, last_sent_at, created_at, updated_at")
    .eq("user_id", userId)
    .eq("enabled", true);

  const now = Date.now();
  let fired = 0;
  for (const row of rows ?? []) {
    const timer: MessageTimer = {
      id: row.id,
      message: row.message,
      intervalMinutes: row.interval_minutes,
      enabled: row.enabled,
      platforms: (row.platforms ?? []).filter(
        (platform): platform is "KICK" | "TWITCH" => platform === "KICK" || platform === "TWITCH",
      ),
      lastSentAt: row.last_sent_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!timerIsDue(timer, now)) continue;
    const text = timer.message.trim().slice(0, 480);
    if (!text) continue;

    if (timer.platforms.includes("KICK")) {
      const sent = await sendKickChatMessage(userId, "", text);
      if (!sent) continue;
    } else {
      continue;
    }

    const iso = new Date(now).toISOString();
    const { error } = await supabaseAdmin
      .from("message_timers")
      .update({ last_sent_at: iso })
      .eq("id", timer.id)
      .eq("user_id", userId);
    if (!error) fired += 1;
  }
  return fired;
}
