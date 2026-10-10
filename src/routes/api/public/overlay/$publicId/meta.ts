import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/overlay/$publicId/meta")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        // Token-gated public metadata lookup. The token is an unguessable
        // UUID and only safe columns leave the server.
        const { supabaseAdmin } = await import("@/lib/supabase/client.server");

        const { data: widget } = await supabaseAdmin
          .from("widgets")
          .select("id, name, type, config, is_enabled, user_id")
          .eq("public_token", params.publicId)
          .maybeSingle();

        if (widget?.is_enabled) {
          const { userHasActivePro } = await import("@/lib/subscription.server");
          const { clampFreeWidgetConfig, isProOnlyWidgetType } = await import("@/lib/planLimits");
          const ownerPro = await userHasActivePro(supabaseAdmin, widget.user_id);
          if (!ownerPro && isProOnlyWidgetType(widget.type)) {
            return Response.json({ error: "overlay_not_found" }, { status: 404 });
          }
          const config = ownerPro ? widget.config : clampFreeWidgetConfig(widget.type, widget.config);
          return Response.json(
            {
              widget: {
                id: widget.id,
                name: widget.name,
                type: widget.type,
                config,
              },
              // Back-compat for clients that only read `overlay.theme`.
              overlay: { name: widget.name, theme: config },
            },
            { headers: { "cache-control": "no-store" } },
          );
        }

        const { data: overlay } = await supabaseAdmin
          .from("overlays")
          .select("id, name, theme, subathon_id")
          .eq("public_token", params.publicId)
          .maybeSingle();

        if (!overlay) {
          return Response.json({ error: "overlay_not_found" }, { status: 404 });
        }

        const { data: subathon } = await supabaseAdmin
          .from("subathons")
          .select("user_id")
          .eq("id", overlay.subathon_id)
          .maybeSingle();
        const { userHasActivePro } = await import("@/lib/subscription.server");
        const ownerPro = subathon ? await userHasActivePro(supabaseAdmin, subathon.user_id) : false;
        if (!ownerPro) {
          return Response.json({ error: "overlay_not_found" }, { status: 404 });
        }

        return Response.json(
          {
            widget: {
              id: overlay.id,
              name: overlay.name,
              type: "SUBATHON_TIMER" as const,
              config: overlay.theme,
            },
            overlay,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
