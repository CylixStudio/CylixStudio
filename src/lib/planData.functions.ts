import { createServerFn } from "@tanstack/react-start";

import { rangeStart } from "@/lib/dashboardAnalytics";
import { FREE_PLAN_LIMITS } from "@/lib/plans";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import type { Json } from "@/lib/supabase/types";
import { userHasActivePro } from "@/lib/subscription.server";

const ANALYTICS_COLUMNS = "id, event_type, amount, quantity, created_at, raw_payload";
const ACTIVITY_EVENT_COLUMNS =
  "id, platform, event_type, actor_name, amount, currency, quantity, seconds_added, raw_payload, created_at";
const ACTIVITY_TARGET_COLUMNS =
  "id, platform, event_type, actor_name, amount, currency, quantity, created_at";

type AnalyticsRow = {
  id: string;
  event_type: string;
  amount: number | null;
  quantity: number;
  created_at: string;
  raw_payload: Json;
};

async function subathonIdsFor(userId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("subathons").select("id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id);
}

export const getPlanAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveSharedFeatureSubject } = await import("@/lib/planAccess.server");
    const subject = await resolveSharedFeatureSubject(context.userId);
    if (subject.locked) {
      return { locked: true as const, isPro: false, canExport: false, events: [] as AnalyticsRow[] };
    }
    const days = subject.isPro ? 90 : FREE_PLAN_LIMITS.analyticsDays;
    const since = rangeStart(days).toISOString();
    if (subject.viaGrant) {
      const ids = await subathonIdsFor(subject.userId);
      if (ids.length === 0) return { locked: false as const, isPro: true, canExport: false, events: [] as AnalyticsRow[] };
      const { supabaseAdmin } = await import("@/lib/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("events")
        .select(ANALYTICS_COLUMNS)
        .in("subathon_id", ids)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(2000);
      if (error) throw new Error(error.message);
      return { locked: false as const, isPro: true, canExport: false, events: (data ?? []) as AnalyticsRow[] };
    }
    const { data, error } = await context.supabase
      .from("events")
      .select(ANALYTICS_COLUMNS)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error) throw new Error(error.message);
    return {
      locked: false as const,
      isPro: subject.isPro,
      canExport: subject.isPro,
      events: (data ?? []) as AnalyticsRow[],
    };
  });

export const exportPlanAnalyticsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isPro = await userHasActivePro(context.supabase, context.userId);
    if (!isPro) return { ok: false as const, error: "pro_required" as const, csv: "" };
    const since = rangeStart(90).toISOString();
    const { data, error } = await context.supabase
      .from("events")
      .select(ANALYTICS_COLUMNS)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error) return { ok: false as const, error: "save_failed" as const, csv: "" };
    const lines = ["created_at,event_type,quantity,amount"];
    for (const row of data ?? []) {
      const amount = row.amount == null ? "" : String(row.amount);
      lines.push(
        [row.created_at, row.event_type, String(row.quantity ?? 1), amount]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      );
    }
    return { ok: true as const, error: null, csv: lines.join("\n") };
  });

export const getPlanActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveSharedFeatureSubject } = await import("@/lib/planAccess.server");
    const subject = await resolveSharedFeatureSubject(context.userId);
    if (subject.locked) {
      return { locked: true as const, isPro: false, events: [], targets: [] };
    }
    const limit = subject.isPro ? 200 : FREE_PLAN_LIMITS.activityEvents;
    const since = subject.isPro ? null : rangeStart(FREE_PLAN_LIMITS.analyticsDays).toISOString();

    const load = async (client: typeof context.supabase, eventFilter: { subathonIds?: string[] }) => {
      let eventsQuery = client
        .from("events")
        .select(ACTIVITY_EVENT_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (since) eventsQuery = eventsQuery.gte("created_at", since);
      if (eventFilter.subathonIds) eventsQuery = eventsQuery.in("subathon_id", eventFilter.subathonIds);
      let targetsQuery = client
        .from("target_events")
        .select(ACTIVITY_TARGET_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (since) targetsQuery = targetsQuery.gte("created_at", since);
      if (subject.viaGrant) targetsQuery = targetsQuery.eq("user_id", subject.userId);
      const [eventsResult, targetsResult] = await Promise.all([eventsQuery, targetsQuery]);
      if (eventsResult.error) throw new Error(eventsResult.error.message);
      if (targetsResult.error && targetsResult.error.code !== "PGRST205") {
        throw new Error(targetsResult.error.message);
      }
      return {
        events: eventsResult.data ?? [],
        targets: targetsResult.error ? [] : (targetsResult.data ?? []),
      };
    };

    if (subject.viaGrant) {
      const ids = await subathonIdsFor(subject.userId);
      const { supabaseAdmin } = await import("@/lib/supabase/client.server");
      const loaded = ids.length
        ? await load(supabaseAdmin, { subathonIds: ids })
        : { events: [], targets: [] };
      return { locked: false as const, isPro: true, ...loaded };
    }
    const loaded = await load(context.supabase, {});
    return { locked: false as const, isPro: subject.isPro, ...loaded };
  });

export const getPlanLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isPro = await userHasActivePro(context.supabase, context.userId);
    const limit = isPro ? 5000 : FREE_PLAN_LIMITS.loyaltyLeaderboard;
    const { data, error } = await context.supabase
      .from("loyalty_members")
      .select("id, display_name, level, points, watch_seconds")
      .order("points", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return { isPro, members: data ?? [] };
  });
