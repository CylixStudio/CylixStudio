import { createFileRoute } from "@tanstack/react-router";
import {
  alertResponse,
  authorizeAlertRequest,
  boundedBody,
  AlertHttpError,
} from "@/lib/alertAccess.server";
import { uploadAlertMedia } from "@/lib/alertStudio.server";
import { PRO_MEDIA_BYTES } from "@/lib/alertStudio";
export const Route = createFileRoute("/api/alerts/media")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        alertResponse(async () => {
          const id = await authorizeAlertRequest(request);
          if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
            throw new AlertHttpError(415, "multipart_required");
          const bytes = await boundedBody(request, PRO_MEDIA_BYTES + 65536);
          const form = await new Response(bytes.buffer as ArrayBuffer, {
            headers: { "content-type": request.headers.get("content-type")! },
          }).formData();
          return Response.json(await uploadAlertMedia(id, form), {
            headers: { "cache-control": "no-store" },
          });
        }),
    },
  },
});
