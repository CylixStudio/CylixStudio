/**
 * Persists the studio version, posts one Make notice, then emails registered users.
 * Callers must already have confirmed the admin role. This module does not
 * send on import. A failed Make POST does not undo the save or skip the email.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export const STUDIO_VERSION_KEY = "app_version";
const VERSION_MAX = 40;
const SITE = "https://cylixstudio.com";

export function normalizeStudioVersion(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > VERSION_MAX) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(value)) return null;
  return value;
}

type AdminClient = SupabaseClient<Database>;

async function saveVersion(admin: AdminClient, version: string): Promise<boolean> {
  const { error } = await admin.from("studio_settings").upsert(
    { key: STUDIO_VERSION_KEY, value: version, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) {
    console.error("[studio-version] save failed", { message: error.message });
    return false;
  }
  return true;
}

async function broadcastVersion(
  admin: AdminClient,
  version: string,
): Promise<{ sent: number; failed: number; skipped: number; listError: boolean }> {
  const { sendTemplateEmail } = await import("@/lib/email.server");
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let page = 1;
  const perPage = 100;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[studio-version] could not list users", { page, message: error.message });
      return { sent, failed, skipped, listError: true };
    }
    const batch = data.users;
    for (const user of batch) {
      const email = user.email?.trim() ?? "";
      if (!email.includes("@")) {
        skipped += 1;
        continue;
      }
      try {
        const result = await sendTemplateEmail(
          email,
          {
            template: "version_broadcast",
            data: { siteUrl: SITE, version, locale: "ar" },
          },
          { logRecipients: false },
        );
        if (result.ok) sent += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    if (batch.length < perPage) break;
    page += 1;
    if (page > 200) break;
  }

  console.info("[studio-version] broadcast finished", { sent, failed, skipped });
  return { sent, failed, skipped, listError: false };
}

export async function saveAndBroadcastStudioVersion(
  admin: AdminClient,
  rawVersion: string,
): Promise<
  | { ok: true; saved: true; sent: number; failed: number; skipped: number; listError: boolean }
  | { ok: false; error: "invalid_version" | "save_failed" }
> {
  const version = normalizeStudioVersion(rawVersion);
  if (!version) return { ok: false, error: "invalid_version" };
  const saved = await saveVersion(admin, version);
  if (!saved) return { ok: false, error: "save_failed" };
  const { notifyUpdateSaved, studioVersionDescription } = await import("@/lib/updateWebhook.server");
  await notifyUpdateSaved({
    type: "version",
    name: "CylixStudio",
    version,
    description: studioVersionDescription(version),
  });
  const broadcast = await broadcastVersion(admin, version);
  return { ok: true, saved: true, ...broadcast };
}
