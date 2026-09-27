import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Radio, Search, Star, Swords, Trash2, Users } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { StudioPageTabs } from "@/components/layout/StudioPageTabs";
import { DarkSelect } from "@/components/ui/dark-select";
import { PlatformIcon } from "@/components/widgets/PlatformIcon";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLanguage } from "@/lib/i18n";
import {
  searchTwitchChannels,
  type ChannelSearchHit,
  type ChannelSnapshot,
  type CounterPlatform,
} from "@/lib/liveCounter.functions";
import { supabase } from "@/lib/supabase/client";

export const Route = createFileRoute("/_authenticated/live-counter")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Counter" },
      {
        name: "description",
        content:
          "Track live follower counts for any Kick or Twitch channel, save social accounts, and sum public follower totals.",
      },
      { property: "og:title", content: "CylixStudio — Counter" },
      {
        property: "og:description",
        content: "Real-time follower counters with saved channels and VS comparison mode.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveCounterPage,
});

type Target = { platform: CounterPlatform; username: string };

/** Browser calls our origin only. Platform APIs are fetched by the server route. */
async function lookupViaProxy(platform: CounterPlatform, username: string): Promise<ChannelSnapshot> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to look up a channel");
  const response = await fetch("/api/live-counter/lookup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ platform, username }),
  });
  const payload = (await response.json()) as ChannelSnapshot & { message?: string };
  if (!response.ok) throw new Error(payload.message || "Channel Not Found");
  return payload;
}

type Saved = { platform: string; username: string; displayName: string; avatarUrl: string | null };
type SuggestionSource = "connected" | "favorite" | "recent" | "twitch";
type ChannelSuggestion = {
  platform: "KICK" | "TWITCH" | "X" | "TIKTOK" | "YOUTUBE";
  username: string;
  displayName: string;
  avatarUrl: string | null;
  source: SuggestionSource;
  isLive?: boolean;
};

const TRACKABLE: ChannelSuggestion["platform"][] = ["KICK", "TWITCH", "X", "YOUTUBE"];

const POLL_MS = 5_000;
const FAVORITES_KEY = "creovix.live-counter.favorites";
const DAILY_KEY = "creovix.live-counter.daily";
const SNAPSHOT_KEY = "creovix.live-counter.snapshots";
const RECENT_KEY = "creovix.live-counter.recent";
const SOCIAL_KEY = "creovix.live-counter.socials";

const field =
  "h-11 w-full rounded-xl border border-white/10 bg-background px-3 text-sm outline-none focus:border-primary";

function isTrackable(platform: string): platform is ChannelSuggestion["platform"] {
  return TRACKABLE.includes(platform as ChannelSuggestion["platform"]);
}

function suggestionKey(item: { platform: string; username: string }) {
  return `${item.platform}:${item.username.trim().toLowerCase()}`;
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "");
}

function matchesQuery(item: ChannelSuggestion, query: string) {
  const needle = query.trim().replace(/^@/, "").toLowerCase();
  if (!needle) return false;
  return (
    item.username.toLowerCase().includes(needle) ||
    item.displayName.toLowerCase().includes(needle)
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Counts up from the previous value (0 on first load) to the new total. */
function useCountUp(value: number | null): number | null {
  const [display, setDisplay] = useState<number | null>(value);
  const from = useRef(0);

  useEffect(() => {
    if (value === null) {
      setDisplay(null);
      return;
    }
    const start = from.current;
    if (start === value) {
      setDisplay(value);
      return;
    }
    const began = performance.now();
    const duration = 900;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (value - start) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return display;
}

/** Rolling digits: each character animates independently when it changes. */
function RollingCounter({ value, size = "text-7xl" }: { value: number | null; size?: string }) {
  const animated = useCountUp(value);
  const text = animated === null ? "—" : animated.toLocaleString("en-US");
  const previous = useRef(text);
  const changed = previous.current !== text;
  useEffect(() => {
    previous.current = text;
  }, [text]);

  return (
    <div className={`flex font-mono font-bold tabular-nums ${size}`} aria-live="polite">
      {text.split("").map((char, index) => (
        <span
          key={`${index}-${char}`}
          className={`inline-block ${changed ? "animate-fade-in" : ""}`}
          style={{ minWidth: char === "," ? "0.35em" : "0.62em", textAlign: "center" }}
        >
          {char}
        </span>
      ))}
    </div>
  );
}


/**
 * One tracked channel. The last good reading is remembered in state and in
 * localStorage, so a failed or empty background poll never blanks the counter.
 */
function useChannel(target: Target | null) {
  const query = useQuery({
    queryKey: ["live-counter", target?.platform, target?.username?.toLowerCase()],
    enabled: Boolean(target?.username),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    retry: 1,
    placeholderData: (previous: ChannelSnapshot | undefined) => previous,
    queryFn: () => lookupViaProxy(target!.platform, target!.username),
  });

  const key = target ? `${target.platform}:${target.username.trim().toLowerCase()}` : null;
  const [sticky, setSticky] = useState<ChannelSnapshot | undefined>(undefined);

  // Restore the previous reading for this channel the moment it is selected.
  useEffect(() => {
    if (!key) {
      setSticky(undefined);
      return;
    }
    const store = readJson<Record<string, ChannelSnapshot>>(SNAPSHOT_KEY, {});
    setSticky(store[key]);
  }, [key]);

  // Remember every successful reading (a poll that returns no total is ignored).
  useEffect(() => {
    const fresh = query.data;
    if (!key || !fresh || fresh.followers === null) return;
    setSticky(fresh);
    const store = readJson<Record<string, ChannelSnapshot>>(SNAPSHOT_KEY, {});
    store[key] = fresh;
    try {
      window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(store));
    } catch {
      /* storage full or unavailable — the in-memory value still holds */
    }
  }, [query.data, key]);

  const data =
    query.data && query.data.followers !== null ? query.data : (sticky ?? query.data);

  return {
    data,
    isFetching: query.isFetching,
    // Only surface an error when there is nothing at all to show.
    error: data ? null : query.error,
  };
}


/** Keeps the first count seen today so growth can be reported honestly. */
function useDailyGrowth(snapshot: ChannelSnapshot | undefined): number | null {
  const [growth, setGrowth] = useState<number | null>(null);

  useEffect(() => {
    if (!snapshot || snapshot.followers === null) return;
    const key = `${snapshot.platform}:${snapshot.username.toLowerCase()}`;
    const today = new Date().toISOString().slice(0, 10);
    const store = readJson<Record<string, { day: string; start: number }>>(DAILY_KEY, {});
    const entry = store[key];
    if (!entry || entry.day !== today) {
      store[key] = { day: today, start: snapshot.followers };
      window.localStorage.setItem(DAILY_KEY, JSON.stringify(store));
      setGrowth(0);
      return;
    }
    setGrowth(snapshot.followers - entry.start);
  }, [snapshot]);

  return growth;
}

function PlatformSelect({
  value,
  onPlatform,
  ariaLabel,
  className,
}: {
  value: CounterPlatform;
  onPlatform: (next: CounterPlatform) => void;
  ariaLabel: string;
  className?: string;
}) {
  const { t } = useLanguage();
  const platforms: { id: CounterPlatform; label: string; comingSoon?: boolean }[] = [
    { id: "ALL", label: t("counter.platform.all") },
    { id: "KICK", label: t("counter.platform.kick") },
    { id: "TWITCH", label: t("counter.platform.twitch") },
    { id: "YOUTUBE", label: t("counter.platform.youtube") },
    { id: "TIKTOK", label: t("counter.platform.tiktokSoon"), comingSoon: true },
    { id: "X", label: t("counter.platform.xTwitter") },
  ];

  return (
    <DarkSelect
      value={value}
      onValueChange={(next) => onPlatform(next as CounterPlatform)}
      aria-label={ariaLabel}
      className={className ?? "h-11 w-[12.5rem] shrink-0"}
      options={platforms.filter((entry) => !entry.comingSoon).map((entry) => ({
        value: entry.id,
        label: (
          <span className="flex items-center gap-2">
            {entry.id !== "ALL" ? <PlatformIcon platform={entry.id} size={14} /> : null}
            {entry.label}
          </span>
        ),
      }))}
    />
  );
}

function ChannelSearchField({
  value,
  platform,
  onValue,
  onPlatform,
  onPick,
  label,
  localSuggestions,
}: {
  value: string;
  platform: CounterPlatform;
  onValue: (next: string) => void;
  onPlatform: (next: CounterPlatform) => void;
  onPick?: (username: string, platform: CounterPlatform) => void;
  label: string;
  localSuggestions: ChannelSuggestion[];
}) {
  const { t } = useLanguage();
  const sourceLabel: Record<SuggestionSource, string> = {
    connected: t("counter.source.connected"),
    favorite: t("counter.source.favorite"),
    recent: t("counter.source.recent"),
    twitch: t("counter.source.twitch"),
  };
  const listId = useMemo(
    () => `channel-suggest-${label.replace(/\s+/g, "-").toLowerCase()}`,
    [label],
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<number | null>(null);
  const searchTwitch = useServerFn(searchTwitchChannels);
  const typed = value.trim().replace(/^@/, "");
  const debounced = useDebounced(typed, 280);
  const canSearchTwitch =
    debounced.length >= 2 && (platform === "ALL" || platform === "TWITCH");

  const twitchQuery = useQuery({
    queryKey: ["live-counter-search", debounced.toLowerCase(), platform],
    enabled: canSearchTwitch,
    staleTime: 30_000,
    retry: 0,
    queryFn: async () => {
      try {
        return (await searchTwitch({ data: { query: debounced } })) as ChannelSearchHit[];
      } catch {
        // Guest sessions and missing Twitch credentials should not break typing.
        return [] as ChannelSearchHit[];
      }
    },
  });

  const suggestions = useMemo(() => {
    const needle = typed.toLowerCase();
    if (!needle) return [] as ChannelSuggestion[];

    const seen = new Set<string>();
    const next: ChannelSuggestion[] = [];
    const push = (item: ChannelSuggestion) => {
      if (platform !== "ALL" && item.platform !== platform) return;
      if (!matchesQuery(item, typed)) return;
      const key = suggestionKey(item);
      if (seen.has(key)) return;
      seen.add(key);
      next.push(item);
    };

    for (const item of localSuggestions) push(item);
    if (platform === "ALL" || platform === "TWITCH") {
      for (const hit of twitchQuery.data ?? []) {
        push({
          platform: "TWITCH",
          username: hit.username,
          displayName: hit.displayName,
          avatarUrl: hit.avatarUrl,
          source: "twitch",
          isLive: hit.isLive,
        });
      }
    }
    return next.slice(0, 8);
  }, [localSuggestions, platform, typed, twitchQuery.data]);

  const showList = open && typed.length > 0;
  const emptyHint =
    platform === "ALL" || platform === "TWITCH"
      ? t("counter.search.emptyTwitch")
      : t("counter.search.emptyLocal");

  const pick = (item: ChannelSuggestion) => {
    onValue(item.username);
    onPlatform(item.platform);
    onPick?.(item.username, item.platform);
    setOpen(false);
  };

  const moveActive = (delta: number) => {
    if (suggestions.length === 0) return;
    setActive((index) => (index + delta + suggestions.length) % suggestions.length);
  };

  useEffect(() => {
    setActive(0);
  }, [typed, platform]);

  useEffect(
    () => () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
    },
    [],
  );

  return (
    <div className="relative min-w-0 flex-1">
      <Search
        className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
        aria-hidden
      />
      <input
        value={value}
        onChange={(event) => {
          onValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 140);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            moveActive(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            moveActive(-1);
          } else if (event.key === "Escape") {
            setOpen(false);
          } else if (event.key === "Enter" && showList && suggestions[active]) {
            event.preventDefault();
            pick(suggestions[active]);
          }
        }}
        placeholder={label}
        className={`${field} ps-9`}
        dir="auto"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={
          showList && suggestions[active] ? `${listId}-${active}` : undefined
        }
        role="combobox"
        autoComplete="off"
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute start-0 end-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#12151e]/95 py-1 text-sm shadow-2xl shadow-black/60 backdrop-blur-2xl"
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-3 text-center text-xs text-muted-foreground">
              {canSearchTwitch && twitchQuery.isFetching
                ? t("counter.search.searchingTwitch")
                : emptyHint}
            </li>
          ) : (
            suggestions.map((item, index) => (
              <li key={suggestionKey(item)} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-start transition-colors ${
                    index === active
                      ? "bg-violet-600/20 text-violet-100"
                      : "text-slate-100 hover:bg-violet-600/15"
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(item)}
                >
                  {item.avatarUrl ? (
                    <img
                      src={item.avatarUrl}
                      alt=""
                      className="size-7 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[0.65rem] font-bold">
                      {item.displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium" dir="auto">{item.displayName}</span>
                    <span className="block truncate text-[0.7rem] text-muted-foreground" dir="auto">
                      @{item.username}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    <PlatformIcon platform={item.platform} size={12} />
                    {sourceLabel[item.source]}
                    {item.isLive ? t("counter.search.liveSuffix") : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function SearchBar({
  value,
  platform,
  onValue,
  onPlatform,
  onSubmit,
  label,
  localSuggestions,
}: {
  value: string;
  platform: CounterPlatform;
  onValue: (next: string) => void;
  onPlatform: (next: CounterPlatform) => void;
  onSubmit: (username: string, platform: CounterPlatform) => void;
  label: string;
  localSuggestions: ChannelSuggestion[];
}) {
  const { t } = useLanguage();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value, platform);
      }}
    >
      <ChannelSearchField
        value={value}
        platform={platform}
        onValue={onValue}
        onPlatform={onPlatform}
        onPick={onSubmit}
        label={label}
        localSuggestions={localSuggestions}
      />
      <PlatformSelect value={platform} onPlatform={onPlatform} ariaLabel={t("counter.aria.platform")} />
      <button
        type="submit"
        className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t("counter.trackLive")}
      </button>
    </form>
  );
}

function VsComparisonBar({
  inputA,
  platformA,
  inputB,
  platformB,
  onInputA,
  onPlatformA,
  onInputB,
  onPlatformB,
  onTrack,
  localSuggestions,
}: {
  inputA: string;
  platformA: CounterPlatform;
  inputB: string;
  platformB: CounterPlatform;
  onInputA: (next: string) => void;
  onPlatformA: (next: CounterPlatform) => void;
  onInputB: (next: string) => void;
  onPlatformB: (next: CounterPlatform) => void;
  onTrack: (a: Target, b: Target) => void;
  localSuggestions: ChannelSuggestion[];
}) {
  const { t } = useLanguage();
  const ready = Boolean(normalizeUsername(inputA) && normalizeUsername(inputB));
  const selectClass = "h-11 w-[9.75rem] shrink-0";

  return (
    <form
      className="rounded-2xl border border-white/10 bg-background/50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const a = normalizeUsername(inputA);
        const b = normalizeUsername(inputB);
        if (!a || !b) return;
        onTrack({ platform: platformA, username: a }, { platform: platformB, username: b });
      }}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ChannelSearchField
            value={inputA}
            platform={platformA}
            onValue={onInputA}
            onPlatform={onPlatformA}
            label={t("counter.creatorA")}
            localSuggestions={localSuggestions}
          />
          <PlatformSelect
            value={platformA}
            onPlatform={onPlatformA}
            ariaLabel={t("counter.aria.creatorAPlatform")}
            className={selectClass}
          />
        </div>
        <div className="flex justify-center">
          <span className="rounded-full border border-white/10 bg-muted px-2.5 py-1 text-[0.65rem] font-bold tracking-[0.2em] text-muted-foreground">
            {t("counter.vs")}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ChannelSearchField
            value={inputB}
            platform={platformB}
            onValue={onInputB}
            onPlatform={onPlatformB}
            label={t("counter.creatorB")}
            localSuggestions={localSuggestions}
          />
          <PlatformSelect
            value={platformB}
            onPlatform={onPlatformB}
            ariaLabel={t("counter.aria.creatorBPlatform")}
            className={selectClass}
          />
        </div>
        <button
          type="submit"
          disabled={!ready}
          className="h-11 shrink-0 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
        >
          {t("counter.trackLive")}
        </button>
      </div>
    </form>
  );
}

function ChannelCard({
  snapshot,
  loading,
  error,
  compact = false,
  action,
}: {
  snapshot: ChannelSnapshot | undefined;
  loading: boolean;
  error: string | null;
  compact?: boolean;
  action?: React.ReactNode;
}) {
  const { t } = useLanguage();
  const growth = useDailyGrowth(snapshot);

  if (error) {
    const notFound = error.toLowerCase().includes("not found");
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/5 p-8 text-center">
        <span
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            notFound
              ? "bg-destructive/20 text-destructive"
              : "bg-amber-400/15 text-amber-300"
          }`}
        >
          {notFound ? t("counter.channelNotFound") : t("counter.lookupFailed")}
        </span>
        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!snapshot) {
    if (compact) {
      return (
        <div className="grid min-h-[7.5rem] place-items-center rounded-2xl border border-white/5 text-sm text-muted-foreground">
          {loading ? t("counter.loading") : null}
        </div>
      );
    }
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        {loading ? t("counter.loadingChannel") : t("counter.searchToStart")}
      </div>
    );
  }

  const growthLabel =
    growth === null
      ? null
      : t("counter.followersToday", {
          n: `${growth >= 0 ? "+" : ""}${growth.toLocaleString()}`,
        });

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/5 p-8 text-center">
      <div className="flex items-center gap-4">
        {snapshot.avatarUrl ? (
          <img
            src={snapshot.avatarUrl}
            alt={snapshot.displayName}
            className="size-16 rounded-full border border-[oklch(1_0_0/0.12)] object-cover"
          />
        ) : (
          <div className="grid size-16 place-items-center rounded-full bg-muted text-lg font-bold">
            {snapshot.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="text-start">
          <p className={`font-bold ${compact ? "text-lg" : "text-2xl"}`}>{snapshot.displayName}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[oklch(1_0_0/0.1)] px-2.5 py-1 text-xs">
            <PlatformIcon platform={snapshot.platform} size={14} />
            {snapshot.platform}
          </span>
        </div>
        {action}
      </div>

      <RollingCounter value={snapshot.followers} size={compact ? "text-5xl" : "text-7xl"} />
      <p className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
        <Users className="size-3.5" aria-hidden /> {t("counter.followers")}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
        <span className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] px-3 py-1 font-semibold text-primary">
          <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
          {t("counter.livePollingActive")}
        </span>
        {snapshot.isLive ? (
          <span className="rounded-full bg-destructive/20 px-3 py-1 font-semibold text-destructive">
            {t("counter.onAir")}
            {snapshot.viewers !== null
              ? ` ${t("counter.viewersSuffix", { n: snapshot.viewers.toLocaleString() })}`
              : ""}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
            {t("counter.offline")}
          </span>
        )}
        {growthLabel ? (
          <span className="rounded-full border border-[oklch(1_0_0/0.1)] px-3 py-1">{growthLabel}</span>
        ) : null}
      </div>

      {snapshot.note ? (
        <p className="max-w-md text-xs text-muted-foreground">{snapshot.note}</p>
      ) : null}
    </div>
  );
}

function errorText(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : fallback;
}

function SocialCounterSection() {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<Saved[]>([]);
  const [input, setInput] = useState("");
  const [platform, setPlatform] = useState<Exclude<CounterPlatform, "ALL">>("TWITCH");
  const inputRef = useRef<HTMLInputElement>(null);

  const socialPlatforms: { id: Exclude<CounterPlatform, "ALL">; label: string; comingSoon?: boolean }[] = [
    { id: "KICK", label: t("counter.platform.kick") },
    { id: "TWITCH", label: t("counter.platform.twitch") },
    { id: "YOUTUBE", label: t("counter.platform.youtube") },
    { id: "TIKTOK", label: t("counter.platform.tiktokSoon"), comingSoon: true },
    { id: "X", label: t("counter.platform.xTwitter") },
  ];

  useEffect(() => {
    setAccounts(readJson<Saved[]>(SOCIAL_KEY, []));
  }, []);

  const persistSocial = (next: Saved[]) => {
    setAccounts(next);
    try {
      window.localStorage.setItem(SOCIAL_KEY, JSON.stringify(next));
    } catch {
      /* storage full or unavailable */
    }
  };

  const queries = useQueries({
    queries: accounts.map((account) => ({
      queryKey: ["live-counter-social", account.platform, account.username.toLowerCase()] as const,
      enabled: Boolean(account.username),
      refetchInterval: 15_000,
      retry: 0,
      queryFn: () => lookupViaProxy(account.platform as CounterPlatform, account.username),
    })),
  });

  const knownCounts = queries
    .map((query) => query.data?.followers)
    .filter((value): value is number => typeof value === "number");
  const total = knownCounts.length > 0 ? knownCounts.reduce((sum, value) => sum + value, 0) : null;

  const addAccount = () => {
    const username = input.trim().replace(/^@/, "");
    if (!username) return;
    if (platform === "TIKTOK") return;
    const key = `${platform}:${username.toLowerCase()}`;
    if (accounts.some((item) => `${item.platform}:${item.username.toLowerCase()}` === key)) {
      setInput("");
      return;
    }
    persistSocial([
      ...accounts,
      { platform, username, displayName: username, avatarUrl: null },
    ]);
    setInput("");
  };

  const focusAdd = () => {
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          addAccount();
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("counter.social.usernamePlaceholder")}
          className={`${field} min-w-[180px] flex-1`}
          dir="auto"
        />
        <DarkSelect
          value={platform}
          onValueChange={(next) => setPlatform(next as Exclude<CounterPlatform, "ALL">)}
          aria-label={t("counter.aria.socialPlatform")}
          className="h-11 w-[11.5rem] shrink-0"
          options={socialPlatforms.filter((entry) => !entry.comingSoon).map((entry) => ({
            value: entry.id,
            label: (
              <span className="flex items-center gap-2">
                <PlatformIcon platform={entry.id} size={14} />
                {entry.label}
              </span>
            ),
          }))}
        />
        <button
          type="submit"
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="size-4" aria-hidden />
          {t("counter.social.add")}
        </button>
      </form>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("counter.social.emptyTitle")}
          description={t("counter.social.emptyDescription")}
          actionLabel={t("counter.social.addFirst")}
          onAction={focusAdd}
        />
      ) : (
        <div className="rounded-2xl border border-white/5 px-5 py-6 text-center">
          {total === null ? (
            <p className="text-sm text-muted-foreground">{t("counter.social.noTotalsYet")}</p>
          ) : (
            <>
              <RollingCounter value={total} size="text-6xl" />
              <p className="mt-2 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
                <Users className="size-3.5" aria-hidden /> {t("counter.social.combinedFollowers")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("counter.social.accountsWithTotal", {
                  known: knownCounts.length,
                  total: accounts.length,
                })}
              </p>
            </>
          )}
        </div>
      )}

      {accounts.length > 0 ? (
        <ul className="space-y-2">
          {accounts.map((account, index) => {
            const snapshot = queries[index]?.data;
            const error = errorText(queries[index]?.error, t("counter.couldNotLoad"));
            const followers = snapshot?.followers ?? null;
            return (
              <li
                key={`${account.platform}:${account.username}`}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-background/50 px-3 py-2.5"
              >
                {snapshot?.avatarUrl || account.avatarUrl ? (
                  <img
                    src={snapshot?.avatarUrl || account.avatarUrl || ""}
                    alt=""
                    className="size-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">
                    {(snapshot?.displayName || account.displayName).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" dir="auto">
                    {snapshot?.displayName || account.displayName}
                  </p>
                  <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                    <PlatformIcon platform={account.platform} size={12} />
                    @{account.username}
                  </p>
                </div>
                <div className="text-end">
                  {followers !== null ? (
                    <p className="text-sm font-semibold tabular-nums">{followers.toLocaleString()}</p>
                  ) : (
                    <p className="max-w-[12rem] text-[0.68rem] leading-snug text-muted-foreground">
                      {queries[index]?.isFetching
                        ? t("counter.social.lookingUp")
                        : error || snapshot?.note || t("counter.social.noPublicCount")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={t("counter.aria.remove", { name: account.displayName })}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    persistSocial(
                      accounts.filter(
                        (item) =>
                          `${item.platform}:${item.username.toLowerCase()}` !==
                          `${account.platform}:${account.username.toLowerCase()}`,
                      ),
                    )
                  }
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function LiveCounterPage() {
  const { user } = Route.useRouteContext();
  const { data: workspace } = useWorkspace(user.id);
  const { t } = useLanguage();

  const [pane, setPane] = useState<"live" | "social">("live");
  const [vsMode, setVsMode] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [recent, setRecent] = useState<Saved[]>([]);

  useEffect(() => {
    setSaved(readJson<Saved[]>(FAVORITES_KEY, []));
    const stored = readJson<Saved[]>(RECENT_KEY, []);
    const snapshots = Object.values(readJson<Record<string, ChannelSnapshot>>(SNAPSHOT_KEY, {}));
    const seen = new Set(stored.map((entry) => suggestionKey(entry)));
    const extras = snapshots
      .filter((snapshot) => !seen.has(suggestionKey(snapshot)))
      .map((snapshot) => ({
        platform: snapshot.platform,
        username: snapshot.username,
        displayName: snapshot.displayName,
        avatarUrl: snapshot.avatarUrl,
      }));
    setRecent([...stored, ...extras].slice(0, 20));
  }, []);

  const persist = (next: Saved[]) => {
    setSaved(next);
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  };

  const rememberRecent = (snapshot: ChannelSnapshot) => {
    const entry: Saved = {
      platform: snapshot.platform,
      username: snapshot.username,
      displayName: snapshot.displayName,
      avatarUrl: snapshot.avatarUrl,
    };
    setRecent((prev) => {
      const key = suggestionKey(entry);
      const existing = prev.find((item) => suggestionKey(item) === key);
      if (
        existing &&
        existing.displayName === entry.displayName &&
        existing.avatarUrl === entry.avatarUrl
      ) {
        return prev;
      }
      const next = [entry, ...prev.filter((item) => suggestionKey(item) !== key)].slice(0, 20);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* storage full or unavailable */
      }
      return next;
    });
  };

  // Single view
  const [input, setInput] = useState("");
  const [platform, setPlatform] = useState<CounterPlatform>("ALL");
  const [target, setTarget] = useState<Target | null>(null);
  const main = useChannel(target);

  // VS mode
  const [inputA, setInputA] = useState("");
  const [platformA, setPlatformA] = useState<CounterPlatform>("ALL");
  const [targetA, setTargetA] = useState<Target | null>(null);
  const [inputB, setInputB] = useState("");
  const [platformB, setPlatformB] = useState<CounterPlatform>("ALL");
  const [targetB, setTargetB] = useState<Target | null>(null);
  const sideA = useChannel(vsMode ? targetA : null);
  const sideB = useChannel(vsMode ? targetB : null);

  useEffect(() => {
    if (main.data) rememberRecent(main.data);
  }, [main.data]);
  useEffect(() => {
    if (sideA.data) rememberRecent(sideA.data);
  }, [sideA.data]);
  useEffect(() => {
    if (sideB.data) rememberRecent(sideB.data);
  }, [sideB.data]);

  const localSuggestions = useMemo(() => {
    const items: ChannelSuggestion[] = [];
    const seen = new Set<string>();
    const push = (
      item: Saved,
      source: Exclude<SuggestionSource, "twitch">,
    ) => {
      if (!item.username || !isTrackable(item.platform)) return;
      const next: ChannelSuggestion = {
        platform: item.platform,
        username: item.username,
        displayName: item.displayName || item.username,
        avatarUrl: item.avatarUrl,
        source,
      };
      const key = suggestionKey(next);
      if (seen.has(key)) return;
      seen.add(key);
      items.push(next);
    };

    for (const connection of workspace?.connections ?? []) {
      if (!connection.is_active || !connection.username) continue;
      const meta = (connection.metadata ?? {}) as { avatar_url?: string | null };
      push(
        {
          platform: connection.platform,
          username: connection.username,
          displayName: connection.username,
          avatarUrl: meta.avatar_url ?? null,
        },
        "connected",
      );
    }
    for (const entry of saved) push(entry, "favorite");
    for (const entry of recent) push(entry, "recent");
    return items;
  }, [workspace?.connections, saved, recent]);

  const isFavorite = useMemo(
    () =>
      Boolean(
        main.data &&
          saved.some(
            (entry) =>
              entry.platform === main.data!.platform &&
              entry.username.toLowerCase() === main.data!.username.toLowerCase(),
          ),
      ),
    [saved, main.data],
  );

  const toggleFavorite = () => {
    const snapshot = main.data;
    if (!snapshot) return;
    const key = `${snapshot.platform}:${snapshot.username.toLowerCase()}`;
    const without = saved.filter(
      (entry) => `${entry.platform}:${entry.username.toLowerCase()}` !== key,
    );
    persist(
      isFavorite
        ? without
        : [
            ...without,
            {
              platform: snapshot.platform,
              username: snapshot.username,
              displayName: snapshot.displayName,
              avatarUrl: snapshot.avatarUrl,
            },
          ],
    );
  };

  const gap =
    sideA.data?.followers != null && sideB.data?.followers != null
      ? sideA.data.followers - sideB.data.followers
      : null;

  const toggleClass = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <AppShell
      user={user}
      profile={workspace?.profile}
      title={t("counter.title")}
      subtitle={t("counter.subtitle")}
    >
      <StudioPageTabs
        value={pane}
        onChange={setPane}
        items={[
          { id: "live", label: t("counter.tab.live") },
          { id: "social", label: t("counter.tab.social") },
        ]}
      />
      {pane === "live" ? (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-1 border-b border-white/5 pb-4">
          <button type="button" className={toggleClass(!vsMode)} onClick={() => setVsMode(false)}>
            <Radio className="size-4" aria-hidden /> {t("counter.singleView")}
          </button>
          <button type="button" className={toggleClass(vsMode)} onClick={() => setVsMode(true)}>
            <Swords className="size-4" aria-hidden /> {t("counter.vsMode")}
          </button>
        </div>

        {!vsMode ? (
          <>
            <div className="space-y-4">
              <SearchBar
                value={input}
                platform={platform}
                onValue={setInput}
                onPlatform={setPlatform}
                onSubmit={(username, nextPlatform) => {
                  setInput(username);
                  setPlatform(nextPlatform);
                  setTarget({ platform: nextPlatform, username });
                }}
                label={t("counter.channelUsername")}
                localSuggestions={localSuggestions}
              />

              {saved.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {saved.map((entry) => (
                    <div
                      key={`${entry.platform}-${entry.username}`}
                      className="group flex shrink-0 items-center gap-2 rounded-xl border border-[oklch(1_0_0/0.08)] bg-background/60 px-3 py-2"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2 text-start"
                        onClick={() => {
                          setInput(entry.username);
                          setPlatform(entry.platform as CounterPlatform);
                          setTarget({
                            platform: entry.platform as CounterPlatform,
                            username: entry.username,
                          });
                        }}
                      >
                        {entry.avatarUrl ? (
                          <img
                            src={entry.avatarUrl}
                            alt=""
                            className="size-8 rounded-full object-cover"
                          />
                        ) : (
                          <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-bold">
                            {entry.displayName.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="text-sm font-medium">{entry.displayName}</span>
                        <PlatformIcon platform={entry.platform} size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("counter.aria.remove", { name: entry.displayName })}
                        className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        onClick={() =>
                          persist(
                            saved.filter(
                              (item) =>
                                `${item.platform}:${item.username.toLowerCase()}` !==
                                `${entry.platform}:${entry.username.toLowerCase()}`,
                            ),
                          )
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <ChannelCard
              snapshot={main.data}
              loading={main.isFetching}
              error={errorText(main.error, t("counter.couldNotLoad"))}
              action={
                main.data ? (
                  <button
                    type="button"
                    onClick={toggleFavorite}
                    className={`ms-2 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isFavorite
                        ? "border-amber-400/60 bg-amber-400/15 text-amber-300"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Star
                      className="size-3.5"
                      fill={isFavorite ? "currentColor" : "none"}
                      aria-hidden
                    />
                    {isFavorite ? t("counter.favorited") : t("counter.favorite")}
                  </button>
                ) : null
              }
            />
          </>
        ) : (
          <div className="space-y-4">
            <VsComparisonBar
              inputA={inputA}
              platformA={platformA}
              inputB={inputB}
              platformB={platformB}
              onInputA={setInputA}
              onPlatformA={setPlatformA}
              onInputB={setInputB}
              onPlatformB={setPlatformB}
              onTrack={(a, b) => {
                setInputA(a.username);
                setPlatformA(a.platform);
                setTargetA(a);
                setInputB(b.username);
                setPlatformB(b.platform);
                setTargetB(b);
              }}
              localSuggestions={localSuggestions}
            />

            {targetA && targetB ? (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  <ChannelCard
                    snapshot={sideA.data}
                    loading={sideA.isFetching}
                    error={errorText(sideA.error, t("counter.couldNotLoad"))}
                    compact
                  />
                  <ChannelCard
                    snapshot={sideB.data}
                    loading={sideB.isFetching}
                    error={errorText(sideB.error, t("counter.couldNotLoad"))}
                    compact
                  />
                </div>

                {gap !== null ? (
                  <div className="border-t border-white/5 p-6 text-center">
                    {gap === 0 ? (
                      <p className="text-lg font-semibold">{t("counter.deadHeat")}</p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">{t("counter.liveDifference")}</p>
                        <div className="flex justify-center">
                          <RollingCounter value={Math.abs(gap)} size="text-5xl" />
                        </div>
                        <p className="mt-2 text-sm font-semibold">
                          {t("counter.leadsBy", {
                            name:
                              (gap > 0 ? sideA.data?.displayName : sideB.data?.displayName) ??
                              t("counter.channelFallback"),
                            n: Math.abs(gap).toLocaleString(),
                          })}
                        </p>
                        {(() => {
                          const a = sideA.data?.followers ?? 0;
                          const b = sideB.data?.followers ?? 0;
                          const total = a + b;
                          const share = total > 0 ? (a / total) * 100 : 50;
                          return (
                            <div className="mx-auto mt-4 max-w-2xl">
                              <div className="flex h-3 overflow-hidden rounded-full bg-[oklch(1_0_0/0.08)]">
                                <div
                                  className="h-full bg-primary transition-[width] duration-700"
                                  style={{ width: `${share}%` }}
                                />
                                <div className="h-full flex-1 bg-amber-400/70" />
                              </div>
                              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                                <span>
                                  {sideA.data?.displayName} · {a.toLocaleString()}
                                </span>
                                <span>
                                  {sideB.data?.displayName} · {b.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </div>
      ) : (
        <SocialCounterSection />
      )}
    </AppShell>
  );
}
