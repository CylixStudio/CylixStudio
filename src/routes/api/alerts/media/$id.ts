import { createFileRoute } from "@tanstack/react-router";
import { alertResponse, authorizeAlertRequest } from "@/lib/alertAccess.server";
import { getAlertMedia, removeAlertMedia } from "@/lib/alertStudio.server";
export const Route = createFileRoute("/api/alerts/media/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        alertResponse(async () => getAlertMedia(await authorizeAlertRequest(request), params.id)),
      DELETE: async ({ request, params }) =>
        alertResponse(async () =>
          Response.json(await removeAlertMedia(await authorizeAlertRequest(request), params.id), {
            headers: { "cache-control": "no-store" },
          }),
        ),
    },
  },
});
