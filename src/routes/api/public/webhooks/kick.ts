import { createFileRoute } from "@tanstack/react-router";

import {
  chatLineNeedsCommandModules,
  chatTextNeedsHandlers,
  extractKickChat,
  isCylixBotChatAuthor,
  isKickChatEvent,
  kickEventAlreadyHandled,
  normalizeKickEvent,
  rememberKickEvent,
  unwrapKickEvent,
  viewerChatMessageId,
  type KickPayload,
  type KickWebhookOutcome,
} from "@/lib/kickWebhookParse";

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

const connectionCache = new Map<string, { userId: string; at: number }>();
const CONNECTION_TTL_MS = 30_000;
const directCatalogCache = new Map<
  string,
  { catalog: NonNullable<Awaited<ReturnType<typeof loadDirectCommandCatalog>>>; at: number }
>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function logOutcome(fields: {
  messageId: string | null;
  outcome: KickWebhookOutcome;
  reason?: string;
  eventType?: string | null;
}): void {
  console.log("[kick-webhook] outcome", JSON.stringify(fields));
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
              bodyBytes: rawBody.length,
            }),
          );
          const signature = request.headers.get("kick-event-signature");
          const timestamp = request.headers.get("kick-event-message-timestamp");
          const skipVerify = process.env["KICK_WEBHOOK_SKIP_VERIFY"] === "true";
          const verification = await verifyKickSignature({
            publicKeyPem,
            hmacSecret,
            messageId,
            timestamp,
            signature,
            rawBody,
          });
          if (!verification.ok && skipVerify) {
            console.warn("[kick-webhook] signature bypassed via KICK_WEBHOOK_SKIP_VERIFY", verification.reason);
          } else if (!verification.ok) {
            console.error("[kick-webhook] invalid signature", verification.reason);
            logOutcome({ messageId, outcome: "failed", reason: verification.reason, eventType: headerType });
            return jsonResponse({ error: "invalid_signature", reason: verification.reason }, 403);
          }

          if (kickEventAlreadyHandled(messageId)) {
            logOutcome({ messageId, outcome: "duplicate", eventType: headerType });
            return jsonResponse({ status: "duplicate", messageId });
          }

          let body: KickPayload;
          try {
            body = JSON.parse(rawBody) as KickPayload;
          } catch (error) {
            console.error("[kick-webhook] invalid json", error);
            logOutcome({ messageId, outcome: "failed", reason: "invalid_json", eventType: headerType });
            return jsonResponse({ error: "invalid_json" }, 400);
          }

          const type =
            headerType ||
            (typeof body["event"] === "string" ? body["event"] : "") ||
            (typeof body["type"] === "string" ? body["type"] : "") ||
            (typeof body["event_type"] === "string" ? body["event_type"] : "");
          const normalizedType = type.toLowerCase().replace(/_/g, ".");
          const chat = extractKickChat(body);

          const looksLikeRewardRedemption =
            normalizedType.includes("reward") && normalizedType.includes("redemption");
          if (looksLikeRewardRedemption) {
            const { ingestKickMediaRedemption } = await import("@/lib/mediaRequests.server");
            const result = await ingestKickMediaRedemption({ messageId: messageId ?? "", body });
            rememberKickEvent(messageId);
            logOutcome({ messageId, outcome: "processed", reason: "media_redemption", eventType: type });
            return jsonResponse(result);
          }

          const interactiveHint = `${type} ${pickString(body, "name") ?? ""} ${pickString(body, "event_name") ?? ""}`;
          let interactiveName: string | undefined;
          if (/poll|prediction/i.test(interactiveHint)) {
            const { classifyKickInteractiveEvent } = await import("@/lib/interactiveWidgets");
            interactiveName = [type, pickString(body, "name") ?? "", pickString(body, "event_name") ?? ""].find(
              (candidate) => classifyKickInteractiveEvent(candidate),
            );
          }
          if (interactiveName) {
            const broadcasterId =
              pickString(body, "broadcaster", "user_id") ??
              pickString(body, "broadcaster", "id") ??
              pickString(body, "broadcaster_user_id") ??
              pickString(asRecord(body["data"]) ?? {}, "broadcaster", "user_id") ??
              pickString(asRecord(body["data"]) ?? {}, "broadcaster_user_id") ??
              pickString(asRecord(body["payload"]) ?? {}, "broadcaster", "user_id") ??
              pickString(body, "channel", "user_id");
            if (!broadcasterId) {
              logOutcome({ messageId, outcome: "intentionally_ignored", reason: "no_broadcaster", eventType: interactiveName });
              return jsonResponse({ status: "ignored", reason: "no_broadcaster" });
            }
            const { supabaseAdmin } = await import("@/lib/supabase/client.server");
            const resolved = await findKickConnection(supabaseAdmin, broadcasterId);
            if (resolved.failed) {
              logOutcome({ messageId, outcome: "failed", reason: resolved.reason, eventType: interactiveName });
              return jsonResponse({ status: "failed", reason: resolved.reason }, 503);
            }
            if (!resolved.userId) {
              logOutcome({ messageId, outcome: "intentionally_ignored", reason: "kick_connection_not_found", eventType: interactiveName });
              return jsonResponse({ status: "ignored", reason: "kick_connection_not_found" });
            }
            const { ingestKickInteractiveEvent } = await import("@/lib/interactiveWidgets.server");
            const result = await ingestKickInteractiveEvent({
              userId: resolved.userId,
              eventName: interactiveName,
              messageId: messageId ?? "",
              body,
            });
            rememberKickEvent(messageId);
            logOutcome({ messageId, outcome: "processed", reason: "interactive", eventType: interactiveName });
            return jsonResponse(result);
          }

          if (isKickChatEvent(type, chat)) {
            const { broadcasterId, text, username, senderId, senderUserId, identityBadges } = chat;
            if (isCylixBotChatAuthor(username, senderUserId, process.env["KICK_BOT_PLATFORM_USER_ID"])) {
              rememberKickEvent(messageId);
              logOutcome({ messageId, outcome: "intentionally_ignored", reason: "bot_author", eventType: type });
              return jsonResponse({ status: "ignored", reason: "bot_author" });
            }
            if (!broadcasterId) {
              logOutcome({ messageId, outcome: "intentionally_ignored", reason: "no_broadcaster", eventType: type });
              return jsonResponse({ status: "ignored", reason: "no_broadcaster" });
            }
            const { supabaseAdmin } = await import("@/lib/supabase/client.server");
            const resolved = await findKickConnection(supabaseAdmin, broadcasterId);
            if (resolved.failed) {
              logOutcome({ messageId, outcome: "failed", reason: resolved.reason, eventType: type });
              return jsonResponse({ status: "failed", reason: resolved.reason }, 503);
            }
            if (!resolved.userId) {
              logOutcome({
                messageId,
                outcome: "intentionally_ignored",
                reason: "kick_connection_not_found",
                eventType: type,
              });
              return jsonResponse({ status: "ignored", reason: "kick_connection_not_found" });
            }
            const userId = resolved.userId;

            if (text.trim()) {
              const { publishOverlayChat } = await import("@/lib/overlayChat.server");
              const { viewerLineFromKick } = await import("@/lib/overlayChat");
              const viewerLine = viewerLineFromKick(body, messageId ?? "");
              if (!viewerLine) {
                logOutcome({ messageId, outcome: "failed", reason: "chat_line_unreadable", eventType: type });
                return jsonResponse({ status: "failed", reason: "chat_line_unreadable" }, 503);
              }
              const published = await publishOverlayChat(supabaseAdmin, userId, viewerLine);
              if (!published.ok) {
                logOutcome({ messageId, outcome: "failed", reason: published.reason, eventType: type });
                return jsonResponse({ status: "failed", reason: published.reason }, 503);
              }
            }

            if (username && text.trim()) {
              const { maybeWelcomeChatter } = await import("@/lib/chatTextAlerts.server");
              await maybeWelcomeChatter({
                userId,
                kickBroadcasterUserId: broadcasterId,
                platform: "KICK",
                username,
                platformUserId: senderUserId,
              }).catch((error) => console.error("[kick-webhook] welcome alert failed", error));
            }
            if (username) {
              const { noteRecentChatter } = await import("@/lib/recentChatters");
              noteRecentChatter(userId, username);
            }

            const { deferRequestWork } = await import("@/lib/requestContext.server");
            let catalog: Awaited<ReturnType<typeof loadDirectCommandCatalog>> = null;
            if (!chatTextNeedsHandlers(text) && text.trim()) {
              catalog = await loadDirectCommandCatalog(supabaseAdmin, userId);
            }
            const needsHandlers = await chatLineNeedsCommandModules(text, catalog);

            if (needsHandlers) {
              const { matchMarkCommand } = await import("@/lib/markPoints");
              const markMatch = matchMarkCommand(text);
              if (markMatch) {
                const { handleMarkCommand } = await import("@/lib/markPoints.server");
                deferRequestWork(
                  request,
                  handleMarkCommand({
                    userId,
                    broadcasterUserId: broadcasterId,
                    platform: "KICK",
                    text,
                    sender: { username, platformId: senderId, identityBadges },
                  })
                    .then(() => {
                      rememberKickEvent(messageId);
                      logOutcome({ messageId, outcome: "accepted", reason: markMatch.kind, eventType: type });
                    })
                    .catch((error) => console.error("[kick-webhook] mark command failed", error)),
                );
                return jsonResponse({ status: "accepted", command: markMatch.kind });
              }
            }

            let commandResult: { status: string; reason?: string; command?: string } = {
              status: "ignored",
              reason: text.trim() ? "not_a_command" : "empty_text",
            };
            if (text && needsHandlers) {
              try {
                const { requestPublicOrigin } = await import("@/lib/commandsUrl");
                const origin = requestPublicOrigin(request);
                const { isPointsCommandAttempt } = await import("@/lib/pointsCommand");
                if (isPointsCommandAttempt(text)) {
                  const { handlePointsCommand } = await import("@/lib/pointsCommand.server");
                  commandResult = await handlePointsCommand({
                    userId,
                    broadcasterUserId: broadcasterId,
                    text,
                    sender: username,
                    senderPlatformId: senderUserId,
                    identityBadges,
                  });
                } else if (/^!?(?:shop|store|متجر)$/i.test(text.trim())) {
                  const { handleShopDirectoryCommand } = await import("@/lib/shopDirectory.server");
                  commandResult = await handleShopDirectoryCommand({
                    userId,
                    broadcasterUserId: broadcasterId,
                    text,
                    senderPlatformId: senderUserId,
                    identityBadges,
                  });
                } else if (/^!buy(?:\s|$)/i.test(text.trim())) {
                  const { handleShopBuyCommand } = await import("@/lib/shopBuy.server");
                  commandResult = await handleShopBuyCommand({
                    userId,
                    broadcasterUserId: broadcasterId,
                    platform: "KICK",
                    text,
                    sender: { username },
                    isTest: false,
                  });
                } else if (/^!?(?:wheel|spin|عجلة)$/i.test(text.trim())) {
                  const { handleWheelChatCommand } = await import("@/lib/wheelCommand.server");
                  commandResult = await handleWheelChatCommand({
                    userId,
                    broadcasterUserId: broadcasterId,
                    platform: "KICK",
                    text,
                    sender: { username },
                    isTest: false,
                  });
                } else {
                  const { handleDefaultChatCommand } = await import("@/lib/defaultCommands.server");
                  const defaultResult = await handleDefaultChatCommand({
                    userId,
                    broadcasterUserId: broadcasterId,
                    platform: "KICK",
                    text,
                    sender: { username, identityBadges, senderPlatformId: senderUserId },
                    origin,
                    replyToMessageId: viewerChatMessageId(body),
                  });
                  commandResult = defaultResult;
                  if (defaultResult.status === "ignored" && defaultResult.reason === "no_match") {
                    const { handleCustomChatCommand } = await import("@/lib/customCommands.server");
                    commandResult = await handleCustomChatCommand({
                      userId,
                      broadcasterUserId: broadcasterId,
                      platform: "KICK",
                      text,
                      sender: { username, identityBadges },
                    });
                  }
                }
              } catch (error) {
                console.error("[kick-webhook] chat command failed", error);
                commandResult = { status: "error", reason: "command_threw" };
              }
            }

            deferRequestWork(
              request,
              (async () => {
                const { captureGiveawayEntry, confirmGiveawayPresence } = await import("@/lib/giveaway.server");
                const isTest =
                  (body as { isTest?: unknown }).isTest === true ||
                  (body as { is_test?: unknown }).is_test === true;
                await confirmGiveawayPresence(supabaseAdmin, userId, { username, text, isTest });
                await captureGiveawayEntry(supabaseAdmin, userId, {
                  platform: "KICK",
                  username,
                  text,
                  isSubscriber: identityBadges.some((badge) => /sub|founder|og|vip/i.test(badge)),
                });
              })().catch((error) => console.error("[kick-webhook] giveaway entry failed", error)),
            );

            let media: { ok: boolean; reason?: string } = { ok: false, reason: "no_media_link" };
            if (text && /https?:\/\/|spotify:track:/i.test(text)) {
              const { ingestChatMediaRequest } = await import("@/lib/mediaRequests.server");
              media = await ingestChatMediaRequest({
                userId,
                messageId: pickString(body, "message_id") ?? messageId ?? crypto.randomUUID(),
                username,
                text,
              });
            }

            if (commandResult.status === "error") {
              rememberKickEvent(messageId);
              logOutcome({ messageId, outcome: "failed", reason: commandResult.reason, eventType: type });
              return jsonResponse({ status: "failed", reason: commandResult.reason, command: commandResult });
            }

            rememberKickEvent(messageId);
            const outcome: KickWebhookOutcome =
              commandResult.status === "ignored" && !media.ok ? "intentionally_ignored" : "processed";
            logOutcome({
              messageId,
              outcome: text && chatTextNeedsHandlers(text) ? outcome : "processed",
              reason: commandResult.reason ?? commandResult.status,
              eventType: type,
            });
            return jsonResponse({ ...media, command: commandResult, status: "processed" });
          }

          const eventBody = unwrapKickEvent(body);
          const normalized = normalizeKickEvent(type, messageId ?? "", eventBody);
          if (!normalized) {
            logOutcome({ messageId, outcome: "intentionally_ignored", reason: "unsupported_type", eventType: type || null });
            return jsonResponse({ status: "ignored", reason: "unsupported_type" });
          }

          const broadcasterId =
            pickString(eventBody, "broadcaster", "user_id") ??
            pickString(eventBody, "broadcaster", "channel_id") ??
            pickString(eventBody, "channel_id") ??
            pickString(body, "broadcaster", "user_id") ??
            pickString(body, "broadcaster", "channel_id") ??
            pickString(body, "channel_id");
          if (!broadcasterId) {
            logOutcome({ messageId, outcome: "intentionally_ignored", reason: "no_broadcaster", eventType: type });
            return jsonResponse({ status: "ignored", reason: "no_broadcaster" });
          }

          const { supabaseAdmin } = await import("@/lib/supabase/client.server");
          const { receivePlatformEvent } = await import("@/lib/webhooks/ingest.server");
          const resolved = await findKickConnection(supabaseAdmin, broadcasterId);
          if (resolved.failed) {
            logOutcome({ messageId, outcome: "failed", reason: resolved.reason, eventType: type });
            return jsonResponse({ status: "failed", reason: resolved.reason }, 503);
          }
          if (!resolved.userId) {
            logOutcome({ messageId, outcome: "intentionally_ignored", reason: "kick_connection_not_found", eventType: type });
            return jsonResponse({ status: "ignored", reason: "kick_connection_not_found" });
          }

          const result = await receivePlatformEvent(supabaseAdmin, resolved.userId, normalized);
          const { classifyKickChatAlert } = await import("@/lib/chatTextAlerts");
          const signal = classifyKickChatAlert(type, eventBody);
          if (signal && messageId) {
            const { deliverChatTextAlert } = await import("@/lib/chatTextAlerts.server");
            await deliverChatTextAlert({
              userId: resolved.userId,
              kickBroadcasterUserId: broadcasterId,
              providerEventId: messageId,
              signal,
            }).catch((error) => console.error("[kick-webhook] chat alert failed", error));
          }
          rememberKickEvent(messageId);
          logOutcome({ messageId, outcome: "processed", reason: normalized.eventType, eventType: type });
          return jsonResponse(result);
        } catch (error) {
          console.error("[kick-webhook] unhandled failure", error);
          return jsonResponse({ error: "webhook_failed" }, 500);
        }
      },
    },
  },
});

type DirectCatalog = NonNullable<Awaited<ReturnType<typeof loadDirectCommandCatalog>>>;

/** Names of custom commands whose effective prefix is empty. Cached per isolate. */
async function loadDirectCommandCatalog(
  admin: typeof import("@/lib/supabase/client.server").supabaseAdmin,
  userId: string,
): Promise<{
  defaultPrefix: string;
  commands: Array<{
    id: string;
    name: string;
    prefix: string | null;
    response: string;
    enabled: boolean;
    platforms: Array<"KICK" | "TWITCH">;
    roles: string[];
    cooldownSeconds: number;
    createdAt: string;
    updatedAt: string;
  }>;
} | null> {
  const cached = directCatalogCache.get(userId);
  if (cached && Date.now() - cached.at < CONNECTION_TTL_MS) return cached.catalog;
  const [{ data: settings, error: settingsError }, { data: rows, error: rowsError }] = await Promise.all([
    admin.from("custom_chat_command_settings").select("default_prefix").eq("user_id", userId).maybeSingle(),
    admin
      .from("custom_chat_commands")
      .select("id, name, prefix, enabled, platforms, roles, cooldown_seconds, created_at, updated_at")
      .eq("user_id", userId)
      .eq("enabled", true),
  ]);
  if (settingsError || rowsError) {
    console.warn("[kick-webhook] custom command catalog unavailable");
    return null;
  }
  if (!rows?.length) {
    const empty: DirectCatalog = { defaultPrefix: "!", commands: [] };
    directCatalogCache.set(userId, { catalog: empty, at: Date.now() });
    return empty;
  }
  const { normalizeTriggerMarker, sanitizeCommandName } = await import("@/lib/customCommands");
  const catalog: DirectCatalog = {
    defaultPrefix: normalizeTriggerMarker(settings?.default_prefix ?? "!"),
    commands: (rows ?? []).flatMap((row) => {
      const name = sanitizeCommandName(row.name ?? "");
      if (!name) return [];
      const platforms = (row.platforms ?? []).filter(
        (platform): platform is "KICK" | "TWITCH" => platform === "KICK" || platform === "TWITCH",
      );
      return [
        {
          id: row.id,
          name,
          prefix: row.prefix === null ? null : normalizeTriggerMarker(row.prefix),
          response: "",
          enabled: row.enabled,
          platforms: platforms.length ? platforms : ["KICK"],
          roles: row.roles?.length ? row.roles : ["Everyone"],
          cooldownSeconds: row.cooldown_seconds,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      ];
    }),
  };
  directCatalogCache.set(userId, { catalog, at: Date.now() });
  return catalog;
}

async function findKickConnection(
  admin: typeof import("@/lib/supabase/client.server").supabaseAdmin,
  broadcasterId: string,
): Promise<{ userId: string | null; failed: boolean; reason: string }> {
  const cached = connectionCache.get(broadcasterId);
  if (cached && Date.now() - cached.at < CONNECTION_TTL_MS) {
    return { userId: cached.userId, failed: false, reason: "cache" };
  }
  const { data, error } = await admin
    .from("platform_connections")
    .select("user_id")
    .eq("platform", "KICK")
    .eq("platform_user_id", broadcasterId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) return { userId: null, failed: true, reason: "kick_connection_query_failed" };
  const userId = data?.[0]?.user_id ?? null;
  if (!userId) return { userId: null, failed: false, reason: "kick_connection_not_found" };
  connectionCache.set(broadcasterId, { userId, at: Date.now() });
  return { userId, failed: false, reason: "matched_platform_user_id" };
}
