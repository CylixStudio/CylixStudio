import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";

import {
  formatCountdown,
  formatUptime,
  resolveStreamSchedule,
  type StreamEventsRuntime,
} from "@/lib/streamEventsSchedule";
import {
  parseStreamEventsScheduleConfig,
  parseStreamEventsScheduleState,
} from "@/lib/widgets";
import { cn } from "@/lib/utils";

/**
 * OBS / hub glass card for the smart broadcast events schedule.
 */
export function StreamEventsScheduleCard({
  config,
  runtime,
  demo = false,
  onPrevious,
  onNext,
  showNav = false,
  compact = false,
}: {
  config: unknown;
  runtime?: StreamEventsRuntime | null;
  demo?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  showNav?: boolean;
  compact?: boolean;
}) {
  const style = parseStreamEventsScheduleConfig(config);
  const [now, setNow] = useState(() => Date.now());

  const effectiveRuntime: StreamEventsRuntime = useMemo(() => {
    if (runtime?.startedAt) return runtime;
    if (demo) {
      return {
        startedAt: new Date(Date.now() - 7 * 60_000).toISOString(),
        bonusElapsedSeconds: 0,
        revision: 0,
      };
    }
    return runtime ?? { startedAt: null, bonusElapsedSeconds: 0, revision: 0 };
  }, [runtime, demo]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const snapshot = useMemo(
    () => resolveStreamSchedule(style.events, effectiveRuntime, now),
    [style.events, effectiveRuntime, now],
  );

  const badge =
    snapshot.status === "waiting"
      ? "STANDBY"
      : snapshot.status === "finished"
        ? "DONE"
        : snapshot.phase === "up_next"
          ? "UP NEXT"
          : "ON STREAM";

  const eventTitle =
    snapshot.status === "active"
      ? snapshot.current.title
      : snapshot.status === "finished"
        ? "Schedule complete"
        : "Waiting for stream…";

  const countdown =
    snapshot.status === "active"
      ? formatCountdown(snapshot.remainingSeconds)
      : snapshot.status === "waiting"
        ? "--:--"
        : "0:00";

  const urgency = snapshot.status === "active" ? snapshot.urgency : "calm";
  const uptimeSeconds =
    snapshot.status === "waiting" ? 0 : snapshot.streamElapsedSeconds;

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e14]/78 shadow-[0_18px_60px_rgba(0,0,0,.4)] backdrop-blur-xl",
        compact ? "p-3" : "p-4",
      )}
      dir="rtl"
      style={{ fontFamily: style.fontFamily, fontSize: `${style.fontSize}px` }}
    >
      <div
        className={cn(
          "hub-spotlight-card rounded-xl border border-white/10 bg-white/[0.05] backdrop-blur-md",
          compact ? "px-3 py-2.5" : "px-3.5 py-3",
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: style.accentColor }}
            aria-hidden
          />
          <span
            className="min-w-0 flex-1 truncate font-bold"
            style={{ color: style.accentColor, fontSize: `${Math.max(12, Math.round(style.fontSize * 0.42))}px` }}
            dir="auto"
          >
            {eventTitle}
          </span>
          <span className="shrink-0 text-[0.5rem] font-bold uppercase tracking-[0.24em] text-zinc-400">
            {badge}
          </span>
        </div>

        <p
          className={cn(
            "mt-2 font-mono font-bold tabular-nums tracking-wide transition-colors",
            urgency === "critical" && "animate-pulse text-rose-400",
            urgency === "warn" && "text-amber-300",
            urgency === "calm" && "text-zinc-50",
          )}
          style={{ fontSize: `${Math.max(18, Math.round(style.fontSize * (compact ? 0.72 : 1)))}px` }}
        >
          {snapshot.status === "waiting" ? (
            <span className="inline-flex items-center gap-2 text-zinc-400">
              <span className="size-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
              Loading
            </span>
          ) : (
            countdown
          )}
        </p>
        {snapshot.status === "active" && snapshot.next ? (
          <p className="mt-1 truncate text-[0.65rem] text-zinc-500" dir="auto">
            التالي: {snapshot.next.title}
          </p>
        ) : null}
      </div>

      <div className={cn("mt-3 flex items-start gap-2.5", compact && "mt-2.5")}>
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
          <Clock3 className="size-4 text-[#bee1fc]" aria-hidden />
        </span>
        <div className="min-w-0">
          <p
            className="truncate font-medium tracking-tight text-zinc-50"
            style={{ fontSize: `${Math.max(13, Math.round(style.fontSize * 0.45))}px` }}
          >
            {style.title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[0.72rem] leading-relaxed text-zinc-400">
            فعاليات مجدولة على مدار البث مع عداد تنازلي مباشر.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 pt-1">
        <span className="flex items-center gap-2 text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                effectiveRuntime.startedAt || demo ? "bg-[#bee1fc]" : "bg-zinc-600",
              )}
              aria-hidden
            />
            LIVE
          </span>
          {style.showUptime ? (
            <span className="font-mono normal-case tracking-normal text-zinc-500">
              {formatUptime(uptimeSeconds)}
            </span>
          ) : null}
        </span>

        {showNav ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrevious}
              className="rounded-xl border border-white/10 p-1.5 text-zinc-400 transition-opacity hover:opacity-80"
              aria-label="Previous event"
            >
              <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onNext}
              className="rounded-xl border border-white/10 p-1.5 text-zinc-400 transition-opacity hover:opacity-80"
              aria-label="Next event"
            >
              <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StreamEventsScheduleView({
  config,
  runtime = null,
  demo = false,
}: {
  config: unknown;
  runtime?: StreamEventsRuntime | null;
  demo?: boolean;
}) {
  return (
    <div className="w-full max-w-[340px]">
      <StreamEventsScheduleCard config={config} runtime={runtime ?? null} demo={demo} />
    </div>
  );
}
