/** Absolute command-list URL. Production is the public site; local dev uses the request origin. */
export function commandsPageUrl(requestOrigin: string, slug: string): string {
  const safeSlug = slug.trim().toLowerCase();
  let base = "https://cylixstudio.com";
  try {
    const url = new URL(requestOrigin);
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      base = url.origin;
    }
  } catch {
    base = "https://cylixstudio.com";
  }
  return `${base}/commands/${encodeURIComponent(safeSlug)}`;
}

export function requestPublicOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || "";
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = forwardedProto || (local ? "http" : "https");
  if (host) return `${proto}://${host}`;
  try {
    return new URL(request.url).origin;
  } catch {
    return "https://cylixstudio.com";
  }
}
