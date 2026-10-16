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
import { bindKickReplyTrace, createKickReplyTrace, logKickReplyTrace } from "@/lib/kickReplyTiming";

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
        const trace = createKickReplyTrace(request.headers.get("kick-event-message-id") ?? "none");
        trace.mark("webhook_received");

        return bindKickReplyTrace(trace, async () => {
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
          trace.mark("signature_verified");

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
            if (isCylixBotChatAuthor(username, senderUserId, process.env["KICK_APP_BOT_USER_ID"])) {
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
            trace.mark("channel_resolved");
            const giveawayGate = text.trim()
              ? giveawayTextMightApply(supabaseAdmin, userId, text)
              : Promise.resolve(false);

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

            let catalog: Awaited<ReturnType<typeof loadDirectCommandCatalog>> = null;
            if (!chatTextNeedsHandlers(text) && text.trim()) {
              catalog = await loadDirectCommandCatalog(supabaseAdmin, userId);
            }
            const needsHandlers = await chatLineNeedsCommandModules(text, catalog);
            trace.mark("db_done");

            let commandResult: { status: string; reason?: string; command?: string } = {
              status: "ignored",
              reason: text.trim() ? "not_a_command" : "empty_text",
            };
            const giveawayMatches = await giveawayGate;
            if ((needsHandlers || giveawayMatches) && !messageId) {
              logOutcome({ messageId, outcome: "failed", reason: "missing_event_id", eventType: type });
              return jsonResponse({ status: "failed", reason: "missing_event_id" }, 503);
            }
            if ((needsHandlers || giveawayMatches) && messageId) {
              const { createSupabaseReceiptBoard } = await import("@/lib/kickCommandReceipt.server");
              const {
                claimKickCommandOrPlan,
                decideAppBotIdentity,
                finalizeKickReceiptAfterCommand,
                logKickReceiptStage,
                retryKickReplyDelivery,
                runClaimedKickExecute,
                withKickReceipt,
              } = await import("@/lib/kickCommandReceipt");
              const { deferRequestWork } = await import("@/lib/requestContext.server");
              const board = createSupabaseReceiptBoard();
              const chatMessageId = viewerChatMessageId(body);
              if (needsHandlers && chatMessageId) {
                const outbound = await board.findOutbound(userId, chatMessageId);
                const learned = await board.learnedBotUserId();
                const identity = decideAppBotIdentity({
                  senderUserId,
                  configuredBotUserId: process.env["KICK_APP_BOT_USER_ID"] ?? null,
                  learnedBotUserId: learned,
                  incomingChatMessageId: chatMessageId,
                  outboundChatMessageId: outbound?.kickMessageId ?? null,
                });
                if (identity.ignore) {
                  if (identity.learnSenderId) await board.learnBotUser(identity.learnSenderId, chatMessageId);
                  rememberKickEvent(messageId);
                  logOutcome({ messageId, outcome: "intentionally_ignored", reason: "bot_author", eventType: type });
                  return jsonResponse({ status: "ignored", reason: "bot_author" });
                }
              }
              let markHandled = false;
              const receiptSession = { board, userId, providerEventId: messageId };
              logKickReceiptStage(messageId, "webhook_received", { needsHandlers, giveaway: giveawayMatches });
              try {
                const deliverStored = async (replyText: string) => {
                  const { sendOfficialKickBot } = await import("@/lib/kickChatDeliver");
                  const { getKickAccessToken } = await import("@/lib/platformTokens.server");
                  logKickReceiptStage(messageId, "reply_delivery_started", { retry: true });
                  const result = await sendOfficialKickBot({
                    userId,
                    broadcasterUserId: broadcasterId,
                    content: replyText,
                    loadToken: (id, forceRefresh) =>
                      getKickAccessToken(id, { requireScopes: ["chat:write"], forceRefresh }),
                  });
                  logKickReceiptStage(messageId, "kick_api_response", {
                    ok: result.ok,
                    status: result.status,
                    reason: result.reason,
                    outcome: result.outcome,
                    retry: true,
                  });
                  return result.outcome === "skipped" ? "rejected" : result.outcome;
                };

                const runHandlers = () =>
                  withKickReceipt(receiptSession, async () => {
                    logKickReceiptStage(messageId, "command_execution_started", {});
                    if (needsHandlers) {
                      const { matchMarkCommand } = await import("@/lib/markPoints");
                      const markMatch = matchMarkCommand(text);
                      if (markMatch) {
                        markHandled = true;
                        trace.mark("command_matched");
                        const { handleMarkCommand } = await import("@/lib/markPoints.server");
                        try {
                          commandResult = await handleMarkCommand({
                            userId,
                            broadcasterUserId: broadcasterId,
                            platform: "KICK",
                            text,
                            sender: { username, platformId: senderId, identityBadges },
                          });
                        } catch (error) {
                          console.error("[kick-webhook] mark command failed", error);
                          commandResult = { status: "error", reason: "command_threw" };
                        }
                        trace.mark("command_executed");
                      }
                    }
                    if (text && needsHandlers && !markHandled) {
                      trace.mark("command_matched");
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
                            receiptSession,
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
                          logKickReceiptStage(messageId, "command_matched", { kind: "default_or_custom" });
                          const defaultResult = await handleDefaultChatCommand({
                            userId,
                            broadcasterUserId: broadcasterId,
                            platform: "KICK",
                            text,
                            sender: { username, identityBadges, senderPlatformId: senderUserId },
                            origin,
                            replyToMessageId: viewerChatMessageId(body),
                            receiptSession,
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
                              receiptSession,
                            });
                          }
                        }
                      } catch (error) {
                        console.error("[kick-webhook] chat command failed", error);
                        commandResult = { status: "error", reason: "command_threw" };
                      }
                      trace.mark("command_executed");
                    }

                    if (giveawayMatches) {
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
                    }
                  });

                const plan = await claimKickCommandOrPlan({
                  board,
                  userId,
                  providerEventId: messageId,
                  broadcasterUserId: broadcasterId,
                  now: Date.now(),
                });

                if (plan.action === "busy") {
                  logOutcome({ messageId, outcome: "failed", reason: "receipt_busy", eventType: type });
                  return jsonResponse({ status: "failed", reason: "receipt_busy" }, 503);
                }

                if (plan.action === "ack") {
                  commandResult = { status: "ignored", reason: plan.reason, command: "duplicate" };
                } else if (plan.action === "retry_delivery") {
                  // ACK Kick immediately; finish resend under waitUntil so Kick cannot cancel mid-send.
                  deferRequestWork(
                    request,
                    (async () => {
                      const { delivered } = await retryKickReplyDelivery({
                        board,
                        userId,
                        providerEventId: messageId,
                        now: Date.now(),
                        replyText: plan.replyText,
                        deliverStored,
                      });
                      logKickReceiptStage(messageId, "reply_delivery_finalized", {
                        outcome: delivered ? "sent" : "failed",
                        retry: true,
                        deferred: true,
                      });
                    })(),
                  );
                  rememberKickEvent(messageId);
                  logOutcome({ messageId, outcome: "processed", reason: "retry_delivery_deferred", eventType: type });
                  return jsonResponse({ status: "accepted", reason: "retry_delivery_deferred" });
                } else if (plan.action === "execute" && plan.claimed) {
                  // Production evidence 2026-10-16: Kick canceled the webhook at ~3.8s wall
                  // after claim, leaving receipts at webhook_received with null reply_text.
                  // Claim sync (at-most-once), ACK 200, finish handlers+send via waitUntil.
                  deferRequestWork(
                    request,
                    (async () => {
                      try {
                        await runClaimedKickExecute({
                          board,
                          userId,
                          providerEventId: messageId,
                          now: Date.now(),
                          execute: runHandlers,
                        });
                        if (needsHandlers) {
                          logKickReceiptStage(messageId, "command_execution_completed", {
                            status: commandResult.status,
                            reason: commandResult.reason ?? null,
                            deferred: true,
                          });
                          await finalizeKickReceiptAfterCommand({
                            board,
                            userId,
                            providerEventId: messageId,
                            now: Date.now(),
                            commandStatus: commandResult.status,
                            commandReason: commandResult.reason ?? null,
                          });
                        }
                      } catch (error) {
                        const missing = error instanceof Error && error.message === "kick_command_receipts_missing";
                        console.error(
                          "[kick-webhook] deferred command failed",
                          missing ? "migration_required" : "command_deferred_failed",
                        );
                      }
                    })(),
                  );
                  rememberKickEvent(messageId);
                  logOutcome({ messageId, outcome: "processed", reason: "command_deferred", eventType: type });
                  return jsonResponse({ status: "accepted", reason: "command_deferred" });
                }
              } catch (error) {
                const missing = error instanceof Error && error.message === "kick_command_receipts_missing";
                console.error("[kick-webhook] command receipt failed", missing ? "migration_required" : "receipt_failed");
                logOutcome({
                  messageId,
                  outcome: "failed",
                  reason: missing ? "migration_required" : "receipt_failed",
                  eventType: type,
                });
                return jsonResponse(
                  { status: "failed", reason: missing ? "migration_required" : "receipt_failed" },
                  503,
                );
              }
            }

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
              const sendFailed = commandResult.reason === "send_failed";
              if (!sendFailed) rememberKickEvent(messageId);
              logOutcome({ messageId, outcome: "failed", ...(commandResult.reason ? { reason: commandResult.reason } : {}), eventType: type });
              return jsonResponse(
                { status: "failed", reason: commandResult.reason, command: commandResult },
                sendFailed ? 503 : 500,
              );
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
        } finally {
          logKickReplyTrace(trace);
        }
        });
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

const giveawayGateCache = new Map<string, { keyword: string; open: boolean; at: number }>();

/** Exact giveaway keyword only. Ordinary chat does not import giveaway.server. */
async function giveawayTextMightApply(
  admin: typeof import("@/lib/supabase/client.server").supabaseAdmin,
  userId: string,
  text: string,
): Promise<boolean> {
  const cached = giveawayGateCache.get(userId);
  let keyword = "";
  let open = false;
  if (cached && Date.now() - cached.at < CONNECTION_TTL_MS) {
    keyword = cached.keyword;
    open = cached.open;
  } else {
    const { data, error } = await admin
      .from("giveaway_settings")
      .select("keyword, is_open")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return true;
    keyword = data?.keyword ?? "";
    open = Boolean(data?.is_open);
    giveawayGateCache.set(userId, { keyword, open, at: Date.now() });
  }
  const key = (keyword.trim() || (open ? "+1" : "")).toLowerCase();
  return Boolean(key) && text.trim().toLowerCase() === key;
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
