import { CLIP_SIGNED_URL_TTL_SECONDS, clipStoragePath } from "@/lib/clipStorage";
import { supabaseAdmin } from "@/lib/supabase/client.server";

/**
 * Signs a clip with the server admin client (`SUPABASE_SERVICE_ROLE_KEY` or
 * `SUPABASE_SECRET_KEY`). The anon key must not sign these URLs.
 */
export async function signClipStoragePath(path: string): Promise<string | null> {
  const objectPath = clipStoragePath(path);
  if (!objectPath) return null;
  const signed = await supabaseAdmin.storage
    .from("clips")
    .createSignedUrl(objectPath, CLIP_SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    console.error("[clip-storage] signing failed", signed.error?.message ?? "no url");
    return null;
  }
  return signed.data.signedUrl;
}

/** Reads the object with the service role so the browser never presents a storage JWT. */
export async function downloadClipObject(path: string): Promise<Blob | null> {
  const objectPath = clipStoragePath(path);
  if (!objectPath) return null;
  const downloaded = await supabaseAdmin.storage.from("clips").download(objectPath);
  if (downloaded.error || !downloaded.data) {
    console.error("[clip-storage] download failed", downloaded.error?.message ?? "empty");
    return null;
  }
  return downloaded.data;
}
