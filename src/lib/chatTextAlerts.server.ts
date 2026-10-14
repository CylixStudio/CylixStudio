import {
  alertClearsMinimum,
  mergeChatAlerts,
  renderChatAlert,
  type ChatAlertId,
  type ChatAlertSignal,
} from "@/lib/chatTextAlerts";
import { supabaseAdmin } from "@/lib/supabase/client.server";

const claimedSends = new Set<string>();
const claimedWelcomes = new Set<string>();

async function loadAlert(userId: string, alertId: ChatAlertId) {
  const { data, error } = await supabaseAdmin
    .from("chat_text_alerts")
    .select("enabled, template, minimum")
    .eq("user_id", userId)
    .eq("alert_id", alertId)
    .maybeSingle();
  const saved = !error && data ? [{ id: alertId, enabled: data.enabled, template: data.template, minimum: data.minimum }] : [];
  return mergeChatAlerts(saved).find((item) => item.id === alertId)!;
}

async function kickBroadcasterId(userId: string, provided?: string | null): Promise<string | null> {
  const given = provided?.trim();
  if (given) return given;
  const { data } = await supabaseAdmin
    .from("platform_connections")
    .select("platform_user_id")
    .eq("user_id", userId)
    .eq("platform", "KICK")
    .eq("is_active", true)
    .maybeSingle();
  return data?.platform_user_id?.trim() || null;
}

async function claimSend(userId: string, providerEventId: string, alertId: string): Promise<boolean> {
  const key = `${userId}:${providerEventId}:${alertId}`;
  if (claimedSends.has(key)) return false;
  const { error } = await supabaseAdmin.from("chat_text_alert_sends").insert({
    user_id: userId,
    provider_event_id: providerEventId,
    alert_id: alertId,
  });
  if (error?.code === "23505") return false;
  claimedSends.add(key);
  return true;
}

export async function deliverChatTextAlert(input: {
  userId: string;
  kickBroadcasterUserId?: string | null;
  providerEventId: string;
  signal: ChatAlertSignal;
}): Promise<{ status: string; reason?: string }> {
  const alert = await loadAlert(input.userId, input.signal.alertId);
  if (!alert.enabled) return { status: "ignored", reason: "disabled" };
  const measured = input.signal.alertId === "raid" ? input.signal.viewers : input.signal.amount;
  if (!alertClearsMinimum(input.signal.alertId, measured, alert.minimum)) {
    return { status: "ignored", reason: "below_minimum" };
  }
  const providerEventId = input.providerEventId.trim().slice(0, 180);
  if (!providerEventId) return { status: "ignored", reason: "no_event_id" };
  const broadcasterId = await kickBroadcasterId(input.userId, input.kickBroadcasterUserId);
  if (!broadcasterId) return { status: "ignored", reason: "no_kick_chat" };
  const body = renderChatAlert(alert.template, {
    name: input.signal.name,
    amount: input.signal.amount,
    viewers: input.signal.viewers,
    months: input.signal.months,
  });
  if (!body) return { status: "ignored", reason: "empty" };
  const claimed = await claimSend(input.userId, providerEventId, input.signal.alertId);
  if (!claimed) return { status: "ignored", reason: "duplicate" };
  const { sendKickChatMessage } = await import("@/lib/kickChat.server");
  const sent = await sendKickChatMessage(input.userId, broadcasterId, body);
  return sent ? { status: "replied", reason: input.signal.alertId } : { status: "error", reason: "send_failed" };
}

/** First Kick chat line of the UTC day, once per chatter. */
export async function maybeWelcomeChatter(input: {
  userId: string;
  kickBroadcasterUserId: string;
  platform: "KICK";
  username: string;
  platformUserId?: string | null;
}): Promise<{ status: string; reason?: string }> {
  const username = input.username.trim();
  if (!username || username === "Kick viewer") return { status: "ignored", reason: "no_chatter" };
  const alert = await loadAlert(input.userId, "welcome");
  if (!alert.enabled) return { status: "ignored", reason: "disabled" };
  const day = new Date().toISOString().slice(0, 10);
  const chatter = (input.platformUserId?.trim() || username.toLowerCase()).slice(0, 80);
  const key = `${input.userId}:${input.platform}:${chatter}:${day}`;
  if (claimedWelcomes.has(key)) return { status: "ignored", reason: "duplicate" };
  const { error } = await supabaseAdmin.from("chat_text_alert_welcomes").insert({
    user_id: input.userId,
    platform: input.platform,
    chatter_key: chatter,
    welcomed_on: day,
  });
  if (error?.code === "23505") {
    claimedWelcomes.add(key);
    return { status: "ignored", reason: "duplicate" };
  }
  claimedWelcomes.add(key);
  const body = renderChatAlert(alert.template, { name: username });
  if (!body) return { status: "ignored", reason: "empty" };
  const { sendKickChatMessage } = await import("@/lib/kickChat.server");
  const sent = await sendKickChatMessage(input.userId, input.kickBroadcasterUserId, body);
  return sent ? { status: "replied", reason: "welcome" } : { status: "error", reason: "send_failed" };
}
