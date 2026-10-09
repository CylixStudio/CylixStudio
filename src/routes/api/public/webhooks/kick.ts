import { createFileRoute } from "@tanstack/react-router";

import type { EventType, NormalizedEvent } from "@/lib/webhooks/ingest.server";

type KickPayload = Record<string, unknown>;

function pickString(obj: unknown, ...path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : typeof cur === "number" ? String(cur) : null;
}

function asRecord(value: unknown): KickPayload | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as KickPayload) : null;
}

function messageTextFrom(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number") return String(value);
  const record = asRecord(value);
  if (!record) return null;
  return (
    messageTextFrom(record["text"], depth + 1) ??
    messageTextFrom(record["content"], depth + 1) ??
    messageTextFrom(record["message"], depth + 1) ??
    messageTextFrom(record["body"], depth + 1)
  );
}

function firstString(source: KickPayload, paths: string[][]): string | null {
  for (const path of paths) {
    const value = pickString(source, ...path);
    if (value) return value;
  }
  return null;
}

type KickChatFields = {
  text: string;
  rawText: string;
  username: string;
  broadcasterId: string | null;
  senderId: string | null;
  identityBadges: string[];
};

function readIdentityBadges(source: KickPayload): string[] {
  const identity = (source["sender"] as KickPayload | undefined)?.["identity"] as KickPayload | undefined;
  const badges = identity?.["badges"];
  if (!Array.isArray(badges)) return [];
  return badges.map((badge) => {
    const record = asRecord(badge);
    return String(record?.["type"] ?? record?.["text"] ?? badge ?? "");
  });
}

const SENDER_NAME_PATHS = [
  ["sender", "username"],
  ["sender", "name"],
  ["sender", "slug"],
  ["chatter", "username"],
  ["author", "username"],
  ["message", "sender", "username"],
] as const;

const BROADCASTER_NAME_PATHS = [
  ["broadcaster", "username"],
  ["broadcaster", "name"],
  ["broadcaster", "channel_slug"],
  ["channel", "username"],
  ["channel", "slug"],
] as const;

/** Prefer the chatter. A nested `user` is only used when it is not the channel account. */
function senderUsernameFrom(source: KickPayload): string {
  const sender = firstString(source, SENDER_NAME_PATHS.map((path) => [...path]));
  if (sender) return sender;
  const broadcaster = firstString(source, BROADCASTER_NAME_PATHS.map((path) => [...path]));
  const generic =
    firstString(source, [["user", "username"], ["user", "name"], ["username"]]) ?? "";
  if (generic && generic.toLowerCase() !== (broadcaster ?? "").toLowerCase()) return generic;
  return "";
}

/** Walks the shapes Kick has used for chat.message.sent, including wrapped `data`. */
function extractKickChat(body: KickPayload): KickChatFields {
  const sources = [body, asRecord(body["data"]), asRecord(body["payload"]), asRecord(body["event"])].filter(
    (source): source is KickPayload => source != null,
  );
  let rawText = "";
  let username = "";
  let broadcasterId: string | null = null;
  let senderId: string | null = null;
  let identityBadges: string[] = [];

  for (const source of sources) {
    rawText ||=
      messageTextFrom(source["content"]) ??
      messageTextFrom(source["message"]) ??
      messageTextFrom(source["text"]) ??
      "";
    username ||= senderUsernameFrom(source);
    broadcasterId ||= firstString(source, [
      ["broadcaster", "user_id"],
      ["broadcaster", "id"],
      ["broadcaster_user_id"],
      ["channel", "user_id"],
      ["channel_id"],
    ]);
    senderId ||= firstString(source, [
      ["sender", "user_id"],
      ["sender", "id"],
      ["user", "user_id"],
      ["user_id"],
    ]);
    if (!identityBadges.length) identityBadges = readIdentityBadges(source);
  }

  const plain = rawText
    .replace(/\[emote:\d+:[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    text: plain || rawText.trim(),
    rawText,
    username: username || "Kick viewer",
    broadcasterId,
    senderId,
    identityBadges,
  };
}

function viewerChatMessageId(body: KickPayload): string | null {
  const sources = [body, asRecord(body["data"]), asRecord(body["payload"]), asRecord(body["message"])].filter(
    (source): source is KickPayload => source != null,
  );
  for (const source of sources) {
    const id = firstString(source, [["message_id"], ["id"]]);
    if (id && id.length >= 8 && id.length <= 80) return id;
  }
  return null;
}

function isKickChatEvent(type: string, chat: KickChatFields): boolean {
  const normalized = type.toLowerCase().replace(/_/g, ".");
  if (normalized === "chat.message.sent" || normalized.includes("chat.message")) return true;
  // Follows, subs, kicks, and raids can carry a message. They are not chat.
  if (
    normalized.startsWith("channel.") ||
    normalized.startsWith("kicks.") ||
    normalized === "follow" ||
    normalized === "subscription" ||
    normalized === "raid" ||
    normalized.startsWith("gifted.")
  ) {
    return false;
  }
  return Boolean(chat.rawText && chat.username !== "Kick viewer");
}

/** Kick sometimes wraps the event in `data` / `payload`. Chat uses the outer body. */
function unwrapKickEvent(body: KickPayload): KickPayload {
  const nested = [asRecord(body["data"]), asRecord(body["payload"])].filter(
    (source): source is KickPayload => source != null,
  );
  for (const source of nested) {
    if (
      source["follower"] ||
      source["subscriber"] ||
      source["gifter"] ||
      source["broadcaster"] ||
      source["sender"] ||
      source["gift"] ||
      source["raider"]
    ) {
      return source;
    }
  }
  return body;
}

/** Subscription length in months. A seconds-sized value must not become the unit count. */
function subscriptionMonths(value: unknown): number {
  const months = Number(value ?? 1);
  if (!Number.isFinite(months) || months < 1 || months > 36) return 1;
  return Math.round(months);
}

function boundedCount(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.round(value), 500);
}

function normalize(type: string, messageId: string, body: KickPayload): NormalizedEvent | null {
  const kind = type.toLowerCase().replace(/_/g, ".");
  const gift = asRecord(body["gift"]);
  const giftMessage = pickString(gift ?? {}, "message") ?? pickString(body, "message");
  const base = {
    platform: "KICK" as const,
    providerEventId: messageId,
    rawPayload: giftMessage ? { ...body, message: giftMessage } : body,
    amount: null as number | null,
    currency: null as string | null,
  };
  const actorName =
    pickString(body, "follower", "username") ??
    pickString(body, "subscriber", "username") ??
    pickString(body, "gifter", "username") ??
    pickString(body, "sender", "username") ??
    pickString(body, "raider", "username") ??
    pickString(body, "user", "username");
  const actorPlatformId =
    pickString(body, "follower", "user_id") ??
    pickString(body, "subscriber", "user_id") ??
    pickString(body, "gifter", "user_id") ??
    pickString(body, "sender", "user_id") ??
    pickString(body, "raider", "user_id");

  switch (kind) {
    case "channel.followed":
    case "follow":
      return { ...base, eventType: "FOLLOW" as EventType, actorName, actorPlatformId, quantity: 1 };
    case "channel.subscription.new":
    case "channel.subscription.renewal":
    case "subscription":
      return {
        ...base,
        eventType: "SUBSCRIPTION" as EventType,
        actorName,
        actorPlatformId,
        quantity: subscriptionMonths(body["duration"]),
      };
    case "channel.subscription.gifts":
    case "gifted.subscriptions":
      return {
        ...base,
        eventType: "GIFT_SUB" as EventType,
        actorName: actorName ?? "Anonymous",
        actorPlatformId,
        quantity: boundedCount(
          Array.isArray(body["giftees"]) ? (body["giftees"] as unknown[]).length : Number(body["quantity"] ?? 1) || 1,
        ),
      };
    case "kicks.gifted":
    case "channel.kicks.gifted": {
      const amount = Number(gift?.["amount"] ?? body["amount"] ?? 0);
      return {
        ...base,
        eventType: "BITS" as EventType,
        actorName,
        actorPlatformId,
        amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        quantity: 1,
      };
    }
    case "channel.raid":
    case "livestream.raid":
    case "raid":
      return {
        ...base,
        eventType: "RAID" as EventType,
        actorName,
        actorPlatformId,
        amount: null,
        quantity: 1,
      };
    default:
      return null;
  }
}

export const Route = createFileRoute("/api/public/webhooks/kick")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: true, listener: "kick", status: "listening" }), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
      POST: async ({ request }) => {
        const { jsonResponse, receivePlatformEvent, resolveUserByPlatformUser } = await import(
          "@/lib/webhooks/ingest.server"
        );
        const { verifyKickSignature } = await import("@/lib/webhooks/verify.server");

        try {
        const publicKeyPem = process.env["KICK_WEBHOOK_PUBLIC_KEY"];
        const hmacSecret = process.env["KICK_WEBHOOK_SECRET"];
        const rawBody = await request.text();
        const messageId = request.headers.get("kick-event-message-id");
        const headerType = request.headers.get("kick-event-type");
        console.log(
          "[kick-webhook] incoming",
          JSON.stringify({
            messageId,
            eventType: headerType,
            body: rawBody.length > 20000 ? `${rawBody.slice(0, 20000)}…truncated` : rawBody,
          }),
        );
        const signature = request.headers.get("kick-event-signature");
        const timestamp = request.headers.get("kick-event-message-timestamp");
        const skipVerify = process.env["KICK_WEBHOOK_SKIP_VERIFY"] === "true";
        const missingEnv = [
          publicKeyPem?.trim() ? null : "KICK_WEBHOOK_PUBLIC_KEY",
          hmacSecret?.trim() ? null : "KICK_WEBHOOK_SECRET",
        ].filter((name): name is string => name != null);
        const verification = await verifyKickSignature({
          publicKeyPem,
          hmacSecret,
          messageId,
          timestamp,
          signature,
          rawBody,
        });
        if (!verification.ok && skipVerify) {
          console.warn(
            "[kick-webhook] signature bypassed via KICK_WEBHOOK_SKIP_VERIFY",
            JSON.stringify({ ...verification, missingEnv }),
          );
        } else if (!verification.ok) {
          console.error(
            "[kick-webhook] invalid signature",
            JSON.stringify({
              ...verification,
              missingEnv,
              note: "Kick signs with its RSA public key. KICK_WEBHOOK_PUBLIC_KEY and KICK_WEBHOOK_SECRET are optional overrides.",
            }),
          );
          return jsonResponse({ error: "invalid_signature", reason: verification.reason }, 403);
        }

        let body: KickPayload;
        try {
          body = JSON.parse(rawBody) as KickPayload;
        } catch (error) {
          console.error("[kick-webhook] invalid json", error);
          return jsonResponse({ error: "invalid_json" }, 400);
        }

        const type =
          headerType ||
          (typeof body["event"] === "string" ? body["event"] : "") ||
          (typeof body["type"] === "string" ? body["type"] : "") ||
          (typeof body["event_type"] === "string" ? body["event_type"] : "");
        const normalizedType = type.toLowerCase().replace(/_/g, ".");
        const chat = extractKickChat(body);
        console.log(
          "[kick-webhook] parsed",
          JSON.stringify({
            messageId,
            eventType: type || null,
            normalizedType,
            username: chat.username,
            text: chat.text,
            broadcasterId: chat.broadcasterId,
            senderId: chat.senderId,
          }),
        );
        const looksLikeRewardRedemption =
          normalizedType.includes("reward") && normalizedType.includes("redemption");
        if (looksLikeRewardRedemption) {
          const { ingestKickMediaRedemption } = await import("@/lib/mediaRequests.server");
          const result = await ingestKickMediaRedemption({ messageId: messageId ?? "", body });
          console.log("[kick-webhook] media request pipeline result", JSON.stringify({ type, messageId, result }));
          return jsonResponse(result);
        }
        if (isKickChatEvent(type, chat)) {
          const { broadcasterId, text, username, senderId, identityBadges } = chat;
          if (!broadcasterId) {
            console.warn("[kick-webhook] chat ignored — no broadcaster id", { messageId, eventType: type });
            return jsonResponse({ status: "ignored", reason: "no_broadcaster" });
          }
          const { supabaseAdmin } = await import("@/lib/supabase/client.server");
          const { data: connection } = await supabaseAdmin.from("platform_connections")
            .select("user_id").eq("platform", "KICK").eq("platform_user_id", broadcasterId)
            .eq("is_active", true).maybeSingle();
          if (!connection) {
            console.warn("[kick-webhook] chat ignored — no Kick connection", { messageId, broadcasterId });
            return jsonResponse({ status: "ignored", reason: "kick_connection_not_found" });
          }

          const { deferRequestWork } = await import("@/lib/requestContext.server");
          const { handleClipCommand } = await import("@/lib/clipCommand.server");

          if (/^!clip\b/i.test(text.trim())) {
            const isTest =
              (body as { isTest?: unknown }).isTest === true ||
              (body as { is_test?: unknown }).is_test === true;
            const command = handleClipCommand({
              userId: connection.user_id,
              broadcasterUserId: broadcasterId,
              text,
              sender: {
                username,
                platformId: senderId,
                identityBadges,
              },
              isTest,
            });
            deferRequestWork(
              request,
              command.then((result) => {
                console.log("[kick-webhook] clip command completed", {
                  messageId,
                  broadcasterId,
                  status: result.status,
                  reason: result.reason,
                });
              }),
            );
            // Kick expects a fast acknowledgement. The clip request and chat reply
            // continue after this response so the webhook itself does not wait.
            return jsonResponse({ status: "accepted", command: "clip" });
          }

          const { matchMarkCommand } = await import("@/lib/markPoints");
          const markMatch = matchMarkCommand(text);
          if (markMatch) {
            const { handleMarkCommand } = await import("@/lib/markPoints.server");
            deferRequestWork(
              request,
              handleMarkCommand({
                userId: connection.user_id,
                broadcasterUserId: broadcasterId,
                platform: "KICK",
                text,
                sender: {
                  username,
                  platformId: senderId,
                  identityBadges,
                },
              })
                .then((result) => {
                  console.log("[kick-webhook] mark command", { messageId, ...result });
                })
                .catch((error) => console.error("[kick-webhook] mark command failed", error)),
            );
            return jsonResponse({ status: "accepted", command: markMatch.kind });
          }

          let commandResult: { status: string; reason?: string; command?: string } = {
            status: "ignored",
            reason: "empty_text",
          };
          if (text) {
            try {
              const { requestPublicOrigin } = await import("@/lib/commandsUrl");
              const origin = requestPublicOrigin(request);
              if (/^!buy\b/i.test(text.trim())) {
                const { handleShopBuyCommand } = await import("@/lib/shopBuy.server");
                commandResult = await handleShopBuyCommand({
                  userId: connection.user_id,
                  broadcasterUserId: broadcasterId,
                  platform: "KICK",
                  text,
                  sender: { username },
                  isTest: false,
                });
              } else if (/^!?(?:wheel|spin|عجلة)$/i.test(text.trim())) {
                const { handleWheelChatCommand } = await import("@/lib/wheelCommand.server");
                commandResult = await handleWheelChatCommand({
                  userId: connection.user_id,
                  broadcasterUserId: broadcasterId,
                  platform: "KICK",
                  text,
                  sender: { username },
                  isTest: false,
                });
              } else {
                const { handleDefaultChatCommand } = await import("@/lib/defaultCommands.server");
                const defaultResult = await handleDefaultChatCommand({
                  userId: connection.user_id,
                  broadcasterUserId: broadcasterId,
                  platform: "KICK",
                  text,
                  sender: { username },
                  origin,
                  replyToMessageId: viewerChatMessageId(body),
                });
                commandResult = defaultResult;
                if (defaultResult.status === "ignored" && defaultResult.reason === "no_match") {
                  const { handleCustomChatCommand } = await import("@/lib/customCommands.server");
                  commandResult = await handleCustomChatCommand({
                    userId: connection.user_id,
                    broadcasterUserId: broadcasterId,
                    platform: "KICK",
                    text,
                    sender: { username, identityBadges },
                  });
                }
              }
              console.log("[kick-webhook] chat command", {
                messageId,
                username,
                text: text.slice(0, 80),
                ...commandResult,
              });
            } catch (error) {
              console.error("[kick-webhook] chat command failed", error);
              commandResult = { status: "error", reason: "command_threw" };
            }
          } else {
            console.warn("[kick-webhook] chat event had no message text", { messageId, eventType: type });
          }

          // Giveaway keyword entries are captured server-side so they land
          // even when nobody has the dashboard open.
          deferRequestWork(
            request,
            (async () => {
              const { captureGiveawayEntry, confirmGiveawayPresence } = await import("@/lib/giveaway.server");
              const isTest =
                (body as { isTest?: unknown }).isTest === true ||
                (body as { is_test?: unknown }).is_test === true;
              await confirmGiveawayPresence(supabaseAdmin, connection.user_id, {
                username,
                text,
                isTest,
              });
              await captureGiveawayEntry(supabaseAdmin, connection.user_id, {
                platform: "KICK",
                username,
                text,
                isSubscriber: identityBadges.some((badge) => /sub|founder|og|vip/i.test(badge)),
              });
            })().catch((error) => console.error("[kick-webhook] giveaway entry failed", error)),
          );

          const { ingestChatMediaRequest } = await import("@/lib/mediaRequests.server");

          const result = await ingestChatMediaRequest({
            userId: connection.user_id,
            messageId: pickString(body, "message_id") ?? messageId ?? crypto.randomUUID(),
            username,
            text,
          });
          return jsonResponse({ ...result, command: commandResult });
        }

        const eventBody = unwrapKickEvent(body);
        const normalized = normalize(type, messageId ?? "", eventBody);
        if (!normalized) {
          console.log("[kick-webhook] ignored unsupported event", { messageId, eventType: type || null });
          return jsonResponse({ status: "ignored", reason: "unsupported_type" });
        }

        const broadcasterId =
          pickString(eventBody, "broadcaster", "user_id") ??
          pickString(eventBody, "broadcaster", "channel_id") ??
          pickString(eventBody, "channel_id") ??
          pickString(body, "broadcaster", "user_id") ??
          pickString(body, "broadcaster", "channel_id") ??
          pickString(body, "channel_id");
        if (!broadcasterId) return jsonResponse({ status: "ignored", reason: "no_broadcaster" });

        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const userId = await resolveUserByPlatformUser(supabaseAdmin, "KICK", broadcasterId);
        if (!userId) return jsonResponse({ status: "ignored", reason: "no_connection" });

        const result = await receivePlatformEvent(supabaseAdmin, userId, normalized);
        return jsonResponse(result);
        } catch (error) {
          console.error("[kick-webhook] unhandled failure", error);
          return jsonResponse({ error: "webhook_failed" }, 500);
        }
      },
    },
  },
});
