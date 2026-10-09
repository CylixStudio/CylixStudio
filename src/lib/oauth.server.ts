import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

import { publicSiteUrl } from "@/lib/siteUrl.server";

export type OAuthProvider = "twitch" | "kick" | "streamelements" | "streamlabs" | "tiktok";

/** Kick OAuth 2.1 authorize host — NEVER api.kick.com (API host only). */
export const KICK_AUTHORIZE_URL = "https://id.kick.com/oauth/authorize";
export const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";

export type ProviderProfile = {
  id: string;
  username: string;
  email: string | null;
  image: string | null;
  /** Extra provider fields persisted into connection metadata (e.g. followers). */
  extra?: Record<string, unknown>;
};

type ProviderConfig = {
  platform: "TWITCH" | "KICK" | "STREAMELEMENTS" | "STREAMLABS" | "TIKTOK";
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
  usesPkce: boolean;
  clientIdEnv: string;
  clientSecretEnv: string;
  fetchProfile: (accessToken: string, clientId: string) => Promise<ProviderProfile>;
};

/** Trim + strip wrapping quotes from dashboard-pasted secrets. */
export function readOAuthEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  return trimmed || undefined;
}

export const PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  twitch: {
    platform: "TWITCH",
    authorizeUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    scopes: [
      "user:read:email",
      "moderator:read:followers",
      "channel:read:subscriptions",
      "bits:read",
    ].join(" "),
    usesPkce: false,
    clientIdEnv: "TWITCH_CLIENT_ID",
    clientSecretEnv: "TWITCH_CLIENT_SECRET",
    fetchProfile: async (accessToken, clientId) => {
      const res = await fetch("https://api.twitch.tv/helix/users", {
        headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": clientId },
      });
      if (!res.ok) throw new Error(`Twitch profile request failed: ${res.status}`);
      const json = (await res.json()) as {
        data: Array<{
          id: string;
          login: string;
          display_name: string;
          email?: string;
          profile_image_url?: string;
        }>;
      };
      const user = json.data?.[0];
      if (!user) throw new Error("Twitch profile response was empty");
      return {
        id: user.id,
        username: user.display_name || user.login,
        email: user.email ?? null,
        image: user.profile_image_url ?? null,
        // IRC JOIN requires the lowercase login, not the display name.
        extra: { twitch_login: user.login.toLowerCase(), login: user.login.toLowerCase() },
      };
    },
  },
  kick: {
    platform: "KICK",
    authorizeUrl: KICK_AUTHORIZE_URL,
    tokenUrl: KICK_TOKEN_URL,
    // Scopes must be enabled on the Kick Developer App. Prefer a login-safe
    // default; override with KICK_OAUTH_SCOPES (space-separated) if needed.
    get scopes() {
      const override = readOAuthEnv("KICK_OAUTH_SCOPES");
      if (override) return override;
      return [
        "user:read",
        "channel:read",
        "channel:write",
        "chat:write",
        "streamkey:read",
        "channel:rewards:read",
        "channel:rewards:write",
        "events:subscribe",
      ].join(" ");
    },
    usesPkce: true,
    clientIdEnv: "KICK_CLIENT_ID",
    clientSecretEnv: "KICK_CLIENT_SECRET",
    fetchProfile: async (accessToken) => {
      const res = await fetch("https://api.kick.com/public/v1/users", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Kick profile request failed: ${res.status}`);
      const json = (await res.json()) as {
        data: Array<{
          user_id: number | string;
          name?: string;
          email?: string;
          profile_picture?: string;
        }>;
      };
      const user = json.data?.[0];
      if (!user) throw new Error("Kick profile response was empty");
      return {
        id: String(user.user_id),
        username: user.name ?? `kick_${user.user_id}`,
        email: user.email ?? null,
        image: user.profile_picture ?? null,
      };
    },
  },
  streamelements: {
    platform: "STREAMELEMENTS",
    authorizeUrl: "https://api.streamelements.com/oauth2/authorize",
    tokenUrl: "https://api.streamelements.com/oauth2/token",
    scopes: ["channel:read", "tips:read", "activities:read"].join(" "),
    usesPkce: false,
    clientIdEnv: "STREAMELEMENTS_CLIENT_ID",
    clientSecretEnv: "STREAMELEMENTS_CLIENT_SECRET",
    fetchProfile: async (accessToken) => {
      const res = await fetch("https://api.streamelements.com/kappa/v2/channels/me", {
        headers: { Authorization: `oAuth ${accessToken}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`StreamElements profile request failed: ${res.status}`);
      const user = (await res.json()) as {
        _id?: string;
        username?: string;
        displayName?: string;
        email?: string;
        avatar?: string;
      };
      if (!user?._id) throw new Error("StreamElements profile response was empty");
      return {
        id: user._id,
        username: user.displayName || user.username || `se_${user._id}`,
        email: user.email ?? null,
        image: user.avatar ?? null,
      };
    },
  },
  streamlabs: {
    platform: "STREAMLABS",
    authorizeUrl: "https://streamlabs.com/api/v2.0/authorize",
    tokenUrl: "https://streamlabs.com/api/v2.0/token",
    scopes: ["donations.read", "alerts.create", "socket.token"].join(" "),
    usesPkce: false,
    clientIdEnv: "STREAMLABS_CLIENT_ID",
    clientSecretEnv: "STREAMLABS_CLIENT_SECRET",
    fetchProfile: async (accessToken) => {
      const res = await fetch("https://streamlabs.com/api/v2.0/user", {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Streamlabs profile request failed: ${res.status}`);
      const json = (await res.json()) as {
        streamlabs?: { id?: number | string; display_name?: string; thumbnail?: string };
        twitch?: { display_name?: string; name?: string };
        youtube?: { title?: string };
      };
      const account = json.streamlabs;
      if (!account?.id) throw new Error("Streamlabs profile response was empty");
      return {
        id: String(account.id),
        username:
          account.display_name ||
          json.twitch?.display_name ||
          json.twitch?.name ||
          json.youtube?.title ||
          `streamlabs_${account.id}`,
        email: null,
        image: account.thumbnail ?? null,
      };
    },
  },
  tiktok: {
    platform: "TIKTOK",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "user.info.profile", "user.info.stats"].join(","),
    usesPkce: true,
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    fetchProfile: async (accessToken) => {
      const fields = "open_id,union_id,display_name,avatar_url,follower_count,profile_deep_link";
      const res = await fetch(
        `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`TikTok profile request failed: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as {
        data?: {
          user?: {
            open_id?: string;
            union_id?: string;
            display_name?: string;
            avatar_url?: string;
            follower_count?: number;
          };
        };
      };
      const user = json.data?.user;
      if (!user?.open_id) throw new Error("TikTok profile response was empty");
      return {
        id: user.open_id,
        username: user.display_name || `tiktok_${user.open_id.slice(0, 8)}`,
        email: null,
        image: user.avatar_url ?? null,
        extra: {
          open_id: user.open_id,
          union_id: user.union_id ?? null,
          display_name: user.display_name ?? null,
          avatar_url: user.avatar_url ?? null,
          follower_count: typeof user.follower_count === "number" ? user.follower_count : null,
        },
      };
    },
  },
};

export const isOAuthProvider = (value: string): value is OAuthProvider =>
  value === "twitch" ||
  value === "kick" ||
  value === "streamelements" ||
  value === "streamlabs" ||
  value === "tiktok";

/** RFC 7636 base64url without padding. */
export const base64Url = (input: Buffer) =>
  input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const createVerifier = () => base64Url(randomBytes(32));
export const createState = () => base64Url(randomBytes(24));
/** PKCE S256 code_challenge — always unpadded base64url (RFC 7636). */
export const challengeFor = (verifier: string) =>
  base64Url(createHash("sha256").update(verifier).digest());

export const oauthCallbackPath = (provider: OAuthProvider) => {
  if (provider === "tiktok") return "/api/auth/callback/tiktok";
  return `/api/auth/${provider}/callback`;
};

/** Registered in the Streamlabs app. Must match character-for-character. */
export const STREAMLABS_PRODUCTION_CALLBACK =
  "https://www.cylixstudio.com/api/auth/streamlabs/callback";

function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

/**
 * Exact redirect URI sent to the provider (no trailing slash on origin).
 * Must match Kick/Twitch/Streamlabs developer console entries character-for-character.
 * Streamlabs production always uses the www callback. Localhost keeps the request origin.
 */
export const redirectUriFor = (request: Request, provider: OAuthProvider) => {
  const origin = publicSiteUrl(request);
  if (provider === "streamlabs" && !isLocalOrigin(origin)) {
    return STREAMLABS_PRODUCTION_CALLBACK;
  }
  return `${origin}${oauthCallbackPath(provider)}`;
};

/**
 * Build the authorize URL.
 *
 * Kick requires host `id.kick.com` (not `api.kick.com`). Encode every value with
 * `encodeURIComponent` so spaces are `%20` and colons are `%3A`. Param order
 * matches Kick docs: response_type → client_id → redirect_uri → scope →
 * code_challenge → code_challenge_method → state.
 */
export function buildAuthorizeUrl(args: {
  provider: OAuthProvider;
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string | null;
}): string {
  const config = PROVIDERS[args.provider];
  const isKick = args.provider === "kick";
  const authorizeBase = isKick ? KICK_AUTHORIZE_URL : config.authorizeUrl;
  const clientKey = args.provider === "tiktok" ? "client_key" : "client_id";

  // Kick + TikTok PKCE: RFC 7636 unpadded base64url (no `=` / `%3D`).
  // Fail closed — never authorize without a verifier when the provider requires PKCE.
  if (config.usesPkce && !args.verifier) {
    throw new Error(`${args.provider}_pkce_verifier_required`);
  }
  const challenge = args.verifier ? challengeFor(args.verifier) : null;

  const pairs: Array<[string, string]> = [
    ["response_type", "code"],
    [clientKey, args.clientId],
    ["redirect_uri", args.redirectUri],
    ["scope", config.scopes],
  ];

  if (config.usesPkce && challenge) {
    pairs.push(["code_challenge", challenge]);
    pairs.push(["code_challenge_method", "S256"]);
  }

  pairs.push(["state", args.state]);

  const query = pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  const location = `${authorizeBase}?${query}`;

  if (isKick && location.includes("api.kick.com")) {
    throw new Error("Kick authorize URL must use id.kick.com, not api.kick.com");
  }

  return location;
}

function requestHostnameForCookie(request: Request): string {
  const url = new URL(request.url);
  const host = (request.headers.get("x-forwarded-host") ?? url.host)
    .split(",")[0]
    ?.trim()
    .split(":")[0]
    ?.toLowerCase();
  return host || url.hostname.toLowerCase();
}

function isLocalRequestHost(request: Request): boolean {
  const host = requestHostnameForCookie(request);
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".local")
  );
}

function requestIsHttps(request: Request): boolean {
  // Never mark cookies Secure on localhost — even if a proxy header lies.
  if (isLocalRequestHost(request)) return false;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return proto === "https";
}

/**
 * Share OAuth state/verifier across apex ↔ www so a 308 hop cannot drop the cookie.
 * Never applies on localhost.
 */
function oauthCookieDomain(request: Request): string | null {
  if (isLocalRequestHost(request)) return null;
  try {
    const hostname = new URL(publicSiteUrl(request)).hostname.toLowerCase();
    if (hostname === "cylixstudio.com" || hostname === "www.cylixstudio.com") {
      return ".cylixstudio.com";
    }
  } catch {
    /* ignore */
  }
  const host = requestHostnameForCookie(request);
  if (host === "cylixstudio.com" || host === "www.cylixstudio.com") {
    return ".cylixstudio.com";
  }
  return null;
}

export type CookieOptions = {
  /**
   * Host-only cookie (no Domain=). Use for one-shot handoffs like oauth_session_handoff
   * so apex/www Domain rules cannot drop the cookie on the next same-host hop.
   */
  hostOnly?: boolean;
};

export const cookie = (
  request: Request,
  name: string,
  value: string,
  maxAge: number,
  opts?: CookieOptions,
) => {
  const secure = requestIsHttps(request) ? "; Secure" : "";
  const domain = opts?.hostOnly ? null : oauthCookieDomain(request);
  const domainPart = domain ? `; Domain=${domain}` : "";
  const line = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}${domainPart}; Max-Age=${maxAge}`;
  console.info(`[oauth:cookie] set ${name}`, {
    maxAge,
    secure: Boolean(secure),
    domain: domain ?? "(host-only)",
    host: requestHostnameForCookie(request),
    valueLength: value.length,
  });
  return line;
};

export const readCookie = (request: Request, name: string) => {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
};

/** Encode opaque secrets for Set-Cookie (avoids `;`, `,`, spaces, etc.). */
export function encodeCookiePayload(value: string): string {
  return `b64.${Buffer.from(value, "utf8").toString("base64url")}`;
}

export function decodeCookiePayload(value: string): string {
  if (value.startsWith("b64.")) {
    return Buffer.from(value.slice(4), "base64url").toString("utf8");
  }
  // Legacy handoff used encodeURIComponent — keep reading those during rollout.
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string | string[];
};

export const exchangeCode = async (args: {
  provider: OAuthProvider;
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  verifier: string | null;
}): Promise<TokenResponse> => {
  const config = PROVIDERS[args.provider];
  const isTikTok = args.provider === "tiktok";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_secret: args.clientSecret,
  });
  body.set(isTikTok ? "client_key" : "client_id", args.clientId);
  // PKCE providers must always send code_verifier — never skip it.
  if (config.usesPkce) {
    if (!args.verifier) {
      console.error(`[oauth:${args.provider}] token exchange aborted — missing PKCE code_verifier`);
      throw new Error(`${args.provider}_pkce_verifier_missing`);
    }
    body.set("code_verifier", args.verifier);
  }

  console.info(`[oauth:${args.provider}] token exchange start`, {
    tokenUrl: config.tokenUrl,
    redirectUri: args.redirectUri,
    hasVerifier: Boolean(args.verifier),
    codeLength: args.code.length,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const responseText = await res.text();
    console.error(`[oauth:${args.provider}] token exchange failed`, {
      status: res.status,
      statusText: res.statusText,
      redirectUri: args.redirectUri,
      body: responseText.slice(0, 800),
    });
    throw new Error(`${args.provider} token exchange failed: ${res.status} ${responseText}`);
  }
  console.info(`[oauth:${args.provider}] token exchange ok`, { status: res.status });
  return (await res.json()) as TokenResponse;
};

/* ---------------------------------------------------------------------------
 * Account-linking state
 * OAuth flows started from Settings must attach the connection to the signed-in
 * user instead of minting a new session. The user id travels in the `state`
 * parameter, signed with a server-only secret so the callback can trust it.
 * ------------------------------------------------------------------------- */

/** Server-only HMAC key. Never fall back to public SUPABASE_URL or a constant. */
export function linkSecret(): string {
  const secret =
    readOAuthEnv("OAUTH_LINK_SECRET") ?? readOAuthEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) {
    throw new Error(
      "OAUTH_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is required for account linking",
    );
  }
  return secret;
}

export const signLinkState = (userId: string, ttlSeconds = 600) => {
  const exp = Date.now() + ttlSeconds * 1000;
  const payload = `${userId}.${exp}`;
  const mac = base64Url(createHmac("sha256", linkSecret()).update(payload).digest());
  return `link:${payload}.${mac}`;
};

export const verifyLinkState = (state: string): string | null => {
  if (!state.startsWith("link:")) return null;
  const [userId, expRaw, mac] = state.slice(5).split(".");
  if (!userId || !expRaw || !mac) return null;
  let expected: string;
  try {
    expected = base64Url(
      createHmac("sha256", linkSecret()).update(`${userId}.${expRaw}`).digest(),
    );
  } catch {
    return null;
  }
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (Number(expRaw) < Date.now()) return null;
  return userId;
};

/**
 * One-time OAuth → /auth/callback handoff. Carries only the Supabase user id
 * (HMAC-signed). The actual session is minted in /api/auth/session/finish so
 * we never store a magic-link token_hash in a cookie (those expire / truncate).
 */
export function signSessionHandoff(userId: string, ttlSeconds = 300): string {
  const exp = Date.now() + ttlSeconds * 1000;
  const payload = `${userId}.${exp}`;
  const mac = base64Url(
    createHmac("sha256", linkSecret()).update(`oauth_session:${payload}`).digest(),
  );
  return encodeCookiePayload(`v1.${payload}.${mac}`);
}

export function verifySessionHandoff(raw: string): string | null {
  const decoded = decodeCookiePayload(raw).trim();
  const parts = decoded.split(".");
  // v1.<uuid>.<exp>.<mac>
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, userId, expRaw, mac] = parts;
  if (!userId || !expRaw || !mac) return null;
  let expected: string;
  try {
    expected = base64Url(
      createHmac("sha256", linkSecret())
        .update(`oauth_session:${userId}.${expRaw}`)
        .digest(),
    );
  } catch {
    return null;
  }
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (Number(expRaw) < Date.now()) return null;
  return userId;
}

/**
 * Mint a real Supabase access/refresh session for an existing auth user.
 * generateLink + verifyOtp run in the same request (no cookie round-trip for OTPs).
 */
export async function mintSupabaseSessionForUser(userId: string): Promise<{
  access_token: string;
  refresh_token: string;
}> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { createClient } = await import("@supabase/supabase-js");

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData.user?.email) {
    throw new Error(userError?.message ?? "auth_user_not_found");
  }
  const email = userData.user.email;

  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link?.properties) {
    throw new Error(linkError?.message ?? "generate_link_failed");
  }

  const emailOtp = link.properties.email_otp;
  const hashedToken = link.properties.hashed_token;

  const url =
    readOAuthEnv("SUPABASE_URL") ?? readOAuthEnv("VITE_SUPABASE_URL");
  const anonKey =
    readOAuthEnv("SUPABASE_PUBLISHABLE_KEY") ??
    readOAuthEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ??
    readOAuthEnv("SUPABASE_ANON_KEY") ??
    readOAuthEnv("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("supabase_not_configured");

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Prefer email OTP — shorter and avoids token_hash cookie encoding issues.
  if (emailOtp) {
    const { data, error } = await anon.auth.verifyOtp({
      email,
      token: emailOtp,
      type: "email",
    });
    if (!error && data.session?.access_token && data.session.refresh_token) {
      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
    }
    console.warn("[oauth:mintSession] email_otp verify failed, trying token_hash", {
      message: error?.message ?? null,
    });
  }

  if (hashedToken) {
    for (const type of ["email", "magiclink"] as const) {
      const { data, error } = await anon.auth.verifyOtp({
        type,
        token_hash: hashedToken,
      });
      if (!error && data.session?.access_token && data.session.refresh_token) {
        return {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        };
      }
      console.warn(`[oauth:mintSession] token_hash verify failed (type=${type})`, {
        message: error?.message ?? null,
      });
    }
  }

  throw new Error("session_mint_failed");
}

/** Streamlabs socket token — required for realtime donation alerts. */
export const fetchStreamlabsSocketToken = async (accessToken: string): Promise<string | null> => {
  try {
    const res = await fetch(
      `https://streamlabs.com/api/v2.0/socket/token?access_token=${encodeURIComponent(accessToken)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { socket_token?: string };
    return json.socket_token ?? null;
  } catch {
    return null;
  }
};
