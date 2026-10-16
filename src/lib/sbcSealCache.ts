const SBC_HOST = "eauthenticate.saudibusiness.gov.sa";

/** Public certificate pages are reused only inside this window, then fetched again. */
export const SBC_LINK_TTL_MS = 15 * 60 * 1000;

export type SealLinkRecord = {
  href: string;
  userId: string;
  storedAt: number;
};

const SHORT_LIVED_QUERY = ["exp", "expires", "expiry", "token", "sig", "signature"];

export function isPublicCertificateHref(value: string): boolean {
  try {
    const url = new URL(value);
    const stable =
      url.protocol === "https:" &&
      url.hostname === SBC_HOST &&
      (url.pathname.includes("/certificate-details/") || url.pathname.includes("/request/"));
    if (!stable) return false;
    return !SHORT_LIVED_QUERY.some((key) => url.searchParams.has(key));
  } catch {
    return false;
  }
}

export function sealLinkCacheKey(userId: string): string {
  return `cylix.sbc-certificate-href:${userId}`;
}

/** Returns the certificate href only for the same user and an unexpired record. */
export function readSealLinkCache(
  raw: string | null,
  userId: string,
  now: number,
  ttl = SBC_LINK_TTL_MS,
): string | null {
  if (!userId || !raw) return null;
  let parsed: Partial<SealLinkRecord>;
  try {
    parsed = JSON.parse(raw) as Partial<SealLinkRecord>;
  } catch {
    return null;
  }
  if (parsed.userId !== userId) return null;
  if (typeof parsed.storedAt !== "number" || !Number.isFinite(parsed.storedAt)) return null;
  if (now < parsed.storedAt || now - parsed.storedAt >= ttl) return null;
  if (typeof parsed.href !== "string" || !isPublicCertificateHref(parsed.href)) return null;
  return parsed.href;
}

/** Refuses anything that is not a public certificate URL for this user. */
export function writeSealLinkCache(href: string, userId: string, now: number): string | null {
  if (!userId || !isPublicCertificateHref(href)) return null;
  const record: SealLinkRecord = { href, userId, storedAt: now };
  return JSON.stringify(record);
}
