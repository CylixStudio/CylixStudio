import { createFileRoute } from "@tanstack/react-router";

import type { Database } from "@/lib/supabase/types";
import { snapshotFromRow, toFrame } from "@/lib/timer";
import type { OverlayEvent } from "@/lib/widgets";
import {
  parseSpinState,
  parseSpotlightState,
  parseStreamEventsScheduleState,
  parseTappers,
  parseTappersConfig,
} from "@/lib/widgets";

const TICK_MS = 1000;
const DB_POLL_MS = 2000;
const HEARTBEAT_MS = 15_000;
const MAX_LIFETIME_MS = 30 * 60 * 1000;

type TimerRow = Database["public"]["Tables"]["timer_states"]["Row"];

export const Route = createFileRoute("/api/public/overlay/$publicId/stream")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        // Token-gated lookup performed server-side with the privileged
        // client: widgets/overlays and timer_states are not publicly
        // listable, so share tokens cannot be enumerated via the Data API.
        const { overlayLiveClient } = await import("@/lib/overlayStream.server");
        const supabase = overlayLiveClient();

        const { data: widget } = await supabase
          .from("widgets")
          .select(
            "id, name, type, config, state, subathon_id, user_id, is_enabled, subathons(title, max_duration_seconds)",
          )
          .eq("public_token", params.publicId)
          .maybeSingle();

        if (!widget || !widget.is_enabled) {
          return new Response("overlay_not_found", { status: 404 });
        }

        let subathon = Array.isArray(widget.subathons) ? widget.subathons[0] : widget.subathons;
        let subathonId = widget.subathon_id;

        // Widgets created before/without a subathon still need live data:
        // fall back to the owner's most recent subathon.
        if (!subathonId) {
          const { data: fallback } = await supabase
            .from("subathons")
            .select("id, title, max_duration_seconds")
            .eq("user_id", widget.user_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fallback) {
            subathonId = fallback.id;
            subathon = { title: fallback.title, max_duration_seconds: fallback.max_duration_seconds };
          }
        }

        const maxTimeSeconds = subathon?.max_duration_seconds ?? null;
        const type = widget.type;

        const encoder = new TextEncoder();
        const abort = request.signal;

        let stopStream = () => {};

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let closed = false;
            let lastTimerPayload = "";
            let lastGoalPayload = "";
            let lastEventsPayload = "";
            let lastSpinPayload = "";
            let lastSpotlightPayload = "";
            let lastStreamEventsPayload = "";
            let lastTapGoalPayload = "";
            let lastTappersPayload = "";
            let lastTimerEventsPayload = "";
            let lastFetch = 0;
            let lastBeat = Date.now();
            const startedAt = Date.now();
            let row: TimerRow | null = null;

            const enqueue = (chunk: Uint8Array) => {
              if (closed) return;
              try {
                controller.enqueue(chunk);
              } catch {
                close();
              }
            };

            const send = (event: string, data: unknown) => {
              enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            const close = () => {
              if (closed) return;
              closed = true;
              clearInterval(interval);
              abort.removeEventListener("abort", close);
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            };
            stopStream = close;

            // Repeated identical PostgREST GETs inside one long-lived
            // connection can be served from the runtime HTTP cache, which
            // freezes the overlay on the data it saw first. Every poll adds a
            // harmless, always-true `created_at` filter with a unique value so
            // each request URL is distinct and always hits the database.
            let bustCounter = 0;
            const bust = () => new Date(++bustCounter).toISOString();

            const fetchTimer = async () => {
              if (!subathonId) return;
              const { data } = await supabase
                .from("timer_states")
                .select("*")
                .eq("subathon_id", subathonId)
                .gte("created_at", bust())
                .maybeSingle();
              row = data ?? row;
            };

            const fetchGoal = async () => {
              const { data } = await supabase
                .from("goals")
                .select("title, unit, target_value, current_value")
                .eq("widget_id", widget.id)
                .gte("created_at", bust())
                .maybeSingle();
              if (!data) return null;
              return {
                title: data.title,
                unit: data.unit,
                target: Number(data.target_value),
                current: Number(data.current_value),
              };
            };

            const fetchEvents = async (limit: number): Promise<OverlayEvent[]> => {
              const { listOverlayEvents } = await import("@/lib/targets.server");
              return listOverlayEvents(supabase, {
                userId: widget.user_id,
                subathonId,
                limit,
              });
            };

            const fetchWidgetState = async () => {
              const { data } = await supabase
                .from("widgets")
                .select("config, state")
                .eq("id", widget.id)
                .gte("created_at", bust())
                .maybeSingle();
              return data;
            };


            const fetchTappers = async (limit: number) => {
              if (!subathonId) return [];
              const { data } = await supabase.rpc("overlay_tiktok_tappers", {
                p_subathon: subathonId,
                p_limit: limit,
              });
              return parseTappers(data);
            };

            const fetchTapGoal = async () => {
              if (!subathonId) return { taps: 0 };
              const { data } = await supabase.rpc("overlay_tiktok_tap_total", {
                p_subathon: subathonId,
              });
              return { taps: Number(data ?? 0) || 0 };
            };

            const refresh = async () => {
              lastFetch = Date.now();
              if (type === "TIKTOK_TAP_GOAL") {
                const current = await fetchWidgetState();
                const config = current?.config ?? widget.config;
                const tapGoal = await fetchTapGoal();
                const payload = JSON.stringify({ tapGoal, config });
                if (payload !== lastTapGoalPayload) {
                  lastTapGoalPayload = payload;
                  lastBeat = Date.now();
                  send("tapgoal", { tapGoal, config });
                }
                return;
              }
              if (type === "TIKTOK_TAPPERS") {
                const current = await fetchWidgetState();
                const config = current?.config ?? widget.config;
                const tappers = await fetchTappers(parseTappersConfig(config).topLimit);
                const payload = JSON.stringify({ tappers, config });
                if (payload !== lastTappersPayload) {
                  lastTappersPayload = payload;
                  lastBeat = Date.now();
                  send("tappers", { tappers, config });
                }
                return;
              }
              if (type === "SUBATHON_TIMER") {
                await fetchTimer();
                const timerEvents = await fetchEvents(5);
                const timerPayload = JSON.stringify(timerEvents);
                if (timerPayload !== lastTimerEventsPayload) {
                  lastTimerEventsPayload = timerPayload;
                  lastBeat = Date.now();
                  send("events", timerEvents);
                }
                return;
              }
              if (type === "CHAT_SPOTLIGHT") {
                const current = await fetchWidgetState();
                const spotlight = parseSpotlightState(current?.state ?? null);
                const payload = JSON.stringify({ spotlight, config: current?.config ?? null });
                if (payload !== lastSpotlightPayload) {
                  lastSpotlightPayload = payload;
                  lastBeat = Date.now();
                  send("spotlight", { spotlight, config: current?.config ?? null });
                }
                return;
              }
              if (type === "STREAM_EVENTS_SCHEDULE") {
                const current = await fetchWidgetState();
                const streamEvents = parseStreamEventsScheduleState(current?.state ?? null);
                const payload = JSON.stringify({
                  streamEvents,
                  config: current?.config ?? null,
                });
                if (payload !== lastStreamEventsPayload) {
                  lastStreamEventsPayload = payload;
                  lastBeat = Date.now();
                  send("streamevents", { streamEvents, config: current?.config ?? null });
                }
                return;
              }
              if (type === "GOAL_BAR") {
                const goal = await fetchGoal();
                const payload = JSON.stringify(goal);
                if (payload !== lastGoalPayload) {
                  lastGoalPayload = payload;
                  lastBeat = Date.now();
                  send("goal", goal);
                }
                return;
              }
              if (type === "ALERT_BOX" || type === "CHAT_BOX" || type === "EMOTE_RAIN" || type === "EVENT_LABELS") {
                const events = await fetchEvents(type === "CHAT_BOX" ? 25 : type === "EVENT_LABELS" ? 50 : 5);
                const payload = JSON.stringify(events);
                if (payload !== lastEventsPayload) {
                  lastEventsPayload = payload;
                  lastBeat = Date.now();
                  send("events", events);
                }
                return;
              }
              if (type === "SPIN_WHEEL") {
                const current = await fetchWidgetState();
                const spin = parseSpinState(current?.state ?? null);
                const payload = JSON.stringify({ spin, config: current?.config ?? null });
                if (payload !== lastSpinPayload) {
                  lastSpinPayload = payload;
                  lastBeat = Date.now();
                  send("spin", { spin, config: current?.config ?? null });
                }
              }
            };

            const tick = async () => {
              if (closed) return;
              try {
                const now = Date.now();
                if (now - lastFetch >= DB_POLL_MS) await refresh();

                if (type === "SUBATHON_TIMER" && row) {
                  const frame = toFrame(snapshotFromRow(row, maxTimeSeconds), Date.now());
                  const { serverTime: _ignored, ...comparable } = frame;
                  const payload = JSON.stringify(comparable);
                  if (payload !== lastTimerPayload) {
                    lastTimerPayload = payload;
                    lastBeat = now;
                    send("state", frame);
                  }
                }

                if (now - lastBeat >= HEARTBEAT_MS) {
                  lastBeat = now;
                  enqueue(encoder.encode(": ping\n\n"));
                }
                if (now - startedAt > MAX_LIFETIME_MS) close();
              } catch {
                close();
              }
            };

            const interval = setInterval(() => void tick(), TICK_MS);
            abort.addEventListener("abort", close);

            enqueue(encoder.encode("retry: 2000\n\n"));

            if (type === "SUBATHON_TIMER") await fetchTimer();
            const goal = type === "GOAL_BAR" ? await fetchGoal() : null;
            const events =
              type === "ALERT_BOX" ||
              type === "CHAT_BOX" ||
              type === "EMOTE_RAIN" ||
              type === "SUBATHON_TIMER" ||
              type === "EVENT_LABELS"
                ? await fetchEvents(type === "CHAT_BOX" ? 25 : type === "EVENT_LABELS" ? 50 : 5)
                : [];
            const spin = type === "SPIN_WHEEL" ? parseSpinState(widget.state) : null;
            const spotlight = type === "CHAT_SPOTLIGHT" ? parseSpotlightState(widget.state) : null;
            const streamEvents =
              type === "STREAM_EVENTS_SCHEDULE"
                ? parseStreamEventsScheduleState(widget.state)
                : null;
            let chat = null;
            if (type === "CHAT_BOX" || type === "CHAT_SPOTLIGHT") {
              const { resolveChatSources } = await import("@/lib/chatSources.server");
              chat = await resolveChatSources(supabase, widget.user_id);
            }
            const tapGoal = type === "TIKTOK_TAP_GOAL" ? await fetchTapGoal() : null;
            const tappers =
              type === "TIKTOK_TAPPERS"
                ? await fetchTappers(parseTappersConfig(widget.config).topLimit)
                : [];
            lastFetch = Date.now();
            lastTappersPayload =
              type === "TIKTOK_TAPPERS"
                ? JSON.stringify({ tappers, config: widget.config })
                : "";
            lastTapGoalPayload =
              type === "TIKTOK_TAP_GOAL" ? JSON.stringify({ tapGoal, config: widget.config }) : "";
            lastGoalPayload = JSON.stringify(goal);
            lastEventsPayload = JSON.stringify(events);
            lastSpinPayload = JSON.stringify({ spin, config: widget.config });
            lastSpotlightPayload = JSON.stringify({ spotlight, config: widget.config });
            lastStreamEventsPayload = JSON.stringify({ streamEvents, config: widget.config });
            lastTimerEventsPayload = type === "SUBATHON_TIMER" ? JSON.stringify(events) : "";

            send("init", {
              widget: {
                id: widget.id,
                name: widget.name,
                type,
                config: widget.config,
              },
              subathon: { id: subathonId, title: subathon?.title ?? null },
              frame: row ? toFrame(snapshotFromRow(row, maxTimeSeconds), Date.now()) : null,
              goal,
              events,
              spin,
              spotlight,
              streamEvents,
              tappers,
              tapGoal,
              chat,
            });


            if (row) {
              const { serverTime: _init, ...comparable } = toFrame(
                snapshotFromRow(row, maxTimeSeconds),
              );
              lastTimerPayload = JSON.stringify(comparable);
            }
          },
          cancel() {
            stopStream();
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store, no-transform",
            connection: "keep-alive",
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
});
