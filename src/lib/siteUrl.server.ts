/**
 * Canonical public origin for production OAuth / EventSub / public links.
 *
 * Vercel permanently redirects apex → www (308), so the only safe production
 * origin is https://www.cylixstudio.com (no trailing slash). Twitch/Kick
 * developer consoles must register www redirect URIs to match.
 *
 * Always set PUBLIC_SITE_URL on Vercel Production. Localhost request hosts
 * ignore a production PUBLIC_SITE_URL so OAuth cookies/state stay on localhost.
 */

export const CANONICAL_PRODUCTION_ORIGIN = "https://www.cylixstudio.com";

/** Trim, strip wrapping quotes, drop trailing slash; apex → www for this product. */
export function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.hostname === "cylixstudio.com") {
      url.hostname = "www.cylixstudio.com";
    }
    return url.origin;
  } catch {
    return trimmed;
  }
}

function requestHostname(request: Request): string {
  const url = new URL(request.url);
  const hostHeader = (request.headers.get("x-forwarded-host") ?? url.host)
    .split(",")[0]
    ?.trim();
  const host = hostHeader || url.host;
  return (host.split(":")[0] ?? "").toLowerCase();
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

export function publicSiteUrl(request?: Request): string {
  if (request) {
    const hostname = requestHostname(request);
    if (isLocalHostname(hostname)) {
      const url = new URL(request.url);
      const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
      const hostHeader = (request.headers.get("x-forwarded-host") ?? url.host)
        .split(",")[0]
        ?.trim();
      return `${proto}://${hostHeader || url.host}`;
    }
  }

  const configured = normalizeSiteUrl(
    process.env["PUBLIC_SITE_URL"] ?? process.env["SITE_URL"] ?? "",
  );
  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    try {
      const configuredHost = new URL(configured).hostname.toLowerCase();
      // Guard: never apply a production www URL when the caller had no request
      // but NODE_ENV is development and SITE was copied from .env.example.
      if (
        !request &&
        process.env["NODE_ENV"] !== "production" &&
        (configuredHost === "www.cylixstudio.com" || configuredHost === "cylixstudio.com")
      ) {
        return "http://localhost:3000";
      }
    } catch {
      /* use configured as-is */
    }
    return configured;
  }
  if (!request) return "http://localhost:3000";

  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const hostHeader = (request.headers.get("x-forwarded-host") ?? url.host)
    .split(",")[0]
    ?.trim();
  const host = hostHeader || url.host;
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";

  if (hostname === "cylixstudio.com" || hostname === "www.cylixstudio.com") {
    return CANONICAL_PRODUCTION_ORIGIN;
  }

  return `${proto}://${host}`;
}
