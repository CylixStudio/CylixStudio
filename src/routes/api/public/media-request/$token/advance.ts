import { createFileRoute } from "@tanstack/react-router";

/** Overlay-side "video ended" signal: promotes the next approved request. */
export const Route = createFileRoute("/api/public/media-request/$token/advance")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const { data: settings } = await supabaseAdmin.from("media_request_settings")
          .select("user_id").eq("overlay_token", params.token).maybeSingle();
        if (!settings) return Response.json({ error: "overlay_not_found" }, { status: 404 });
        const { userHasActivePro } = await import("@/lib/subscription.server");
        if (!(await userHasActivePro(supabaseAdmin, settings.user_id))) {
          return Response.json({ error: "overlay_not_found" }, { status: 404 });
        }
        let finishedId: string | null = null;
        try {
          const body = await request.json() as { requestId?: string };
          finishedId = typeof body.requestId === "string" ? body.requestId : null;
        } catch { /* body is optional */ }
        const { advanceQueue } = await import("@/lib/mediaRequests.server");
        const result = await advanceQueue(settings.user_id, finishedId);
        return Response.json(result, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
