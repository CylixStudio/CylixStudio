import { activeKickReceipt, markReplyPending, markReplyResult } from "@/lib/kickCommandReceipt";
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
  },
): Promise<boolean> {
  const loadToken =
    options?.loadToken ??
    ((id: string, forceRefresh: boolean) =>
      getKickAccessToken(id, { requireScopes: ["chat:write"], forceRefresh }));
  const session = activeKickReceipt();
  const now = Date.now();
  if (session) {
    const armed = await markReplyPending(session.board, session.userId, session.providerEventId, content, now);
    if (!armed) return false;
  }
  try {
    const sent = await sendOfficialKickBot({
      userId,
      broadcasterUserId,
      content,
      replyToMessageId,
      userOnly: options?.userOnly,
      loadToken,
      fetchImpl: options?.fetchImpl,
      onChatStart: () => markActiveKickReply("chat_request_started"),
      onChatResponse: () => markActiveKickReply("chat_response_received"),
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
    }
    if (!sent.ok) return false;
    console.log("[chat-bot] kick chat response sent", {
      broadcasterId: Number(broadcasterUserId) || null,
      mode: "bot",
      chars: [...content.normalize("NFC").trim()].length,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "send_failed";
    console.error("[chat-bot] kick chat send threw", redactKickError(message));
    if (session) {
      await markReplyResult(session.board, session.userId, session.providerEventId, "ambiguous", Date.now(), null, "send_threw");
    }
    return false;
  }
}
