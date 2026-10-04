import { chatMention } from "@/lib/commandTemplate";
import { captureKickClip, fetchKickChannel, refreshKickBuffer } from "@/lib/kickClip.server";
import { publicSiteUrl } from "@/lib/siteUrl.server";
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
): Promise<boolean> {
  const token = await kickToken(userId);
  if (!token) {
    console.warn("[chat-bot] kick send skipped — no access token", { userId, broadcasterUserId });
    return false;
  }
  const body = content.normalize("NFC").trim().slice(0, 480);
  if (!body) return false;
  const broadcasterId = Number(broadcasterUserId);

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
    const bot = await post({ type: "bot", content: body });
    if (bot.response.ok) {
      console.log("[chat-bot] kick chat response sent", { broadcasterId, mode: "bot", chars: [...body].length });
      return true;
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

/** Base URL used for the public, playable clip page linked in chat. */
function siteOrigin(): string {
  return publicSiteUrl();
}


/** Checks Kick's livestream endpoint; null when the state can't be determined. */
async function isChannelLive(token: string, broadcasterId: number): Promise<boolean | null> {
  try {
    const url = new URL("https://api.kick.com/public/v1/users/livestreams");
    if (Number.isSafeInteger(broadcasterId)) url.searchParams.append("user_id", String(broadcasterId));
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn("[clip-command] livestream check failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json().catch(() => ({}))) as { data?: unknown };
    const list = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
    console.log("[clip-command] livestream check", { broadcasterId, live: list.length > 0 });
    return list.length > 0;
  } catch (error) {
    console.error("[clip-command] livestream check error", error);
    return null;
  }
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
 * Kick's public developer API exposes no clip-creation endpoint, so the clip
 * is captured from the channel's public HLS live edge and stored by us.
 */
async function createKickClip(
  userId: string,
  broadcasterUserId: string,
  duration: number,
): Promise<CreatedClip | { error: string }> {
  const token = await kickToken(userId);
  if (!token) return { error: "kick_not_connected" };
  const broadcasterId = Number(broadcasterUserId);

  const live = await isChannelLive(token, broadcasterId);
  if (live === false) {
    console.warn("[clip-command] skipping clip creation, channel offline", { broadcasterId });
    return { error: "stream_offline" };
  }

  const slug = await kickSlug(userId);
  if (!slug) return { error: "kick_channel_unknown" };

  const channel = await fetchKickChannel(slug);
  if (!channel?.playbackUrl) return { error: "stream_offline" };
  if (live === null && !channel.isLive) return { error: "stream_offline" };

  console.log("[clip-command] capturing clip", { slug, duration });
  const captured = await captureKickClip(userId, slug, duration);

  if ("error" in captured) return captured;

  return {
    externalId: captured.path,
    url: captured.url,
    title: channel.title ?? `Clip from ${slug}`,
    thumbnail: channel.thumbnail,
    duration: captured.seconds || duration,
  };
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

  const created = await createKickClip(userId, broadcasterUserId, duration);
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

  // Chat gets a playable page link, not the raw MPEG-TS storage file.
  const shareUrl = row?.id ? `${siteOrigin()}/clip/${row.id}` : created.url;
  if (row?.id) await supabaseAdmin.from("clips").update({ share_url: shareUrl }).eq("id", row.id);

  const reply = (settings.response || CLIP_DEFAULTS.response)
    .replace(/@?\{user\}/gi, () => chatMention(sender.username))
    .replaceAll("{clip_url}", shareUrl);
  await sendKickChatMessage(userId, broadcasterUserId, reply);

  return { status: "created", clipId: row?.id };

}
