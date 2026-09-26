import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Plus,
  SkipForward,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  clampDurationSeconds,
  formatCountdown,
  formatUptime,
  newScheduleEventId,
  resolveStreamSchedule,
  type StreamScheduleEvent,
} from "@/lib/streamEventsSchedule";
import {
  saveStreamEventsList,
  skipStreamEvent,
  startStreamEventsClock,
  stopStreamEventsClock,
} from "@/lib/streamEventsSchedule.functions";
import {
  parseStreamEventsScheduleConfig,
  parseStreamEventsScheduleState,
  type StreamEventsScheduleConfig,
} from "@/lib/widgets";
import { cn } from "@/lib/utils";

/**
 * Moderator control panel: edit segment list, start/stop stream clock, skip.
 */
export function StreamEventsScheduleControlPanel({
  widgetId,
  config,
  state,
  onConfigChange,
}: {
  widgetId: string;
  config: unknown;
  state: unknown;
  onConfigChange: (next: StreamEventsScheduleConfig) => void;
}) {
  const startClock = useServerFn(startStreamEventsClock);
  const stopClock = useServerFn(stopStreamEventsClock);
  const skip = useServerFn(skipStreamEvent);
  const saveList = useServerFn(saveStreamEventsList);
  const queryClient = useQueryClient();

  const parsed = parseStreamEventsScheduleConfig(config);
  const [draftEvents, setDraftEvents] = useState<StreamScheduleEvent[]>(parsed.events);
  const [title, setTitle] = useState(parsed.title);
  const [showUptime, setShowUptime] = useState(parsed.showUptime);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const runtime = parseStreamEventsScheduleState(state);

  useEffect(() => {
    setDraftEvents(parsed.events);
    setTitle(parsed.title);
    setShowUptime(parsed.showUptime);
  }, [parsed.events, parsed.title, parsed.showUptime, runtime.revision]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const snapshot = useMemo(
    () => resolveStreamSchedule(draftEvents, runtime, now),
    [draftEvents, runtime, now],
  );

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["widget", widgetId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const persistEvents = () =>
    void run("save", async () => {
      const cleaned = draftEvents
        .map((event) => ({
          ...event,
          title: event.title.trim().slice(0, 80),
          durationSeconds: clampDurationSeconds(event.durationSeconds),
        }))
        .filter((event) => event.title.length > 0);
      if (cleaned.length === 0) throw new Error("Add at least one event");
      await saveList({
        data: { widgetId, events: cleaned, title, showUptime },
      });
      onConfigChange({ ...parsed, events: cleaned, title, showUptime });
      toast.success("Schedule saved");
    });

  const updateEvent = (id: string, patch: Partial<StreamScheduleEvent>) => {
    setDraftEvents((prev) =>
      prev.map((event) => (event.id === id ? { ...event, ...patch } : event)),
    );
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Clock3 className="size-4 text-primary" aria-hidden />
        Stream events control
      </p>

      <div
        className={cn(
          "rounded-xl border px-3 py-3",
          snapshot.status === "active"
            ? "border-primary/30 bg-primary/10"
            : "border-border bg-muted/20",
        )}
      >
        {snapshot.status === "waiting" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Waiting for stream start time…
          </div>
        ) : null}
        {snapshot.status === "active" ? (
          <div className="space-y-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-primary">
              {snapshot.phase === "up_next" ? "UP NEXT" : "ON STREAM"}
            </p>
            <p className="text-sm font-semibold" dir="auto">
              {snapshot.current.title}
            </p>
            <p
              className={cn(
                "font-mono text-lg font-bold tabular-nums",
                snapshot.urgency === "critical" && "text-rose-400",
                snapshot.urgency === "warn" && "text-amber-300",
                snapshot.urgency === "calm" && "text-foreground",
              )}
            >
              {formatCountdown(snapshot.remainingSeconds)}
            </p>
            <p className="text-[0.7rem] text-muted-foreground">
              Stream uptime {formatUptime(snapshot.streamElapsedSeconds)}
              {snapshot.next ? ` · Next: ${snapshot.next.title}` : ""}
            </p>
          </div>
        ) : null}
        {snapshot.status === "finished" ? (
          <p className="text-sm text-muted-foreground">
            Schedule finished · uptime {formatUptime(snapshot.streamElapsedSeconds)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {runtime.startedAt ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("stop", () => stopClock({ data: { widgetId } }))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
          >
            <Square className="size-3.5" aria-hidden />
            Reset clock
          </button>
        ) : (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("start", () => startClock({ data: { widgetId } }))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Clock3 className="size-3.5" aria-hidden />
            Start stream clock
          </button>
        )}
        <button
          type="button"
          disabled={busy !== null || !runtime.startedAt}
          onClick={() =>
            void run("prev", () => skip({ data: { widgetId, direction: "previous" } }))
          }
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold disabled:opacity-50"
          aria-label="Previous event"
        >
          <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />
          Prev
        </button>
        <button
          type="button"
          disabled={busy !== null || !runtime.startedAt}
          onClick={() => void run("next", () => skip({ data: { widgetId, direction: "next" } }))}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold disabled:opacity-50"
          aria-label="Skip to next event"
        >
          <SkipForward className="size-3.5 rtl:rotate-180" aria-hidden />
          Skip
          <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Overlay title
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
          dir="auto"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={showUptime}
          onChange={(e) => setShowUptime(e.target.checked)}
          className="size-3.5 accent-primary"
        />
        Show total stream uptime on overlay
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Events (name + duration)
          </p>
          <button
            type="button"
            onClick={() =>
              setDraftEvents((prev) => [
                ...prev,
                {
                  id: newScheduleEventId(),
                  title: "New segment",
                  durationSeconds: 15 * 60,
                },
              ])
            }
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.68rem] font-semibold hover:bg-muted/40"
          >
            <Plus className="size-3" aria-hidden />
            Add
          </button>
        </div>

        <ul className="space-y-2">
          {draftEvents.map((event, index) => {
            const active = snapshot.status === "active" && snapshot.current.id === event.id;
            return (
              <li
                key={event.id}
                className={cn(
                  "grid gap-2 rounded-lg border px-2 py-2 sm:grid-cols-[auto_minmax(0,1fr)_5.5rem_auto] sm:items-center",
                  active ? "border-primary/40 bg-primary/10" : "border-border",
                )}
              >
                <span className="w-5 text-center text-[0.65rem] text-muted-foreground">
                  {index + 1}
                </span>
                <input
                  value={event.title}
                  onChange={(e) => updateEvent(event.id, { title: e.target.value })}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary/40"
                  dir="auto"
                />
                <label className="block min-w-0">
                  <span className="mb-1 block text-[0.6rem] uppercase tracking-wide text-muted-foreground sm:sr-only">
                    Minutes
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={Math.round(event.durationSeconds / 60)}
                    onChange={(e) =>
                      updateEvent(event.id, {
                        durationSeconds: clampDurationSeconds(Number(e.target.value) * 60),
                      })
                    }
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm tabular-nums outline-none focus:border-primary/40"
                    aria-label="Duration minutes"
                    title="Minutes"
                  />
                </label>
                <button
                  type="button"
                  disabled={draftEvents.length <= 1}
                  onClick={() =>
                    setDraftEvents((prev) => prev.filter((row) => row.id !== event.id))
                  }
                  className="rounded-md p-1.5 text-muted-foreground hover:text-rose-400 disabled:opacity-30"
                  aria-label="Delete event"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        disabled={busy !== null}
        onClick={persistEvents}
        className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy === "save" ? "Saving…" : "Save schedule"}
      </button>
    </div>
  );
}
