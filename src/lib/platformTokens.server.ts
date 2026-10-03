import { readOAuthEnv } from "@/lib/oauth.server";
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

/**
 * Returns a usable Kick user access token, refreshing when near expiry.
 * Returns null if disconnected or refresh fails when the token is expired.
 */
export async function getKickAccessToken(
  userId: string,
  opts?: { requireScopes?: string[] },
): Promise<string | null> {
  const data = await loadConnection(userId, "KICK");
  if (!data?.access_token) return null;

  const scopes = data.scopes ?? [];
  if (opts?.requireScopes?.length && scopes.length) {
    const missing = opts.requireScopes.filter((scope) => !scopes.includes(scope));
    if (missing.length) {
      console.warn("[tokens] Kick connection missing scopes", { userId, missing });
      return null;
    }
  }

  if (stillFresh(data.token_expires_at)) return data.access_token;
  if (!data.refresh_token) return null;

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
        refresh_token: data.refresh_token,
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
    await supabaseAdmin
      .from("platform_connections")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? data.refresh_token,
        token_expires_at: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : data.token_expires_at,
        scopes: refreshedScopes.length ? refreshedScopes : scopes,
      })
      .eq("id", data.id);
    return refreshed.access_token;
  } catch (error) {
    console.error("[tokens] Kick refresh error", error);
    return null;
  }
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
    console.error("[tokens] Twitch refresh error", error);
    return null;
  }
}
