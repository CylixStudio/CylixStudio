import {
  createMemoryReceiptBoard,
  type KickReceipt,
  type KickReceiptState,
  type ReceiptBoard,
} from "@/lib/kickCommandReceipt";
import { supabaseAdmin } from "@/lib/supabase/client.server";

const CLIENT_ID = "01M45FV2CDHR5YGD4DEMSYX87N";

type Row = {
  user_id: string;
  provider_event_id: string;
  broadcaster_user_id: string;
  state: KickReceiptState;
  reply_text: string | null;
  kick_message_id: string | null;
  failure_reason: string | null;
  updated_at: string;
};

function fromRow(row: Row): KickReceipt {
  return {
    userId: row.user_id,
    providerEventId: row.provider_event_id,
    broadcasterUserId: row.broadcaster_user_id,
    state: row.state,
    replyText: row.reply_text,
    kickMessageId: row.kick_message_id,
    failureReason: row.failure_reason,
    updatedAt: Date.parse(row.updated_at) || Date.now(),
  };
}

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /kick_command_receipts|kick_app_bot_identity/i.test(error.message ?? "");
}

export function createSupabaseReceiptBoard(): ReceiptBoard {
  const table = () => supabaseAdmin.from("kick_command_receipts" as never);
  return {
    async claim(input) {
      const { data, error } = await table()
        .insert({
          user_id: input.userId,
          provider_event_id: input.providerEventId,
          broadcaster_user_id: input.broadcasterUserId,
          state: "webhook_received",
          updated_at: new Date(input.now).toISOString(),
        } as never)
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return null;
        if (missingTable(error)) throw new Error("kick_command_receipts_missing");
        throw new Error("kick_command_receipt_claim_failed");
      }
      return data ? fromRow(data as unknown as Row) : null;
    },
    async read(userId, providerEventId) {
      const { data, error } = await table()
        .select("*")
        .eq("user_id" as never, userId)
        .eq("provider_event_id" as never, providerEventId)
        .maybeSingle();
      if (error) {
        if (missingTable(error)) throw new Error("kick_command_receipts_missing");
        throw new Error("kick_command_receipt_read_failed");
      }
      return data ? fromRow(data as unknown as Row) : null;
    },
    async compareAndSet(userId, providerEventId, from, patch) {
      const update: Record<string, unknown> = { updated_at: new Date(patch.now).toISOString() };
      if (patch.state) update["state"] = patch.state;
      if (patch.replyText !== undefined) update["reply_text"] = patch.replyText;
      if (patch.kickMessageId !== undefined) update["kick_message_id"] = patch.kickMessageId;
      if (patch.failureReason !== undefined) update["failure_reason"] = patch.failureReason;
      const { data, error } = await table()
        .update(update as never)
        .eq("user_id" as never, userId)
        .eq("provider_event_id" as never, providerEventId)
        .eq("state" as never, from)
        .select("*")
        .maybeSingle();
      if (error) {
        if (missingTable(error)) throw new Error("kick_command_receipts_missing");
        throw new Error("kick_command_receipt_update_failed");
      }
      return data ? fromRow(data as unknown as Row) : null;
    },
    async findOutbound(userId, kickMessageId) {
      const { data, error } = await table()
        .select("*")
        .eq("user_id" as never, userId)
        .eq("kick_message_id" as never, kickMessageId)
        .maybeSingle();
      if (error) {
        if (missingTable(error)) return null;
        throw new Error("kick_command_receipt_lookup_failed");
      }
      return data ? fromRow(data as unknown as Row) : null;
    },
    async learnedBotUserId() {
      const { data, error } = await supabaseAdmin
        .from("kick_app_bot_identity" as never)
        .select("bot_user_id")
        .eq("client_id" as never, CLIENT_ID)
        .maybeSingle();
      if (error || !data) return null;
      const id = (data as { bot_user_id?: string }).bot_user_id?.trim() ?? "";
      return id || null;
    },
    async learnBotUser(botUserId, messageId) {
      const { error } = await supabaseAdmin.from("kick_app_bot_identity" as never).upsert(
        {
          client_id: CLIENT_ID,
          bot_user_id: botUserId,
          learned_from_message_id: messageId,
        } as never,
        { onConflict: "client_id" },
      );
      if (error) console.warn("[chat-bot] bot identity was not stored");
    },
  };
}

/** Tests and the webhook share this shape. Production uses Supabase. */
export function receiptBoardForTests(): ReceiptBoard {
  return createMemoryReceiptBoard();
}
