import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUp,
  Check,
  ChevronDown,
  Filter,
  Globe,
  Layers,
  Pause,
  Plug,
} from "lucide-react";


import { AppShell } from "@/components/layout/AppShell";
import { InfoTip } from "@/components/ui/info-tip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/layout/EmptyState";
import { TestEventMenu, type InjectedFeedEvent } from "@/components/activity/TestEventMenu";
import { ReplyAlertFrame } from "@/components/overlay/ReplyAlertFrame";
import { PlatformIcon } from "@/components/widgets/PlatformIcon";
import { readReplyMeta } from "@/lib/replyAlert";
import { isStoredTestRow, readTestDisplay } from "@/lib/testAlert";
import { supabase } from "@/lib/supabase/client";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { groupConsecutiveEvents, type FeedEventGroup } from "@/lib/activityFeed";
import { isAllowedPlatformEvent, triggerPhrase } from "@/lib/platformEvents";
import { isTestMode } from "@/lib/testMode";
import { useWidgets } from "@/hooks/useWidgets";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useApplyDefaultPlatform } from "@/lib/defaultPlatform";

export const Route = createFileRoute("/_authenticated/activity-feed")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Activity Feed" },
      {
        name: "description",
        content:
          "Historical activity log of follows, subscriptions, gift subs, bits, raids and tips across your connected streaming platforms.",
      },
      { property: "og:title", content: "CylixStudio — Activity Feed" },
      {
        property: "og:description",
        content: "Browse and filter your full stream event history in one clean feed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivityFeedPage,
});

type FeedEvent = {
  id: string;
  platform: string;
  event_type: string;
  actor_name: string | null;
  amount: number | null;
  currency: string | null;
  quantity: number;
  seconds_added: number;
  message: string | null;
  created_at: string;
  isReply?: boolean;
  replyQuote?: string | null;
  isTest?: boolean;
};


function activityLabelKey(platform: string, eventType: string): TranslationKey {
  return `activity.type.${triggerPhrase(platform, eventType)}` as TranslationKey;
}


type FilterGroup = {
  id: string;
  label: TranslationKey;
  dot: string;
  icon: React.ReactNode;
  match: (event: FeedEvent) => boolean;
};

const KNOWN_PLATFORMS = [
  "KICK",
  "TWITCH",
  "YOUTUBE",
  "TIKTOK",
  "X",
  "STREAMLABS",
  "STREAMELEMENTS",
];

const FILTER_GROUPS: FilterGroup[] = [
  {
    id: "kick",
    label: "activity.filter.kick",
    dot: "#53FC18",
    icon: <PlatformIcon platform="KICK" size={20} />,
    match: (e) => e.platform === "KICK",
  },
  {
    id: "twitch",
    label: "activity.filter.twitch",
    dot: "#9F77F7",
    icon: <PlatformIcon platform="TWITCH" size={20} />,
    match: (e) => e.platform === "TWITCH",
  },
  {
    id: "youtube",
    label: "activity.filter.youtube",
    dot: "#FF4444",
    icon: <PlatformIcon platform="YOUTUBE" size={20} />,
    match: (e) => e.platform === "YOUTUBE",
  },
  {
    id: "tiktok",
    label: "activity.filter.tiktok",
    dot: "#2DCCD3",
    icon: <PlatformIcon platform="TIKTOK" size={20} />,
    match: (e) => e.platform === "TIKTOK",
  },
  {
    id: "x",
    label: "activity.filter.x",
    dot: "#E7E9EA",
    icon: <PlatformIcon platform="X" size={20} />,
    match: (e) => e.platform === "X",
  },
  {
    id: "streamlabs",
    label: "activity.filter.streamlabs",
    dot: "#31C3A2",
    icon: <PlatformIcon platform="STREAMLABS" size={20} />,
    match: (e) => e.platform === "STREAMLABS",
  },
  {
    id: "streamelements",
    label: "activity.filter.streamelements",
    dot: "#236BE9",
    icon: <PlatformIcon platform="STREAMELEMENTS" size={20} />,
    match: (e) => e.platform === "STREAMELEMENTS",
  },
  {
    // Anything from a source outside the named groups (manual adds, future
    // integrations) still belongs in the all-platform totals.
    id: "other",
    label: "activity.filter.other",
    dot: "#A1A1AA",
    icon: <Layers className="size-5 shrink-0" aria-hidden />,
    match: (e) => !KNOWN_PLATFORMS.includes(e.platform),
  },
];


const TEST_FEED_KEY = "creovix:test-activity-feed";

function readTestFeed(): FeedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(TEST_FEED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FeedEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTestFeed(events: FeedEvent[]) {
  try {
    window.sessionStorage.setItem(TEST_FEED_KEY, JSON.stringify(events.slice(0, 200)));
  } catch {
    /* quota / private mode */
  }
}

function formatFeedAmount(
  event: FeedEvent,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string | null {
  if (event.event_type === "DONATION" && event.amount) {
    return `${event.currency === "USD" || !event.currency ? "$" : ""}${event.amount}${
      event.currency && event.currency !== "USD" ? ` ${event.currency}` : ""
    }`;
  }
  if (event.event_type === "BITS" && event.amount) {
    return `${event.amount} ${event.platform === "KICK" ? t("activity.type.KICKS") : t("activity.type.BITS")}`;
  }
  if (event.quantity > 1) return `×${event.quantity}`;
  return null;
}

function ActivityFeedRow({
  group,
  fresh,
  justNow,
  t,
}: {
  group: FeedEventGroup<FeedEvent>;
  fresh: boolean;
  justNow: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const event = group.events[0]!;
  const count = group.events.length;
  const label = t(activityLabelKey(event.platform, event.event_type));
  const amount = formatFeedAmount(event, t);

  return (
    <li className={fresh ? "soft-rise" : ""}>
      <ReplyAlertFrame active={event.isReply === true} quote={event.replyQuote}>
      <div className="flex items-start gap-3 py-3.5" dir="ltr">
        <PlatformIcon platform={event.platform} size={22} />
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[0.72rem] text-muted-foreground">
            {label}
            {event.isTest ? ` · ${t("activity.testEvent")}` : ""}
            {amount ? ` · ${amount}` : ""}
            {count > 1 ? ` · ×${count}` : ""}
          </p>
          <p className="truncate text-sm font-semibold text-foreground" dir="auto">
            {event.actor_name ?? t("activity.anonymous")}
          </p>
          {event.message ? (
            <p className="mt-0.5 break-words text-[0.8rem] text-muted-foreground" dir="auto">
              “{event.message}”
            </p>
          ) : null}
          {count > 1 ? (
            <Collapsible className="mt-1.5">
              <CollapsibleTrigger className="group flex items-center gap-1.5 text-[0.72rem] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground">
                {t("activity.group.count", { count })}
                <ChevronDown
                  className="size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-1.5 space-y-0.5 border-s border-white/10 ps-3">
                  {group.events.map((item) => {
                    const detail = [formatFeedAmount(item, t), item.message].filter(Boolean).join(" · ");
                    return (
                        <li
                        key={item.id}
                        className="py-1 text-[0.75rem] text-muted-foreground"
                      >
                        <ReplyAlertFrame active={item.isReply === true} quote={item.replyQuote}>
                        <div className="flex items-center gap-2">
                        <PlatformIcon platform={item.platform} size={12} />
                        <span className="min-w-0 flex-1 truncate" dir="auto">
                          {detail || t("activity.group.entry")}
                        </span>
                        <span className="shrink-0 tabular-nums" title={item.created_at}>
                          {relativeTime(item.created_at, justNow)}
                        </span>
                        </div>
                        </ReplyAlertFrame>
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>

        <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
          {relativeTime(event.created_at, justNow)}
        </span>
      </div>
      </ReplyAlertFrame>
    </li>
  );
}

function relativeTime(iso: string, justNow: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 10) return justNow;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 31536000) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / 31536000)}y`;
}

function readMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "text", "comment", "user_message", "body"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 400);
  }
  return null;
}

type EventRow = {
  id: string;
  platform: string;
  event_type: string;
  actor_name: string | null;
  amount: number | null;
  currency: string | null;
  quantity: number | null;
  seconds_added: number | null;
  raw_payload: unknown;
  created_at: string;
};

/** Normalizes a persisted `events` row into the shape the feed renders. */
function toFeedEvent(row: EventRow): FeedEvent {
  const reply = readReplyMeta(row.raw_payload);
  const display = readTestDisplay(row.raw_payload);
  const test = isStoredTestRow({ event_type: row.event_type, raw_payload: row.raw_payload });
  return {
    id: row.id,
    platform: row.platform,
    event_type: row.event_type,
    actor_name: row.actor_name,
    amount: display?.amount ?? row.amount,
    currency: display?.currency ?? row.currency,
    quantity: display?.quantity ?? row.quantity ?? 1,
    seconds_added: test ? 0 : (row.seconds_added ?? 0),
    message: readMessage(row.raw_payload),
    created_at: row.created_at,
    isReply: reply.isReply,
    replyQuote: reply.quote,
    ...(test ? { isTest: true as const } : {}),
  };
}

function ActivityFeedPage() {
  const { user } = Route.useRouteContext();
  const { data: workspace } = useWorkspace(user.id);
  const widgets = useWidgets();
  const { t } = useLanguage();
  const testMode = isTestMode();

  const [live, setLive] = useState<FeedEvent[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState<string[]>(() => FILTER_GROUPS.map((g) => g.id));
  useApplyDefaultPlatform(workspace?.profile?.default_platform, (platform) => {
    const id = platform.toLowerCase();
    if (FILTER_GROUPS.some((group) => group.id === id)) setActive([id]);
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const freshTimers = useRef<number[]>([]);

  const chatWidgetId =
    widgets.data?.widgets.find((widget) => widget.type === "CHAT_BOX")?.id ??
    widgets.data?.widgets[0]?.id ??
    null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 150);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (testMode) setLive(readTestFeed());
  }, [testMode]);

  useEffect(() => {
    const timers = freshTimers.current;
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, []);

  const markFresh = (id: string) => {
    setFreshIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const timer = window.setTimeout(() => {
      setFreshIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 700);
    freshTimers.current.push(timer);
  };

  const onInject = (event: InjectedFeedEvent) => {
    setLive((prev) => {
      const next = [event, ...prev.filter((item) => item.id !== event.id)].slice(0, 200);
      if (isTestMode()) writeTestFeed(next);
      return next;
    });
    markFresh(event.id);
  };

  const onPersisted = (localId: string, realId: string) => {
    if (!realId || localId === realId) return;
    setLive((prev) => prev.map((item) => (item.id === localId ? { ...item, id: realId } : item)));
    setFreshIds((prev) => {
      if (!prev.has(localId) && !prev.has(realId)) return prev;
      const next = new Set(prev);
      next.delete(localId);
      next.add(realId);
      return next;
    });
  };

  const query = useQuery({
    queryKey: ["activity-feed"],
    enabled: !testMode,
    refetchInterval: scrolled || testMode ? false : 8000,
    queryFn: async () => {
      const [eventsResult, targetsResult] = await Promise.all([
        supabase
          .from("events")
          .select(
            "id, platform, event_type, actor_name, amount, currency, quantity, seconds_added, raw_payload, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("target_events")
          .select("id, platform, event_type, actor_name, amount, currency, quantity, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (eventsResult.error) throw eventsResult.error;
      if (targetsResult.error && targetsResult.error.code !== "PGRST205") throw targetsResult.error;
      const rows = [
        ...(eventsResult.data ?? []),
        ...(targetsResult.data ?? []).map((row) => ({
          ...row,
          seconds_added: 0,
          raw_payload: {},
        })),
      ];
      return rows.map((row) => toFeedEvent(row as EventRow));
    },
  });

  // Live pipeline: every event written by the Twitch / Kick / TikTok / YouTube /
  // Streamlabs / StreamElements ingest paths lands in `events` and is streamed
  // here instantly, so the feed never waits for the next poll.
  useEffect(() => {
    if (testMode) return;
    const channel = supabase
      .channel("activity-feed-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (payload) => {
          const row = payload.new as EventRow | null;
          if (!row?.id) return;
          setLive((prev) =>
            prev.some((item) => item.id === row.id)
              ? prev
              : [toFeedEvent(row), ...prev].slice(0, 200),
          );
          markFresh(row.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "target_events" },
        (payload) => {
          const row = payload.new as EventRow | null;
          if (!row?.id) return;
          const event = toFeedEvent({ ...row, seconds_added: 0, raw_payload: {} });
          setLive((prev) => (prev.some((item) => item.id === row.id) ? prev : [event, ...prev].slice(0, 200)));
          markFresh(row.id);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [testMode]);

  const events = useMemo(() => {
    const map = new Map<string, FeedEvent>();
    for (const item of [...live, ...(query.data ?? [])]) map.set(item.id, item);
    const sorted = [...map.values()]
      .filter((event) => isAllowedPlatformEvent(event.platform, event.event_type))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // A relay (Streamlabs / StreamElements) can echo a native event. Keep the
    // native row. Two events from the same platform always both stay.
    const NATIVE = new Set(["TWITCH", "KICK", "TIKTOK", "YOUTUBE"]);
    const RELAY = new Set(["STREAMLABS", "STREAMELEMENTS"]);
    const kept: FeedEvent[] = [];
    for (const event of sorted) {
      const actor = (event.actor_name ?? "").trim().toLowerCase();
      const time = new Date(event.created_at).getTime();
      const twinIndex =
        actor.length === 0
          ? -1
          : kept.findIndex((other) => {
              if ((other.actor_name ?? "").trim().toLowerCase() !== actor) return false;
              if (other.event_type !== event.event_type) return false;
              if (other.platform === event.platform) return false;
              if (Math.abs(new Date(other.created_at).getTime() - time) > 10_000) return false;
              const cross =
                (NATIVE.has(event.platform) && RELAY.has(other.platform)) ||
                (RELAY.has(event.platform) && NATIVE.has(other.platform));
              return cross;
            });
      if (twinIndex === -1) {
        kept.push(event);
        continue;
      }
      const twin = kept[twinIndex]!;
      if (NATIVE.has(event.platform) && RELAY.has(twin.platform)) {
        kept[twinIndex] = event;
      }
    }
    return kept;
  }, [query.data, live]);



  const visible = useMemo(
    () => events.filter((event) => FILTER_GROUPS.some((g) => active.includes(g.id) && g.match(event))),
    [events, active],
  );

  const groups = useMemo(() => groupConsecutiveEvents(visible), [visible]);

  const toggle = (id: string) =>
    setActive((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allActive = active.length === FILTER_GROUPS.length;
  const toggleAll = () =>
    setActive(allActive ? [] : FILTER_GROUPS.map((group) => group.id));

  return (
    <AppShell
      user={user}
      profile={workspace?.profile}
      title={t("activity.title")}
      subtitle={t("activity.subtitle")}
      actions={
        <TestEventMenu
          connections={workspace?.connections ?? []}
          widgetId={chatWidgetId}
          onInject={onInject}
          onPersisted={onPersisted}
        />
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">

        <div ref={filterRef} className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterOpen((open) => !open)}
            aria-expanded={filterOpen}
            className="flex items-center gap-2 rounded-xl border border-[oklch(1_0_0/0.1)] bg-[oklch(1_0_0/0.04)] px-4 py-2.5 text-sm font-medium backdrop-blur transition-colors hover:bg-[oklch(1_0_0/0.08)]"
          >
            <Filter className="size-4 text-muted-foreground" aria-hidden />
            {t("activity.filter")}
            <ChevronDown
              className={`size-3.5 text-muted-foreground transition-transform ${filterOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <InfoTip text={t("tooltips.activity.filter")} />

          {filterOpen ? (
            <div
              role="menu"
              className="absolute start-0 top-full z-40 mt-2 min-w-64 rounded-xl border p-1.5"
              style={{
                background: "rgba(10, 10, 10, 0.95)",
                backdropFilter: "blur(12px)",
                borderColor: "rgba(255,255,255,0.1)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
              }}
            >
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={allActive}
                onClick={toggleAll}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-[0.82rem] font-semibold transition-all hover:bg-neutral-800/80 ${
                  allActive
                    ? "bg-neutral-800/80 text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <Globe className="size-5 shrink-0" aria-hidden />
                <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                <span className="flex-1">{t("activity.allPlatforms")}</span>
                <Check
                  className={`size-4 shrink-0 text-primary transition-opacity ${allActive ? "opacity-100" : "opacity-0"}`}
                  aria-hidden
                />
              </button>

              {FILTER_GROUPS.map((group) => {

                const on = active.includes(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => toggle(group.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-[0.82rem] transition-all hover:bg-neutral-800/80 ${
                      on
                        ? "bg-neutral-800/80 text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center">{group.icon}</span>
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: group.dot }}
                    />
                    <span className="flex-1">{t(group.label)}</span>
                    <Check
                      className={`size-4 shrink-0 text-primary transition-opacity ${on ? "opacity-100" : "opacity-0"}`}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <span className="text-xs text-muted-foreground">
          {visible.length} {visible.length === 1 ? t("activity.event") : t("activity.events")}
        </span>
      </div>

      <section className="border-t border-white/5 pt-2">
        {visible.length === 0 ? (
          query.isLoading && !testMode ? (
            <p className="py-14 text-center text-sm text-muted-foreground">{t("activity.loading")}</p>
          ) : (workspace?.connections?.length ?? 0) === 0 ? (
            <EmptyState
              className="mt-2"
              icon={Plug}
              title={t("activity.emptyTitle")}
              description={t("activity.emptyConnectDesc")}
              actionLabel={t("activity.connectCta")}
              actionTo="/settings"
            />
          ) : (
            <EmptyState
              className="mt-2"
              icon={Activity}
              title={t("activity.emptyTitle")}
              description={t("activity.emptyWaitingDesc")}
            />
          )
        ) : (
          <ul className="divide-y divide-white/5">
            {groups.map((group) => (
              <ActivityFeedRow
                key={group.id}
                group={group}
                fresh={group.events.some((event) => freshIds.has(event.id))}
                justNow={t("activity.justNow")}
                t={t}
              />
            ))}
          </ul>
        )}
      </section>

      {scrolled ? (
        <>
          <div
            className="fixed bottom-6 start-1/2 z-40 -translate-x-1/2 rounded-full border px-4 py-2 text-xs font-medium"
            style={{
              background: "rgba(10,10,10,0.9)",
              backdropFilter: "blur(12px)",
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <span className="flex items-center gap-2">
              <Pause className="size-3.5 text-primary" aria-hidden />
              {t("activity.paused")}
            </span>
          </div>

          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-6 end-6 z-40 flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-[oklch(1_0_0/0.1)]"
            style={{
              background: "rgba(10,10,10,0.9)",
              backdropFilter: "blur(12px)",
              borderColor: "rgba(255,255,255,0.12)",
              boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
            }}
          >
            <ArrowUp className="size-4 text-primary" aria-hidden />
            {t("activity.scrollTop")}
          </button>
        </>
      ) : null}

    </AppShell>
  );
}
