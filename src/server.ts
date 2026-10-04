import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { registerRequestContext } from "./lib/requestContext.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function isClientAbort(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const err = error as { name?: string; message?: string; code?: string; cause?: unknown };
  const message = String(err.message ?? "");
  return (
    err.name === "AbortError" ||
    err.code === "ECONNRESET" ||
    /\baborted\b/i.test(message) ||
    /request aborted|socket hang up/i.test(message) ||
    isClientAbort(err.cause)
  );
}

void import("./lib/relaySockets.server")
  .then((mod) => mod.startRelaySockets())
  .catch((error: unknown) => {
    console.error("[relay-sockets] not started", error instanceof Error ? error.message : "error");
  });

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const unregister = registerRequestContext(request, ctx);
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      // Client disconnected (navigation/refresh/closed SSE) — not a server fault.
      if (isClientAbort(error) || request.signal.aborted) {
        return new Response(null, { status: 499 });
      }
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } finally {
      unregister();
    }
  },
};

