import {
  blankCommandTemplate,
  commandArgument,
  profileUrl,
  renderCommandTemplate,
  taggedUsername,
  type CommandTemplateData,
} from "@/lib/commandTemplate";
import type { ChatCommandPlatform } from "@/lib/customCommands";
import { formatFollowDuration } from "@/lib/defaultCommands";
import { readOAuthEnv } from "@/lib/oauth.server";
import { supabaseAdmin } from "@/lib/supabase/client.server";

const ARABIC_LETTER = /[\u0600-\u06FF]/;

function wants(template: string, token: string): boolean {
  return template.toLowerCase().includes(token.toLowerCase());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function numField(source: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function textField(source: Record<string, unknown> | null, ...keys: string[]): string {
  if (!source) return "";
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function readJson(url: string, headers?: HeadersInit): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

type ChannelLive = {
  followers: string;
  title: string;
  category: string;
  viewers: string;
};

async function kickChannel(slug: string): Promise<ChannelLive | null> {
  const name = slug.trim().replace(/^@+/, "");
  if (!name) return null;
  const payload = await readJson(`https://kick.com/api/v2/channels/${encodeURIComponent(name)}`);
  const record = asRecord(payload);
  if (!record) return null;
  const live = asRecord(record["livestream"]);
  const categories = Array.isArray(live?.["categories"]) ? live["categories"] : [];
  const category = asRecord(categories[0]);
  const followers = numField(record, "followers_count", "followersCount", "follower_count");
  const viewers = numField(live, "viewer_count", "viewers");
  return {
    followers: followers === null ? "" : String(followers),
    title: textField(live, "session_title", "title"),
    category: textField(category, "name", "category") || textField(live, "category"),
    viewers: viewers === null ? "" : String(viewers),
  };
}

async function kickFollowage(channel: string, viewer: string, arabic: boolean): Promise<string> {
  const slug = channel.trim().replace(/^@+/, "");
  const name = viewer.trim().replace(/^@+/, "");
  if (!slug || !name) return "";
  const payload = await readJson(
    `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/users/${encodeURIComponent(name)}`,
  );
  const record = asRecord(payload);
  const raw = textField(record, "following_since", "followed_at", "follower_since");
  if (!raw) return "";
  const started = Date.parse(raw);
  if (!Number.isFinite(started)) return "";
  return formatFollowDuration(Date.now() - started, arabic);
}

async function twitchHelix(
  path: string,
  token: string,
  clientId: string,
): Promise<Record<string, unknown> | null> {
  const payload = await readJson(`https://api.twitch.tv/helix/${path}`, {
    Authorization: `Bearer ${token}`,
    "Client-Id": clientId,
  });
  const data = asRecord(payload)?.["data"];
  return Array.isArray(data) ? asRecord(data[0]) : null;
}

async function twitchChannel(
  login: string,
  token: string,
  clientId: string,
): Promise<(ChannelLive & { userId: string }) | null> {
  const user = await twitchHelix(`users?login=${encodeURIComponent(login)}`, token, clientId);
  const userId = textField(user, "id");
  if (!userId) return null;
  const [followersPayload, stream] = await Promise.all([
    readJson(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(userId)}`, {
      Authorization: `Bearer ${token}`,
      "Client-Id": clientId,
    }),
    twitchHelix(`streams?user_id=${encodeURIComponent(userId)}`, token, clientId),
  ]);
  const total = numField(asRecord(followersPayload), "total");
  const viewers = numField(stream, "viewer_count");
  return {
    userId,
    followers: total === null ? "" : String(total),
    title: textField(stream, "title"),
    category: textField(stream, "game_name"),
    viewers: viewers === null ? "" : String(viewers),
  };
}

function isPublicHttps(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "metadata.google.internal"
  ) {
    return null;
  }
  if (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(
      host,
    )
  ) {
    return null;
  }
  return url;
}

async function requestValue(rawUrl: string): Promise<string> {
  const url = isPublicHttps(rawUrl);
  if (!url) return "";
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(2500),
      headers: { accept: "application/json, text/plain" },
    });
    if (response.status >= 300 && response.status < 400) return "";
    if (!response.ok) return "";
    const text = (await response.text()).slice(0, 8000);
    let value = "";
    try {
      const json = JSON.parse(text) as unknown;
      if (json && typeof json === "object" && "value" in json) {
        const inner = (json as { value: unknown }).value;
        value = inner == null ? "" : typeof inner === "string" ? inner : JSON.stringify(inner);
      } else if (typeof json === "string" || typeof json === "number") {
        value = String(json);
      }
    } catch {
      value = text;
    }
    return value.replace(/\s+/g, " ").trim().slice(0, 120);
  } catch {
    return "";
  }
}

function collectRequestUrls(template: string): string[] {
  const urls: string[] = [];
  const pattern = /\{\{\s*request\(\s*(["'])(https:\/\/[^"']+)\1\s*\)\.value\s*\}\}/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template))) {
    if (match[2]) urls.push(match[2]);
  }
  return urls;
}

export async function resolveCommandTemplate(input: {
  template: string;
  message: string;
  command: string;
  platform: ChatCommandPlatform;
  userId: string;
  senderUsername: string;
  target?: string;
  list?: string;
  followage?: string;
}): Promise<string> {
  const template = input.template.normalize("NFC");
  const param = commandArgument(input.message);
  const tagged = taggedUsername(param);
  const senderName = input.senderUsername.trim().replace(/^@+/, "");
  const arabic = ARABIC_LETTER.test(template);

  const { data: connection } = await supabaseAdmin
    .from("platform_connections")
    .select("username")
    .eq("user_id", input.userId)
    .eq("platform", input.platform)
    .eq("is_active", true)
    .maybeSingle();
  const streamerName = connection?.username?.trim().replace(/^@+/, "") ?? "";

  const data: CommandTemplateData = blankCommandTemplate({
    command: input.command,
    platform: input.platform,
    param,
    target: input.target ?? "",
    list: input.list ?? "",
    followage: input.followage ?? "",
    sender: {
      username: senderName,
      followers: "",
      url: profileUrl(input.platform, senderName),
      followage: input.followage ?? "",
    },
    streamer: {
      username: streamerName,
      followers: "",
      url: profileUrl(input.platform, streamerName),
    },
    taggedUser: {
      username: tagged,
      followers: "",
      followage: "",
    },
  });

  const needSenderFollowers = wants(template, "sender.followers");
  const needTaggedFollowers = wants(template, "taggedUser.followers") && Boolean(tagged);
  const needStreamerFollowers = wants(template, "streamer.followers");
  const needStream = wants(template, "stream.");
  const needSenderFollowage = wants(template, "sender.followage") || wants(template, "{followage}");
  const needTaggedFollowage = wants(template, "taggedUser.followage") && Boolean(tagged);

  if (input.platform === "KICK") {
    const lookups: Promise<void>[] = [];
    if ((needStreamerFollowers || needStream) && streamerName) {
      lookups.push(
        kickChannel(streamerName).then((channel) => {
          if (!channel) return;
          data.streamer.followers = channel.followers;
          data.stream = {
            title: channel.title,
            category: channel.category,
            viewers: channel.viewers,
          };
        }),
      );
    }
    if (needSenderFollowers && senderName) {
      lookups.push(
        kickChannel(senderName).then((channel) => {
          if (channel) data.sender.followers = channel.followers;
        }),
      );
    }
    if (needTaggedFollowers) {
      lookups.push(
        kickChannel(tagged).then((channel) => {
          if (channel) data.taggedUser.followers = channel.followers;
        }),
      );
    }
    if (needSenderFollowage && !data.sender.followage && streamerName && senderName) {
      lookups.push(
        kickFollowage(streamerName, senderName, arabic).then((value) => {
          data.sender.followage = value;
          data.followage = value;
        }),
      );
    }
    if (needTaggedFollowage && streamerName) {
      lookups.push(
        kickFollowage(streamerName, tagged, arabic).then((value) => {
          data.taggedUser.followage = value;
        }),
      );
    }
    await Promise.all(lookups);
  } else if (input.platform === "TWITCH" && (needStreamerFollowers || needStream || needSenderFollowers)) {
    const { getTwitchAccessToken } = await import("@/lib/platformTokens.server");
    const token = await getTwitchAccessToken(input.userId);
    const clientId = readOAuthEnv("TWITCH_CLIENT_ID");
    if (token && clientId && streamerName) {
      const channel = await twitchChannel(streamerName, token, clientId);
      if (channel) {
        data.streamer.followers = channel.followers;
        data.stream = {
          title: channel.title,
          category: channel.category,
          viewers: channel.viewers,
        };
        if (senderName && senderName.toLowerCase() === streamerName.toLowerCase()) {
          data.sender.followers = channel.followers;
        }
        if (tagged && tagged.toLowerCase() === streamerName.toLowerCase()) {
          data.taggedUser.followers = channel.followers;
        }
      }
    }
  }

  const requests = new Map<string, string>();
  await Promise.all(
    collectRequestUrls(template).map(async (url) => {
      requests.set(url, await requestValue(url));
    }),
  );

  return renderCommandTemplate(template, data, requests);
}
