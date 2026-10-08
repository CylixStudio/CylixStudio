import { chatMention } from "@/lib/commandTemplate";
import { captureKickClip, createNativeKickClip, fetchKickChannel, refreshKickBuffer } from "@/lib/kickClip.server";
import { clipErrorAfterAttempt, shouldAttemptClip } from "@/lib/kickClipLive";
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
  const { getKickAccessToken } = await import("@/lib/platformTokens.server");
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
    const response = await fetch("https://api.kick.com/public/v1/chat", {
      method: "POST",
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
  url: string;
  title: string;
  thumbnail: string | null;
  duration: number;
};

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

/**
 * Keeps the rolling HLS buffer warm while the channel has chat activity, so a
 * later `!clip 60` can actually cut 60 seconds of the past instead of the ~28s
 * that Kick's live edge exposes.
 */
export async function warmKickClipBuffer(userId: string): Promise<void> {
  const settings = await loadClipSettings(userId);
  if (!settings.enabled) return;
  const slug = await kickSlug(userId);
  if (!slug) return;
  await refreshKickBuffer(userId, slug);
}



/**
 * Creates a Kick clip and returns the public clip page when Kick does.
 * A null livestream, a failed channel read, or an empty official livestream
 * list is not treated as offline. The clip call runs first; HLS capture is
 * only the fallback once a fresh read says the channel is live or unknown.
 */
async function createKickClip(
  userId: string,
  duration: number,
): Promise<CreatedClip | { error: string }> {
  const token = await kickToken(userId);
  if (!token) return { error: "kick_not_connected" };

  const slug = await kickSlug(userId);
  if (!slug) return { error: "kick_channel_unknown" };

  const channel = await fetchKickChannel(slug);
  const liveState = channel?.liveState ?? null;
  // A null livestream or a local is_live false does not skip the clip call.
  if (!shouldAttemptClip(liveState)) return { error: "stream_offline" };

  let native: Awaited<ReturnType<typeof createNativeKickClip>>;
  try {
    native = await createNativeKickClip({
      token,
      slug: channel?.slug ?? slug,
      duration,
      livestreamSlug: channel?.livestreamSlug ?? null,
      vodId: channel?.vodId ?? null,
    });
  } catch (error) {
    console.error("[clip-command] kick clip create threw", error);
    native = { error: "clip_api_failed" };
  }
  if ("url" in native) {
    return {
      externalId: native.externalId,
      url: native.url,
      title: native.title ?? channel?.title ?? `Clip from ${slug}`,
      thumbnail: native.thumbnail ?? channel?.thumbnail ?? null,
      duration: native.duration || duration,
    };
  }

  // Rate limit is not an offline stream. HLS runs after the single backoff,
  // and also after any other non-success clip status that is not an agreed offline.
  const agreedOffline = native.error === "stream_offline" && liveState === false;
  if (!agreedOffline && channel?.playbackUrl) {
    console.log("[clip-command] capturing clip", { slug, duration, liveState, status: native.error });
    try {
      const captured = await captureKickClip(userId, slug, duration);
      if (!("error" in captured)) {
        return {
          externalId: captured.path,
          url: captured.url,
          title: channel.title ?? `Clip from ${slug}`,
          thumbnail: channel.thumbnail,
          duration: captured.seconds || duration,
        };
      }
      if (native.rateLimited) return { error: "clip_api_429" };
      return { error: clipErrorAfterAttempt(liveState, captured.error) };
    } catch (error) {
      console.error("[clip-command] capture threw", error);
      return { error: native.rateLimited ? "clip_api_429" : "capture_failed" };
    }
  }

  if (native.rateLimited) return { error: "clip_api_429" };
  return { error: clipErrorAfterAttempt(liveState, native.error) };
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
}): Promise<{ status: string; reason?: string; clipId?: string | undefined }> {
  const { userId, broadcasterUserId, text, sender } = input;
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
    const notice = created.error === "stream_offline"
      ? `@${sender.username} Stream is offline, no clip could be captured.`
      : `@${sender.username} Clip creation failed (${created.error}). Please try again.`;
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
        url: created.url,
        thumbnail_url: created.thumbnail,
        duration_seconds: created.duration,
        clipped_by: sender.username,
        clipped_by_platform_id: sender.platformId,
      },
      { onConflict: "user_id,platform,external_id" },
    )
    .select("id")
    .maybeSingle();

  // Kick page when Kick returned an id. HLS uses the signed capture URL.
  const shareUrl = created.url;
  if (row?.id) await supabaseAdmin.from("clips").update({ share_url: shareUrl }).eq("id", row.id);

  const reply = (settings.response || CLIP_DEFAULTS.response)
    .replace(/@?\{user\}/gi, () => chatMention(sender.username))
    .replaceAll("{clip_url}", shareUrl);
  await sendKickChatMessage(userId, broadcasterUserId, reply);

  return { status: "created", clipId: row?.id };

}
