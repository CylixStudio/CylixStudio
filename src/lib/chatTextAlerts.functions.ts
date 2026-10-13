import { createServerFn } from "@tanstack/react-start";

import {
  catalogChatAlerts,
  isChatAlertId,
  mergeChatAlerts,
  sanitizeAlertMinimum,
  sanitizeAlertTemplate,
  type ChatTextAlert,
} from "@/lib/chatTextAlerts";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

const TEST_KEY = "creovix:chat-text-alerts";

function readTestAlerts(): ChatTextAlert[] {
  if (typeof window === "undefined") return catalogChatAlerts();
  try {
    const raw = window.localStorage.getItem(TEST_KEY);
    if (!raw) return catalogChatAlerts();
    const parsed = JSON.parse(raw) as { alerts?: Array<Partial<ChatTextAlert> & { id: string }> };
    return mergeChatAlerts(Array.isArray(parsed.alerts) ? parsed.alerts : []);
  } catch {
    return catalogChatAlerts();
  }
}

function writeTestAlerts(alerts: ChatTextAlert[]) {
  window.localStorage.setItem(TEST_KEY, JSON.stringify({ alerts }));
}

export function loadTestChatAlerts(): ChatTextAlert[] {
  return readTestAlerts();
}

export function saveTestChatAlert(input: ChatTextAlert): ChatTextAlert[] {
  const current = readTestAlerts();
  const next = current.map((alert) => (alert.id === input.id ? { ...alert, ...input, id: alert.id } : alert));
  writeTestAlerts(next);
  return next;
}

export const listChatTextAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatTextAlert[]> => {
    const { data, error } = await context.supabase
      .from("chat_text_alerts")
      .select("alert_id, enabled, template, minimum")
      .eq("user_id", context.userId);
    if (error) return catalogChatAlerts();
    return mergeChatAlerts(
      (data ?? []).flatMap((row) =>
        isChatAlertId(row.alert_id)
          ? [{ id: row.alert_id, enabled: row.enabled, template: row.template, minimum: row.minimum }]
          : [],
      ),
    );
  });

export const saveChatTextAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ChatTextAlert) => input)
  .handler(async ({ data, context }) => {
    if (!isChatAlertId(data.id)) return { ok: false as const, error: "unknown_alert" };
    const catalog = catalogChatAlerts().find((item) => item.id === data.id);
    const template = sanitizeAlertTemplate(data.template, catalog?.template ?? data.id);
    const { error } = await context.supabase.from("chat_text_alerts").upsert(
      {
        user_id: context.userId,
        alert_id: data.id,
        enabled: Boolean(data.enabled),
        template,
        minimum: sanitizeAlertMinimum(data.minimum),
      },
      { onConflict: "user_id,alert_id" },
    );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
