import { clipStoragePath, publicClipPageUrl } from "@/lib/clipStorage";
import { chatMention } from "@/lib/commandTemplate";
import { captureKickLiveEdge, createNativeKickClip, fetchKickChannel } from "@/lib/kickClip.server";
import { clipErrorAfterAttempt, clipFailureNotice } from "@/lib/kickClipLive";
import { getKickAccessToken } from "@/lib/platformTokens.server";
import { supabaseAdmin } from "@/lib/supabase/client.server";


export type ClipCommandSettings = {
  enabled: boolean;
  roles: string[];
  defaultLength: number;
  maxLength: number;
  response: string;
};

export const CLIP_DEFAULTS: ClipCommandSettings = {
  enabled: false,
  roles: ["Everyone"],
  defaultLength: 30,
  maxLength: 120,
  response: "@{user} {clip_url}",
};

type ChatSender = {
  username: string;
  platformId: string | null;
  identityBadges: string[];
};

/** Roles the sender holds, derived from Kick chat identity badges. */
function senderRoles(badges: string[]): Set<string> {
  const roles = new Set<string>(["Everyone"]);
  for (const badge of badges) {
    const type = badge.toLowerCase();
    if (type.includes("moderator") || type.includes("broadcaster")) roles.add("Mods");
    if (type.includes("vip")) roles.add("VIPs");
    if (type.includes("sub") || type.includes("founder")) roles.add("Subs");
  }
  return roles;
}

function isAllowed(settings: ClipCommandSettings, badges: string[]): boolean {
  if (settings.roles.includes("Everyone")) return true;
  const held = senderRoles(badges);
  return settings.roles.some((role) => held.has(role));
}

async function kickToken(userId: string): Promise<string | null> {
  return getKickAccessToken(userId, { requireScopes: ["chat:write"] });
}

export const BOT_NAME = "CylixStudio";

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

type CreatedClip = {
  externalId: string | null;
  /** Kick watch page for a native clip. Local captures leave this empty until the short page exists. */
  url: string;
  title: string;
  thumbnail: string | null;
  duration: number;
  /** True when `externalId` is a storage object path and `url` must become the short page. */
  localFile: boolean;
};

function channelKey(slug: string): string {
  return slug.trim().replace(/^@+/, "").toLowerCase();
}

/** Resolves the channel slug stored with the Kick connection. */
async function kickSlug(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("platform_connections")
    .select("username, metadata")
    .eq("user_id", userId)
    .eq("platform", "KICK")
    .eq("is_active", true)
    .maybeSingle();
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>;
  const fromMeta = typeof metadata["slug"] === "string" ? (metadata["slug"] as string) : null;
  return fromMeta ?? data?.username ?? null;
}

async function storeLiveEdge(userId: string, bytes: Uint8Array): Promise<string | null> {
  const folder = userId.trim();
  const file = `edge${crypto.randomUUID().replace(/-/g, "")}.ts`;
  const objectPath = `${folder}/${file}`;
  if (!clipStoragePath(objectPath)) {
    console.warn("[clip-capture] storage path rejected");
    return null;
  }
  const uploaded = await supabaseAdmin.storage.from("clips").upload(objectPath, Buffer.from(bytes), {
    contentType: "video/mp2t",
    upsert: false,
  });
  if (uploaded.error) {
    console.error("[clip-capture] storage upload failed", uploaded.error.message);
    return null;
  }
  return objectPath;
}

/**
 * One channel read, then one Kick clip create. A failure — including 429 —
 * captures the segments already on the live playlist and uploads them.
 * There is no cooldown, no second host, and no wait for a fuller buffer.
 * The offline error is returned only when the channel read and the clip
 * attempt both say the stream is offline and the local capture also fails.
 */
async function createKickClip(
  userId: string,
  duration: number,
): Promise<CreatedClip | { error: string }> {
  const slug = await kickSlug(userId);
  if (!slug) return { error: "kick_channel_unknown" };
  const key = channelKey(slug);

  const token = await kickToken(userId);
  const channel = await fetchKickChannel(key);
  const vodId = channel?.vodId ?? null;
  const livestreamSlug = channel?.livestreamSlug ?? null;
  const liveState = channel?.liveState ?? null;
  const title = channel?.title ?? `Clip from ${key}`;
  const thumbnail = channel?.thumbnail ?? null;

  let nativeError = "clip_api_unavailable";
  if (!token) {
    nativeError = "kick_not_connected";
  } else if (vodId || livestreamSlug) {
    try {
      const native = await createNativeKickClip({
        token,
        slug: channel?.slug ?? key,
        duration,
        livestreamSlug,
        vodId,
      });
      if ("url" in native) {
        return {
          externalId: native.externalId,
          url: native.url,
          title: native.title ?? title,
          thumbnail: native.thumbnail ?? thumbnail,
          duration: native.duration || duration,
          localFile: false,
        };
      }
      nativeError = native.error;
      console.warn("[clip-capture] kick create failed, using live edge", { error: native.error });
    } catch (error) {
      console.error("[clip-command] kick clip create threw", error);
      nativeError = "clip_api_failed";
    }
  }

  const playbackUrl = channel?.playbackUrl ?? null;
  if (playbackUrl) {
    const edge = await captureKickLiveEdge(playbackUrl, duration);
    if (edge) {
      const objectPath = await storeLiveEdge(userId, edge.bytes);
      if (objectPath) {
        return {
          externalId: objectPath,
          url: "",
          title,
          thumbnail,
          duration: edge.duration || duration,
          localFile: true,
        };
      }
    }
  }

  return { error: clipErrorAfterAttempt(liveState, nativeError) };
}

export async function loadClipSettings(userId: string): Promise<ClipCommandSettings> {
  const { data } = await supabaseAdmin
    .from("clip_command_settings")
    .select("enabled, roles, default_length, max_length, response")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return CLIP_DEFAULTS;
  return {
    enabled: data.enabled,
    roles: data.roles?.length ? data.roles : CLIP_DEFAULTS.roles,
    defaultLength: data.default_length,
    maxLength: data.max_length,
    response: data.response,
  };
}

/**
 * Handles a `!clip` chat command coming from the Kick webhook: permission
 * check, duration parsing, clip creation, chat reply and persistence.
 */
export async function handleClipCommand(input: {
  userId: string;
  broadcasterUserId: string;
  text: string;
  sender: ChatSender;
  isTest?: boolean;
}): Promise<{ status: string; reason?: string; clipId?: string | undefined }> {
  const { userId, broadcasterUserId, text, sender } = input;
  if (input.isTest) return { status: "ignored", reason: "test" };
  const trimmed = text.trim();
  if (!/^!clip\b/i.test(trimmed)) return { status: "ignored", reason: "not_clip_command" };

  const settings = await loadClipSettings(userId);
  if (!settings.enabled) return { status: "ignored", reason: "clip_command_disabled" };
  if (!isAllowed(settings, sender.identityBadges)) {
    return { status: "ignored", reason: "not_permitted" };
  }

  const argument = Number(trimmed.split(/\s+/)[1]);
  const duration = Math.min(
    Math.max(Number.isFinite(argument) && argument > 0 ? Math.round(argument) : settings.defaultLength, 5),
    settings.maxLength,
  );

  const created = await createKickClip(userId, duration);
  if ("error" in created) {
    const notice = clipFailureNotice(sender.username, created.error, settings.response || CLIP_DEFAULTS.response);
    await sendKickChatMessage(
      userId,
      broadcasterUserId,
      notice,
    );
    return { status: "error", reason: created.error };
  }

  const { data: row } = await supabaseAdmin
    .from("clips")
    .upsert(
      {
        user_id: userId,
        platform: "KICK" as const,
        external_id: created.externalId,
        title: created.title,
        url: created.localFile ? "https://cylixstudio.com/clip" : created.url,
        thumbnail_url: created.thumbnail,
        duration_seconds: created.duration,
        clipped_by: sender.username,
        clipped_by_platform_id: sender.platformId,
      },
      { onConflict: "user_id,platform,external_id" },
    )
    .select("id")
    .maybeSingle();

  const shareUrl = row?.id ? publicClipPageUrl(row.id) : "";
  if (row?.id && shareUrl) {
    await supabaseAdmin
      .from("clips")
      .update(created.localFile ? { url: shareUrl, share_url: shareUrl } : { share_url: shareUrl })
      .eq("id", row.id);
  }
  if (!shareUrl) {
    await sendKickChatMessage(
      userId,
      broadcasterUserId,
      clipFailureNotice(sender.username, "persist_failed", settings.response || CLIP_DEFAULTS.response),
    );
    return { status: "error", reason: "persist_failed" };
  }

  const reply = (settings.response || CLIP_DEFAULTS.response)
    .replace(/@?\{user\}/gi, () => chatMention(sender.username))
    .replaceAll("{clip_url}", shareUrl);
  await sendKickChatMessage(userId, broadcasterUserId, reply);

  return { status: "created", clipId: row?.id };

}
