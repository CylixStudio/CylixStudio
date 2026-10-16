export type KickChatAttempt = {
  type: "bot";
  payload: Record<string, unknown>;
};

/**
 * Official Kick chat send (docs.kick.com/apis/chat, fetched 2026-10-15).
 * `POST /public/v1/chat` with a user access token that has `chat:write`.
 * `type: "bot"` posts as the Developer app bot into the channel attached to
 * that token. `broadcaster_user_id` is ignored for `type: "bot"` and is omitted.
 * App access tokens are not a chat security scheme. There is no `type: "user"`
 * attempt and no channel-owner display fallback.
 */
export function kickChatAttempts(
  content: string,
  replyToMessageId?: string | null,
): KickChatAttempt[] {
  const body = content.normalize("NFC").trim().slice(0, 480);
  if (!body) return [];
  const payload: Record<string, unknown> = {
    type: "bot",
    content: body,
  };
  const replyId = replyToMessageId?.trim() ?? "";
  if (replyId) payload["reply_to_message_id"] = replyId;
  return [{ type: "bot", payload }];
}

/** Partner-channel user token only. A dedicated @CylixBot user token is not a substitute. */
export function selectChannelChatToken(channelToken: string | null | undefined): string | null {
  const token = channelToken?.trim() ?? "";
  return token || null;
}

/** Known scopes must include chat:write. An empty list is not treated as granted. */
export function kickTokenAllowsChatWrite(scopes: readonly string[] | null | undefined): boolean {
  return Array.isArray(scopes) && scopes.includes("chat:write");
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

export type KickChatResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  headers?: { get(name: string): string | null };
};

export type KickChatFetch = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<KickChatResponse>;

export type KickChatDelivery = {
  ok: boolean;
  status: number | null;
  reason: string;
  retryAfterMs: number | null;
  outcome: "sent" | "rejected" | "ambiguous" | "skipped";
  kickMessageId: string | null;
};

export function classifyKickSendFailure(status: number | null, code: string): string {
  if ((status === 400 || status === 403 || status === 404) && /channel not found/i.test(code)) {
    return "bot_not_activated";
  }
  if (status === 403) return "bot_forbidden";
  return `bot_${status ?? "error"}`;
}

function kickMessageIdFrom(responseText: string): string | null {
  try {
    const parsed = JSON.parse(responseText) as { data?: { message_id?: unknown } };
    const id = parsed.data?.message_id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

const skipped = (reason: string): KickChatDelivery => ({
  ok: false,
  status: null,
  reason,
  retryAfterMs: null,
  outcome: "skipped",
  kickMessageId: null,
});

function retryAfterMs(headers: KickChatResponse["headers"]): number | null {
  const raw = headers?.get("retry-after")?.trim() ?? "";
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return null;
}

export async function deliverKickChat(input: {
  token: string | null;
  /** Logged for the partner channel. Not sent on `type: "bot"`. */
  broadcasterUserId: string;
  content: string;
  replyToMessageId?: string | null;
  /** Ignored. Timers and commands share the official bot payload. */
  userOnly?: boolean;
  fetchImpl?: KickChatFetch;
  onChatStart?: () => void;
  onChatResponse?: () => void;
}): Promise<KickChatDelivery> {
  void input.userOnly;
  if (!input.token) return skipped("no_access_token");
  const content = input.content.normalize("NFC").trim().slice(0, 480);
  if (!content) return skipped("empty");
  const attempt = kickChatAttempts(content, input.replyToMessageId)[0];
  if (!attempt) return skipped("empty");
  const fetchImpl = input.fetchImpl ?? kickFetch;
  const signal = AbortSignal.timeout(4_000);
  input.onChatStart?.();
  let response: KickChatResponse;
  try {
    response = await fetchImpl("https://api.kick.com/public/v1/chat", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: JSON.stringify(attempt.payload),
    });
  } catch (error) {
    input.onChatResponse?.();
    const name = error instanceof Error ? error.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    const message = error instanceof Error ? error.message : "send_failed";
    console.error("[chat-bot] kick chat send threw", redactKickError(message));
    // Any throw after Kick may have accepted the message — treat as ambiguous (no auto-resend).
    return {
      ok: false,
      status: null,
      reason: timedOut ? "ambiguous_timeout" : "send_threw",
      retryAfterMs: null,
      outcome: "ambiguous",
      kickMessageId: null,
    };
  }
  input.onChatResponse?.();
  const responseText = await response.text().catch(() => "");
  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      reason: "bot",
      retryAfterMs: null,
      outcome: "sent",
      kickMessageId: kickMessageIdFrom(responseText),
    };
  }
  const code = kickErrorCode(responseText);
  const reason = classifyKickSendFailure(response.status, code);
  const retry = response.status === 429 ? retryAfterMs(response.headers) : null;
  if (reason === "bot_not_activated") {
    console.warn("[chat-bot] developer bot activation failed", {
      status: response.status,
      code,
      broadcasterUserId: input.broadcasterUserId,
    });
  } else {
    console.warn("[chat-bot] kick send failed", {
      status: response.status,
      code,
      broadcasterUserId: input.broadcasterUserId,
      retryAfterMs: retry,
    });
  }
  return {
    ok: false,
    status: response.status,
    reason,
    retryAfterMs: retry,
    outcome: "rejected",
    kickMessageId: null,
  };
}

const UNSAFE_RETRY = new Set([401, 403, 429]);

/**
 * One official-bot send for a partner channel. A 401 refreshes once.
 * 401, 403, and 429 are not retried again. `userOnly` does not change the payload.
 */
export async function sendOfficialKickBot(input: {
  userId: string;
  broadcasterUserId: string;
  content: string;
  replyToMessageId?: string | null;
  userOnly?: boolean;
  loadToken: (userId: string, forceRefresh: boolean) => Promise<string | null>;
  fetchImpl?: KickChatFetch;
  onChatStart?: () => void;
  onChatResponse?: () => void;
}): Promise<KickChatDelivery> {
  void input.userOnly;
  const token = selectChannelChatToken(await input.loadToken(input.userId, false));
  if (!token) {
    console.warn("[chat-bot] kick send skipped — channel token missing", {
      broadcasterUserId: input.broadcasterUserId,
      hint: "Partner Kick connection needs chat:write. Reconnect Kick in CylixStudio settings.",
    });
    return skipped("no_access_token");
  }
  const result = await deliverKickChat({
    token,
    broadcasterUserId: input.broadcasterUserId,
    content: input.content,
    replyToMessageId: input.replyToMessageId,
    fetchImpl: input.fetchImpl,
    onChatStart: input.onChatStart,
    onChatResponse: input.onChatResponse,
  });
  if (result.outcome === "ambiguous" || result.reason === "bot_not_activated" || result.status !== 401) return result;
  const refreshed = selectChannelChatToken(await input.loadToken(input.userId, true));
  if (!refreshed || refreshed === token) {
    console.warn("[chat-bot] kick 401 not retried", { broadcasterUserId: input.broadcasterUserId });
    return result;
  }
  const second = await deliverKickChat({
    token: refreshed,
    broadcasterUserId: input.broadcasterUserId,
    content: input.content,
    replyToMessageId: input.replyToMessageId,
    fetchImpl: input.fetchImpl,
  });
  if (!second.ok || (second.status != null && UNSAFE_RETRY.has(second.status)) || second.reason === "bot_not_activated") {
    console.warn("[chat-bot] kick refresh retry failed", {
      broadcasterUserId: input.broadcasterUserId,
      status: second.status,
      reason: second.reason,
    });
    return second.ok ? result : second;
  }
  return second;
}

const kickFetch: KickChatFetch = async (url, init) => {
  const response = await fetch(url, { ...init, keepalive: true, cache: "no-store" });
  return response;
};
