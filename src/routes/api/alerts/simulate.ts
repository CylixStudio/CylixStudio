import { createFileRoute } from "@tanstack/react-router";
import { alertResponse, authorizeAlertRequest, alertJson } from "@/lib/alertAccess.server";
import { simulateAlert } from "@/lib/alertStudio.server";
export const Route = createFileRoute("/api/alerts/simulate")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        alertResponse(async () => {
          const identity = await authorizeAlertRequest(request);
          return Response.json(await simulateAlert(identity, await alertJson(request)), {
            headers: { "cache-control": "no-store" },
          });
        }),
    },
  },
});
