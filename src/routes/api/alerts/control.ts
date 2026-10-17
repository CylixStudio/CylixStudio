import { createFileRoute } from "@tanstack/react-router";
import { alertResponse, authorizeAlertRequest, alertJson } from "@/lib/alertAccess.server";
import { controlState, controlAlertQueue } from "@/lib/alertStudio.server";
export const Route = createFileRoute("/api/alerts/control")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        alertResponse(async () => {
          const id = await authorizeAlertRequest(request);
          return Response.json(await controlState(id.ownerId), {
            headers: { "cache-control": "no-store" },
          });
        }),
      POST: async ({ request }) =>
        alertResponse(async () => {
          const id = await authorizeAlertRequest(request);
          const body = await alertJson(request);
          return Response.json(await controlAlertQueue(id, String(body["action"] ?? "")), {
            headers: { "cache-control": "no-store" },
          });
        }),
    },
  },
});
