/**
 * One JSON POST to Make after a widget or studio-version save succeeds.
 * Server-only. A missing URL or a failed POST does not throw, so the save stands.
 * This module does not send on import.
 */

export type UpdateNotice = {
  type: string;
  name: string;
  version: string;
  description: string;
};

const TIMEOUT_MS = 8000;
const STUDIO_VERSION_FALLBACK = "v0.2";

export function updateNoticeBody(notice: UpdateNotice): UpdateNotice {
  const type = notice.type.trim();
  const name = notice.name.trim();
  const version = notice.version.trim();
  const description = notice.description.trim();
  if (!type || !name || !version || !description) {
    throw new Error("incomplete update notice");
  }
  return { type, name, version, description };
}

export function widgetUpdateDescription(name: string): string {
  const label = name.trim() || "Widget";
  return `${label} was updated.`;
}

export function studioVersionDescription(version: string): string {
  return `Studio version updated to ${version}.`;
}

async function readStudioVersion(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { STUDIO_VERSION_KEY } = await import("@/lib/studioVersion.server");
    const { data, error } = await supabaseAdmin
      .from("studio_settings")
      .select("value")
      .eq("key", STUDIO_VERSION_KEY)
      .maybeSingle();
    if (error) return STUDIO_VERSION_FALLBACK;
    const value = data?.value?.trim();
    return value || STUDIO_VERSION_FALLBACK;
  } catch {
    return STUDIO_VERSION_FALLBACK;
  }
}

/** Posts the notice. Never throws. Skips when MAKE_UPDATE_WEBHOOK_URL is unset. */
export async function notifyUpdateSaved(notice: UpdateNotice): Promise<void> {
  let body: UpdateNotice;
  try {
    body = updateNoticeBody(notice);
  } catch {
    console.error("[update-webhook] post failed", { reason: "incomplete" });
    return;
  }

  const url = process.env["MAKE_UPDATE_WEBHOOK_URL"]?.trim();
  if (!url) return;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[update-webhook] post failed", { status: response.status });
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const reason = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
    console.error("[update-webhook] post failed", { reason });
  }
}

/** Widget row has no version or changelog column. Uses the stored studio version. */
export async function notifyWidgetSaved(name: string): Promise<void> {
  const label = name.trim() || "Widget";
  const version = await readStudioVersion();
  await notifyUpdateSaved({
    type: "widget",
    name: label,
    version,
    description: widgetUpdateDescription(label),
  });
}
