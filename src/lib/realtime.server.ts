/**
 * Server-side Supabase Realtime broadcaster.
 *
 * OBS overlays run anonymously, so instead of exposing table rows over
 * postgres_changes we push lightweight broadcast messages on a per-widget
 * topic (`widget_<widget_id>`). The overlay reacts instantly and then pulls
 * the authoritative snapshot from the token-gated public endpoint.
 */

export type WidgetBroadcastEvent = "refresh" | "chat" | "alert";

export async function broadcastToWidgets(
  widgetIds: string[],
  event: WidgetBroadcastEvent,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key || widgetIds.length === 0) return false;

  const messages = widgetIds.map((id) => ({
    topic: `widget_${id}`,
    event,
    payload: { ...payload, at: Date.now() },
    private: false,
  }));

  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ messages }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Broadcasts to every widget owned by a user (optionally one subathon). */
export async function broadcastUserWidgets(
  admin: {
    from: (table: "widgets") => {
      select: (columns: string) => {
        eq: (column: string, value: string) => Promise<{ data: { id: string }[] | null }>;
      };
    };
  },
  userId: string,
  event: WidgetBroadcastEvent,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { data } = await admin.from("widgets").select("id").eq("user_id", userId);
  await broadcastToWidgets((data ?? []).map((row) => row.id), event, payload);
}
