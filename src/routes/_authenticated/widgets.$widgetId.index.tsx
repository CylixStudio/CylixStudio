import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { DeleteWidgetDialog } from "@/components/widgets/DeleteWidgetDialog";
import { StandaloneWidgetFields } from "@/components/widgets/StandaloneWidgetFields";
import { LayoutPicker } from "@/components/widgets/LayoutPicker";
import { TestSimulatePanel } from "@/components/widgets/TestSimulatePanel";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { wheelSpinLockMs } from "@/components/widgets/SpinWheel";
import { SubathonElementControlPanel } from "@/components/widgets/SubathonElementControlPanel";
import { SubathonTimerSidebar } from "@/components/widgets/SubathonTimerSidebar";
import { SpotlightControlPanel } from "@/components/widgets/SpotlightControlPanel";
import { StreamEventsScheduleControlPanel } from "@/components/widgets/StreamEventsScheduleControlPanel";
import { PollControlPanel } from "@/components/widgets/PollControlPanel";
import { PredictionControlPanel } from "@/components/widgets/PredictionControlPanel";
import { parsePollRuntime, parsePredictionRuntime } from "@/lib/interactiveWidgets";
import { isDynamicGoalWidget, isSplitGoalKind, parseSpotlightConfig, parseStreamEventsScheduleState } from "@/lib/widgets";
import { STANDALONE_TOOLS } from "@/lib/standaloneTools";
import { supabase } from "@/lib/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { syncGoalFollowers } from "@/lib/goals.functions";
import { notePlanError } from "@/components/subscription/upgradePlan";
import { saveWidgetSettings } from "@/lib/widgets.functions";
import { useWidgetStream } from "@/hooks/useWidgetStream";
import { useWorkspace } from "@/hooks/useWorkspace";
import { parseOverlayTheme } from "@/lib/overlayTheme";
import { useLanguage } from "@/lib/i18n";
import { ensureWidgetSubathon, widgetErrorText } from "@/lib/createWidget";
import { SIGNED_OUT_ERROR, isMissingViewerSession } from "@/lib/supabase/sessionError";
import { isTestMode } from "@/lib/testMode";
import { parseChromeLayout, CHROME_LAYOUTS } from "@/lib/widgetLayouts";
import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { widgetOverlayUrl } from "@/lib/widgetOverlayUrl";
import { DarkSelect } from "@/components/ui/dark-select";
import { InfoTip } from "@/components/ui/info-tip";
import {
  CHAT_LAYOUTS,
  WIDGET_LABEL,
  parseChatConfig,
  parseEmoteRainConfig,
  parseGoalConfig,
  parseSpinConfig,
  pickWeightedPrize,
  parseStreamEventsScheduleConfig,
  parseTappersConfig,
  parseTapGoalConfig,
  TAPGOAL_DESIGNS,
  TAPPERS_LAYOUTS,

  TAPPERS_LIMITS,
  type WidgetType,
} from "@/lib/widgets";

type WidgetRecord = {
  id: string;
  name: string;
  type: WidgetType;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
  public_token: string;
  is_enabled: boolean;
  subathon_id: string | null;
};

type GoalRecord = {
  id: string;
  title: string;
  unit: string;
  target_value: number;
  current_value: number;
};

export const Route = createFileRoute("/_authenticated/widgets/$widgetId/")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Widget Builder" },
      {
        name: "description",
        content:
          "Customise fonts, colours, layout and behaviour for your OBS widget with a live preview.",
      },
      { property: "og:title", content: "CylixStudio — Widget Builder" },
      {
        property: "og:description",
        content: "Design your overlay widget and copy its OBS browser-source URL.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WidgetBuilder,
});

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const labelClass = "text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground";

function WidgetBuilder() {
  const { user } = Route.useRouteContext();
  const userId = user?.id ?? "";
  const signedOutViewer = userId.length === 0 || isTestMode();
  const { widgetId } = Route.useParams();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { data: workspace } = useWorkspace(userId);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const widgetQuery = useQuery({
    queryKey: ["widget", widgetId],
    enabled: Boolean(widgetId) && !signedOutViewer,
    queryFn: async () => {
      try {
      const [widget, goal] = await Promise.all([
        supabase
          .from("widgets")
          .select("id, name, type, config, state, public_token, is_enabled, subathon_id")
          .eq("id", widgetId)
          .single(),
        supabase
          .from("goals")
          .select("id, title, unit, target_value, current_value")
          .eq("widget_id", widgetId)
          .maybeSingle(),
      ]);
      if (widget.error) {
        if (isMissingViewerSession(widget.error)) return null;
        throw widget.error;
      }
      if (!widget.data) return null;
      return {
        widget: widget.data as unknown as WidgetRecord,
        goal: goal.data
          ? ({
              ...goal.data,
              target_value: Number(goal.data.target_value),
              current_value: Number(goal.data.current_value),
            } as GoalRecord)
          : null,
      };
      } catch (caught) {
        if (isMissingViewerSession(caught)) return null;
        throw caught;
      }
    },
  });

  const widget = widgetQuery.data?.widget ?? null;
  const goalRow = widgetQuery.data?.goal ?? null;

  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [goalDraft, setGoalDraft] = useState({ title: "", unit: "USD", target: 0, current: 0 });
  const [goalPane, setGoalPane] = useState<"setup" | "control">("setup");
  const [goalBump, setGoalBump] = useState("");
  const subathonSeeded = useRef<string | null>(null);

  useEffect(() => {
    if (!widget) return;
    setName(widget.name);
    setConfig({ ...(widget.config ?? {}) });
    // Hydrate once per widget. A later refetch must not wipe prizes typed in the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget?.id]);

  useEffect(() => {
    if (!goalRow) return;
    setGoalDraft({
      title: goalRow.title,
      unit: goalRow.unit,
      target: goalRow.target_value,
      current: goalRow.current_value,
    });
  }, [goalRow?.id, goalRow]);

  useEffect(() => {
    if (!widget || widget.type !== "SUBATHON_TIMER") return;
    if (subathonSeeded.current === widget.id && widget.subathon_id) return;
    let cancelled = false;
    void ensureWidgetSubathon(widget.id, { seedTimer: true })
      .then(() => {
        if (cancelled) return;
        subathonSeeded.current = widget.id;
        if (!widget.subathon_id) {
          void queryClient.invalidateQueries({ queryKey: ["widget", widgetId] });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(widgetErrorText(err, "Could not prepare the subathon timer."));
      });
    return () => {
      cancelled = true;
    };
  }, [queryClient, widget, widgetId]);

  const stream = useWidgetStream(widget?.is_enabled ? (widget?.public_token ?? null) : null);
  const saveWidget = useServerFn(saveWidgetSettings);

  const save = useMutation({
    mutationFn: async () => {
      await saveWidget({
        data: {
          widgetId,
          name: name.trim() || WIDGET_LABEL[widget!.type],
          config,
          goal: goalRow
            ? {
                id: goalRow.id,
                title: goalDraft.title,
                unit: goalDraft.unit,
                target: goalDraft.target,
                current: goalDraft.current,
              }
            : null,
        },
      });
    },
    onError: (err: Error) => {
      if (notePlanError(err)) return;
      const message = widgetErrorText(err, "Could not save this widget.");
      setError(message);
      if (!isMissingViewerSession(message)) toast.error(message);
    },
    onSuccess: async () => {
      setError(null);
      toast.success("Widget saved");
      await queryClient.invalidateQueries({ queryKey: ["widget", widgetId] });
      await queryClient.invalidateQueries({ queryKey: ["widgets"] });
    },
  });

  const navigate = useNavigate();

  useEffect(() => {
    if (!widget || !isSplitGoalKind(widget.type)) return;
    const spec = STANDALONE_TOOLS.find((tool) => tool.type === widget.type);
    if (!spec) return;
    void navigate({ to: "/tools/$tool", params: { tool: spec.slug }, replace: true });
  }, [navigate, widget]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = useMutation({
    mutationFn: async () => {
      const { error: writeError } = await supabase.from("widgets").delete().eq("id", widgetId);
      if (writeError) throw writeError;
    },
    onError: (err: Error) => {
      setConfirmDelete(false);
      const message = widgetErrorText(err, "Could not delete this widget.");
      setError(message);
      if (!isMissingViewerSession(message)) toast.error(message);
    },
    onSuccess: async () => {
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: ["widgets"] });
      navigate({ to: "/dashboard" });
    },
  });

  const runSyncFollowers = useServerFn(syncGoalFollowers);
  const syncFollowers = useMutation({
    mutationFn: async () => runSyncFollowers({ data: { widgetId } }),
    onError: (err: Error) => {
      const message = widgetErrorText(err, "Could not sync followers.");
      setError(message);
      if (!isMissingViewerSession(message)) toast.error(message);
    },
    onSuccess: async (result) => {
      setError(null);
      if ("total" in result && typeof result.total === "number") {
        setGoalDraft((prev) => ({ ...prev, current: result.total }));
      }
      await queryClient.invalidateQueries({ queryKey: ["widget", widgetId] });
    },
  });

  const spinPrizes = useMemo(() => parseSpinConfig(config).prizes, [config]);
  const [wheelTurning, setWheelTurning] = useState(false);
  const wheelTimer = useRef<number | null>(null);

  const spin = useMutation({
    mutationFn: async () => {
      const result = pickWeightedPrize(spinPrizes);
      if (!result) return null;
      const nonce = Date.now();
      const { error: writeError } = await supabase
        .from("widgets")
        .update({ state: { spin: { result, spunAt: new Date().toISOString(), nonce } } as never })
        .eq("id", widgetId);
      if (writeError) throw writeError;
      return result;
    },
    onError: (err: Error) => {
      const message = widgetErrorText(err, "Could not spin the wheel.");
      setError(message);
      if (!isMissingViewerSession(message)) toast.error(message);
    },
  });

  const requestWheelSpin = () => {
    if (wheelTurning || spin.isPending || spinPrizes.length === 0) return;
    setWheelTurning(true);
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      setWheelTurning(false);
      wheelTimer.current = null;
    }, wheelSpinLockMs());
    spin.mutate();
  };

  const bumpGoal = async (delta: number) => {
    if (!goalRow || !Number.isFinite(delta) || delta === 0) return;
    const next = Math.max(0, Number((goalDraft.current + delta).toFixed(2)));
    setGoalDraft((prev) => ({ ...prev, current: next }));
    const { error: writeError } = await supabase.from("goals").update({ current_value: next }).eq("id", goalRow.id);
    if (writeError) {
      const message = widgetErrorText(writeError, "Could not update the goal.");
      if (isMissingViewerSession(message)) setError(message);
      else toast.error(message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["widget", widgetId] });
  };

  const copyUrl = async () => {
    if (!widget) return;
    if (!widget.is_enabled) {
      toast.error("Enable the widget before copying an OBS URL.");
      return;
    }
    if (widget.type === "TIKTOK_TAPPERS" || widget.type === "TIKTOK_TAP_GOAL") {
      toast.error("TikTok overlays are Coming Soon until OAuth is ready.");
      return;
    }
    const url = widgetOverlayUrl(window.location.origin, widget.public_token);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("OBS URL copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const set = (key: string, value: unknown) => setConfig((prev) => ({ ...prev, [key]: value }));


  const scheduleStyle =
    widget?.type === "STREAM_EVENTS_SCHEDULE" ? parseStreamEventsScheduleConfig(config) : null;
  const style =
    scheduleStyle ??
    (widget?.type === "GOAL_BAR"
      ? parseGoalConfig(config)
      : widget?.type === "CHAT_BOX"
          ? parseChatConfig(config)
          : widget?.type === "SPIN_WHEEL"
            ? parseSpinConfig(config)
            : widget?.type === "EMOTE_RAIN"
              ? parseEmoteRainConfig(config)
              : parseOverlayTheme(config));

  return (
    <AppShell
      user={user}
      profile={workspace?.profile}
      subathons={workspace?.subathons ?? []}
      title={
        widget
          ? widget.type === "EVENT_LABELS" &&
            ["Event labels", "Latest events", "تسميات الأحداث", "آخر الأحداث"].includes(widget.name)
            ? t("home.tool.eventLabels.name")
            : widget.type === "KICKS_GOAL" && ["Kicks Goal", "هدف الكيكس"].includes(widget.name)
              ? t("home.tool.kicksGoal.name")
              : widget.name
          : "Widget builder"
      }
      subtitle={widget ? WIDGET_LABEL[widget.type] : "Loading…"}
      actions={
        widget ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!widget.is_enabled || widget.type === "TIKTOK_TAPPERS" || widget.type === "TIKTOK_TAP_GOAL"}
              title={
                !widget.is_enabled
                  ? "Enable the widget to copy an OBS URL"
                  : widget.type === "TIKTOK_TAPPERS" || widget.type === "TIKTOK_TAP_GOAL"
                    ? "TikTok overlays are Coming Soon"
                    : "Copy OBS browser-source URL"
              }
              onClick={() => void copyUrl()}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              Copy OBS URL
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null
      }
    >
      <SessionAwareError
        error={
          error ??
          (widgetQuery.error ? widgetErrorText(widgetQuery.error, "Could not load this widget.") : null) ??
          (signedOutViewer && !widget ? SIGNED_OUT_ERROR : null)
        }
        signedOutLabel={t("widget.signedOut")}
      />

      {!widget ? (
        signedOutViewer || isMissingViewerSession(widgetQuery.error) ? (
          <div className="grid min-h-[420px] place-items-center rounded-2xl border border-border bg-[repeating-conic-gradient(#16171d_0%_25%,#101116_0%_50%)] bg-[length:32px_32px] p-6">
            <WidgetRenderer
              type="CHAT_BOX"
              config={{}}
              frame={null}
              remaining={0}
              goal={null}
              events={[]}
              spin={null}
              chat={null}
              demo
            />
          </div>
        ) : widgetQuery.isError ? null : (
          <p className="text-sm text-muted-foreground">Loading widget…</p>
        )
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_1fr]">
          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            {widget.type === "SUBATHON_TIMER" ? (
              <SubathonTimerSidebar
                widgetId={widget.id}
                subathonId={widget.subathon_id ?? null}
                publicToken={widget.public_token}
                name={name}
                onNameChange={setName}
                config={config}
                onConfigChange={set}
                frame={stream.frame}
                remaining={stream.remaining}
                onSaveConfig={() => save.mutateAsync()}
                onCopyUrl={() => void copyUrl()}
                copied={copied}
                lang={"en"}
              />
            ) : (
            <>
            <label className="block">
              <span className={labelClass}>Name</span>
              <input
                className={`${fieldClass} mt-2`}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <p className={`${labelClass} pt-1`}>
              {"⚙️ Display & badges"}
            </p>

            {widget.type !== "CHAT_BOX" ? (
              <div className="space-y-4 rounded-xl border border-border bg-background p-4">
                <label className="block">
                  <span className={`${labelClass} inline-flex items-center gap-1.5`}>
                    {"Font size"} ({style.fontSize}px)
                    <InfoTip text={t("tooltips.widget.fontSize")} />
                  </span>
                  <input
                    type="range"
                    min={12}
                    max={160}
                    className="mt-3 w-full accent-primary"
                    value={style.fontSize}
                    onChange={(event) => set("fontSize", Number(event.target.value))}
                  />
                </label>
              </div>
            ) : null}



            {widget.type === "GOAL_BAR" && goalRow ? (
              <div className="space-y-3">
                <div role="tablist" aria-label="Goal" className="flex gap-1 rounded-xl border border-white/8 bg-black/20 p-1">
                  {(
                    [
                      ["setup", "الإعدادات"],
                      ["control", "التحكم بالهدف"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={goalPane === id}
                      onClick={() => setGoalPane(id)}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-[0.72rem] font-semibold ${
                        goalPane === id
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {goalPane === "setup" ? (
              <div className="space-y-4 rounded-xl border border-border bg-background p-4">
                <label className="block">
                  <span className={labelClass}>Goal title</span>
                  <input
                    className={`${fieldClass} mt-2`}
                    value={goalDraft.title}
                    onChange={(event) =>
                      setGoalDraft((prev) => ({ ...prev, title: event.target.value }))
                    }
                  />
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <label>
                    <span className={`${labelClass} inline-flex items-center gap-1.5`}>
                      Unit
                      <InfoTip text={t("tooltips.widget.goalUnit")} />
                    </span>
                    <input
                      className={`${fieldClass} mt-2`}
                      value={goalDraft.unit}
                      onChange={(event) =>
                        setGoalDraft((prev) => ({ ...prev, unit: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span className={`${labelClass} inline-flex items-center gap-1.5`}>
                      Target
                      <InfoTip text={t("tooltips.widget.goalTarget")} />
                    </span>
                    <input
                      type="number"
                      className={`${fieldClass} mt-2`}
                      value={goalDraft.target}
                      onChange={(event) =>
                        setGoalDraft((prev) => ({ ...prev, target: Number(event.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    <span className={`${labelClass} inline-flex items-center gap-1.5`}>
                      Current
                      <InfoTip text={t("tooltips.widget.goalCurrent")} />
                    </span>
                    <input
                      type="number"
                      className={`${fieldClass} mt-2`}
                      value={goalDraft.current}
                      onChange={(event) =>
                        setGoalDraft((prev) => ({ ...prev, current: Number(event.target.value) }))
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => syncFollowers.mutate()}
                  disabled={syncFollowers.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  <RefreshCw
                    className={`size-4 ${syncFollowers.isPending ? "animate-spin" : ""}`}
                    aria-hidden
                  />
                  {syncFollowers.isPending
                    ? "Syncing…"
                    : "Sync Current Followers"}
                </button>
                <p className="text-[10px] text-muted-foreground">
                  {"Pulls the live follower count from your connected Twitch or Kick account."}
                </p>
              </div>
                ) : (
                  <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                    <p className="font-mono text-2xl font-bold tabular-nums">
                      <span dir="ltr">{goalDraft.current.toLocaleString("en-US")}</span>
                      <span className="text-sm text-muted-foreground">
                        {" / "}
                        <span dir="ltr">{goalDraft.target.toLocaleString("en-US")}</span>
                        {" "}
                        {goalDraft.unit}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[1, 5, 10, 25, 50, 100].map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:border-primary hover:text-primary"
                          onClick={() => void bumpGoal(amount)}
                        >
                          +{amount}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:border-primary hover:text-primary"
                        onClick={() => void bumpGoal(-5)}
                      >
                        −5
                      </button>
                    </div>
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const value = Number(goalBump);
                        if (!Number.isFinite(value) || value === 0) return;
                        void bumpGoal(value);
                        setGoalBump("");
                      }}
                    >
                      <input
                        inputMode="decimal"
                        placeholder="Custom amount"
                        value={goalBump}
                        onChange={(event) => setGoalBump(event.target.value)}
                        className={`${fieldClass} flex-1`}
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                      >
                        Apply
                      </button>
                    </form>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => void bumpGoal(-goalDraft.current)}
                    >
                      Reset progress
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {widget.type === "KICKS_GOAL" ||
            widget.type === "VIEWER_COUNTER" ||
            widget.type === "SPIN_WHEEL" ||
            widget.type === "EVENT_LABELS" ? (
              <StandaloneWidgetFields
                type={widget.type}
                config={config}
                set={set}
                spinning={wheelTurning || spin.isPending}
                onSpin={widget.type === "SPIN_WHEEL" ? requestWheelSpin : undefined}
              />
            ) : null}

            {widget.type === "CHAT_BOX" ? (
              <div className="space-y-4 rounded-xl border border-border bg-background p-4">
                <label className="block">
                  <span className={labelClass}>
                    {"Message layout style"}
                  </span>
                  <DarkSelect
                    className="mt-2"
                    value={parseChatConfig(config).chatLayout}
                    onValueChange={(next) => set("chatLayout", next)}
                    options={CHAT_LAYOUTS.map((entry) => ({
                      value: entry.value,
                      label: entry.label,
                    }))}
                  />
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {
                      CHAT_LAYOUTS.find((e) => e.value === parseChatConfig(config).chatLayout)
                        ?.hint
                    }
                  </span>
                </label>

                <label className="block">
                  <span className={`${labelClass} inline-flex items-center gap-1.5`}>
                    Messages shown ({parseChatConfig(config).maxMessages})
                    <InfoTip text={t("tooltips.widget.chatMax")} />
                  </span>
                  <input
                    type="range"
                    min={3}
                    max={25}
                    className="mt-3 w-full accent-primary"
                    value={parseChatConfig(config).maxMessages}
                    onChange={(event) => set("maxMessages", Number(event.target.value))}
                  />
                </label>

                <label className="block">
                  <span className={`${labelClass} inline-flex items-center gap-1.5`}>
                    {"Message spacing"} (
                    {parseChatConfig(config).messageGap}px)
                    <InfoTip text={t("tooltips.widget.chatGap")} />
                  </span>
                  <input
                    type="range"
                    min={4}
                    max={20}
                    className="mt-3 w-full accent-primary"
                    value={parseChatConfig(config).messageGap}
                    onChange={(event) => set("messageGap", Number(event.target.value))}
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>
                    {"Text size"} (
                    {Math.min(28, Math.max(12, parseChatConfig(config).fontSize))}px)
                  </span>
                  <input
                    type="range"
                    min={12}
                    max={28}
                    className="mt-3 w-full accent-primary"
                    value={Math.min(28, Math.max(12, parseChatConfig(config).fontSize))}
                    onChange={(event) => set("fontSize", Number(event.target.value))}
                  />
                </label>

                <ToggleField
                  label={"Show platform badge"}
                  hint={
                    "Hides the Twitch / Kick / TikTok tag next to the username"
                  }
                  checked={parseChatConfig(config).showPlatform}
                  onChange={(next) => set("showPlatform", next)}
                />

                <ToggleField
                  label={"Show account badges"}
                  hint="👑 Broadcaster · 🛡️ Moderator · 💎 Sub/VIP · 🎵 TikTok gifter"
                  checked={parseChatConfig(config).showBadges}
                  onChange={(next) => set("showBadges", next)}
                />
              </div>
            ) : null}

            

            {widget.type === "TIKTOK_TAP_GOAL" ? (
              <div className="space-y-4 rounded-xl border border-border bg-background p-4">
                <p className={labelClass}>
                  {"🎯 Tap goal"}
                </p>
                <label className="block">
                  <span className={labelClass}>
                    {"Design layout"}
                  </span>
                  <DarkSelect
                    className="mt-2"
                    value={parseTapGoalConfig(config).design}
                    onValueChange={(next) => set("design", next)}
                    options={TAPGOAL_DESIGNS.map((entry) => ({
                      value: entry.value,
                      label: entry.label,
                    }))}
                  />
                </label>

                <label className="block">
                  <span className={labelClass}>{"Goal title"}</span>
                  <input
                    className={`${fieldClass} mt-2`}
                    value={parseTapGoalConfig(config).title}
                    onChange={(event) => set("title", event.target.value)}
                    placeholder="Goal: 50K Taps for Giveaway!"
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>
                    {"Goal target (taps)"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1000}
                    className={`${fieldClass} mt-2`}
                    value={parseTapGoalConfig(config).target}
                    onChange={(event) => set("target", Number(event.target.value))}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {[10000, 50000, 100000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => set("target", preset)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
                    >
                      {preset.toLocaleString()}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelClass}>
                      {"Gradient start"}
                    </span>
                    <input
                      type="color"
                      className="mt-2 h-10 w-full rounded-lg border border-border bg-transparent"
                      value={parseTapGoalConfig(config).gradientFrom}
                      onChange={(event) => set("gradientFrom", event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>
                      {"Gradient end"}
                    </span>
                    <input
                      type="color"
                      className="mt-2 h-10 w-full rounded-lg border border-border bg-transparent"
                      value={parseTapGoalConfig(config).gradientTo}
                      onChange={(event) => set("gradientTo", event.target.value)}
                    />
                  </label>
                </div>
                <ToggleField
                  label={"Show percentage"}
                  checked={parseTapGoalConfig(config).showPercent}
                  onChange={(next) => set("showPercent", next)}
                />
                <button
                  type="button"
                  onClick={() => void copyUrl()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary"
                >
                  {copied ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                  {"Copy OBS URL"}
                </button>
                <code className="block break-all text-[0.7rem] text-muted-foreground">
                  /overlay/tiktok-tap-goal?token={widget.public_token}
                </code>
              </div>
            ) : null}

            {widget.type === "TIKTOK_TAPPERS" ? (
              <div className="space-y-4 rounded-xl border border-border bg-background p-4">
                <p className={labelClass}>
                  {"🏆 Top tappers"}
                </p>
                <label className="block">
                  <span className={labelClass}>{"Layout"}</span>
                  <DarkSelect
                    className="mt-2"
                    value={parseTappersConfig(config).layout}
                    onValueChange={(next) => set("layout", next)}
                    options={TAPPERS_LAYOUTS.map((entry) => ({
                      value: entry.value,
                      label: entry.label,
                    }))}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>{"Top limit"}</span>
                  <DarkSelect
                    className="mt-2"
                    value={String(parseTappersConfig(config).topLimit)}
                    onValueChange={(next) => set("topLimit", Number(next))}
                    options={TAPPERS_LIMITS.map((limit) => ({
                      value: String(limit),
                      label: `Top ${limit}`,
                    }))}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>{"Title"}</span>
                  <input
                    className={`${fieldClass} mt-2`}
                    value={parseTappersConfig(config).title}
                    onChange={(event) => set("title", event.target.value)}
                  />
                </label>
                <ToggleField
                  label={"Show profile pictures"}
                  checked={parseTappersConfig(config).showAvatars}
                  onChange={(next) => set("showAvatars", next)}
                />
                <button
                  type="button"
                  onClick={() => void copyUrl()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary"
                >
                  {copied ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                  {"Copy OBS URL"}
                </button>
                <code className="block break-all text-[0.7rem] text-muted-foreground">
                  /overlay/tiktok-tappers?token={widget.public_token}
                </code>
              </div>
            ) : null}

            {widget.type === "EMOTE_RAIN" ? (
              <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                <label className="block">
                  <span className={labelClass}>Emotes (comma separated)</span>
                  <input
                    className={`${fieldClass} mt-2`}
                    value={parseEmoteRainConfig(config).emotes.join(", ")}
                    onChange={(event) =>
                      set(
                        "emotes",
                        event.target.value.split(",").map((entry) => entry.trim()),
                      )
                    }
                  />
                </label>
                <label className="block">
                  <span className={`${labelClass} inline-flex items-center gap-1.5`}>
                    Emotes per event ({parseEmoteRainConfig(config).burst})
                    <InfoTip text={t("tooltips.widget.emoteBurst")} />
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    className="mt-3 w-full accent-primary"
                    value={parseEmoteRainConfig(config).burst}
                    onChange={(event) => set("burst", Number(event.target.value))}
                  />
                </label>
                <label className="block">
                  <span className={labelClass}>
                    Emote size ({parseEmoteRainConfig(config).emoteSize}px)
                  </span>
                  <input
                    type="range"
                    min={16}
                    max={160}
                    className="mt-3 w-full accent-primary"
                    value={parseEmoteRainConfig(config).emoteSize}
                    onChange={(event) => set("emoteSize", Number(event.target.value))}
                  />
                </label>
                <label className="block">
                  <span className={`${labelClass} inline-flex items-center gap-1.5`}>
                    Fall duration ({Math.round(parseEmoteRainConfig(config).fallMs / 1000)}s)
                    <InfoTip text={t("tooltips.widget.fallDuration")} />
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={15}
                    className="mt-3 w-full accent-primary"
                    value={Math.round(parseEmoteRainConfig(config).fallMs / 1000)}
                    onChange={(event) => set("fallMs", Number(event.target.value) * 1000)}
                  />
                </label>
              </div>
            ) : null}



            {widget.type === "CHAT_SPOTLIGHT" ? (
              <>
                <LayoutPicker
                  value={parseChromeLayout(config)}
                  options={CHROME_LAYOUTS.map((id) => ({ id, label: t(`layout.chrome.${id}`) }))}
                  onChange={(id) => set("layout", id)}
                />
              <SpotlightControlPanel
                widgetId={widget.id}
                chat={stream.chat ?? null}
                testMessages={stream.testMessages}
                pinned={stream.spotlight ?? null}
                autoHideMs={parseSpotlightConfig(config).autoHideMs}
                onAutoHideChange={(next) => set("autoHideMs", next)}
                lang={"en"}
              />
              </>
            ) : null}

            {widget.type === "STREAM_EVENTS_SCHEDULE" ? (
              <>
                <LayoutPicker
                  value={parseChromeLayout(config)}
                  options={CHROME_LAYOUTS.map((id) => ({ id, label: t(`layout.chrome.${id}`) }))}
                  onChange={(id) => set("layout", id)}
                />
              <StreamEventsScheduleControlPanel
                widgetId={widget.id}
                config={config}
                state={widget.state}
                onConfigChange={(next) => {
                  setConfig({ ...next });
                }}
              />
              </>
            ) : null}

            {widget.type === "POLL" ? (
              <PollControlPanel
                state={widget.state}
                live={stream.poll}
                chat={stream.chat}
                kickConnected={Boolean(stream.chat?.kickChatroomId)}
              />
            ) : null}

            {widget.type === "PREDICTION" ? (
              <PredictionControlPanel
                state={widget.state}
                live={stream.prediction}
                chat={stream.chat}
                kickConnected={Boolean(stream.chat?.kickChatroomId)}
              />
            ) : null}

            {widget.type === "STREAM_EVENTS_SCHEDULE" ||
            widget.type === "SPIN_WHEEL" ||
            widget.type === "EVENT_LABELS" ||
            widget.type === "CHAT_BOX" ||
            widget.type === "CHAT_SPOTLIGHT" ||
            widget.type === "VIEWER_COUNTER" ? null : (
              <TestSimulatePanel widgetId={widget.id} />
            )}

            {widget.type === "SPIN_WHEEL" ||
            widget.type === "EVENT_LABELS" ||
            widget.type === "CHAT_BOX" ||
            widget.type === "CHAT_SPOTLIGHT" ||
            widget.type === "STREAM_EVENTS_SCHEDULE" ||
            widget.type === "POLL" ||
            widget.type === "PREDICTION" ||
            widget.type === "VIEWER_COUNTER" ? null : (
            <div className="rounded-xl border border-border bg-background p-4">
              <p className={labelClass}>OBS browser source</p>
              <code className="mt-2 block break-all text-xs text-muted-foreground">
                {`/overlay/${widget.public_token}`}
              </code>
            </div>
            )}

            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-transparent px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:border-red-500/30 hover:bg-red-500/10"
            >
              <Trash2 className="size-4" aria-hidden />
              {t("home.delete")}
            </button>
            </>
            )}
          </section>

          <section className="grid min-h-[420px] place-items-center rounded-2xl border border-border bg-[repeating-conic-gradient(#16171d_0%_25%,#101116_0%_50%)] bg-[length:32px_32px] p-6">
            <WidgetRenderer
              type={widget.type}
              config={config}
              frame={stream.frame}
              remaining={stream.remaining}
              goal={
                isDynamicGoalWidget(widget.type)
                  ? null
                  : goalRow
                    ? {
                        title: goalDraft.title,
                        unit: goalDraft.unit,
                        target: goalDraft.target,
                        current: goalDraft.current,
                      }
                    : stream.goal
              }
              events={stream.events}
              spin={stream.spin}
              spotlight={stream.spotlight}
              streamEvents={
                stream.streamEvents ??
                (widget ? parseStreamEventsScheduleState(widget.state) : null)
              }
              poll={stream.poll ?? (widget ? parsePollRuntime(widget.state) : null)}
              prediction={stream.prediction ?? (widget ? parsePredictionRuntime(widget.state) : null)}
              tappers={stream.tappers}
              tapGoal={stream.tapGoal}

              chat={stream.chat}
              testMessages={stream.testMessages}
              demo
              publicToken={widget.public_token}
              spinning={wheelTurning || spin.isPending}
            />
          </section>
        </div>
      )}

      {confirmDelete ? (
        <DeleteWidgetDialog
          widgetName={widget?.name}
          pending={remove.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
    </AppShell>
  );
}


function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block text-[10px] text-muted-foreground">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
            checked ? "start-[22px]" : "start-0.5"
          }`}
        />
      </button>
    </div>
  );
}
