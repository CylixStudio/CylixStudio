import { createFileRoute } from "@tanstack/react-router";

/**
 * Token-gated target status for OBS widgets and bots.
 * The token is the widget's public overlay token.
 */
export const Route = createFileRoute("/api/public/targets/$publicId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const { listOverlayEvents, listTargetStatus } = await import("@/lib/targets.server");

        const { data: widget } = await supabaseAdmin
          .from("widgets")
          .select("id, user_id, is_enabled, type")
          .eq("public_token", params.publicId)
          .maybeSingle();
        if (!widget || !widget.is_enabled) {
          return Response.json({ error: "target_not_found" }, { status: 404 });
        }

        const targets = await listTargetStatus(supabaseAdmin, widget.user_id);
        const scoped =
          widget.type === "GOAL_BAR" ? targets.filter((target) => target.widgetId === widget.id) : targets;
        const { data: subathon } = await supabaseAdmin
          .from("subathons")
          .select("id")
          .eq("user_id", widget.user_id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const recentEvents = await listOverlayEvents(supabaseAdmin, {
          userId: widget.user_id,
          subathonId: subathon?.id ?? null,
          limit: 20,
        });
        const { data: milestones, error: milestoneError } = await supabaseAdmin
          .from("target_milestones")
          .select("id, goal_id, widget_id, target_value, reached_at")
          .eq("user_id", widget.user_id)
          .order("reached_at", { ascending: false })
          .limit(20);
        if (milestoneError && milestoneError.code !== "PGRST205") {
          return Response.json({ error: milestoneError.message }, { status: 500 });
        }

        return Response.json(
          {
            widgetId: widget.id,
            targets: scoped,
            recentEvents,
            milestones: milestones ?? [],
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
