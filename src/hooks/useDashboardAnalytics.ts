import { useQuery } from "@tanstack/react-query";

import {
  ANALYTICS_FETCH_DAYS,
  buildDemoOverview,
  emptyLiveOverview,
  rangeStart,
  summarizeEvents,
  type AnalyticsEvent,
  type DashboardOverview,
} from "@/lib/dashboardAnalytics";
import { supabase } from "@/lib/supabase/client";
import { isStoredTestRow } from "@/lib/testAlert";
import { isTestMode } from "@/lib/testMode";

function toAnalyticsEvent(row: {
  id?: unknown;
  event_type?: unknown;
  amount?: unknown;
  quantity?: unknown;
  created_at?: unknown;
  raw_payload?: unknown;
}): AnalyticsEvent {
  const eventType = String(row.event_type ?? "");
  const test = isStoredTestRow({ event_type: eventType, raw_payload: row.raw_payload });
  return {
    id: String(row.id ?? ""),
    event_type: eventType,
    amount: row.amount == null ? null : Number(row.amount),
    quantity: Number(row.quantity ?? 1),
    created_at: String(row.created_at ?? ""),
    ...(test ? { isTest: true as const } : {}),
  };
}

async function fetchLiveOverview(): Promise<DashboardOverview> {
  const since = rangeStart(ANALYTICS_FETCH_DAYS).toISOString();
  const { data, error } = await supabase
    .from("events")
    .select("id, event_type, amount, quantity, created_at, raw_payload")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) throw error;

  const events = (data ?? []).map(toAnalyticsEvent);
  const summarized = summarizeEvents(events);
  return {
    ...emptyLiveOverview(),
    ...summarized,
    source: "live",
    messages: 0,
    commandsUsed: 0,
    chatTracked: false,
    events,
  };
}

/** Event payload for analytics. Test mode uses a fixed demo series; live uses `events`. */
export function useDashboardAnalytics() {
  return useQuery({
    queryKey: ["dashboard-analytics"],
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => (isTestMode() ? buildDemoOverview() : fetchLiveOverview()),
  });
}
