import { createFileRoute } from "@tanstack/react-router";

import { clipStoragePath, publicClipMediaUrl } from "@/lib/clipStorage";

/**
 * Public playback data for a captured clip. Only the clip's own random id is
 * needed — no creator data is exposed beyond the clip's public metadata.
 *
 * Stored HLS objects are streamed with the service-role client (`?media=1`)
 * so the browser never opens a storage JWT. Kick clip ids are not signed.
 */
export const Route = createFileRoute("/api/public/clip/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("clips")
          .select("id, title, url, external_id, thumbnail_url, duration_seconds, clipped_by, created_at")
          .eq("id", params.id)
          .maybeSingle();

        if (!data) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        }

        const objectPath = clipStoragePath(data.external_id);
        const wantsMedia = new URL(request.url).searchParams.get("media") === "1";
        if (wantsMedia) {
          if (!objectPath) {
            return new Response(JSON.stringify({ error: "not_found" }), {
              status: 404,
              headers: { "content-type": "application/json", "cache-control": "no-store" },
            });
          }
          const { downloadClipObject } = await import("@/lib/clipStorage.server");
          const file = await downloadClipObject(objectPath);
          if (!file) {
            return new Response(JSON.stringify({ error: "not_found" }), {
              status: 404,
              headers: { "content-type": "application/json", "cache-control": "no-store" },
            });
          }
          return new Response(file, {
            status: 200,
            headers: {
              "content-type": "video/mp2t",
              "cache-control": "private, max-age=3600",
            },
          });
        }

        return new Response(
          JSON.stringify({
            id: data.id,
            title: data.title,
            url: objectPath ? publicClipMediaUrl(data.id) : data.url,
            thumbnail: data.thumbnail_url,
            duration: data.duration_seconds,
            clippedBy: data.clipped_by,
            createdAt: data.created_at,
          }),
          { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } },
        );
      },
    },
  },
});
