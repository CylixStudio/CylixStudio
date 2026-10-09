/** Storage object path for an HLS clip: `{user id}/{file}.ts`. Not a Kick clip id. */
const STORAGE_PATH = /^[A-Za-z0-9_-]{8,80}\/[A-Za-z0-9._-]+\.ts$/;

/** Seven days. Longer expiries make Storage reject the signed token. */
export const CLIP_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

export function clipStoragePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.trim().replace(/^\/+/, "").split("?")[0]?.split("#")[0] ?? "";
  if (!clean || clean.includes("..") || clean.includes("\\") || clean.includes("//")) return null;
  return STORAGE_PATH.test(clean) ? clean : null;
}

export function publicClipPageUrl(id: string): string {
  return `https://cylixstudio.com/clip/${encodeURIComponent(id)}`;
}

export function publicClipMediaUrl(id: string): string {
  return `https://cylixstudio.com/api/public/clip/${encodeURIComponent(id)}?media=1`;
}

export function isSupabaseSignedClipUrl(url: string): boolean {
  return /supabase\.co\/storage\/v1\/object\/sign\/|\/object\/sign\/clips\//i.test(url);
}

/** Player source. Stored HLS files are served by our media route, not a storage JWT. */
export function clipPlaybackUrl(clip: { id: string; url: string; externalId?: string | null }): string {
  if (clipStoragePath(clip.externalId) || isSupabaseSignedClipUrl(clip.url)) {
    return publicClipMediaUrl(clip.id);
  }
  return clip.url;
}
