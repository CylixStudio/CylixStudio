import { redactKickError } from "@/lib/kickChatDeliver";
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

function scopesAllowChat(scopes: string[]): boolean {
  return scopes.length === 0 || scopes.includes("chat:write");
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
  const refreshed = await refreshKickUserToken(data.refresh_token, scopes, data.token_expires_at);
  if (!refreshed) return null;
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

type BotMemory = { accessToken: string; refreshToken: string | null; expiresAt: string | null; scopes: string[] };
let cylixBotMemory: BotMemory | null = null;

/**
 * Token for @CylixBot only.
 * Env `KICK_BOT_ACCESS_TOKEN` (optional `KICK_BOT_REFRESH_TOKEN`, `KICK_BOT_EXPIRES_AT`)
 * or an existing Kick connection whose `platform_user_id` is `KICK_BOT_PLATFORM_USER_ID`.
 * Never returns a channel-owner token. Refresh stays on this token.
 */
export async function getCylixBotChatToken(): Promise<string | null> {
  const envAccess = process.env["KICK_BOT_ACCESS_TOKEN"]?.trim() ?? "";
  if (envAccess) {
    const current = cylixBotMemory ?? {
      accessToken: envAccess,
      refreshToken: process.env["KICK_BOT_REFRESH_TOKEN"]?.trim() || null,
      expiresAt: process.env["KICK_BOT_EXPIRES_AT"]?.trim() || null,
      scopes: ["chat:write"],
    };
    cylixBotMemory = current;
    if (stillFresh(current.expiresAt)) return current.accessToken;
    if (!current.refreshToken) return null;
    const refreshed = await refreshKickUserToken(current.refreshToken, current.scopes, current.expiresAt);
    if (!refreshed) return null;
    cylixBotMemory = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
      scopes: refreshed.scopes,
    };
    return refreshed.accessToken;
  }

  const botUserId = process.env["KICK_BOT_PLATFORM_USER_ID"]?.trim() ?? "";
  if (!botUserId) return null;
  const expectedName = (process.env["KICK_BOT_USERNAME"]?.trim() || "CylixBot").toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("platform_connections")
    .select("id, access_token, refresh_token, token_expires_at, scopes, username")
    .eq("platform", "KICK")
    .eq("platform_user_id", botUserId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error || !data?.[0]?.access_token) return null;
  const row = data[0];
  if (row.username && row.username.trim().toLowerCase() !== expectedName) {
    console.warn("[chat-bot] CylixBot connection username mismatch");
    return null;
  }
  const scopes = row.scopes ?? [];
  if (!scopesAllowChat(scopes)) {
    console.warn("[chat-bot] CylixBot connection missing chat:write");
    return null;
  }
  if (stillFresh(row.token_expires_at)) return row.access_token;
  if (!row.refresh_token) return null;
  const refreshed = await refreshKickUserToken(row.refresh_token, scopes, row.token_expires_at);
  if (!refreshed) return null;
  await supabaseAdmin
    .from("platform_connections")
    .update({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
      token_expires_at: refreshed.expiresAt,
      scopes: refreshed.scopes,
    })
    .eq("id", row.id);
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
