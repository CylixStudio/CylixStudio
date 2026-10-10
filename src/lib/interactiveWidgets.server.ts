import { supabaseAdmin } from "@/lib/supabase/client.server";
import { userHasActivePro } from "@/lib/subscription.server";
import {
  applyKickPoll,
  applyKickPrediction,
  classifyKickInteractiveEvent,
  parsePollRuntime,
  parsePredictionRuntime,
  type PollRuntime,
  type PredictionRuntime,
} from "@/lib/interactiveWidgets";

type WidgetRow = {
  id: string;
  state: unknown;
  updated_at: string;
};

/**
 * Stores the official Kick poll or prediction snapshot on the creator's
 * overlays and broadcasts the same refresh other live widgets use.
 */
export async function ingestKickInteractiveEvent(input: {
  userId: string;
  eventName: string;
  messageId: string;
  body: unknown;
}): Promise<{ status: string; reason?: string; kind?: string }> {
  const classified = classifyKickInteractiveEvent(input.eventName);
  if (!classified) return { status: "ignored", reason: "unsupported_type" };
  if (!(await userHasActivePro(supabaseAdmin, input.userId))) {
    return { status: "ignored", reason: "pro_required", kind: classified.kind };
  }

  const widgetType = classified.kind === "poll" ? "POLL" : "PREDICTION";
  const { data } = await supabaseAdmin
    .from("widgets")
    .select("id, state, updated_at")
    .eq("user_id", input.userId)
    .eq("type", widgetType)
    .eq("is_enabled", true);
  const widgets = (data ?? []) as WidgetRow[];
  if (!widgets.length) return { status: "ignored", reason: "no_widget", kind: classified.kind };

  const messageId = input.messageId.trim() || null;
  const updated: string[] = [];
  for (const widget of widgets) {
    const saved = await writeSnapshot(widget, classified.kind, input.eventName, input.body, messageId);
    if (saved) {
      updated.push(widget.id);
      continue;
    }
    const { data: fresh } = await supabaseAdmin
      .from("widgets")
      .select("id, state, updated_at")
      .eq("id", widget.id)
      .maybeSingle();
    if (!fresh) continue;
    const retried = await writeSnapshot(
      fresh as WidgetRow,
      classified.kind,
      input.eventName,
      input.body,
      messageId,
    );
    if (retried) updated.push(widget.id);
  }
  if (!updated.length) return { status: "ignored", reason: "unchanged", kind: classified.kind };

  const { broadcastToWidgets } = await import("@/lib/realtime.server");
  await broadcastToWidgets(updated, "refresh", { reason: classified.kind });
  return { status: "accepted", kind: classified.kind };
}

async function writeSnapshot(
  widget: WidgetRow,
  kind: "poll" | "prediction",
  eventName: string,
  body: unknown,
  messageId: string | null,
): Promise<boolean> {
  const now = Date.now();
  const previous = widget.state;
  const next =
    kind === "poll"
      ? applyKickPoll(parsePollRuntime(previous), eventName, body, now, messageId)
      : applyKickPrediction(parsePredictionRuntime(previous), eventName, body, now, messageId);
  if (!next) return false;
  const currentRevision =
    kind === "poll" ? parsePollRuntime(previous).revision : parsePredictionRuntime(previous).revision;
  if (next.revision === currentRevision) return false;

  const prev =
    previous && typeof previous === "object" && !Array.isArray(previous)
      ? { ...(previous as Record<string, unknown>) }
      : {};
  if (kind === "poll") prev["poll"] = next as PollRuntime;
  else prev["prediction"] = next as PredictionRuntime;

  const { data } = await supabaseAdmin
    .from("widgets")
    .update({ state: prev as never, updated_at: new Date(now).toISOString() })
    .eq("id", widget.id)
    .eq("updated_at", widget.updated_at)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}
