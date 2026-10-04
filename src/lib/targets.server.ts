import type { SupabaseClient } from "@supabase/supabase-js";

import { goalTypePreset } from "@/lib/goalTypes";
import type { Database } from "@/lib/supabase/types";
import { readReplyMeta } from "@/lib/replyAlert";
import type { OverlayEvent } from "@/lib/widgets";
import type { NormalizedEvent } from "@/lib/webhooks/ingest.server";

type Admin = SupabaseClient<Database>;

export type TargetStatus = {
  goalId: string;
  widgetId: string;
  title: string;
  unit: string;
  goalType: string;
  current: number;
  target: number;
  percent: number;
  reached: boolean;
};

/** Units this event contributes to a matching goal. Raids are logged, not counted. */
export function targetDelta(event: NormalizedEvent): number {
  if (event.eventType === "RAID") return 0;
  if (event.eventType === "DONATION" || event.eventType === "BITS") {
    const amount = Number(event.amount ?? 0);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }
  const count = Math.round(Number(event.quantity) || 1);
  return Math.max(count, 1);
}

function goalTypeOf(config: unknown): string {
  if (!config || typeof config !== "object") return "DONATION";
  const value = (config as { goalType?: unknown }).goalType;
  return typeof value === "string" ? value : "DONATION";
}

/**
 * Moves every enabled goal whose preset listens for this event.
 * Widgets already advanced by a subathon rule are skipped so one delivery
 * cannot double-count.
 */
export async function advanceTargets(
  admin: Admin,
  userId: string,
  event: NormalizedEvent,
  skipWidgetIds: ReadonlySet<string>,
): Promise<{ updated: string[]; milestones: string[] }> {
  const delta = targetDelta(event);
  if (delta <= 0) return { updated: [], milestones: [] };

  const { data: widgets } = await admin
    .from("widgets")
    .select("id, config")
    .eq("user_id", userId)
    .eq("type", "GOAL_BAR")
    .eq("is_enabled", true);
  if (!widgets?.length) return { updated: [], milestones: [] };

  const ids = widgets.map((widget) => widget.id);
  const { data: goals } = await admin
    .from("goals")
    .select("id, widget_id, current_value, target_value")
    .eq("user_id", userId)
    .in("widget_id", ids);
  if (!goals?.length) return { updated: [], milestones: [] };

  const typeByWidget = new Map(widgets.map((widget) => [widget.id, goalTypeOf(widget.config)]));
  const updated: string[] = [];
  const milestones: string[] = [];

  for (const goal of goals) {
    if (skipWidgetIds.has(goal.widget_id)) continue;
    const preset = goalTypePreset(typeByWidget.get(goal.widget_id));
    if (!preset.triggers.includes(event.eventType)) continue;

    const before = Number(goal.current_value);
    const target = Number(goal.target_value);
    const { data: next, error } = await admin.rpc("apply_goal_increment", {
      p_widget_id: goal.widget_id,
      p_amount: delta,
    });
    if (error) continue;
    const after = Number(next ?? before + delta);
    updated.push(goal.widget_id);

    if (target > 0 && before < target && after >= target) {
      const { data: milestone } = await admin
        .from("target_milestones")
        .insert({
          user_id: userId,
          goal_id: goal.id,
          widget_id: goal.widget_id,
          target_value: target,
        })
        .select("id")
        .maybeSingle();
      if (milestone?.id) milestones.push(milestone.id);
    }
  }

  return { updated, milestones };
}

/** Persists an event that has no subathon row. Duplicate provider ids are ignored. */
export async function recordTargetEvent(
  admin: Admin,
  userId: string,
  event: NormalizedEvent,
): Promise<{ inserted: boolean; id: string | null }> {
  const { data, error } = await admin
    .from("target_events")
    .insert({
      user_id: userId,
      platform: event.platform,
      event_type: event.eventType,
      provider_event_id: event.providerEventId,
      actor_name: event.actorName,
      actor_platform_id: event.actorPlatformId,
      amount: event.amount,
      currency: event.currency,
      quantity: Math.max(1, Math.round(event.quantity || 1)),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { inserted: false, id: null };
    throw new Error(`Failed to persist target event: ${error.message}`);
  }
  return { inserted: true, id: data?.id ?? null };
}

export async function listTargetStatus(admin: Admin, userId: string): Promise<TargetStatus[]> {
  const { data: widgets } = await admin
    .from("widgets")
    .select("id, config, is_enabled")
    .eq("user_id", userId)
    .eq("type", "GOAL_BAR");
  const { data: goals } = await admin
    .from("goals")
    .select("id, widget_id, title, unit, current_value, target_value")
    .eq("user_id", userId);
  const typeByWidget = new Map((widgets ?? []).map((widget) => [widget.id, goalTypeOf(widget.config)]));
  return (goals ?? []).map((goal) => {
    const current = Number(goal.current_value);
    const target = Number(goal.target_value);
    const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;
    return {
      goalId: goal.id,
      widgetId: goal.widget_id,
      title: goal.title,
      unit: goal.unit,
      goalType: typeByWidget.get(goal.widget_id) ?? "CUSTOM",
      current,
      target,
      percent,
      reached: target > 0 && current >= target,
    };
  });
}

function replyOverlayFields(
  raw: unknown,
  createdAt: string,
): Pick<OverlayEvent, "isReply" | "replyQuote" | "appearedAt"> {
  const meta = readReplyMeta(raw);
  if (!meta.isReply) return { isReply: false, replyQuote: null };
  const appearance = meta.appearanceMs ?? Date.parse(createdAt);
  return {
    isReply: true,
    replyQuote: meta.quote,
    appearedAt: Number.isFinite(appearance) ? new Date(appearance).toISOString() : createdAt,
  };
}

/** Events the alert and activity overlays should render. */
export async function listOverlayEvents(
  admin: Admin,
  args: { userId: string; subathonId: string | null; limit: number },
): Promise<OverlayEvent[]> {
  const limit = Math.min(Math.max(args.limit, 1), 50);
  const combined: OverlayEvent[] = [];

  if (args.subathonId) {
    const { data } = await admin
      .from("events")
      .select(
        "id, platform, event_type, actor_name, amount, currency, quantity, seconds_added, raw_payload, created_at",
      )
      .eq("subathon_id", args.subathonId)
      .order("created_at", { ascending: false })
      .limit(limit);
    for (const event of data ?? []) {
      combined.push({
        id: event.id,
        platform: event.platform,
        eventType: event.event_type,
        actorName: event.actor_name,
        amount: event.amount === null ? null : Number(event.amount),
        currency: event.currency,
        quantity: event.quantity,
        secondsAdded: event.seconds_added,
        createdAt: event.created_at,
        ...replyOverlayFields(event.raw_payload, event.created_at),
      });
    }
  }

  const targetQuery = await admin
    .from("target_events")
    .select("id, platform, event_type, actor_name, amount, currency, quantity, created_at")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (targetQuery.error && targetQuery.error.code !== "PGRST205") {
    throw new Error(targetQuery.error.message);
  }
  for (const event of targetQuery.data ?? []) {
    combined.push({
      id: event.id,
      platform: event.platform,
      eventType: event.event_type,
      actorName: event.actor_name,
      amount: event.amount === null ? null : Number(event.amount),
      currency: event.currency,
      quantity: event.quantity,
      secondsAdded: 0,
      createdAt: event.created_at,
    });
  }

  combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return combined.slice(0, limit);
}
