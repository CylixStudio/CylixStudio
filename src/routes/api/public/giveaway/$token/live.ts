import { createFileRoute } from "@tanstack/react-router";

/** Public, token-gated snapshot of the giveaway display for OBS browser sources. */
export const Route = createFileRoute("/api/public/giveaway/$token/live")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("giveaway_settings")
          .select("user_id, keyword, draw_state, last_winner")
          .eq("overlay_token", params.token)
          .maybeSingle();
        if (!settings) return Response.json({ error: "overlay_not_found" }, { status: 404 });
        const { userHasActivePro } = await import("@/lib/subscription.server");
        if (!(await userHasActivePro(supabaseAdmin, settings.user_id))) {
          return Response.json({ error: "overlay_not_found" }, { status: 404 });
        }

        const { data: participants } = await supabaseAdmin
          .from("giveaway_participants")
          .select("id, platform, username")
          .eq("user_id", settings.user_id)
          .order("created_at", { ascending: false })
          .limit(400);

        return Response.json(
          {
            keyword: settings.keyword ?? "+1",
            draw: settings.draw_state ?? null,
            lastWinner: settings.last_winner ?? null,
            participants: participants ?? [],
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
