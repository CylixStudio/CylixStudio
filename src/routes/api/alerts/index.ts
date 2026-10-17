import { createFileRoute } from "@tanstack/react-router";
import { alertResponse, authorizeAlertRequest, alertJson } from "@/lib/alertAccess.server";
import { readAlertStudio, saveAlertStudio } from "@/lib/alertStudio.server";
export const Route = createFileRoute("/api/alerts/")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        alertResponse(async () => {
          const identity = await authorizeAlertRequest(request);
          return Response.json(await readAlertStudio(identity), {
            headers: { "cache-control": "no-store" },
          });
        }),
      PUT: async ({ request }) =>
        alertResponse(async () => {
          const identity = await authorizeAlertRequest(request);
          return Response.json(await saveAlertStudio(identity, await alertJson(request)), {
            headers: { "cache-control": "no-store" },
          });
        }),
    },
  },
});
