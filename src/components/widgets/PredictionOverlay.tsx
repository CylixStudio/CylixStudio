import { useEffect, useState } from "react";

import { useLiveChat, type ChatSources } from "@/hooks/useLiveChat";
import {
  predictionCardVisible,
  preferNewer,
  sharePercents,
  type PredictionRuntime,
} from "@/lib/interactiveWidgets";
import { useLanguage } from "@/lib/i18n";
import { parsePredictionConfig } from "@/lib/widgets";

export function PredictionOverlay({
  config,
  runtime,
  chat = null,
  demo = false,
}: {
  config: unknown;
  runtime: PredictionRuntime | null;
  chat?: ChatSources | null;
  demo?: boolean;
}) {
  const { t } = useLanguage();
  const parsed = parsePredictionConfig(config);
  const { kickPrediction } = useLiveChat(chat, 1);
  const live = preferNewer(runtime, kickPrediction);
  const [now, setNow] = useState(() => Date.now());
  const visible = predictionCardVisible(live, now);
  const open = live?.status === "open";

  useEffect(() => {
    if (!live?.endsAt && !live?.hideAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [live?.endsAt, live?.hideAt, live?.status]);

  if (!visible || !live) {
    if (!demo) return null;
    return (
      <p className="rounded-2xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-[#bee1fc]" dir="rtl">
        {t("widget.prediction.idle")}
      </p>
    );
  }

  const outcomes = live.outcomes.slice(0, 2);
  const percents = sharePercents(outcomes.map((outcome) => outcome.points));
  const remaining =
    open && live.endsAt ? Math.max(0, Math.ceil((Date.parse(live.endsAt) - now) / 1000)) : 0;
  const statusLabel = open
    ? `${t("widget.prediction.open")}${live.endsAt ? ` · ${remaining}s` : ""}`
    : live.status === "locked"
      ? t("widget.prediction.locked")
      : t("widget.prediction.resolved");

  return (
    <div
      className="overlay-prediction-card w-[min(100%,36rem)] rounded-3xl border px-5 py-4"
      dir="rtl"
      style={{
        color: parsed.textColor,
        fontFamily: parsed.fontFamily,
        background: "linear-gradient(180deg, rgba(10,16,24,0.74), rgba(8,10,14,0.5))",
        borderColor: "rgba(190,225,252,0.35)",
        backdropFilter: "blur(18px)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.45), 0 0 32px rgba(190,225,252,0.16)",
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-base font-semibold" dir="auto">
          {live.title}
        </p>
        <span className="text-[0.7rem] font-semibold tracking-wide text-[#bee1fc]">{statusLabel}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <Side
          label={outcomes[0]?.label ?? ""}
          points={outcomes[0]?.points ?? 0}
          voters={outcomes[0]?.voters ?? 0}
          winner={live.status === "resolved" && live.winnerId != null && outcomes[0]?.id === live.winnerId}
          pointsLabel={t("widget.prediction.points")}
        />
        <span className="pb-6 text-sm font-black text-[#bee1fc]">VS</span>
        <Side
          label={outcomes[1]?.label ?? ""}
          points={outcomes[1]?.points ?? 0}
          voters={outcomes[1]?.voters ?? 0}
          winner={live.status === "resolved" && live.winnerId != null && outcomes[1]?.id === live.winnerId}
          pointsLabel={t("widget.prediction.points")}
        />
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="overlay-poll-bar h-full"
          style={{
            flex: Math.max(8, percents[0] ?? 0),
            background: live.winnerId && outcomes[1]?.id === live.winnerId ? "rgba(255,255,255,0.25)" : "#bee1fc",
          }}
        />
        <div
          className="overlay-poll-bar h-full"
          style={{
            flex: Math.max(8, percents[1] ?? 0),
            background: live.winnerId && outcomes[0]?.id === live.winnerId ? "rgba(255,255,255,0.25)" : "#7ec8f5",
          }}
        />
      </div>
    </div>
  );
}

function Side({
  label,
  points,
  voters,
  winner,
  pointsLabel,
}: {
  label: string;
  points: number;
  voters: number;
  winner: boolean;
  pointsLabel: string;
}) {
  return (
    <div className={winner ? "overlay-prediction-win text-center" : "text-center"}>
      <p className="text-base font-semibold" dir="auto">
        {label}
      </p>
      <p className="mt-1 text-3xl font-black tabular-nums text-[#bee1fc]">{points}</p>
      <p className="text-[0.7rem] text-white/70">
        {pointsLabel}
        {voters > 0 ? ` · ${voters}` : ""}
      </p>
      {winner ? <p className="mt-1 text-xs font-bold text-[#bee1fc]">★</p> : null}
    </div>
  );
}
