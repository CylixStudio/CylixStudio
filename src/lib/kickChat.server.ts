import { deliverKickChat } from "@/lib/kickChatDeliver";
import { getKickAccessToken } from "@/lib/platformTokens.server";

async function kickToken(userId: string): Promise<string | null> {
  return getKickAccessToken(userId, { requireScopes: ["chat:write"] });
}

/** Posts a chat line as the connected Kick user. Bot type is only a fallback. */
export async function sendKickChatMessage(
  userId: string,
  broadcasterUserId: string,
  content: string,
  replyToMessageId?: string | null,
  options?: { userOnly?: boolean },
): Promise<boolean> {
  const token = await kickToken(userId);
  if (!token) {
    console.warn("[chat-bot] kick send skipped — no access token", { userId, broadcasterUserId });
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
    console.error("[chat-bot] kick chat send threw", error);
    return false;
  }
}
