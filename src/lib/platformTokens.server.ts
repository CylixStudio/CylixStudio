import { kickTokenAllowsChatWrite, redactKickError } from "@/lib/kickChatDeliver";
import { scopesFromIntrospection, storedChatWrite } from "@/lib/kickCommandReceipt";
import { readOAuthEnv } from "@/lib/oauth.server";
import { singleFlight } from "@/lib/singleFlight";
import { supabaseAdmin } from "@/lib/supabase/client.server";

const REFRESH_SKEW_MS = 5 * 60 * 1000;

type ConnectionRow = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes?: string[] | null;
};

async function loadConnection(
  userId: string,
  platform: "KICK" | "TWITCH",
): Promise<ConnectionRow | null> {
  const { data } = await supabaseAdmin
    .from("platform_connections")
    .select("id, access_token, refresh_token, token_expires_at, scopes")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("is_active", true)
    .maybeSingle();
  return data?.access_token ? (data as ConnectionRow) : null;
}

function stillFresh(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const ms = new Date(expiresAt).getTime();
  return Number.isFinite(ms) && ms > Date.now() + REFRESH_SKEW_MS;
}

type RefreshedKickToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  scopes: string[];
};

async function refreshKickUserToken(
  refreshToken: string,
  scopes: string[],
  expiresAt: string | null,
): Promise<RefreshedKickToken | null> {
  const clientId = readOAuthEnv("KICK_CLIENT_ID");
  const clientSecret = readOAuthEnv("KICK_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  try {
    const response = await fetch("https://id.kick.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!response.ok) {
      console.warn("[tokens] Kick refresh failed", response.status);
      return null;
    }
    const refreshed = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string | string[];
    };
    if (!refreshed.access_token) return null;
    const refreshedScopes = Array.isArray(refreshed.scope)
      ? refreshed.scope
      : (refreshed.scope ?? scopes.join(" ")).split(/\s+/).filter(Boolean);
    return {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? refreshToken,
      expiresAt: refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : expiresAt,
      scopes: refreshedScopes.length ? refreshedScopes : scopes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "refresh_failed";
    console.error("[tokens] Kick refresh error", redactKickError(message));
    return null;
  }
}

async function introspectKickScopes(accessToken: string): Promise<string[] | null> {
  try {
    const response = await fetch("https://id.kick.com/oauth/token/introspect", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!response.ok) {
      console.warn("[tokens] Kick introspection failed", response.status);
      return null;
    }
    const body = (await response.json()) as { data?: { active?: boolean; scope?: string }; scope?: string };
    const scope = body.data?.scope ?? body.scope;
    if (body.data?.active === false) return null;
    return scopesFromIntrospection(scope);
  } catch (error) {
    const message = error instanceof Error ? error.message : "introspect_failed";
    console.error("[tokens] Kick introspection error", redactKickError(message));
    return null;
  }
}

const kickRefreshInflight = new Map<string, Promise<RefreshedKickToken | null>>();

/**
 * Returns a usable Kick user access token, refreshing when near expiry.
 * Returns null if disconnected, chat:write is required but absent, or refresh fails.
 */
export async function getKickAccessToken(
  userId: string,
  opts?: { requireScopes?: string[]; forceRefresh?: boolean },
): Promise<string | null> {
  const data = await loadConnection(userId, "KICK");
  if (!data?.access_token) return null;

  let scopes = data.scopes ?? [];
  if (opts?.requireScopes?.includes("chat:write")) {
    const recorded = storedChatWrite(scopes);
    if (recorded === "absent") {
      console.warn("[tokens] Kick grant has no chat:write", {
        userId,
        hint: "Reconnect Kick in CylixStudio settings. Do not create a new Kick app.",
      });
      return null;
    }
    if (recorded === "unrecorded") {
      const discovered = await introspectKickScopes(data.access_token);
      if (!discovered) {
        console.warn("[tokens] Kick scopes are unrecorded and introspection failed", {
          userId,
          hint: "Reconnect Kick in CylixStudio settings.",
        });
        return null;
      }
      scopes = discovered;
      await supabaseAdmin.from("platform_connections").update({ scopes }).eq("id", data.id);
      if (!kickTokenAllowsChatWrite(scopes)) {
        console.warn("[tokens] Kick introspection omitted chat:write", {
          userId,
          hint: "Reconnect Kick in CylixStudio settings.",
        });
        return null;
      }
    }
  }
  if (opts?.requireScopes?.length) {
    const missing = opts.requireScopes.filter((scope) => scope !== "chat:write" && !scopes.includes(scope));
    if (missing.length && scopes.length) {
      console.warn("[tokens] Kick connection missing scopes", { userId, missing });
      return null;
    }
  }

  if (!opts?.forceRefresh && stillFresh(data.token_expires_at)) return data.access_token;
  if (!data.refresh_token) return null;
  const refreshed = await singleFlight(data.id, kickRefreshInflight, () =>
    refreshKickUserToken(data.refresh_token!, scopes, data.token_expires_at),
  );
  if (!refreshed) return null;
  if (opts?.requireScopes?.includes("chat:write") && !kickTokenAllowsChatWrite(refreshed.scopes)) {
    console.warn("[tokens] Kick refresh dropped chat:write", { userId });
    return null;
  }
  await supabaseAdmin
    .from("platform_connections")
    .update({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
      token_expires_at: refreshed.expiresAt,
      scopes: refreshed.scopes,
    })
    .eq("id", data.id);
  return refreshed.accessToken;
}

/**
 * Returns a usable Twitch user access token, refreshing when near expiry.
 */
export async function getTwitchAccessToken(userId: string): Promise<string | null> {
  const data = await loadConnection(userId, "TWITCH");
  if (!data?.access_token) return null;

  if (stillFresh(data.token_expires_at)) return data.access_token;
  if (!data.refresh_token) return null;

  const clientId = readOAuthEnv("TWITCH_CLIENT_ID");
  const clientSecret = readOAuthEnv("TWITCH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: data.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!response.ok) {
      console.warn("[tokens] Twitch refresh failed", response.status);
      return null;
    }
    const refreshed = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string[];
    };
    if (!refreshed.access_token) return null;
    await supabaseAdmin
      .from("platform_connections")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? data.refresh_token,
        token_expires_at: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : data.token_expires_at,
        scopes: refreshed.scope ?? data.scopes ?? [],
      })
      .eq("id", data.id);
    return refreshed.access_token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "refresh_failed";
    console.error("[tokens] Twitch refresh error", redactKickError(message));
    return null;
  }
}
