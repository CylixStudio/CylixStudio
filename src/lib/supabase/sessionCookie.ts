/** First-party cookie that mirrors the browser access token for server functions. */
export const SESSION_ACCESS_COOKIE = "cylix-sb-access";

const JWT_PART = /^[A-Za-z0-9_-]+$/;

export function isUserJwt(value: string | null | undefined): value is string {
  if (!value) return false;
  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => JWT_PART.test(part));
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

function accessTokenFromStoredSession(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;
  try {
    text = decodeURIComponent(text);
  } catch {
    /* keep the raw value */
  }
  if (text.startsWith("base64-")) {
    try {
      text = decodeBase64Url(text.slice("base64-".length));
    } catch {
      return null;
    }
  }
  if (isUserJwt(text)) return text;
  try {
    const parsed = JSON.parse(text) as {
      access_token?: unknown;
      currentSession?: { access_token?: unknown };
    };
    const token = parsed.access_token ?? parsed.currentSession?.access_token;
    return typeof token === "string" && isUserJwt(token) ? token : null;
  } catch {
    return null;
  }
}

function readCookieJar(header: string | null): Map<string, string> {
  const jar = new Map<string, string>();
  if (!header) return jar;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
  return jar;
}

function accessTokenFromCookieHeader(header: string | null): string | null {
  const jar = readCookieJar(header);
  const direct = jar.get(SESSION_ACCESS_COOKIE);
  if (direct) {
    const token = accessTokenFromStoredSession(direct);
    if (token) return token;
  }

  const groups = new Map<string, { index: number; value: string }[]>();
  for (const [name, value] of jar) {
    const match = /^(sb-.+-auth-token)(?:\.(\d+))?$/.exec(name);
    if (!match?.[1]) continue;
    const list = groups.get(match[1]) ?? [];
    list.push({ index: match[2] ? Number(match[2]) : 0, value });
    groups.set(match[1], list);
  }

  for (const chunks of groups.values()) {
    const combined = chunks
      .sort((a, b) => a.index - b.index)
      .map((chunk) => chunk.value)
      .join("");
    const token = accessTokenFromStoredSession(combined);
    if (token) return token;
  }
  return null;
}

type HeaderSource = { headers: { get(name: string): string | null } };

/**
 * User JWT for a server function: the Authorization bearer when it is a JWT,
 * otherwise the session cookie the browser already sends.
 */
export function accessTokenFromRequest(request: HeaderSource): string | null {
  const header = request.headers.get("authorization");
  if (header && /^bearer\s+/i.test(header)) {
    const token = header.replace(/^bearer\s+/i, "").trim();
    if (isUserJwt(token)) return token;
  }
  return accessTokenFromCookieHeader(request.headers.get("cookie"));
}

/** Keep the access token on a SameSite cookie so server functions can read it. */
export function writeSessionCookie(token: string | null, expiresAt?: number | null): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  if (!token || !isUserJwt(token)) {
    document.cookie = `${SESSION_ACCESS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    return;
  }
  const maxAge =
    typeof expiresAt === "number" && expiresAt > Date.now() / 1000
      ? Math.max(60, Math.floor(expiresAt - Date.now() / 1000))
      : 60 * 60;
  document.cookie = `${SESSION_ACCESS_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}
