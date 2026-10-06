import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactElement } from "react";
import {
  Gauge,
  Gift,
  Lock,
  MessageSquare,
  Pin,
  PlaySquare,
  Clock3,
  Sparkles,
  Timer,
  Trophy,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { InfoTip } from "@/components/ui/info-tip";
import { SaudiBusinessSeal } from "@/components/brand/SaudiBusinessSeal";
import { DeleteWidgetDialog } from "@/components/widgets/DeleteWidgetDialog";
import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/lib/supabase/client";
import { ToolCard } from "@/components/hub/ToolCard";
import { HubPlatformDot } from "@/components/hub/HubPlatformDot";
import {
  ALL_PLATFORMS,
  FILTER_ORDER,
  PLATFORM_META,
  type PlatformFilter,
  type PlatformId,
} from "@/components/hub/platforms";

import {
  ChatPreview,
  CustomGoalPreview,
  EmotePreview,
  SpotlightPreview,
  StreamEventsSchedulePreview,
  TappersPreview,
  TapGoalPreview,
  GoalTypePreview,
  MediaRequestPreview,
  TimerPreview,
} from "@/components/hub/previews";

function GiveawayPreview() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-3">
      <span className="grid size-10 place-items-center rounded-full border border-[#bee1fc]/35 bg-[#bee1fc]/12 text-[#bee1fc]">
        <Gift className="size-4" aria-hidden />
      </span>
      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">+1</p>
      <div className="flex gap-1">
        {["A", "B", "C"].map((letter) => (
          <span
            key={letter}
            className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[0.52rem] text-foreground/80"
          >
            @{letter}
          </span>
        ))}
      </div>
    </div>
  );
}
import {
  GOAL_TYPES,
  DEFAULT_GOAL_TYPE,
  goalOverlayParams,
  goalTypePreset,
  type GoalTypeId,
} from "@/lib/goalTypes";
import { useQuery } from "@tanstack/react-query";
import { getMediaRequestDashboard } from "@/lib/mediaRequests.functions";
import { useWidgets } from "@/hooks/useWidgets";
import { useWorkspace } from "@/hooks/useWorkspace";
import { createWidget, widgetErrorText } from "@/lib/createWidget";
import { useApplyDefaultPlatform } from "@/lib/defaultPlatform";
import type { WidgetType } from "@/lib/widgets";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { isTestMode } from "@/lib/testMode";
import { PRO_ONLY_HUB_TOOL_IDS } from "@/lib/plans";
import { DarkSelect } from "@/components/ui/dark-select";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Widget Hub" },
      {
        name: "description",
        content:
          "Discover, open and customize every streaming widget: timers, goals, alerts, chat, wheels, emote rain and more.",
      },
      { property: "og:title", content: "CylixStudio — Widget Hub" },
      {
        property: "og:description",
        content: "Everything you need to build, customize, and control your stream.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const HUB_INITIAL_VISIBLE = 12;
const HUB_LOAD_MORE = 8;

/** Hub tools that require an active Pro subscription (matches PLAN_FEATURES). */
const PRO_ONLY_TOOL_IDS = PRO_ONLY_HUB_TOOL_IDS;

type Tool = {
  id: string;
  /** Stable English name used for existing widget matching / create payload. */
  name: string;
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
  categoryKey: TranslationKey;
  icon: LucideIcon;
  preview: () => ReactElement;
  type?: WidgetType;
  keywords?: string;
  platforms: PlatformId[];
  comingSoon?: boolean;
};

const FILTER_KEYS: Record<PlatformFilter, TranslationKey> = {
  ALL: "home.filterAll",
  KICK: "home.filterKick",
  TWITCH: "home.filterTwitch",
  YOUTUBE: "home.filterYouTube",
  TIKTOK: "home.filterTikTok",
};

const TOOLS: Tool[] = [
  {
    id: "chat-box",
    name: "Chat box",
    nameKey: "home.tool.chatBox.name",
    descriptionKey: "home.tool.chatBox.desc",
    categoryKey: "cat.Chat",
    icon: MessageSquare,
    preview: ChatPreview,
    type: "CHAT_BOX",
    keywords: "chat messages live island bubbles transparent",
    platforms: [...ALL_PLATFORMS],
  },
  {
    id: "subathon-timer",
    name: "Subathon timer",
    nameKey: "home.tool.subathon.name",
    descriptionKey: "home.tool.subathon.desc",
    categoryKey: "cat.Subathon",
    icon: Timer,
    preview: TimerPreview,
    type: "SUBATHON_TIMER",
    keywords: "countdown subathon clock timer rules logic",
    platforms: [...ALL_PLATFORMS],
  },
  {
    id: "custom-goal",
    name: "Goal bar",
    nameKey: "home.tool.goalBar.name",
    descriptionKey: "home.tool.goalBar.desc",
    categoryKey: "cat.Goals",
    icon: Gauge,
    preview: CustomGoalPreview,
    type: "GOAL_BAR",
    keywords: "goal donation follower subscriber custom progress bar target",
    platforms: [...ALL_PLATFORMS],
  },
  {
    id: "chat-spotlight",
    name: "Chat spotlight",
    nameKey: "home.tool.spotlight.name",
    descriptionKey: "home.tool.spotlight.desc",
    categoryKey: "cat.Chat",
    icon: Pin,
    preview: SpotlightPreview,
    type: "CHAT_SPOTLIGHT",
    keywords: "spotlight pin highlight featured message chat",
    platforms: ["KICK", "TWITCH"],
  },
  {
    id: "stream-events-schedule",
    name: "Stream events schedule",
    nameKey: "home.tool.streamEvents.name",
    descriptionKey: "home.tool.streamEvents.desc",
    categoryKey: "cat.Utilities",
    icon: Clock3,
    preview: StreamEventsSchedulePreview,
    type: "STREAM_EVENTS_SCHEDULE",
    keywords: "schedule events countdown segments timeline up next on stream clock",
    platforms: [...ALL_PLATFORMS],
  },
  {
    id: "tiktok-tappers",
    name: "Top Tappers Overlay",
    nameKey: "home.tool.tappers.name",
    descriptionKey: "home.tool.tappers.desc",
    categoryKey: "cat.TikTok",
    icon: Trophy,
    preview: TappersPreview,
    type: "TIKTOK_TAPPERS",
    keywords: "tiktok taps likes leaderboard top tappers ranking",
    platforms: ["TIKTOK"],
    comingSoon: true,
  },
  {
    id: "tiktok-tap-goal",
    name: "TikTok Tap Goal Overlay",
    nameKey: "home.tool.tapGoal.name",
    descriptionKey: "home.tool.tapGoal.desc",
    categoryKey: "cat.TikTok",
    icon: Gauge,
    preview: TapGoalPreview,
    type: "TIKTOK_TAP_GOAL",
    keywords: "tiktok taps likes goal target progress bar confetti",
    platforms: ["TIKTOK"],
    comingSoon: true,
  },
  {
    id: "kick-media-requests",
    name: "Media Requests",
    nameKey: "home.tool.mediaRequests.name",
    descriptionKey: "home.tool.mediaRequests.desc",
    categoryKey: "cat.Kick",
    icon: PlaySquare,
    preview: MediaRequestPreview,
    keywords: "media request song request youtube spotify anghami soundcloud kick channel points queue player donation support",
    platforms: ["KICK"],
  },
  {
    id: "giveaway",
    name: "Giveaway",
    nameKey: "home.tool.giveaway.name",
    descriptionKey: "home.tool.giveaway.desc",
    categoryKey: "cat.Utilities",
    icon: Gift,
    preview: GiveawayPreview,
    keywords: "giveaway raffle keyword winner draw chat",
    platforms: [...ALL_PLATFORMS],
  },
  {
    id: "emote-rain",
    name: "Emote rain",
    nameKey: "home.tool.emoteRain.name",
    descriptionKey: "home.tool.emoteRain.desc",
    categoryKey: "cat.Utilities",
    icon: Sparkles,
    preview: EmotePreview,
    type: "EMOTE_RAIN",
    keywords: "emote rain particles hype gifts",
    platforms: ["KICK", "TWITCH"],
  },
];

function HomePage() {
  const { user } = Route.useRouteContext();
  const userId = user?.id ?? "";
  const { data: workspace } = useWorkspace(userId);
  const widgets = useWidgets();
  const mediaRequests = useQuery({
    queryKey: ["media-requests"],
    queryFn: () => getMediaRequestDashboard(),
    staleTime: 60_000,
    enabled: !isTestMode(),
  });
  const mediaOverlayUrl = mediaRequests.data?.overlayUrl ?? undefined;
  const subscription = useSubscription(userId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const needsPro = subscription.isSuccess && !subscription.data.isActive;
  const lockLabel = t("home.unlockPro");

  const toolLocked = (tool: Tool) => needsPro && PRO_ONLY_TOOL_IDS.has(tool.id);

  const openWidget = async (widgetId: string) => {
    await navigate({ to: "/widgets/$widgetId", params: { widgetId } });
  };

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goalModal, setGoalModal] = useState(false);
  const [goalType, setGoalType] = useState<GoalTypeId>(DEFAULT_GOAL_TYPE);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [visibleCount, setVisibleCount] = useState(HUB_INITIAL_VISIBLE);
  useApplyDefaultPlatform(workspace?.profile?.default_platform, (platform) => {
    setPlatformFilter(platform);
  });

  const visibleTools = TOOLS.filter(
    (tool) => platformFilter === "ALL" || tool.platforms.includes(platformFilter),
  ).sort((a, b) => Number(Boolean(a.comingSoon)) - Number(Boolean(b.comingSoon)));
  const shownTools = visibleTools.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(HUB_INITIAL_VISIBLE);
  }, [platformFilter]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeleting(true);
    setError(null);
    try {
      const { error: writeError } = await supabase.from("widgets").delete().eq("id", target.id);
      if (writeError) throw writeError;
      setPendingDelete(null);
      setRemovingId(target.id);
      // Let the card fade/scale out before the query cache drops it.
      await new Promise((resolve) => setTimeout(resolve, 260));
      await queryClient.invalidateQueries({ queryKey: ["widgets"] });
      setRemovingId(null);
    } catch (err) {
      setError(widgetErrorText(err, "Could not delete this widget."));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const goalWidgets = widgets.data?.widgets.filter((widget) => widget.type === "GOAL_BAR") ?? [];

  const existingFor = (tool: Tool) =>
    tool.id === "custom-goal"
      ? (goalWidgets[0] ?? null)
      : tool.type
        ? (widgets.data?.widgets.find((widget) => widget.type === tool.type) ?? null)
        : null;

  const goalPreset = goalTypePreset(goalType);

  const createGoalWidget = async () => {
    setError(null);
    setBusy("custom-goal");
    try {
      const widget = await createWidget({
        userId,
        subathonId: workspace?.subathons[0]?.id ?? null,
        type: "GOAL_BAR",
        name: `${goalPreset.title}`,
        goalType,
      });
      await queryClient.invalidateQueries({ queryKey: ["widgets"] });
      setGoalModal(false);
      await openWidget(widget.id);
    } catch (err) {
      console.error("[dashboard] create goal failed", err);
      setError(widgetErrorText(err, "Could not create this goal."));
    } finally {
      setBusy(null);
    }
  };

  const open = async (tool: Tool) => {
    if (tool.comingSoon) return;
    if (toolLocked(tool)) {
      await navigate({ to: "/subscription" });
      return;
    }
    if (tool.id === "custom-goal") {
      setGoalModal(true);
      return;
    }
    if (tool.id === "kick-media-requests") {
      try {
        await navigate({ to: "/media-requests" });
      } catch (err) {
        console.error("[dashboard] open media-requests failed", err);
        setError(widgetErrorText(err, "Could not open this tool."));
      }
      return;
    }
    if (tool.id === "giveaway") {
      try {
        await navigate({ to: "/giveaway" });
      } catch (err) {
        console.error("[dashboard] open giveaway failed", err);
        setError(widgetErrorText(err, "Could not open this tool."));
      }
      return;
    }

    if (!tool.type) {
      setError("This tool has no openable route yet.");
      return;
    }
    setError(null);
    const existing = existingFor(tool);
    if (existing) {
      try {
        await openWidget(existing.id);
      } catch (err) {
        console.error("[dashboard] navigate to widget failed", err);
        setError(widgetErrorText(err, "Could not open this tool."));
      }
      return;
    }
    // Wait until the widget list is known so a slow load cannot insert a second
    // row (and a second OBS token) for a tool that already exists.
    if (widgets.isPending) return;
    setBusy(tool.id);
    try {
      const widget = await createWidget({
        userId,
        subathonId: workspace?.subathons[0]?.id ?? null,
        type: tool.type,
        name: tool.name,
      });
      await queryClient.invalidateQueries({ queryKey: ["widgets"] });
      await openWidget(widget.id);
    } catch (err) {
      console.error("[dashboard] open tool failed", { toolId: tool.id, err });
      setError(widgetErrorText(err, "Could not open this tool."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell
      user={user}
      profile={workspace?.profile}
      title={t("home.title")}
      subtitle={t("home.subtitle")}
    >
      <SessionAwareError error={error} signedOutLabel={t("widget.signedOut")} boxed={false} />

      {needsPro ? (
        <div className="glass-3d mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 p-4">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <Lock className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[0.85rem] font-medium">{t("home.freePlan")}</p>
            <p className="text-[0.76rem] text-muted-foreground">{t("home.freePlan.hint")}</p>
          </div>
          <button
            type="button"
            onClick={() => void navigate({ to: "/subscription" })}
            className="ms-auto rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("home.unlockPro")}
          </button>
        </div>
      ) : null}

      <div
        role="toolbar"
        aria-label={t("home.platformFilter")}
        className="mb-5 flex flex-wrap items-center gap-1 overflow-visible px-0.5"
        style={{ overflow: "visible" }}
      >
        <InfoTip text={t("tooltips.home.platformFilter")} />
        {FILTER_ORDER.map((id) => {
          const active = platformFilter === id;
          const color = id === "ALL" ? "var(--foreground)" : PLATFORM_META[id].color;
          const label = t(FILTER_KEYS[id]);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setPlatformFilter((prev) => (prev === id && id !== "ALL" ? "ALL" : id))}
              className={`inline-flex items-center gap-1.5 overflow-visible rounded-full px-3 py-1.5 text-[0.72rem] leading-none transition-colors ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              style={{
                overflow: "visible",
                ...(active && id !== "ALL" ? { color } : {}),
              }}
            >
              {id === "ALL" ? (
                <span className="inline-flex items-center gap-1.5 overflow-visible" aria-hidden>
                  {ALL_PLATFORMS.map((dot) => (
                    <HubPlatformDot key={dot} id={dot} />
                  ))}
                </span>
              ) : (
                <HubPlatformDot id={id} />
              )}
              {label}
            </button>
          );
        })}
      </div>

      {visibleTools.length === 0 ? (
        <p className="py-12 text-sm text-muted-foreground">{t("home.empty")}</p>
      ) : (
        <>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
            {shownTools.map((tool) => {
              const existing = existingFor(tool);
              const Preview = tool.preview;
              const locked = toolLocked(tool);
              return (
                <ToolCard
                  key={tool.id}
                  name={t(tool.nameKey)}
                  description={t(tool.descriptionKey)}
                  category={t(tool.categoryKey)}
                  icon={tool.icon}
                  platforms={tool.platforms}
                  comingSoon={Boolean(tool.comingSoon)}
                  preview={<Preview />}
                  status={
                    tool.id === "kick-media-requests"
                      ? t("home.status.live")
                      : existing?.is_enabled
                        ? t("home.status.live")
                        : existing
                          ? t("home.status.paused")
                          : t("home.status.ready")
                  }
                  live={Boolean(existing?.is_enabled)}
                  publicToken={
                    existing?.is_enabled && !tool.comingSoon ? existing.public_token : undefined
                  }
                  overlayUrl={
                    tool.id === "kick-media-requests" && !tool.comingSoon
                      ? mediaOverlayUrl
                      : undefined
                  }
                  disabled={busy === tool.id}
                  actionLabel={
                    tool.id === "kick-media-requests"
                      ? t("home.action.openQueue")
                      : busy === tool.id
                        ? t("home.action.opening")
                        : existing
                          ? t("home.action.customize")
                          : t("home.action.open")
                  }
                  onOpen={() => void open(tool)}
                  removing={Boolean(existing && removingId === existing.id)}
                  deleteLabel={t("home.delete")}
                  locked={locked}
                  lockLabel={lockLabel}
                  onDelete={
                    existing && !locked
                      ? () => setPendingDelete({ id: existing.id, name: existing.name })
                      : undefined
                  }
                />
              );
            })}
          </div>
          {visibleTools.length > visibleCount ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + HUB_LOAD_MORE)}
                className="rounded-full px-3 py-1.5 text-[0.78rem] text-muted-foreground hover:text-foreground"
              >
                {t("home.loadMore")}
              </button>
            </div>
          ) : null}
        </>
      )}

      <SaudiBusinessSeal />

      {goalModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Customize custom goal"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setGoalModal(false)}
        >
          <div
            className="glass-3d w-full max-w-lg rounded-2xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-base font-medium tracking-tight">Custom goal</h2>
            <p className="mt-1 text-[0.78rem] text-muted-foreground">
              Pick a goal type — targets, labels, triggers, colors and the OBS URL update instantly.
            </p>

            {goalWidgets.length > 0 ? (
              <div className="mt-4 space-y-1.5">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Your goals
                </p>
                {goalWidgets.map((widget) => (
                  <div
                    key={widget.id}
                    className="flex items-center gap-2 rounded-xl border border-[oklch(1_0_0/0.08)] px-3 py-2 text-[0.78rem]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setGoalModal(false);
                        navigate({ to: "/widgets/$widgetId", params: { widgetId: widget.id } });
                      }}
                      className="flex min-w-0 flex-1 items-center justify-between hover:text-primary"
                    >
                      <span className="truncate">{widget.name}</span>
                      <span className="text-[0.68rem] text-muted-foreground">Edit</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`${t("home.delete")}: ${widget.name}`}
                      onClick={() => {
                        setGoalModal(false);
                        setPendingDelete({ id: widget.id, name: widget.name });
                      }}
                      className="rounded-xl bg-[oklch(1_0_0/0.05)] p-1.5 text-muted-foreground transition-all duration-200 hover:scale-110 hover:bg-red-500/20 hover:text-red-400"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ))}

              </div>
            ) : null}

            <label className="mt-4 block text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Goal type
            </label>
            <DarkSelect
              value={goalType}
              onValueChange={(next) => setGoalType(next as GoalTypeId)}
              className="mt-2 w-full"
              options={GOAL_TYPES.map((preset) => ({
                value: preset.id,
                label: `${preset.emoji} ${preset.labelEn}`,
              }))}
            />

            <div className="mt-4 h-[120px] overflow-hidden rounded-xl border border-[oklch(1_0_0/0.06)] bg-[oklch(1_0_0/0.02)]">
              <GoalTypePreview
                label={goalPreset.overlayLabel}
                current={goalPreset.previewCurrent}
                target={goalPreset.target}
                unit={goalPreset.unit}
                accent={goalPreset.accentColor}
              />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2 text-[0.72rem]">
              <div className="rounded-xl border border-[oklch(1_0_0/0.06)] p-2.5">
                <dt className="text-muted-foreground">Target</dt>
                <dd className="mt-0.5 font-medium">
                  {goalPreset.target.toLocaleString()} {goalPreset.unit}
                </dd>
              </div>
              <div className="rounded-xl border border-[oklch(1_0_0/0.06)] p-2.5">
                <dt className="text-muted-foreground">Triggers</dt>
                <dd className="mt-0.5 font-medium">{goalPreset.triggers.join(", ")}</dd>
              </div>
            </dl>

            <p className="mt-3 truncate rounded-xl border border-[oklch(1_0_0/0.06)] px-2.5 py-2 font-mono text-[0.68rem] text-muted-foreground">
              /overlay/&lt;token&gt;{goalOverlayParams(goalType)}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGoalModal(false)}
                className="rounded-xl border border-[oklch(1_0_0/0.1)] px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy === "custom-goal"}
                onClick={() => void createGoalWidget()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy === "custom-goal" ? "Creating…" : "Create goal"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <DeleteWidgetDialog
          widgetName={pendingDelete.name}
          pending={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </AppShell>
  );
}
