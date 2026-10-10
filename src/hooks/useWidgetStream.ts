import { useCallback, useEffect, useRef, useState } from "react";

import { useWidgetRealtime } from "@/hooks/useWidgetRealtime";
import type { ChatMessage, ChatSources } from "@/hooks/useLiveChat";
import { readReplyMeta } from "@/lib/replyAlert";
import type { StreamEventsRuntime } from "@/lib/streamEventsSchedule";
import type { PollRuntime, PredictionRuntime } from "@/lib/interactiveWidgets";
import { computeRemaining, type TimerFrame } from "@/lib/timer";
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

function previewFromAlert(payload: Record<string, unknown>): OverlayEvent | null {
  if (payload["isTest"] !== true) return null;
  const id = typeof payload["eventId"] === "string" ? payload["eventId"] : "";
  if (!id) return null;
  const amount = payload["amount"];
  const quantity = payload["quantity"];
  return {
    id,
    platform: String(payload["platform"] ?? ""),
    eventType: String(payload["eventType"] ?? ""),
    actorName: typeof payload["actorName"] === "string" ? payload["actorName"] : null,
    amount: typeof amount === "number" && Number.isFinite(amount) ? amount : null,
    currency: typeof payload["currency"] === "string" ? payload["currency"] : null,
    quantity: typeof quantity === "number" && quantity > 0 ? quantity : 1,
    secondsAdded: 0,
    createdAt: new Date().toISOString(),
    isTest: true,
  };
}

export type StreamStatus = "connecting" | "live" | "error";

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
};

/**
 * Single subscription that powers every public widget renderer. Three layers
 * keep OBS in sync: Supabase Realtime broadcasts (instant), SSE (fast path)
 * and a light poll (guaranteed convergence). The timer is re-derived locally
 * against the last server frame so rendering stays smooth between pushes.
 */
export function useWidgetStream(publicToken: string | null) {
  const [widget, setWidget] = useState<StreamWidget | null>(null);
  const [frame, setFrame] = useState<TimerFrame | null>(null);
  const [remaining, setRemaining] = useState(0);
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
  const [testMessages, setTestMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const offsetRef = useRef(0);
  const previewTests = useRef<OverlayEvent[]>([]);

  const adoptServerEvents = (server: OverlayEvent[]) => {
    const merged = mergePreviewTests(previewTests.current, server);
    previewTests.current = merged.pending;
    return merged.events;
  };

  useEffect(() => {
    if (!publicToken) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let cancelled = false;

    const onFrame = (next: TimerFrame) => {
      offsetRef.current = next.serverTime - Date.now();
      setFrame(next);
      setRemaining(next.remainingSeconds);
    };

    const connect = () => {
      if (cancelled) return;
      source = new EventSource(`/api/public/overlay/${publicToken}/stream`);

      source.addEventListener("init", (event) => {
        attempts = 0;
        const payload = JSON.parse((event as MessageEvent).data) as Snapshot;
        setWidget(payload.widget);
        setGoal(payload.goal);
        setEvents(adoptServerEvents(payload.events ?? []));
        setSpin(payload.spin);
        setSpotlight(payload.spotlight ?? null);
        setStreamEvents(payload.streamEvents ?? null);
        setPollRuntime(payload.poll ?? null);
        setPredictionRuntime(payload.prediction ?? null);
        setTappers(payload.tappers ?? []);
        setTapGoal(payload.tapGoal?.taps ?? 0);
        setChat(payload.chat ?? null);
        if (payload.frame) onFrame(payload.frame);
        setStatus("live");
      });

      source.addEventListener("state", (event) => {
        onFrame(JSON.parse((event as MessageEvent).data) as TimerFrame);
      });
      source.addEventListener("goal", (event) => {
        setGoal(JSON.parse((event as MessageEvent).data) as GoalSnapshot | null);
      });
      source.addEventListener("events", (event) => {
        setEvents(adoptServerEvents(JSON.parse((event as MessageEvent).data) as OverlayEvent[]));
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
        setStatus("error");
        source?.close();
        source = null;
        if (cancelled) return;
        attempts += 1;
        const delay = Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4));
        retry = setTimeout(() => {
          setStatus("connecting");
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [publicToken]);

  const poll = useCallback(async () => {
    if (!publicToken) return;
    try {
      const response = await fetch(`/api/public/overlay/${publicToken}/live`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as Snapshot;
      setWidget(payload.widget);
      setGoal(payload.goal);
      setEvents(adoptServerEvents(payload.events ?? []));
      setSpin(payload.spin);
      setSpotlight(payload.spotlight ?? null);
      setStreamEvents(payload.streamEvents ?? null);
      setPollRuntime(payload.poll ?? null);
      setPredictionRuntime(payload.prediction ?? null);
      setTappers(payload.tappers ?? []);
      setTapGoal(payload.tapGoal?.taps ?? 0);
      if (payload.chat) setChat(payload.chat);
      if (payload.frame) {
        offsetRef.current = payload.frame.serverTime - Date.now();
        setFrame(payload.frame);
        setRemaining(payload.frame.remainingSeconds);
      }
      setStatus("live");
    } catch {
      /* the SSE reconnect loop reports connection problems */
    }
  }, [publicToken]);

  useEffect(() => {
    if (!publicToken) return;
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => clearInterval(id);
  }, [publicToken, poll]);

  useWidgetRealtime(widget?.id ?? null, (message) => {
    if (message.event === "alert") {
      const preview = previewFromAlert(message.payload);
      if (preview) {
        previewTests.current = [
          preview,
          ...previewTests.current.filter((event) => event.id !== preview.id),
        ].slice(0, 8);
        setEvents((current) => [preview, ...current.filter((event) => event.id !== preview.id)]);
      }
    }
    if (message.event === "chat") {
      const payload = message.payload as Partial<ChatMessage>;
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
    void poll();
  });

  useEffect(() => {
    if (!frame) return;
    const id = setInterval(() => {
      setRemaining(computeRemaining(frame, Date.now() + offsetRef.current));
    }, 250);
    return () => clearInterval(id);
  }, [frame]);

  return {
    widget,
    frame,
    remaining,
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
    testMessages,
    status,
  };
}
