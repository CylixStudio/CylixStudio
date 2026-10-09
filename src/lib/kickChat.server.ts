import { getKickAccessToken } from "@/lib/platformTokens.server";

async function kickToken(userId: string): Promise<string | null> {
  return getKickAccessToken(userId, { requireScopes: ["chat:write"] });
}

/** Posts a bot message back to the creator's Kick chat feed. */
export async function sendKickChatMessage(
  userId: string,
  broadcasterUserId: string,
  content: string,
  replyToMessageId?: string | null,
): Promise<boolean> {
  const token = await kickToken(userId);
  if (!token) {
    console.warn("[chat-bot] kick send skipped — no access token", { userId, broadcasterUserId });
    return false;
  }
  const body = content.normalize("NFC").trim().slice(0, 480);
  if (!body) return false;
  const broadcasterId = Number(broadcasterUserId);
  const replyId = replyToMessageId?.trim() ?? "";

  const post = async (payload: Record<string, unknown>) => {
    // Own signal so this POST is not cancelled or held by the webhook request.
    const signal = new AbortController().signal;
    const response = await fetch("https://api.kick.com/public/v1/chat", {
      method: "POST",
      keepalive: true,
      cache: "no-store",
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text().catch(() => "");
    return { response, responseText };
  };

  try {
    const botPayload: Record<string, unknown> = { type: "bot", content: body };
    if (replyId) botPayload["reply_to_message_id"] = replyId;
    const bot = await post(botPayload);
    if (bot.response.ok) {
      console.log("[chat-bot] kick chat response sent", { broadcasterId, mode: "bot", chars: [...body].length });
      return true;
    }
    if (replyId) {
      const plain = await post({ type: "bot", content: body });
      if (plain.response.ok) {
        console.log("[chat-bot] kick chat response sent", { broadcasterId, mode: "bot", chars: [...body].length });
        return true;
      }
    }
    console.warn("[chat-bot] kick bot send failed", bot.response.status, bot.responseText);

    if (!Number.isSafeInteger(broadcasterId) || broadcasterId <= 0) return false;
    const user = await post({
      type: "user",
      content: body,
      broadcaster_user_id: broadcasterId,
    });
    if (!user.response.ok) {
      console.warn("[chat-bot] kick user send failed", user.response.status, user.responseText);
      return false;
    }
    console.log("[chat-bot] kick chat response sent", { broadcasterId, mode: "user", chars: [...body].length });
    return true;
  } catch (error) {
    console.error("[chat-bot] kick chat send threw", error);
    return false;
  }
}
