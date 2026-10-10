import { useEffect, useState } from "react";

import { useLiveChat, type ChatSources } from "@/hooks/useLiveChat";
import {
  pollCardVisible,
  preferNewer,
  sharePercents,
  type PollRuntime,
} from "@/lib/interactiveWidgets";
import { useLanguage } from "@/lib/i18n";
import { parsePollConfig } from "@/lib/widgets";

export function PollOverlay({
  config,
  runtime,
  chat = null,
  demo = false,
}: {
  config: unknown;
  runtime: PollRuntime | null;
  chat?: ChatSources | null;
  demo?: boolean;
}) {
  const { t } = useLanguage();
  const parsed = parsePollConfig(config);
  const { kickPoll } = useLiveChat(chat, 1);
  const live = preferNewer(runtime, kickPoll);
  const [now, setNow] = useState(() => Date.now());
  const visible = pollCardVisible(live, now);
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
        {t("widget.poll.idle")}
      </p>
    );
  }

  const counts = live.options.map((option) => option.votes);
  const percents = sharePercents(counts);
  const remaining =
    open && live.endsAt ? Math.max(0, Math.ceil((Date.parse(live.endsAt) - now) / 1000)) : 0;
  const statusLabel = open ? t("widget.poll.live") : t("widget.poll.ended");

  return (
    <div
      className="overlay-poll-card w-[min(100%,32rem)] rounded-3xl border px-5 py-4"
      dir="rtl"
      style={{
        color: parsed.textColor,
        fontFamily: parsed.fontFamily,
        background: "linear-gradient(180deg, rgba(10,16,24,0.72), rgba(8,10,14,0.55))",
        borderColor: "rgba(190,225,252,0.35)",
        backdropFilter: "blur(18px)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.45), 0 0 32px rgba(190,225,252,0.16)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-semibold" dir="auto">
          {live.title}
        </p>
        <span className="rounded-full border border-[#bee1fc]/40 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-[#bee1fc]">
          {statusLabel}
          {open && live.endsAt ? ` · ${remaining}s` : ""}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {live.options.map((option, index) => {
          const votes = option.votes;
          const percent = percents[index] ?? 0;
          const winner = live.winnerId != null && option.id === live.winnerId;
          return (
            <div key={option.id} className={winner ? "overlay-prediction-win" : undefined}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span dir="auto">
                  {index + 1}. {option.label}
                </span>
                <span className="tabular-nums text-[#bee1fc]">
                  {percent}% · {votes}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="overlay-poll-bar h-full rounded-full"
                  style={{
                    width: `${Math.max(percent, votes === 0 ? 0 : 4)}%`,
                    background: "linear-gradient(90deg, #7ec8f5, #bee1fc)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
