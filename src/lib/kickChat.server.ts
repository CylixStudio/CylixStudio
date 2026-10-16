import {
  activeKickReceipt,
  logKickReceiptStage,
  markReplyPending,
  markReplyResult,
  type ReceiptSession,
} from "@/lib/kickCommandReceipt";
import { redactKickError, sendOfficialKickBot, type KickChatFetch } from "@/lib/kickChatDeliver";
import { markActiveKickReply } from "@/lib/kickReplyTiming";
import { getKickAccessToken } from "@/lib/platformTokens.server";

/**
 * Posts as the CylixBot Developer app bot into the partner channel attached
 * to that channel's user access token (`type: "bot"`, `chat:write`).
 * Does not read KICK_BOT_ACCESS_TOKEN and does not fall back to `type: "user"`.
 */
export async function sendKickChatMessage(
  userId: string,
  broadcasterUserId: string,
  content: string,
  replyToMessageId?: string | null,
  options?: {
    /** Accepted so older callers compile. It does not change the bot payload. */
    userOnly?: boolean;
    loadToken?: (userId: string, forceRefresh: boolean) => Promise<string | null>;
    fetchImpl?: KickChatFetch;
    /** Explicit receipt binding. Prefer this over ALS alone on Workers. */
    receiptSession?: ReceiptSession | null | undefined;
  },
): Promise<boolean> {
  const loadToken =
    options?.loadToken ??
    ((id: string, forceRefresh: boolean) =>
      getKickAccessToken(id, { requireScopes: ["chat:write"], forceRefresh }));
  const session = options?.receiptSession ?? activeKickReceipt();
  const correlationId = session?.providerEventId ?? "none";
  const body = content.normalize("NFC").trim().slice(0, 480);
  if (!body) {
    logKickReceiptStage(correlationId, "reply_generated", { empty: true });
    return false;
  }
  logKickReceiptStage(correlationId, "reply_generated", { chars: [...body].length });
  const now = Date.now();
  if (!session) {
    logKickReceiptStage(correlationId, "reply_session_missing", { willSend: true });
  }
  if (session) {
    const armed = await markReplyPending(session.board, session.userId, session.providerEventId, body, now);
    if (!armed) {
      logKickReceiptStage(correlationId, "reply_delivery_started", { armed: false });
      return false;
    }
    logKickReceiptStage(correlationId, "reply_delivery_started", { armed: true });
  }
  try {
    const sent = await sendOfficialKickBot({
      userId,
      broadcasterUserId,
      content: body,
      loadToken,
      onChatStart: () => markActiveKickReply("chat_request_started"),
      onChatResponse: () => markActiveKickReply("chat_response_received"),
      ...(replyToMessageId != null ? { replyToMessageId } : {}),
      ...(options?.userOnly !== undefined ? { userOnly: options.userOnly } : {}),
      ...(options?.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
    logKickReceiptStage(correlationId, "kick_api_response", {
      ok: sent.ok,
      status: sent.status,
      reason: sent.reason,
      outcome: sent.outcome,
      hasKickMessageId: Boolean(sent.kickMessageId),
    });
    if (session) {
      await markReplyResult(
        session.board,
        session.userId,
        session.providerEventId,
        sent.outcome === "skipped" ? "rejected" : sent.outcome,
        Date.now(),
        sent.kickMessageId,
        sent.ok ? null : sent.reason,
      );
      logKickReceiptStage(correlationId, "reply_delivery_finalized", {
        outcome: sent.outcome === "skipped" ? "rejected" : sent.outcome,
      });
    }
    if (!sent.ok) return false;
    console.log("[chat-bot] kick chat response sent", {
      broadcasterId: Number(broadcasterUserId) || null,
      mode: "bot",
      chars: [...body].length,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "send_failed";
    console.error("[chat-bot] kick chat send threw", redactKickError(message));
    if (session) {
      await markReplyResult(session.board, session.userId, session.providerEventId, "ambiguous", Date.now(), null, "send_threw");
      logKickReceiptStage(correlationId, "reply_delivery_finalized", { outcome: "ambiguous" });
    }
    return false;
  }
}
