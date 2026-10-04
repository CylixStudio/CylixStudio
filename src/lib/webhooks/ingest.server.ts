import type { SupabaseClient } from "@supabase/supabase-js";

import { isAllowedPlatformEvent, timerUnits } from "@/lib/platformEvents";
import { annotateReplyPayload } from "@/lib/replyAlert";
import type { Database } from "@/lib/supabase/types";

export type Platform = Database["public"]["Enums"]["platform_type"];
export type EventType = Database["public"]["Enums"]["rule_event_type"];

type Admin = SupabaseClient<Database>;

export type NormalizedEvent = {
  platform: Platform;
  eventType: EventType;
  /** Provider-unique id used for deduplication. */
  providerEventId: string | null;
  actorName: string | null;
  actorPlatformId: string | null;
  /** Monetary/bits amount (donations, bits). */
  amount: number | null;
  currency: string | null;
  /** Unit count (gift subs, months, tier weight). */
  quantity: number;
  rawPayload: unknown;
  /**
   * False when this row is logged for the feed but must not move the timer
   * (a replay of an event that another row already times).
   */
  countsTowardTimer?: boolean;
  /**
   * Twitch sends channel.subscribe with is_gift for every gifted sub, and also
   * channel.subscription.gift for the whole gift. When a gift-sub rule is
   * enabled, only the gift event adds time.
   */
  isGiftedSubscription?: boolean;
};

export type IngestResult =
  | { status: "ignored"; reason: string }
  | { status: "duplicate"; eventId: string | null }
  | { status: "accepted"; eventId: string; secondsAdded: number; remainingSeconds: number };

/** True when this provider is allowed to report this kind of event. */
export function isAllowedEventSource(platform: Platform, eventType: EventType): boolean {
  return isAllowedPlatformEvent(platform, eventType);
}


/** Resolves the active subathon for a connected platform account. */
export async function resolveSubathonByPlatformUser(
  admin: Admin,
  platform: Platform,
  platformUserId: string,
): Promise<{ subathonId: string; userId: string } | null> {
  const { data: connection } = await admin
    .from("platform_connections")
    .select("user_id")
    .eq("platform", platform)
    .eq("platform_user_id", platformUserId)
    .eq("is_active", true)
    .maybeSingle();
  if (!connection) return null;
  return activeSubathonFor(admin, connection.user_id);
}

/** Resolves the active subathon from a provider token stored on the connection. */
export async function resolveSubathonByToken(
  admin: Admin,
  platform: Platform,
  token: string,
): Promise<{ subathonId: string; userId: string; secret: string } | null> {
  // Indexed equality — never scan every active connection into memory.
  const { data: match } = await admin
    .from("platform_connections")
    .select("user_id, access_token")
    .eq("platform", platform)
    .eq("is_active", true)
    .eq("access_token", token)
    .maybeSingle();
  if (!match?.access_token) return null;
  const subathon = await activeSubathonFor(admin, match.user_id);
  if (!subathon) return null;
  return { ...subathon, secret: match.access_token };
}

/** Lists candidate connections for a platform (used for JWT secret matching). */
export async function listConnections(admin: Admin, platform: Platform) {
  const { data } = await admin
    .from("platform_connections")
    .select("user_id, access_token, platform_user_id, metadata")
    .eq("platform", platform)
    .eq("is_active", true);
  return data ?? [];
}

export async function activeSubathonFor(
  admin: Admin,
  userId: string,
): Promise<{ subathonId: string; userId: string } | null> {
  const { data } = await admin
    .from("subathons")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { subathonId: data.id, userId } : null;
}

/**
 * Seconds awarded by an enabled rule for this exact platform and event.
 * A Twitch follow rule does not fire for Kick, and a MANUAL rule does not
 * cover other platforms. No matching rule means zero seconds.
 */
export async function evaluateRules(
  admin: Admin,
  subathonId: string,
  event: NormalizedEvent,
): Promise<number> {
  if (event.countsTowardTimer === false) return 0;

  if (event.isGiftedSubscription) {
    const { data: giftRules } = await admin
      .from("rules")
      .select("id")
      .eq("subathon_id", subathonId)
      .eq("platform", event.platform)
      .eq("event_type", "GIFT_SUB")
      .eq("is_enabled", true)
      .limit(1);
    if (giftRules?.length) return 0;
  }

  const { data: rules } = await admin
    .from("rules")
    .select("*")
    .eq("subathon_id", subathonId)
    .eq("event_type", event.eventType)
    .eq("platform", event.platform)
    .eq("is_enabled", true)
    .order("priority", { ascending: false });

  if (!rules?.length) return 0;

  const units = timerUnits(event);
  if (units <= 0) return 0;

  const rule = rules.find((entry) => entry.min_amount === null || units >= Number(entry.min_amount));
  if (!rule || rule.seconds_per_unit <= 0) return 0;

  const unitAmount = Number(rule.unit_amount) || 1;
  let seconds = Math.floor((units / unitAmount) * rule.seconds_per_unit);
  if (rule.max_seconds_per_event !== null) {
    seconds = Math.min(seconds, rule.max_seconds_per_event);
  }
  return Math.max(seconds, 0);
}

const REPLAY_WINDOW_MS = 12_000;

function sameDelivery(
  row: { amount: number | null; quantity: number },
  event: NormalizedEvent,
): boolean {
  const quantity = Math.max(1, Math.round(event.quantity || 1));
  if (row.quantity !== quantity) return false;
  if (event.amount == null || row.amount == null) return true;
  return Number(row.amount) === Number(event.amount);
}

/**
 * Socket and webhook copies of one tip or sub often carry different provider
 * ids. Same actor, type, amount, and quantity inside a few seconds is one
 * delivery. Anonymous rows are left alone so two unnamed tips are not merged.
 */
async function findReplayTwin(
  admin: Admin,
  scope: { subathonId?: string; userId?: string },
  event: NormalizedEvent,
): Promise<string | null> {
  const actor = (event.actorName ?? "").trim();
  if (actor.length < 2 || /^anonymous$/i.test(actor)) return null;
  const since = new Date(Date.now() - REPLAY_WINDOW_MS).toISOString();

  if (scope.subathonId) {
    const { data } = await admin
      .from("events")
      .select("id, amount, quantity")
      .eq("subathon_id", scope.subathonId)
      .eq("platform", event.platform)
      .eq("event_type", event.eventType)
      .eq("actor_name", actor)
      .gte("created_at", since)
      .limit(8);
    const twin = (data ?? []).find((row) => sameDelivery(row, event));
    if (twin) return twin.id;
  }

  if (scope.userId) {
    const { data, error } = await admin
      .from("target_events")
      .select("id, amount, quantity")
      .eq("user_id", scope.userId)
      .eq("platform", event.platform)
      .eq("event_type", event.eventType)
      .eq("actor_name", actor)
      .gte("created_at", since)
      .limit(8);
    if (error?.code === "PGRST205") return null;
    const twin = (data ?? []).find((row) => sameDelivery(row, event));
    if (twin) return twin.id;
  }

  return null;
}

/**
 * Full ingest pipeline: rule evaluation -> deduplicated insert -> timer update.
 * Deduplication relies on the unique (platform, provider_event_id) constraint.
 */
export async function ingestEvent(
  admin: Admin,
  target: { subathonId: string; userId: string },
  event: NormalizedEvent,
): Promise<IngestResult> {
  if (!isAllowedEventSource(event.platform, event.eventType)) {
    return {
      status: "ignored",
      reason: `${event.platform} does not own ${event.eventType} events — handled by the native platform connection`,
    };
  }

  if (event.providerEventId) {
    const { data: existing } = await admin
      .from("events")
      .select("id")
      .eq("platform", event.platform)
      .eq("provider_event_id", event.providerEventId)
      .maybeSingle();
    if (existing) return { status: "duplicate", eventId: existing.id };
  }

  const replay = await findReplayTwin(admin, { subathonId: target.subathonId, userId: target.userId }, event);
  if (replay) return { status: "duplicate", eventId: replay };

  const seconds = await evaluateRules(admin, target.subathonId, event);

  const { data: inserted, error } = await admin
    .from("events")
    .insert({
      subathon_id: target.subathonId,
      platform: event.platform,
      event_type: event.eventType,
      provider_event_id: event.providerEventId,
      actor_name: event.actorName,
      actor_platform_id: event.actorPlatformId,
      amount: event.amount,
      currency: event.currency,
      quantity: event.quantity,
      seconds_added: seconds,
      raw_payload: annotateReplyPayload(event.rawPayload ?? {}) as never,
      processed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // Unique violation => concurrent delivery of the same provider event.
    if (error.code === "23505") return { status: "duplicate", eventId: null };
    throw new Error(`Failed to persist event: ${error.message}`);
  }

  let remaining = 0;
  if (seconds > 0) {
    const { data: timer, error: timerError } = await admin.rpc("apply_timer_seconds", {
      p_subathon_id: target.subathonId,
      p_seconds: seconds,
    });
    if (timerError) throw new Error(`Failed to update timer: ${timerError.message}`);
    const row = Array.isArray(timer) ? timer[0] : timer;
    remaining = row?.remaining_seconds ?? 0;
  } else {
    const { data: timer } = await admin
      .from("timer_states")
      .select("remaining_seconds")
      .eq("subathon_id", target.subathonId)
      .maybeSingle();
    remaining = timer?.remaining_seconds ?? 0;
  }

  await admin.from("audit_logs").insert({
    user_id: target.userId,
    subathon_id: target.subathonId,
    action: "webhook.event",
    entity: "event",
    entity_id: inserted.id,
    metadata: {
      platform: event.platform,
      event_type: event.eventType,
      seconds_added: seconds,
    } as never,
  });

  const skipped = await applyGoalIncrements(admin, target.subathonId, event);
  const { advanceTargets } = await import("@/lib/targets.server");
  const targets = await advanceTargets(admin, target.userId, event, skipped);

  // Push every overlay owned by this creator immediately (OBS refreshes
  // without waiting for its next poll).
  const { broadcastUserWidgets } = await import("@/lib/realtime.server");
  await broadcastUserWidgets(admin as never, target.userId, "alert", {
    reason: "event",
    platform: event.platform,
    eventType: event.eventType,
    actorName: event.actorName,
    amount: event.amount,
    quantity: event.quantity,
    secondsAdded: seconds,
    goals: targets.updated,
    milestones: targets.milestones,
  });



  return {
    status: "accepted",
    eventId: inserted.id,
    secondsAdded: seconds,
    remainingSeconds: remaining,
  };
}

/**
 * Widget-scoped rules can also push progress into the goal linked to that
 * widget (e.g. a donation goal bar). Runs after the event is persisted so a
 * duplicate delivery can never double-count progress.
 */
export async function applyGoalIncrements(
  admin: Admin,
  subathonId: string,
  event: NormalizedEvent,
): Promise<Set<string>> {
  const touched = new Set<string>();
  const { data: rules } = await admin
    .from("rules")
    .select("widget_id, goal_increment, unit_amount, min_amount, platform")
    .eq("subathon_id", subathonId)
    .eq("event_type", event.eventType)
    .eq("platform", event.platform)
    .eq("is_enabled", true)
    .not("widget_id", "is", null);

  if (!rules?.length) return touched;

  const units = timerUnits(event);
  if (units <= 0) return touched;

  for (const rule of rules) {
    const increment = Number(rule.goal_increment ?? 0);
    if (!rule.widget_id || increment <= 0) continue;
    if (rule.min_amount !== null && units < Number(rule.min_amount)) continue;
    const unitAmount = Number(rule.unit_amount) || 1;
    const delta = (units / unitAmount) * increment;
    if (delta <= 0) continue;
    await admin.rpc("apply_goal_increment", {
      p_widget_id: rule.widget_id,
      p_amount: delta,
    });
    touched.add(rule.widget_id);
  }
  return touched;
}

/**
 * One entry for every platform webhook. An active subathon still drives the
 * timer. Goals, milestones, and the alert broadcast run either way.
 */
export async function receivePlatformEvent(
  admin: Admin,
  userId: string,
  event: NormalizedEvent,
): Promise<IngestResult> {
  if (!isAllowedEventSource(event.platform, event.eventType)) {
    return {
      status: "ignored",
      reason: `${event.platform} does not own ${event.eventType} events — handled by the native platform connection`,
    };
  }

  const target = await activeSubathonFor(admin, userId);
  if (target) return ingestEvent(admin, target, event);

  const replay = await findReplayTwin(admin, { userId }, event);
  if (replay) return { status: "duplicate", eventId: replay };

  const { recordTargetEvent, advanceTargets } = await import("@/lib/targets.server");
  const recorded = await recordTargetEvent(admin, userId, event);
  if (!recorded.inserted) return { status: "duplicate", eventId: recorded.id };

  const targets = await advanceTargets(admin, userId, event, new Set());
  const { broadcastUserWidgets } = await import("@/lib/realtime.server");
  await broadcastUserWidgets(admin as never, userId, "alert", {
    reason: "event",
    platform: event.platform,
    eventType: event.eventType,
    actorName: event.actorName,
    amount: event.amount,
    quantity: event.quantity,
    goals: targets.updated,
    milestones: targets.milestones,
  });

  return { status: "accepted", eventId: recorded.id ?? "", secondsAdded: 0, remainingSeconds: 0 };
}

/** Resolves the creator who owns a connected platform account. */
export async function resolveUserByPlatformUser(
  admin: Admin,
  platform: Platform,
  platformUserId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("platform_connections")
    .select("user_id")
    .eq("platform", platform)
    .eq("platform_user_id", platformUserId)
    .eq("is_active", true)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** Resolves the creator from a provider token stored on the connection. */
export async function resolveUserByToken(
  admin: Admin,
  platform: Platform,
  token: string,
): Promise<string | null> {
  const { data } = await admin
    .from("platform_connections")
    .select("user_id")
    .eq("platform", platform)
    .eq("is_active", true)
    .eq("access_token", token)
    .maybeSingle();
  return data?.user_id ?? null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
