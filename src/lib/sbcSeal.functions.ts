import { createServerFn } from "@tanstack/react-start";

const SBC_HOST = "eauthenticate.saudibusiness.gov.sa";

function isSealFrameUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === SBC_HOST && url.pathname === "/EAuthSealApi/seal";
  } catch {
    return false;
  }
}

/** Pull the "view verification" anchor out of the official seal HTML. */
export function extractSbcCertificateHref(html: string): string | null {
  const tags = html.match(/<a\b[^>]*>/gi) ?? [];
  let fallback: string | null = null;
  for (const tag of tags) {
    const href = tag.match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    const isCertificate =
      url.protocol === "https:" &&
      url.hostname === SBC_HOST &&
      (url.pathname.includes("/certificate-details/") || url.pathname.includes("/request/"));
    if (!isCertificate) continue;
    if (/\bclass="[^"]*\bsbc-link\b/.test(tag)) return url.href;
    fallback ??= url.href;
  }
  return fallback;
}

export const resolveSbcCertificateUrl = createServerFn({ method: "POST" })
  .inputValidator((input: { sealUrl?: string }) => {
    const sealUrl = input.sealUrl?.trim() ?? "";
    if (!isSealFrameUrl(sealUrl)) {
      throw new Error("invalid_seal_url");
    }
    return { sealUrl };
  })
  .handler(async ({ data }) => {
    const response = await fetch(data.sealUrl, {
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { href: null as string | null };
    return { href: extractSbcCertificateHref(await response.text()) };
  });
