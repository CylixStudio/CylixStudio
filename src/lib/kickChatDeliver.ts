export type KickChatAttempt = {
  type: "user" | "bot";
  payload: Record<string, unknown>;
};

/**
 * One attempt: `type: "user"` as the CylixBot user, aimed at the partner channel.
 * `type: "bot"` posts as the channel on the token and ignores `broadcaster_user_id`,
 * so it is not a way to appear as @CylixBot in someone else's chat.
 * There is no second attempt and no channel-owner token.
 */
export function kickChatAttempts(
  broadcasterUserId: string,
  content: string,
  replyToMessageId?: string | null,
): KickChatAttempt[] {
  const body = content.normalize("NFC").trim().slice(0, 480);
  const replyId = replyToMessageId?.trim() ?? "";
  const broadcasterId = Number(broadcasterUserId);
  if (!Number.isSafeInteger(broadcasterId) || broadcasterId <= 0) return [];
  const payload: Record<string, unknown> = {
    type: "user",
    content: body,
    broadcaster_user_id: broadcasterId,
  };
  if (replyId) payload["reply_to_message_id"] = replyId;
  return [{ type: "user", payload }];
}

/** Channel-owner tokens are never a substitute for the CylixBot token. */
export function selectCylixBotToken(botToken: string | null | undefined, ownerToken: string | null | undefined): string | null {
  const bot = botToken?.trim() ?? "";
  if (!bot) return null;
  void ownerToken;
  return bot;
}

export function redactKickError(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /((?:access_token|refresh_token|client_secret|token|code)"?\s*[:=]\s*"?)[^"',\s}]+/gi,
      "$1[redacted]",
    )
    .slice(0, 180);
}

export function kickErrorCode(responseText: string): string {
  try {
    const parsed = JSON.parse(responseText) as { error?: unknown; code?: unknown; message?: unknown };
    const code = parsed.error ?? parsed.code ?? parsed.message;
    if (typeof code === "string" && code.trim()) return redactKickError(code);
    if (typeof code === "number") return String(code);
  } catch {
    // Kick sometimes returns a non-JSON body.
  }
  return "unknown";
}

export function kickErrorMessage(responseText: string): string {
  return kickErrorCode(responseText);
}

export type KickChatFetch = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export async function deliverKickChat(input: {
  token: string | null;
  broadcasterUserId: string;
  content: string;
  replyToMessageId?: string | null;
  /** Kept for callers. Bot mode is never added. */
  userOnly?: boolean;
  fetchImpl?: KickChatFetch;
}): Promise<{ ok: boolean; status: number | null; reason: string }> {
  if (!input.token) return { ok: false, status: null, reason: "no_access_token" };
  const content = input.content.normalize("NFC").trim().slice(0, 480);
  if (!content) return { ok: false, status: null, reason: "empty" };
  const fetchImpl = input.fetchImpl ?? kickFetch;
  const attempt = kickChatAttempts(input.broadcasterUserId, content, input.replyToMessageId)[0];
  if (!attempt || (input.userOnly && attempt.type !== "user")) {
    return { ok: false, status: null, reason: "broadcaster_required" };
  }
  const signal = new AbortController().signal;
  const response = await fetchImpl("https://api.kick.com/public/v1/chat", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
    },
    body: JSON.stringify(attempt.payload),
  });
  const responseText = await response.text().catch(() => "");
  if (response.ok) return { ok: true, status: response.status, reason: "user" };
  console.warn("[chat-bot] kick send failed", {
    status: response.status,
    code: kickErrorCode(responseText),
    broadcasterUserId: input.broadcasterUserId,
  });
  return { ok: false, status: response.status, reason: `user_${response.status}` };
}

const kickFetch: KickChatFetch = async (url, init) => {
  const response = await fetch(url, { ...init, keepalive: true, cache: "no-store" });
  return response;
};
