import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";

import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { widgetErrorText } from "@/lib/createWidget";
import { useLanguage } from "@/lib/i18n";

import { useTimerStream } from "@/hooks/useTimerStream";
import { formatDuration } from "@/lib/timer";
import {
  adjustTimer,
  pauseTimer,
  resetTimer,
  setTimer,
  startTimer,
  undoTimer,
} from "@/lib/timer.functions";

const QUICK_ADJUSTS: { seconds: number; label: string }[] = [
  { seconds: 10, label: "+10s" },
  { seconds: 30, label: "+30s" },
  { seconds: 60, label: "+1m" },
  { seconds: 300, label: "+5m" },
  { seconds: 600, label: "+10m" },
  { seconds: 1800, label: "+30m" },
  { seconds: 3600, label: "+1h" },
  { seconds: -300, label: "−5m" },
];

const STATUS_STYLE: Record<string, string> = {
  RUNNING: "bg-primary/20 text-primary",
  PAUSED: "bg-secondary text-secondary-foreground",
  IDLE: "bg-secondary text-secondary-foreground",
  ENDED: "bg-destructive/20 text-destructive",
};

export function TimerControls({
  subathonId,
  publicToken,
}: {
  subathonId: string;
  publicToken: string | null;
}) {
  const { t } = useLanguage();
  const { frame, remaining, status } = useTimerStream(publicToken);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  const start = useServerFn(startTimer);
  const pause = useServerFn(pauseTimer);
  const reset = useServerFn(resetTimer);
  const adjust = useServerFn(adjustTimer);
  const setExact = useServerFn(setTimer);
  const undo = useServerFn(undoTimer);

  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      void queryClient.invalidateQueries({ queryKey: ["subathon-stats", subathonId] });
    } catch (err) {
      setError(widgetErrorText(err, "Action failed"));
    } finally {
      setPending(false);
    }
  };

  const buttonClass =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50";
  const primaryClass =
    "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50";

  const timerStatus = frame?.status ?? "IDLE";

  return (
    <section
      className="mt-6 overflow-hidden rounded-2xl border border-border bg-card"
      style={{ backgroundImage: "var(--gradient-glow)" }}
    >
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Remaining time
            </p>
            <p className="mt-2 font-mono text-6xl font-bold tabular-nums">
              {formatDuration(remaining)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm text-muted-foreground">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                STATUS_STYLE[timerStatus] ?? STATUS_STYLE["IDLE"]
              }`}
            >
              {timerStatus}
            </span>
            <span>
              Overlay sync: {publicToken ? status : "no public overlay"}
              {frame ? ` · +${formatDuration(frame.totalAddedSeconds)} added` : ""}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className={primaryClass}
            onClick={() => run(() => start({ data: { subathonId } }))}
          >
            {timerStatus === "PAUSED" ? "Resume" : "Start"}
          </button>
          <button
            type="button"
            disabled={pending}
            className={buttonClass}
            onClick={() => run(() => pause({ data: { subathonId } }))}
          >
            Pause
          </button>
          <button
            type="button"
            disabled={pending}
            className={buttonClass}
            onClick={() => run(() => reset({ data: { subathonId } }))}
          >
            Reset
          </button>
          <button
            type="button"
            disabled={pending}
            className={buttonClass}
            onClick={() => run(() => undo({ data: { subathonId } }))}
          >
            Undo last action
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {QUICK_ADJUSTS.map((entry) => (
            <button
              key={entry.label}
              type="button"
              disabled={pending}
              className={buttonClass}
              onClick={() => run(() => adjust({ data: { subathonId, seconds: entry.seconds } }))}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const parts = custom.split(":").map(Number);
            if (parts.some((part) => !Number.isFinite(part))) return;
            const seconds =
              parts.length === 3
                ? parts[0]! * 3600 + parts[1]! * 60 + parts[2]!
                : parts.length === 2
                  ? parts[0]! * 60 + parts[1]!
                  : parts[0]!;
            void run(() => setExact({ data: { subathonId, seconds } }));
          }}
        >
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Set exact time (HH:MM:SS or seconds)"
            className="w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button type="submit" disabled={pending} className={buttonClass}>
            Set time
          </button>
        </form>

        <SessionAwareError error={error} signedOutLabel={t("widget.signedOut")} className="mt-3 text-sm" boxed={false} />
      </div>
    </section>
  );
}
