import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Check, Search, Video } from "lucide-react";
import { toast } from "sonner";

import { ClipMaintenance } from "@/components/clips/ClipMaintenance";
import { AppShell } from "@/components/layout/AppShell";
import { ClipPlayer } from "@/components/clips/ClipPlayer";
import { useWorkspace } from "@/hooks/useWorkspace";
import { guardClipDashboardPage } from "@/lib/clipPageGuard";
import { deleteClip, listChannelClips } from "@/lib/clipCommand.functions";
import { useLanguage, type TranslationKey, t as translate } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/clips")({
  ssr: false,
  beforeLoad: () => guardClipDashboardPage(),
  head: () => ({
    meta: [
      { title: "CylixStudio — Channel Clips" },
      {
        name: "description",
        content: "Browse, search, watch and share every clip your community created on your channel.",
      },
      { property: "og:title", content: "CylixStudio — Channel Clips" },
      {
        property: "og:description",
        content: "A searchable gallery of community clips with playback, sharing and download actions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClipsRoute,
});

function ClipsRoute() {
  const { user, clipAdmin } = Route.useRouteContext();
  const { data } = useWorkspace(user.id);
  if (clipAdmin !== true) {
    return <ClipMaintenance user={user} profile={data?.profile} />;
  }
  return <ClipsPage />;
}

type Clip = {
  id: string;
  title: string;
  url: string;
  shareUrl: string | null;
  thumbnail: string | null;
  duration: number;
  views: number;
  clippedBy: string;
  createdAt: string;
  platform: string;
};

const SORT_IDS = ["recent", "views", "today", "all_time"] as const;
type SortId = (typeof SORT_IDS)[number];

const SORT_KEYS: Record<SortId, TranslationKey> = {
  recent: "clips.sort.recent",
  views: "clips.sort.views",
  today: "clips.sort.today",
  all_time: "clips.sort.allTime",
};

const field =
  "w-full border border-zinc-800 bg-transparent py-2 ps-9 pe-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-zinc-600";
const textAction = "text-sm text-muted-foreground hover:text-foreground";

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function timeAgo(iso: string, t: typeof translate) {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "";
  const diff = Date.now() - parsed;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return t("clips.time.justNow");
  if (mins < 60) return t("clips.time.minutes", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("clips.time.hours", { n: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t("clips.time.days", { n: days });
  return new Date(parsed).toLocaleDateString("ar");
}

function normalizeClip(raw: unknown, fallbackTitle: string, fallbackViewer: string): Clip | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const url = typeof row.url === "string" ? row.url.trim() : "";
  if (!id || !url) return null;
  return {
    id,
    title: typeof row.title === "string" && row.title.trim() ? row.title.trim() : fallbackTitle,
    url,
    shareUrl: typeof row.shareUrl === "string" && row.shareUrl ? row.shareUrl : null,
    thumbnail: typeof row.thumbnail === "string" && row.thumbnail ? row.thumbnail : null,
    duration: typeof row.duration === "number" && Number.isFinite(row.duration) ? row.duration : 0,
    views: typeof row.views === "number" && Number.isFinite(row.views) ? row.views : 0,
    clippedBy:
      typeof row.clippedBy === "string" && row.clippedBy.trim() ? row.clippedBy.trim() : fallbackViewer,
    createdAt: typeof row.createdAt === "string" && row.createdAt ? row.createdAt : new Date(0).toISOString(),
    platform: typeof row.platform === "string" && row.platform ? row.platform : "KICK",
  };
}

function ClipsPage() {
  const { user } = Route.useRouteContext();
  const { data: workspace } = useWorkspace(user.id);
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const fetchClips = useServerFn(listChannelClips);
  const removeClip = useServerFn(deleteClip);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("recent");
  const [active, setActive] = useState<Clip | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const {
    data: clips = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["channel-clips"],
    queryFn: async (): Promise<Clip[]> => {
      try {
        const result = await fetchClips();
        const rows = Array.isArray(result) ? result : [];
        return rows
          .map((row) => normalizeClip(row, t("clips.fallbackTitle"), t("clips.fallbackViewer")))
          .filter((clip): clip is Clip => clip != null);
      } catch (error) {
        throw error instanceof Error ? error : new Error(t("clips.loadError"));
      }
    },
    retry: 1,
  });

  const del = useMutation({
    mutationFn: (id: string) => removeClip({ data: { id } }),
    onSuccess: (_result, id) => {
      if (active?.id === id) setActive(null);
      void queryClient.invalidateQueries({ queryKey: ["channel-clips"] });
      toast.success(t("clips.toast.deleted"));
    },
    onError: (error: Error) => toast.error(error.message || t("clips.toast.deleteFail")),
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = clips.filter(
      (clip) =>
        !term ||
        clip.title.toLowerCase().includes(term) ||
        clip.clippedBy.toLowerCase().includes(term),
    );
    if (sort === "today") {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      list = list.filter((clip) => {
        const created = Date.parse(clip.createdAt);
        return Number.isFinite(created) && created >= since;
      });
    }
    const sorted = [...list];
    if (sort === "recent") {
      sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } else {
      sorted.sort((a, b) => b.views - a.views);
    }
    return sorted;
  }, [clips, search, sort]);

  const copy = async (clip: Clip) => {
    try {
      await navigator.clipboard.writeText(clip.shareUrl ?? clip.url);
      setCopied(clip.id);
      setTimeout(() => setCopied((current) => (current === clip.id ? null : current)), 1600);
    } catch {
      toast.error(t("clips.toast.copyFail"));
    }
  };

  const share = async (clip: Clip) => {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: clip.title, url: clip.shareUrl ?? clip.url });
        return;
      } catch {
        /* user dismissed */
      }
    }
    await copy(clip);
  };

  return (
    <AppShell
      user={user}
      profile={workspace?.profile}
      title={t("clips.title")}
      subtitle={t("clips.subtitle")}
    >
      <div className="flex flex-col gap-10">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("clips.search")}
              aria-label={t("clips.search")}
              className={field}
              dir="auto"
            />
          </div>
          <div className="flex flex-wrap justify-start gap-x-5 gap-y-2">
            {SORT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className={`text-sm ${
                  sort === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(SORT_KEYS[id])}
              </button>
            ))}
          </div>
        </div>

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:gap-14">
          <div className="min-w-0 text-start">
            {active ? (
              <>
                <div className="aspect-video w-full bg-black">
                  <ClipPlayer src={active.url} poster={active.thumbnail ?? undefined} />
                </div>
                <h2 className="mt-5 text-[1.05rem] font-semibold" dir="auto">
                  {active.title}
                </h2>
                <p className="mt-1.5 text-[0.78rem] text-muted-foreground">
                  {t("clips.clippedBy")} <span dir="auto">@{active.clippedBy}</span> ·{" "}
                  {t("clips.views", { n: active.views })}
                  {active.createdAt ? ` · ${timeAgo(active.createdAt, t)}` : ""} ·{" "}
                  <span dir="ltr">{active.platform}</span>
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-start gap-x-5 gap-y-2">
                  <button type="button" onClick={() => void copy(active)} className={textAction}>
                    {copied === active.id ? (
                      <span className="inline-flex items-center gap-1">
                        <Check className="size-3.5" aria-hidden />
                        {t("clips.copied")}
                      </span>
                    ) : (
                      t("clips.copy")
                    )}
                  </button>
                  <button type="button" onClick={() => void share(active)} className={textAction}>
                    {t("clips.share")}
                  </button>
                  <a href={active.url} target="_blank" rel="noreferrer" className={textAction}>
                    {t("clips.download")}
                  </a>
                  <a href={active.url} target="_blank" rel="noreferrer" className={textAction}>
                    {t("clips.open")}
                  </a>
                  <button
                    type="button"
                    onClick={() => del.mutate(active.id)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    {t("clips.delete")}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("clips.pick")}</p>
            )}
          </div>

          <div className="min-w-0 text-start">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t("clips.loading")}</p>
            ) : isError ? (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">{t("clips.loadError")}</p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  className="rounded-full bg-[#bee1fc] px-4 py-1.5 text-sm font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {t("clips.retry")}
                </button>
              </div>
            ) : clips.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{t("clips.empty")}</p>
            ) : visible.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{t("clips.noneMatch")}</p>
            ) : (
              <ul className="max-h-[min(70vh,640px)] overflow-y-auto">
                {visible.map((clip) => {
                  const selected = active?.id === clip.id;
                  return (
                    <li key={clip.id} className="border-b border-zinc-800 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setActive(clip)}
                        className="flex w-full items-center gap-3 py-3 text-start"
                        aria-current={selected ? "true" : undefined}
                        aria-label={`${t("clips.play")} ${clip.title}`}
                      >
                        <span className="relative size-16 shrink-0 overflow-hidden bg-black/40">
                          {clip.thumbnail ? (
                            <img
                              src={clip.thumbnail}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <span className="flex size-full items-center justify-center">
                              <Video className="size-4 text-muted-foreground/50" aria-hidden />
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 text-start">
                          <span
                            className={`block truncate text-sm ${selected ? "text-foreground" : "text-foreground/90"}`}
                            dir="auto"
                          >
                            {clip.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.72rem] text-muted-foreground">
                            @{clip.clippedBy} ·{" "}
                            <span dir="ltr">{formatDuration(clip.duration)}</span> ·{" "}
                            {t("clips.views", { n: clip.views })}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
