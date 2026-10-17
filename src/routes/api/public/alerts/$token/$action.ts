import { createFileRoute } from "@tanstack/react-router";
import { alertResponse, alertJson, AlertHttpError } from "@/lib/alertAccess.server";
import { overlayOperation } from "@/lib/alertStudio.server";
export const Route = createFileRoute("/api/public/alerts/$token/$action")({
  server: {
    handlers: {
      GET: async ({ params }) =>
        alertResponse(async () => {
          if (params.action !== "status") throw new AlertHttpError(405, "method_not_allowed");
          return Response.json(await overlayOperation(params.token, "status"), {
            headers: { "cache-control": "no-store" },
          });
        }),
      POST: async ({ request, params }) =>
        alertResponse(async () => {
          if (params.action === "status") throw new AlertHttpError(405, "method_not_allowed");
          return Response.json(
            await overlayOperation(params.token, params.action, await alertJson(request)),
            { headers: { "cache-control": "no-store" } },
          );
        }),
    },
  },
});
