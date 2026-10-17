import { createFileRoute } from "@tanstack/react-router";
import { alertResponse, authorizeAlertRequest } from "@/lib/alertAccess.server";
export const Route = createFileRoute("/api/alerts/access")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        alertResponse(async () => {
          await authorizeAlertRequest(request);
          return Response.json({ admin: true }, { headers: { "cache-control": "no-store" } });
        }),
    },
  },
});
