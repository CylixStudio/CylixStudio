import type { SupabaseClient } from "@supabase/supabase-js";

import { publishViewerChat, type ChatPublishResult, type OverlayChatLine } from "@/lib/overlayChat";
import type { Database, Json } from "@/lib/supabase/types";

/**
 * Persists a viewer chat line on the creator's Chat Box widget rows.
 * The row is the shared store: webhook isolates and overlay isolates both read it.
 * Realtime broadcast is the instant path. The overlay SSE poll is the retry path.
 */
export async function publishOverlayChat(
  admin: SupabaseClient<Database>,
  userId: string,
  line: OverlayChatLine,
): Promise<ChatPublishResult> {
  return publishViewerChat(userId, line, {
    async list(ownerId) {
      const { data, error } = await admin
        .from("widgets")
        .select("id, state, updated_at")
        .eq("user_id", ownerId)
        .eq("type", "CHAT_BOX")
        .eq("is_enabled", true);
      if (error) return null;
      return (data ?? []).map((row) => ({
        id: row.id,
        state: row.state,
        updatedAt: row.updated_at,
      }));
    },
    async save(id, state, updatedAt) {
      const { data, error } = await admin
        .from("widgets")
        .update({ state: state as Json })
        .eq("id", id)
        .eq("updated_at", updatedAt)
        .select("id");
      if (error) return "error";
      return data && data.length > 0 ? "ok" : "conflict";
    },
    async broadcast(ids, payload) {
      const { broadcastToWidgets } = await import("@/lib/realtime.server");
      return broadcastToWidgets(ids, "chat", { ...payload });
    },
  });
}
