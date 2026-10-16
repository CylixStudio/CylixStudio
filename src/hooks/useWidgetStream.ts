import { useEffect, useRef, useState } from "react";

import { useTimerSession } from "@/hooks/useTimerSession";
import { useWidgetRealtime } from "@/hooks/useWidgetRealtime";
import type { ChatMessage, ChatSources } from "@/hooks/useLiveChat";
import {
  readChatLine,
  reconcileChatLines,
  type ChatLinkStatus,
  type OverlayChatLine,
} from "@/lib/overlayChat";
import {
  createOverlayLink,
  eventFromBroadcast,
  FALLBACK_MS,
  mergeAlert,
  mergeServerEvents,
  needsDirectRead,
  SSE_BOOT_MS,
} from "@/lib/overlayTransport";
import { readReplyMeta } from "@/lib/replyAlert";
import type { StreamEventsRuntime } from "@/lib/streamEventsSchedule";
import type { PollRuntime, PredictionRuntime } from "@/lib/interactiveWidgets";
import type { TimerFrame } from "@/lib/timer";
import type {
  GoalSnapshot,
  OverlayEvent,
  SpinState,
  SpotlightMessage,
  TapperEntry,
  WidgetType,
} from "@/lib/widgets";

function mergePreviewTests(pending: OverlayEvent[], server: OverlayEvent[]) {
  const ids = new Set(server.map((event) => event.id));
  const nextPending = pending.filter((event) => !ids.has(event.id));
  if (nextPending.length === 0) return { pending: nextPending, events: server };
  const events = [...nextPending, ...server].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return { pending: nextPending, events };
}

export type StreamStatus = ChatLinkStatus;

export type StreamWidget = {
  id: string;
  name: string;
  type: WidgetType;
  config: unknown;
};

type Snapshot = {
  widget: StreamWidget;
  frame: TimerFrame | null;
  goal: GoalSnapshot | null;
  events: OverlayEvent[];
  spin: SpinState | null;
  spotlight?: SpotlightMessage | null;
  streamEvents?: StreamEventsRuntime | null;
  poll?: PollRuntime | null;
  prediction?: PredictionRuntime | null;
  tappers?: TapperEntry[];
  tapGoal?: { taps: number } | null;
  chat?: ChatSources | null;
  chatMessages?: OverlayChatLine[];
};

/**
 * One direct stream while it is healthy. /live runs only after that stream
 * drops, and once more when a broadcast changes timer, goal, or widget state
 * the stream has not pushed yet. The subathon second still comes from the
 * absolute end time.
 */
export function useWidgetStream(publicToken: string | null) {
  const [widget, setWidget] = useState<StreamWidget | null>(null);
  const [frame, setFrame] = useState<TimerFrame | null>(null);
  const countdown = useTimerSession(frame != null, publicToken);
  const [goal, setGoal] = useState<GoalSnapshot | null>(null);
  const [events, setEvents] = useState<OverlayEvent[]>([]);
  const [spin, setSpin] = useState<SpinState | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightMessage | null>(null);
  const [streamEvents, setStreamEvents] = useState<StreamEventsRuntime | null>(null);
  const [pollRuntime, setPollRuntime] = useState<PollRuntime | null>(null);
  const [predictionRuntime, setPredictionRuntime] = useState<PredictionRuntime | null>(null);
  const [tappers, setTappers] = useState<TapperEntry[]>([]);
  const [tapGoal, setTapGoal] = useState(0);
  const [chat, setChat] = useState<ChatSources | null>(null);
  const [chatMessages, setChatMessages] = useState<OverlayChatLine[]>([]);
  const [testMessages, setTestMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const previewTests = useRef<OverlayEvent[]>([]);
  const sawLive = useRef(false);

  const adoptServerEvents = (server: OverlayEvent[]) => {
    const merged = mergePreviewTests(previewTests.current, server);
    previewTests.current = merged.pending;
    return merged.events;
  };

  const pullRef = useRef<((reason: "fallback" | "refresh") => void) | null>(null);

  useEffect(() => {
    if (!publicToken) return;
    const link = createOverlayLink();
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    let boot: ReturnType<typeof setTimeout> | null = null;
    let flight: AbortController | null = null;
    let cancelled = false;
    let pulling = false;
    let queued: "fallback" | "refresh" | null = null;

    const applySnapshot = (payload: Snapshot) => {
      setWidget(payload.widget);
      setGoal(payload.goal);
      setEvents((current) => mergeServerEvents(adoptServerEvents(payload.events ?? []), current));
      setSpin(payload.spin);
      setSpotlight(payload.spotlight ?? null);
      setStreamEvents(payload.streamEvents ?? null);
      setPollRuntime(payload.poll ?? null);
      setPredictionRuntime(payload.prediction ?? null);
      setTappers(payload.tappers ?? []);
      setTapGoal(payload.tapGoal?.taps ?? 0);
      if (payload.chat) setChat(payload.chat);
      if (Array.isArray(payload.chatMessages)) {
        setChatMessages((prev) => reconcileChatLines(prev, payload.chatMessages ?? []));
      }
      if (payload.frame) {
        countdown.adopt(payload.frame, link.streamOpen() ? "realtime" : "sync");
        setFrame(payload.frame);
      }
      sawLive.current = true;
      setStatus("live");
    };

    const stopFallback = () => {
      if (fallback) clearInterval(fallback);
      fallback = null;
    };

    const pull = (reason: "fallback" | "refresh") => {
      if (cancelled || !publicToken) return;
      if (reason === "fallback" && !link.fallbackActive()) return;
      if (pulling) {
        queued = reason === "refresh" || queued === "refresh" ? "refresh" : reason;
        return;
      }
      pulling = true;
      flight?.abort();
      const controller = new AbortController();
      flight = controller;
      void (async () => {
        try {
          const response = await fetch(`/api/public/overlay/${publicToken}/live`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (controller.signal.aborted || cancelled) return;
          if (response.status === 404) {
            cancelled = true;
            stopFallback();
            if (retry) clearTimeout(retry);
            source?.close();
            source = null;
            setStatus("error");
            return;
          }
          if (!response.ok) {
            setStatus((current) => (current === "live" ? "reconnecting" : current));
            return;
          }
          applySnapshot((await response.json()) as Snapshot);
        } catch {
          if (controller.signal.aborted || cancelled) return;
          setStatus((current) => (current === "live" ? "reconnecting" : current));
        } finally {
          pulling = false;
          const next = queued;
          queued = null;
          if (next && !cancelled) pull(next);
        }
      })();
    };
    pullRef.current = pull;

    const startFallback = () => {
      if (fallback || cancelled) return;
      pull("fallback");
      fallback = setInterval(() => pull("fallback"), FALLBACK_MS);
    };

    const connect = () => {
      if (cancelled) return;
      if (!link.begin().opened) return;
      source?.close();
      source = new EventSource(`/api/public/overlay/${publicToken}/stream`);

      source.addEventListener("init", (event) => {
        sawLive.current = true;
        link.opened();
        stopFallback();
        applySnapshot(JSON.parse((event as MessageEvent).data) as Snapshot);
      });
      source.addEventListener("chatlines", (event) => {
        const next = JSON.parse((event as MessageEvent).data) as OverlayChatLine[];
        setChatMessages((prev) => reconcileChatLines(prev, Array.isArray(next) ? next : []));
      });
      source.addEventListener("state", (event) => {
        const next = JSON.parse((event as MessageEvent).data) as TimerFrame;
        countdown.adopt(next, "realtime");
        setFrame(next);
      });
      source.addEventListener("goal", (event) => {
        setGoal(JSON.parse((event as MessageEvent).data) as GoalSnapshot | null);
      });
      source.addEventListener("events", (event) => {
        const server = JSON.parse((event as MessageEvent).data) as OverlayEvent[];
        setEvents((current) => mergeServerEvents(adoptServerEvents(server), current));
      });
      source.addEventListener("spotlight", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as {
          spotlight: SpotlightMessage | null;
          config: unknown;
        };
        setSpotlight(payload.spotlight);
        setWidget((current) => (current ? { ...current, config: payload.config } : current));
      });
      source.addEventListener("streamevents", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as {
          streamEvents: StreamEventsRuntime | null;
          config: unknown;
        };
        setStreamEvents(payload.streamEvents);
        setWidget((current) => (current ? { ...current, config: payload.config } : current));
      });
      source.addEventListener("poll", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as {
          poll: PollRuntime | null;
          config: unknown;
        };
        setPollRuntime(payload.poll);
        setWidget((current) => (current ? { ...current, config: payload.config } : current));
      });
      source.addEventListener("prediction", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as {
          prediction: PredictionRuntime | null;
          config: unknown;
        };
        setPredictionRuntime(payload.prediction);
        setWidget((current) => (current ? { ...current, config: payload.config } : current));
      });
      source.addEventListener("tappers", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as {
          tappers: TapperEntry[];
          config: unknown;
        };
        setTappers(payload.tappers ?? []);
        setWidget((current) => (current ? { ...current, config: payload.config } : current));
      });
      source.addEventListener("tapgoal", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as {
          tapGoal: { taps: number } | null;
          config: unknown;
        };
        setTapGoal(payload.tapGoal?.taps ?? 0);
        setWidget((current) => (current ? { ...current, config: payload.config } : current));
      });
      source.addEventListener("spin", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as {
          spin: SpinState | null;
          config: unknown;
        };
        setSpin(payload.spin);
        setWidget((current) => (current ? { ...current, config: payload.config } : current));
      });

      source.onerror = () => {
        source?.close();
        source = null;
        const lost = link.lost();
        if (cancelled) return;
        setStatus(sawLive.current ? "reconnecting" : "connecting");
        if (lost.startFallback) startFallback();
        if (!lost.schedule) return;
        if (retry) clearTimeout(retry);
        retry = setTimeout(() => {
          retry = null;
          link.retryDue();
          connect();
        }, lost.delay);
      };
    };

    connect();
    boot = setTimeout(() => {
      if (!cancelled && link.bootTimedOut()) startFallback();
    }, SSE_BOOT_MS);

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      if (boot) clearTimeout(boot);
      stopFallback();
      flight?.abort();
      source?.close();
      link.closed();
      pullRef.current = null;
    };
  }, [publicToken, countdown.adopt]);

  useWidgetRealtime(widget?.id ?? null, (message) => {
    if (message.event === "alert") {
      const next = eventFromBroadcast(message.payload);
      if (next) {
        if (next.isTest) {
          previewTests.current = [
            next,
            ...previewTests.current.filter((event) => event.id !== next.id),
          ].slice(0, 8);
        }
        setEvents((current) => mergeAlert(current, next));
      }
      if (needsDirectRead(message.payload)) pullRef.current?.("refresh");
      return;
    }
    if (message.event === "chat") {
      const payload = message.payload as Partial<ChatMessage> & Record<string, unknown>;
      const liveLine = readChatLine(payload);
      if (liveLine) setChatMessages((prev) => reconcileChatLines(prev, [liveLine]));
      const reply = readReplyMeta(payload);
      setTestMessages((prev) =>
        [
          {
            id: String(payload.id ?? `test-${Date.now()}`),
            platform: (payload.platform as ChatMessage["platform"]) ?? "TEST",
            author: String(payload.author ?? "Tester"),
            color: (payload.color as string | null) ?? null,
            badges: Array.isArray(payload.badges) ? (payload.badges as string[]) : [],
            text: String(payload.text ?? ""),
            at:
              typeof payload.at === "number" && payload.at > 0
                ? payload.at
                : (reply.appearanceMs ?? Date.now()),
            isReply: payload.isReply === true || reply.isReply,
            replyQuote: typeof payload.replyQuote === "string" ? payload.replyQuote : reply.quote,
          },
          ...prev,
        ].slice(0, 25),
      );
      return;
    }
    pullRef.current?.("refresh");
  });

  const shownFrame =
    frame && countdown.status === "ENDED" && frame.status === "RUNNING"
      ? { ...frame, status: "ENDED" as const, remainingSeconds: 0, remainingMs: 0 }
      : frame;

  return {
    widget,
    frame: shownFrame,
    remaining: countdown.remaining,
    goal,
    events,
    spin,
    spotlight,
    streamEvents,
    poll: pollRuntime,
    prediction: predictionRuntime,
    tappers,
    tapGoal,
    chat,
    chatMessages,
    testMessages,
    status,
  };
}
