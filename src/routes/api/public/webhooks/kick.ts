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
    username ||=
      firstString(source, [
        ["sender", "username"],
        ["sender", "name"],
        ["sender", "slug"],
        ["user", "username"],
        ["chatter", "username"],
        ["author", "username"],
      ]) ?? "";
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

function isKickChatEvent(type: string, chat: KickChatFields): boolean {
  const normalized = type.toLowerCase().replace(/_/g, ".");
  if (normalized === "chat.message.sent" || normalized.includes("chat.message")) return true;
  return Boolean(chat.rawText && chat.username !== "Kick viewer");
}

function normalize(type: string, messageId: string, body: KickPayload): NormalizedEvent | null {
  const base = {
    platform: "KICK" as const,
    providerEventId: messageId,
    rawPayload: body,
    amount: null as number | null,
    currency: null as string | null,
  };
  const actorName =
    pickString(body, "follower", "username") ??
    pickString(body, "subscriber", "username") ??
    pickString(body, "gifter", "username") ??
    pickString(body, "sender", "username");
  const actorPlatformId =
    pickString(body, "follower", "user_id") ??
    pickString(body, "subscriber", "user_id") ??
    pickString(body, "gifter", "user_id");

  switch (type) {
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
        quantity: Math.max(Number(body["duration"] ?? 1) || 1, 1),
      };
    case "channel.subscription.gifts":
    case "gifted_subscriptions":
      return {
        ...base,
        eventType: "GIFT_SUB" as EventType,
        actorName: actorName ?? "Anonymous",
        actorPlatformId,
        quantity: Math.max(
          Array.isArray(body["giftees"]) ? (body["giftees"] as unknown[]).length : Number(body["quantity"] ?? 1) || 1,
          1,
        ),
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
        const { jsonResponse, ingestEvent, resolveSubathonByPlatformUser } = await import(
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
          const { handleClipCommand, warmKickClipBuffer } = await import("@/lib/clipCommand.server");

          if (/^!clip\b/i.test(text.trim())) {
            const command = handleClipCommand({
              userId: connection.user_id,
              broadcasterUserId: broadcasterId,
              text,
              sender: {
                username,
                platformId: senderId,
                identityBadges,
              },
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
            // Kick expects a fast acknowledgement. HLS capture can take several
            // seconds, so it must not block the webhook response or Kick retries it.
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
            deferRequestWork(
              request,
              warmKickClipBuffer(connection.user_id).catch((error) =>
                console.error("[kick-webhook] clip buffer warm failed", error),
              ),
            );
            return jsonResponse({ status: "accepted", command: markMatch.kind });
          }

          let commandResult: { status: string; reason?: string; command?: string } = {
            status: "ignored",
            reason: "empty_text",
          };
          if (text) {
            try {
              const { handleDefaultChatCommand } = await import("@/lib/defaultCommands.server");
              const defaultResult = await handleDefaultChatCommand({
                userId: connection.user_id,
                broadcasterUserId: broadcasterId,
                platform: "KICK",
                text,
                sender: { username },
              });
              commandResult = defaultResult;
              if (defaultResult.status === "ignored" && defaultResult.reason !== "cooldown") {
                const { handleCustomChatCommand } = await import("@/lib/customCommands.server");
                commandResult = await handleCustomChatCommand({
                  userId: connection.user_id,
                  broadcasterUserId: broadcasterId,
                  platform: "KICK",
                  text,
                  sender: { username, identityBadges },
                });
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
              const { captureGiveawayEntry } = await import("@/lib/giveaway.server");
              await captureGiveawayEntry(supabaseAdmin, connection.user_id, {
                platform: "KICK",
                username,
                text,
                isSubscriber: identityBadges.some((badge) => /sub|founder|og|vip/i.test(badge)),
              });
            })().catch((error) => console.error("[kick-webhook] giveaway entry failed", error)),
          );

          // Every chat message tops up the rolling clip buffer (throttled),
          // so `!clip` has real stream history to cut from.
          deferRequestWork(
            request,
            warmKickClipBuffer(connection.user_id).catch((error) =>
              console.error("[kick-webhook] clip buffer warm failed", error),
            ),
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

        const normalized = normalize(type, messageId ?? "", body);
        if (!normalized) {
          console.log("[kick-webhook] ignored unsupported event", { messageId, eventType: type || null });
          return jsonResponse({ status: "ignored", reason: "unsupported_type" });
        }

        const broadcasterId =
          pickString(body, "broadcaster", "user_id") ??
          pickString(body, "broadcaster", "channel_id") ??
          pickString(body, "channel_id");
        if (!broadcasterId) return jsonResponse({ status: "ignored", reason: "no_broadcaster" });

        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const target = await resolveSubathonByPlatformUser(supabaseAdmin, "KICK", broadcasterId);
        if (!target) return jsonResponse({ status: "ignored", reason: "no_active_subathon" });

        const result = await ingestEvent(supabaseAdmin, target, normalized);
        return jsonResponse(result);
        } catch (error) {
          console.error("[kick-webhook] unhandled failure", error);
          return jsonResponse({ error: "webhook_failed" }, 500);
        }
      },
    },
  },
});
