import { deliverKickChat, redactKickError, selectCylixBotToken } from "@/lib/kickChatDeliver";
import { getCylixBotChatToken } from "@/lib/platformTokens.server";

/**
 * Posts as @CylixBot into the partner channel (`type: "user"` + that channel's broadcaster id).
 * The studio user's Kick token is not read. A missing or rejected CylixBot token does not post.
 */
export async function sendKickChatMessage(
  _userId: string,
  broadcasterUserId: string,
  content: string,
  replyToMessageId?: string | null,
  options?: { userOnly?: boolean },
): Promise<boolean> {
  const token = selectCylixBotToken(await getCylixBotChatToken(), null);
  if (!token) {
    console.warn("[chat-bot] kick send skipped — CylixBot token missing", {
      broadcasterUserId,
      hint: "Set KICK_BOT_ACCESS_TOKEN or KICK_BOT_PLATFORM_USER_ID",
    });
    return false;
  }
  try {
    const result = await deliverKickChat({
      token,
      broadcasterUserId,
      content,
      replyToMessageId,
      userOnly: options?.userOnly,
    });
    if (!result.ok) return false;
    console.log("[chat-bot] kick chat response sent", {
      broadcasterId: Number(broadcasterUserId),
      mode: result.reason,
      chars: [...content.normalize("NFC").trim()].length,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "send_failed";
    console.error("[chat-bot] kick chat send threw", redactKickError(message));
    return false;
  }
}
