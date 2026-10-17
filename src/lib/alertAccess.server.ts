import { createClient } from "@supabase/supabase-js";
import { accessTokenFromRequest } from "@/lib/supabase/sessionCookie";
import { createSupabaseFetch } from "@/lib/supabase/fetch";

export class AlertHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export type AlertIdentity = { actorId: string; ownerId: string };
type AccessDependencies = {
  verify: (token: string) => Promise<string | null>;
  admin: (id: string) => Promise<boolean>;
  owner: (id: string) => Promise<string>;
};
/** Purely fail-closed: neither a plan flag, workspace owner nor OBS token grants admin. */
export async function authorizeAlertRequest(
  request: Request,
  dependencies?: AccessDependencies,
): Promise<AlertIdentity> {
  const token = accessTokenFromRequest(request);
  if (!token) throw new AlertHttpError(401, "unauthorized");
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin &&
        origin !== new URL(request.url).origin &&
        origin !== process.env["PUBLIC_SITE_URL"]?.replace(/\/$/, ""))
    ) {
      throw new AlertHttpError(403, "origin_denied");
    }
  }
  const deps = dependencies ?? {
    verify: async (jwt: string) => {
      const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
      const key =
        process.env["SUPABASE_PUBLISHABLE_KEY"] ||
        process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
        process.env["SUPABASE_ANON_KEY"] ||
        process.env["VITE_SUPABASE_ANON_KEY"];
      if (!url || !key) throw new AlertHttpError(503, "auth_not_configured");
      const client = createClient(url, key, {
        global: { fetch: createSupabaseFetch(key) },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.getUser(jwt);
      return !error ? (data.user?.id ?? null) : null;
    },
    admin: async (id: string) => {
      const { supabaseAdmin } = await import("@/lib/supabase/client.server");
      const { data, error } = await supabaseAdmin.rpc("is_admin", { _user_id: id });
      return !error && data === true;
    },
    owner: async (id: string) => {
      const { resolveWorkspaceOwner } = await import("@/lib/managedChannels.server");
      return resolveWorkspaceOwner(id);
    },
  };
  const actorId = await deps.verify(token);
  if (!actorId) throw new AlertHttpError(401, "unauthorized");
  if (!(await deps.admin(actorId))) throw new AlertHttpError(403, "admin_required");
  // Resolves only the existing signed workspace cookie and verifies its grant.
  return { actorId, ownerId: await deps.owner(actorId) };
}
export async function alertResponse(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    const known = error instanceof AlertHttpError;
    return Response.json(
      {
        error: known ? error.code : "alerts_unavailable",
        message: known ? error.code : "alerts.schemaMissing",
      },
      { status: known ? error.status : 503, headers: { "cache-control": "no-store" } },
    );
  }
}
export async function boundedBody(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > limit)
    throw new AlertHttpError(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new AlertHttpError(413, "body_too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
export async function alertJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AlertHttpError(415, "json_required");
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 2 * 1024 * 1024)));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof AlertHttpError) throw error;
    throw new AlertHttpError(400, "invalid_json");
  }
}
