import { createFileRoute } from "@tanstack/react-router";

import { snapshotFromRow, toFrame } from "@/lib/timer";
import {
  parseSpinState,
  parseSpotlightState,
  parseStreamEventsScheduleState,
  parseTappers,
  parseTappersConfig,
  type OverlayEvent,
} from "@/lib/widgets";

/**
 * Token-gated snapshot of everything an overlay renders. The SSE stream keeps
 * long-lived connections cheap, but each poll of this endpoint is a brand new
 * request, which guarantees the overlay always converges on fresh data even
 * when a stream connection goes quiet.
 */
export const Route = createFileRoute("/api/public/overlay/$publicId/live")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const supabase = supabaseAdmin;

        const { data: widget } = await supabase
          .from("widgets")
          .select(
            "id, name, type, config, state, subathon_id, user_id, is_enabled, subathons(title, max_duration_seconds)",
          )
          .eq("public_token", params.publicId)
          .maybeSingle();

        if (!widget || !widget.is_enabled) {
          return Response.json({ error: "overlay_not_found" }, { status: 404 });
        }

        let subathon = Array.isArray(widget.subathons) ? widget.subathons[0] : widget.subathons;
        let subathonId = widget.subathon_id;
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
            subathon = {
              title: fallback.title,
              max_duration_seconds: fallback.max_duration_seconds,
            };
          }
        }

        const type = widget.type;
        const maxTimeSeconds = subathon?.max_duration_seconds ?? null;

        let frame = null;
        if (type === "SUBATHON_TIMER" && subathonId) {
          const { data: row } = await supabase
            .from("timer_states")
            .select("*")
            .eq("subathon_id", subathonId)
            .maybeSingle();
          if (row) frame = toFrame(snapshotFromRow(row, maxTimeSeconds), Date.now());
        }

        let goal = null;
        if (type === "GOAL_BAR") {
          const { data } = await supabase
            .from("goals")
            .select("title, unit, target_value, current_value")
            .eq("widget_id", widget.id)
            .maybeSingle();
          if (data) {
            goal = {
              title: data.title,
              unit: data.unit,
              target: Number(data.target_value),
              current: Number(data.current_value),
            };
          }
        }

        let events: OverlayEvent[] = [];
        if (
          type === "ALERT_BOX" ||
          type === "CHAT_BOX" ||
          type === "EMOTE_RAIN" ||
          type === "SUBATHON_TIMER"
        ) {
          const { listOverlayEvents } = await import("@/lib/targets.server");
          events = await listOverlayEvents(supabase, {
            userId: widget.user_id,
            subathonId,
            limit: type === "CHAT_BOX" ? 25 : 5,
          });
        }

        let tappers = null;
        if (type === "TIKTOK_TAPPERS" && subathonId) {
          const { data } = await supabase.rpc("overlay_tiktok_tappers", {
            p_subathon: subathonId,
            p_limit: parseTappersConfig(widget.config).topLimit,
          });
          tappers = parseTappers(data);
        }

        let tapGoal = null;
        if (type === "TIKTOK_TAP_GOAL" && subathonId) {
          const { data } = await supabase.rpc("overlay_tiktok_tap_total", {
            p_subathon: subathonId,
          });
          tapGoal = { taps: Number(data ?? 0) || 0 };
        }

        const spin = type === "SPIN_WHEEL" ? parseSpinState(widget.state) : null;
        const spotlight = type === "CHAT_SPOTLIGHT" ? parseSpotlightState(widget.state) : null;
        const streamEvents =
          type === "STREAM_EVENTS_SCHEDULE" ? parseStreamEventsScheduleState(widget.state) : null;

        let chat = null;
        if (type === "CHAT_BOX" || type === "CHAT_SPOTLIGHT") {
          const { resolveChatSources } = await import("@/lib/chatSources.server");
          chat = await resolveChatSources(supabase, widget.user_id);
        }

        return Response.json(
          {
            widget: { id: widget.id, name: widget.name, type, config: widget.config },
            frame,
            goal,
            events,
            spin,
            spotlight,
            streamEvents,
            tappers,
            tapGoal,
            chat,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
