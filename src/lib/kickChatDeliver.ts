export type KickChatAttempt = {
  type: "user" | "bot";
  payload: Record<string, unknown>;
};

/**
 * User tokens must send `type: "user"` with `broadcaster_user_id`.
 * `type: "bot"` ignores that id and posts as the channel attached to the token.
 * A channel OAuth token is not a bot identity, so the user attempt comes first.
 */
export function kickChatAttempts(
  broadcasterUserId: string,
  content: string,
  replyToMessageId?: string | null,
): KickChatAttempt[] {
  const body = content.normalize("NFC").trim().slice(0, 480);
  const replyId = replyToMessageId?.trim() ?? "";
  const broadcasterId = Number(broadcasterUserId);
  const attempts: KickChatAttempt[] = [];
  if (Number.isSafeInteger(broadcasterId) && broadcasterId > 0) {
    const payload: Record<string, unknown> = {
      type: "user",
      content: body,
      broadcaster_user_id: broadcasterId,
    };
    if (replyId) payload["reply_to_message_id"] = replyId;
    attempts.push({ type: "user", payload });
  }
  const bot: Record<string, unknown> = { type: "bot", content: body };
  if (replyId) bot["reply_to_message_id"] = replyId;
  attempts.push({ type: "bot", payload: bot });
  return attempts;
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

export function kickErrorMessage(responseText: string): string {
  try {
    const parsed = JSON.parse(responseText) as { message?: unknown };
    if (typeof parsed.message === "string") return redactKickError(parsed.message);
  } catch {
    // Kick sometimes returns a non-JSON body.
  }
  return redactKickError(responseText);
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
  /** Timers set this so a failed user send cannot fall through to bot mode. */
  userOnly?: boolean;
  fetchImpl?: KickChatFetch;
}): Promise<{ ok: boolean; status: number | null; reason: string }> {
  if (!input.token) return { ok: false, status: null, reason: "no_access_token" };
  const content = input.content.normalize("NFC").trim().slice(0, 480);
  if (!content) return { ok: false, status: null, reason: "empty" };
  const fetchImpl = input.fetchImpl ?? kickFetch;
  const attempts = kickChatAttempts(input.broadcasterUserId, content, input.replyToMessageId).filter(
    (attempt) => !input.userOnly || attempt.type === "user",
  );
  if (!attempts.length) return { ok: false, status: null, reason: "broadcaster_required" };
  let lastStatus: number | null = null;
  let lastReason = "send_failed";
  for (const attempt of attempts) {
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
    if (response.ok) return { ok: true, status: response.status, reason: attempt.type };
    lastStatus = response.status;
    lastReason = `${attempt.type}_${response.status}`;
    console.warn("[chat-bot] kick send failed", attempt.type, response.status, kickErrorMessage(responseText));
  }
  return { ok: false, status: lastStatus, reason: lastReason };
}

const kickFetch: KickChatFetch = async (url, init) => {
  const response = await fetch(url, { ...init, keepalive: true, cache: "no-store" });
  return response;
};
