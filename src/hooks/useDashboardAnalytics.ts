import { useQuery } from "@tanstack/react-query";

import {
  buildDemoOverview,
  emptyLiveOverview,
  summarizeEvents,
  type AnalyticsEvent,
  type DashboardOverview,
} from "@/lib/dashboardAnalytics";
import { getPlanAnalytics } from "@/lib/planData.functions";
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

async function fetchLiveOverview(): Promise<DashboardOverview & { locked?: boolean; isPro?: boolean }> {
  const result = (await getPlanAnalytics()) as {
    locked: boolean;
    isPro: boolean;
    canExport: boolean;
    events: Parameters<typeof toAnalyticsEvent>[0][];
  };
  const events = result.events.map(toAnalyticsEvent);
  const summarized = summarizeEvents(events);
  return {
    ...emptyLiveOverview(),
    ...summarized,
    source: "live",
    messages: 0,
    commandsUsed: 0,
    chatTracked: false,
    events,
    locked: result.locked,
    isPro: result.isPro,
    canExport: result.canExport,
    rangeDays: result.locked ? 7 : result.isPro ? 90 : 7,
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
