import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Sparkles, Unlock } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { DarkSelect } from "@/components/ui/dark-select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { GiveawayDisplay, type DrawPhase } from "@/components/widgets/GiveawayDisplay";
import { PlatformIcon } from "@/components/widgets/PlatformIcon";
import { ProFeatureGate } from "@/components/subscription/ProLockedScreen";
import { useLiveChat } from "@/hooks/useLiveChat";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  DEFAULT_GIVEAWAY,
  announceGiveawayWinner,
  clearGiveawayParticipants,
  getGiveawayChatSources,
  confirmGiveawayFromChat,
  getGiveawayOverlayToken,
  getGiveawayState,
  publishGiveawayDraw,
  joinGiveaway,
  pickGiveawayWinner,
  saveGiveawaySettings,
  type GiveawayDrawState,
  type GiveawaySettings,
} from "@/lib/giveaway.functions";
import { useLanguage } from "@/lib/i18n";
import { isTestMode } from "@/lib/testMode";

export const Route = createFileRoute("/_authenticated/giveaway")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Giveaway Wheel" },
      {
        name: "description",
        content:
          "Run keyword giveaways across Kick, Twitch, YouTube and TikTok chat, then spin the wheel to pick a winner live.",
      },
      { property: "og:title", content: "CylixStudio — Giveaway Wheel" },
      {
        property: "og:description",
        content: "Collect chat entries with a custom keyword and draw a winner on stream.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GiveawayRoute,
});

function GiveawayRoute() {
  const { user } = Route.useRouteContext();
  return (
    <ProFeatureGate userId={user.id}>
      <GiveawayPage />
    </ProFeatureGate>
  );
}

const field =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-foreground outline-none focus:border-zinc-600";
const label = "mb-1.5 block text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground";
const primary =
  "inline-flex items-center gap-2 rounded-full bg-[#bee1fc] px-5 py-2.5 text-sm font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90 disabled:opacity-40";
const selectClass = "h-10 rounded-xl border-zinc-800 bg-zinc-900";

const SPIN_DURATIONS = [3, 5, 8, 10, 15];
const CLAIM_WINDOWS = [60, 120, 300, 600];
const MULTIPLIERS = [1, 2, 3, 5, 10];

function formatEntered(iso: string, lang: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function GiveawayPage() {
  const { user } = Route.useRouteContext();
  const { data: workspace } = useWorkspace(user.id);
  const { t, lang } = useLanguage();
  const queryClient = useQueryClient();
  const guest = isTestMode();

  const fetchState = useServerFn(getGiveawayState);
  const fetchSources = useServerFn(getGiveawayChatSources);
  const save = useServerFn(saveGiveawaySettings);
  const clear = useServerFn(clearGiveawayParticipants);
  const pick = useServerFn(pickGiveawayWinner);
  const join = useServerFn(joinGiveaway);
  const announce = useServerFn(announceGiveawayWinner);
  const publishDraw = useServerFn(publishGiveawayDraw);
  const confirmChat = useServerFn(confirmGiveawayFromChat);
  const fetchOverlayToken = useServerFn(getGiveawayOverlayToken);

  const state = useQuery({
    queryKey: ["giveaway"],
    queryFn: () => fetchState(),
    enabled: !guest,
    retry: false,
    refetchInterval: guest ? false : 4000,
  });
  const sources = useQuery({
    queryKey: ["giveaway-chat-sources"],
    queryFn: () => fetchSources(),
    enabled: !guest,
    retry: false,
  });
  const overlay = useQuery({
    queryKey: ["giveaway-overlay-token"],
    queryFn: () => fetchOverlayToken(),
    enabled: !guest,
    retry: false,
  });
  const overlayUrl = overlay.data?.overlayUrl || "";

  const [form, setForm] = useState<GiveawaySettings>(DEFAULT_GIVEAWAY);
  const loaded = useRef(false);
  useEffect(() => {
    if (state.data?.settings && !loaded.current) {
      setForm(state.data.settings);
      loaded.current = true;
    }
  }, [state.data]);

  const participants = state.data?.participants ?? [];
  const totalEntries = useMemo(
    () => participants.reduce((sum, p) => sum + p.entries, 0),
    [participants],
  );

  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<{ username: string; platform: string } | null>(null);
  const [rollName, setRollName] = useState<string | null>(null);
  const [drawPhase, setDrawPhase] = useState<DrawPhase>("idle");
  const [claimState, setClaimState] = useState<"pending" | "confirmed" | "expired">("pending");
  const [claimLeft, setClaimLeft] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const winnerRef = useRef<string | null>(null);

  // Mirror the live draw into the OBS browser source.
  const push = (next: Partial<GiveawayDrawState>) =>
    publishDraw({
      data: {
        phase: "idle",
        winner: null,
        claimState: "pending",
        claimUntil: null,
        keyword: form.keyword || "+1",
        ...next,
      } as GiveawayDrawState,
    }).catch(() => undefined);

  // Claim countdown remains active in both the embedded and expanded display.
  useEffect(() => {
    if (!winner || drawPhase !== "settled" || claimState !== "pending") return;
    if (claimLeft <= 0) {
      setClaimState("expired");
      winnerRef.current = null;
      return;
    }
    const id = setTimeout(() => setClaimLeft((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [winner, drawPhase, claimState, claimLeft]);

  const pendingStamp = state.data?.pendingWinner
    ? `${state.data.pendingWinner.username}|${state.data.pendingWinner.at}|${state.data.confirmedAt ?? ""}`
    : "";
  const hydrated = useRef("");
  useEffect(() => {
    if (guest || spinning || !pendingStamp || hydrated.current === pendingStamp) return;
    const pending = state.data?.pendingWinner;
    if (!pending) return;
    hydrated.current = pendingStamp;
    const confirmedAt = state.data?.confirmedAt ?? null;
    setWinner({ username: pending.username, platform: pending.platform });
    setDrawPhase("settled");
    setClaimState(confirmedAt ? "confirmed" : "pending");
    winnerRef.current = confirmedAt ? null : pending.username.toLowerCase();
    if (confirmedAt) return;
    const until = state.data?.claimUntil ? new Date(state.data.claimUntil).getTime() : 0;
    if (until > Date.now()) setClaimLeft(Math.ceil((until - Date.now()) / 1000));
    else if (!state.data?.claimUntil) setClaimLeft(form.claimSeconds);
    else setClaimLeft(0);
  }, [guest, spinning, pendingStamp, state.data, form.claimSeconds]);

  // ---- Live keyword capture from the connected chats (Twitch + Kick) ----
  const seen = useRef(new Set<string>());
  useLiveChat(
    sources.data
      ? {
          twitchChannel: sources.data.twitchChannel,
          kickChatroomId: sources.data.kickChatroomId,
          kickSlug: sources.data.kickSlug,
        }
      : null,
    30,
    (message) => {
      const keyword = (form.keyword || "+1").trim().toLowerCase();
      const text = message.text.trim().toLowerCase();
      if (keyword && text === keyword && message.platform !== "TEST") {
        void confirmChat({
          data: { username: message.author, text: message.text.trim(), isTest: false },
        }).then((result) => {
          if (result.status !== "confirmed") return;
          winnerRef.current = null;
          setClaimState("confirmed");
          void queryClient.invalidateQueries({ queryKey: ["giveaway"] });
          void push({ phase: "settled", winner, claimState: "confirmed", claimUntil: null });
        });
      }
      if (!keyword || !form.isOpen) return;
      if (!message.text.toLowerCase().includes(keyword)) return;
      const key = `${message.platform}:${message.author.toLowerCase()}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      const isSubscriber = message.badges.some((badge) => /sub|founder|og|vip/i.test(badge));
      void join({
        data: {
          platform: message.platform === "TWITCH" ? "TWITCH" : "KICK",
          username: message.author,
          text: message.text,
          isSubscriber,
        },
      }).then(() => queryClient.invalidateQueries({ queryKey: ["giveaway"] }));
    },
  );

  const saveMutation = useMutation({
    mutationFn: (next: GiveawaySettings) => save({ data: next }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(t("giveaway.saved"));
        void queryClient.invalidateQueries({ queryKey: ["giveaway"] });
      } else toast.error(result.error);
    },
    onError: (error: Error) => toast.error(error.message || "Could not save giveaway"),
  });

  const update = (patch: Partial<GiveawaySettings>) => {
    const next = { ...form, ...patch };
    setForm(next);
    saveMutation.mutate(next);
  };

  const clearMutation = useMutation({
    mutationFn: () => clear(),
    onSuccess: () => {
      seen.current.clear();
      setWinner(null);
      setRollName(null);
      setDrawPhase("idle");
      winnerRef.current = null;
      hydrated.current = "";
      void push({ phase: "idle" });
      toast.success(t("giveaway.cleared"));
      void queryClient.invalidateQueries({ queryKey: ["giveaway"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not clear participants"),
  });

  const runDraw = async () => {
    if (!participants.length || spinning) return;
    const started = Date.now();
    setSpinning(true);
    setWinner(null);
    setDrawPhase("shuffling");
    await push({ phase: "shuffling" });

    const names = participants.map((person) => person.username);
    let cursor = 0;
    setRollName(names[0] ?? "");
    const rollTimer = window.setInterval(() => {
      cursor = (cursor + 1) % names.length;
      setRollName(names[cursor] ?? "");
    }, 70);

    const result = await pick();
    const wait = Math.max(0, 1200 - (Date.now() - started));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    window.clearInterval(rollTimer);
    setRollName(null);

    if (!result.ok) {
      setSpinning(false);
      setDrawPhase("idle");
      toast.error(t("giveaway.noParticipants"));
      return;
    }

    setWinner({ username: result.winner.username, platform: result.winner.platform });
    setDrawPhase("settled");
    setSpinning(false);
    winnerRef.current = result.winner.username.toLowerCase();
    setClaimState("pending");
    setClaimLeft(form.claimSeconds);
    await push({
      phase: "settled",
      winner: result.winner,
      claimState: "pending",
      claimUntil: new Date(Date.now() + form.claimSeconds * 1000).toISOString(),
    });
    void announce({
      data: {
        username: result.winner.username,
        keyword: form.keyword || "+1",
        claimSeconds: form.claimSeconds,
      },
    }).catch(() => undefined);
  };

  const minutes = (n: number) =>
    n === 1 ? t("giveaway.minutes1") : t("giveaway.minutesN", { n });

  const display = (
    <GiveawayDisplay
      participants={participants}
      winner={winner}
      phase={drawPhase}
      claimState={claimState}
      claimLeft={claimLeft}
      keyword={form.keyword}
      lastWinner={state.data?.lastWinner}
      expanded={false}
      onToggleExpand={() => setExpanded(true)}
      onReroll={() => void runDraw()}
    />
  );

  return (
    <AppShell
      user={user}
      profile={workspace?.profile}
      title={t("giveaway.title")}
      subtitle={t("giveaway.subtitle")}
    >
      <div className="flex flex-col gap-12 lg:gap-16">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-5">
          <label className="min-w-[8.5rem] flex-1 basis-40 sm:max-w-[13rem]">
            <span className={label}>{t("giveaway.keyword")}</span>
            <input
              className={field}
              value={form.keyword}
              onChange={(e) => setForm({ ...form, keyword: e.target.value })}
              onBlur={() => update({ keyword: form.keyword })}
              placeholder="+1"
              dir="auto"
            />
          </label>
          <label className="min-w-[8.5rem] flex-1 basis-36 sm:max-w-[12rem]">
            <span className={label}>{t("giveaway.multiplier")}</span>
            <DarkSelect
              className={selectClass}
              contentClassName="rounded-xl border-zinc-800 bg-zinc-900"
              value={String(form.subMultiplier)}
              onValueChange={(value) => update({ subMultiplier: Number(value) })}
              options={MULTIPLIERS.map((n) => ({
                value: String(n),
                label: n === 1 ? t("giveaway.multiplierOff") : t("giveaway.multiplierN", { n }),
              }))}
            />
          </label>
          <label className="min-w-[8.5rem] flex-1 basis-36 sm:max-w-[11rem]">
            <span className={label}>{t("giveaway.spin")}</span>
            <DarkSelect
              className={selectClass}
              contentClassName="rounded-xl border-zinc-800 bg-zinc-900"
              value={String(form.spinDuration)}
              onValueChange={(value) => update({ spinDuration: Number(value) })}
              options={SPIN_DURATIONS.map((seconds) => ({
                value: String(seconds),
                label: t("giveaway.seconds", { n: seconds }),
              }))}
            />
          </label>
          <label className="min-w-[8.5rem] flex-1 basis-36 sm:max-w-[11rem]">
            <span className={label}>{t("giveaway.claim")}</span>
            <DarkSelect
              className={selectClass}
              contentClassName="rounded-xl border-zinc-800 bg-zinc-900"
              value={String(form.claimSeconds)}
              onValueChange={(value) => update({ claimSeconds: Number(value) })}
              options={CLAIM_WINDOWS.map((seconds) => ({
                value: String(seconds),
                label:
                  seconds >= 60
                    ? minutes(seconds / 60)
                    : t("giveaway.seconds", { n: seconds }),
              }))}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[#bee1fc]"
              checked={form.subsOnly}
              onChange={(e) => update({ subsOnly: e.target.checked })}
            />
            {t("giveaway.subsOnly")}
          </label>
          <div className="flex flex-wrap items-center gap-3 pb-0.5">
            <button
              type="button"
              onClick={() => update({ isOpen: !form.isOpen })}
              aria-pressed={form.isOpen}
              className={
                form.isOpen
                  ? "inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-100"
                  : "inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/15 px-5 py-2.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/25"
              }
            >
              {form.isOpen ? (
                <Unlock className="size-4" aria-hidden />
              ) : (
                <Lock className="size-4" aria-hidden />
              )}
              {form.isOpen ? t("giveaway.entriesOpen") : t("giveaway.entriesClosed")}
            </button>
            <button
              type="button"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              className="text-sm text-red-400 hover:text-red-300 disabled:opacity-40"
            >
              {t("giveaway.clear")}
            </button>
          </div>
        </div>

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_15.5rem] lg:gap-14">
          <div className="min-w-0">
            <p className={label}>{t("giveaway.stageTitle")}</p>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <div className="grid min-h-[9.5rem] place-items-center">
                {drawPhase === "shuffling" && rollName ? (
                  <p className="max-w-full truncate text-4xl font-semibold text-zinc-100" dir="auto">
                    {rollName}
                  </p>
                ) : winner && drawPhase === "settled" ? (
                  <div className="w-full max-w-md rounded-xl border border-[#bee1fc]/40 bg-[#bee1fc]/10 px-6 py-5 text-center">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#bee1fc]">
                      {t("giveaway.winnerSelected")}
                    </p>
                    <p className="mt-2 truncate text-3xl font-bold text-zinc-50" dir="auto">
                      {winner.username}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{winner.platform}</p>
                    <p className="mt-3 text-sm text-zinc-100">
                      {claimState === "confirmed" ? t("giveaway.confirmed") : t("giveaway.pendingConfirm")}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {participants.length === 0
                      ? t("giveaway.peopleEmpty", { keyword: form.keyword || "+1" })
                      : t("giveaway.drawHint")}
                  </p>
                )}
              </div>
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => void runDraw()}
                  disabled={spinning || participants.length === 0}
                  className={primary}
                >
                  {spinning ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="size-4" aria-hidden />
                  )}
                  {t("giveaway.pick")}
                </button>
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <p className={label}>
              {t("giveaway.peopleTitle")} ·{" "}
              {t("giveaway.entriesCount", {
                people: participants.length,
                entries: totalEntries,
              })}
            </p>
            {participants.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("giveaway.peopleEmpty", { keyword: form.keyword || "+1" })}
              </p>
            ) : (
              <ul className="max-h-[min(52vh,420px)] overflow-y-auto">
                {participants.map((participant) => (
                  <li
                    key={participant.id}
                    className="flex items-center gap-2.5 border-b border-zinc-800 py-2.5 last:border-b-0"
                  >
                    <PlatformIcon platform={participant.platform} size={16} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm" dir="auto">{participant.username}</p>
                      {participant.createdAt ? (
                        <p className="text-[0.68rem] text-muted-foreground">
                          {t("giveaway.enteredAt", {
                            time: formatEntered(participant.createdAt, lang),
                          })}
                        </p>
                      ) : null}
                    </div>
                    <span className="font-mono text-[0.72rem] text-muted-foreground">
                      ×{participant.entries}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="max-w-2xl">
          <span className={label}>{t("giveaway.overlayTitle")}</span>
          <div className="flex items-stretch overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            <input
              readOnly
              className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 font-mono text-[0.78rem] text-foreground outline-none"
              value={overlayUrl}
              placeholder={t("giveaway.overlayPlaceholder")}
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => {
                if (!overlayUrl) return;
                void navigator.clipboard.writeText(overlayUrl);
                toast.success(t("giveaway.copied"));
              }}
              className="shrink-0 border-s border-zinc-800 px-3.5 text-sm text-muted-foreground transition-colors hover:bg-zinc-800/80 hover:text-foreground"
            >
              {t("giveaway.copy")}
            </button>
          </div>
        </div>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="h-[min(88vh,900px)] w-[min(94vw,1600px)] max-w-none overflow-hidden border-0 bg-background p-0 shadow-none [&>button]:hidden">
          <DialogTitle className="sr-only">{t("giveaway.stageTitle")}</DialogTitle>
          <GiveawayDisplay
            participants={participants}
            winner={winner}
            phase={drawPhase}
            claimState={claimState}
            claimLeft={claimLeft}
            keyword={form.keyword}
            lastWinner={state.data?.lastWinner}
            expanded
            onToggleExpand={() => setExpanded(false)}
            onReroll={() => void runDraw()}
          />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
