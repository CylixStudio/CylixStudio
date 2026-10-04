export type CommandPlatform = "KICK" | "TWITCH";

export type CommandTemplateData = {
  command: string;
  platform: CommandPlatform;
  sender: {
    username: string;
    followers: string;
    url: string;
    followage: string;
  };
  streamer: {
    username: string;
    followers: string;
    url: string;
  };
  param: string;
  taggedUser: {
    username: string;
    followers: string;
    followage: string;
  };
  stream: {
    title: string;
    category: string;
    viewers: string;
  };
  /** Default-command tokens `{target}` `{list}` `{followage}`. */
  target: string;
  list: string;
  followage: string;
};

export function blankCommandTemplate(
  partial: Partial<CommandTemplateData> & Pick<CommandTemplateData, "command">,
): CommandTemplateData {
  const senderName = (partial.sender?.username ?? "").trim().replace(/^@+/, "");
  const streamerName = (partial.streamer?.username ?? "").trim().replace(/^@+/, "");
  const taggedName = (partial.taggedUser?.username ?? "").trim().replace(/^@+/, "");
  const platform = partial.platform ?? "KICK";
  return {
    command: partial.command,
    platform,
    sender: {
      username: senderName,
      followers: partial.sender?.followers ?? "",
      url: partial.sender?.url || profileUrl(platform, senderName),
      followage: partial.sender?.followage ?? partial.followage ?? "",
    },
    streamer: {
      username: streamerName,
      followers: partial.streamer?.followers ?? "",
      url: partial.streamer?.url || profileUrl(platform, streamerName),
    },
    param: partial.param ?? "",
    taggedUser: {
      username: taggedName,
      followers: partial.taggedUser?.followers ?? "",
      followage: partial.taggedUser?.followage ?? "",
    },
    stream: {
      title: partial.stream?.title ?? "",
      category: partial.stream?.category ?? "",
      viewers: partial.stream?.viewers ?? "",
    },
    target: partial.target ?? "",
    list: partial.list ?? "",
    followage: partial.followage ?? partial.sender?.followage ?? "",
  };
}

export type ParsedChannel = {
  followers: string;
  title: string;
  category: string;
  viewers: string;
  live: boolean;
};

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

function categoryName(source: Record<string, unknown> | null): string {
  if (!source) return "";
  const direct = textField(source, "category", "game_name", "game");
  if (direct && !asRecord(source["category"])) return direct;
  const nested =
    asRecord(source["category"]) ??
    asRecord(source["game"]) ??
    (Array.isArray(source["categories"]) ? asRecord(source["categories"][0]) : null);
  return textField(nested, "name", "category", "slug") || textField(source, "category_name");
}

/** Kick v2 channel object, or the official `{ data: [...] }` channel list. */
export function parseChannelPayload(payload: unknown): ParsedChannel | null {
  const root = asRecord(payload);
  if (!root) return null;
  const rows = Array.isArray(root["data"]) ? root["data"] : null;
  const record = rows ? asRecord(rows[0]) : root;
  if (!record) return null;
  const user = asRecord(record["user"]);
  const live = asRecord(record["livestream"]) ?? asRecord(record["stream"]);
  const followers = numField(record, "followers_count", "followersCount", "follower_count") ?? numField(user, "followers_count", "followersCount", "follower_count");
  const viewers = numField(live, "viewer_count", "viewers", "viewerCount");
  const liveFlag = live?.["is_live"] === true || record["is_live"] === true || (viewers !== null && viewers > 0);
  return {
    followers: followers === null ? "" : String(followers),
    title: liveFlag ? textField(live, "session_title", "title") : "",
    category: liveFlag ? categoryName(live) : "",
    viewers: liveFlag && viewers !== null ? String(viewers) : "",
    live: liveFlag,
  };
}

/** `{{request(...).value}}` body: JSON `.value`, a JSON primitive, or plain text. */
export function parseRequestPayload(text: string): string {
  const sliced = text.slice(0, 8000);
  let value = "";
  try {
    const json = JSON.parse(sliced) as unknown;
    if (json && typeof json === "object" && "value" in json) {
      const inner = (json as { value: unknown }).value;
      value = inner == null ? "" : typeof inner === "string" ? inner : JSON.stringify(inner);
    } else if (typeof json === "string" || typeof json === "number" || typeof json === "boolean") {
      value = String(json);
    }
  } catch {
    value = sliced;
  }
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Literal https URLs only. Blocks loopback, private, and link-local hosts. */
export function publicRequestUrl(raw: string): URL | null {
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

export function profileUrl(platform: CommandPlatform, username: string): string {
  const name = username.trim().replace(/^@+/, "");
  if (!name) return "";
  return platform === "TWITCH" ? `https://twitch.tv/${name}` : `https://kick.com/${name}`;
}

/** Text after the command word. `!so @name extra` → `@name extra`. */
export function commandArgument(message: string): string {
  return message.trim().split(/\s+/).slice(1).join(" ").trim();
}

/** First @mention, otherwise the whole argument when it is only a username. */
export function taggedUsername(param: string): string {
  const mention = param.match(/@([A-Za-z0-9_]{2,25})/);
  if (mention?.[1]) return mention[1];
  const parts = param.trim().replace(/^@+/, "").split(/\s+/).filter(Boolean);
  if (parts.length !== 1) return "";
  return /^[A-Za-z0-9_]{2,25}$/.test(parts[0] ?? "") ? parts[0] ?? "" : "";
}

function pickRandomItem(body: string): string {
  const items: string[] = [];
  const quoted = /"([^"]*)"|'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = quoted.exec(body))) {
    items.push(match[1] ?? match[2] ?? "");
  }
  if (!items.length) return "";
  return items[Math.floor(Math.random() * items.length)] ?? "";
}

function pickRandomRange(minRaw: string, maxRaw: string): string {
  let min = Number(minRaw);
  let max = Number(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  min = Math.max(-1_000_000, Math.min(1_000_000, Math.trunc(min)));
  max = Math.max(-1_000_000, Math.min(1_000_000, Math.trunc(max)));
  if (min > max) [min, max] = [max, min];
  return String(min + Math.floor(Math.random() * (max - min + 1)));
}

function fieldValue(data: CommandTemplateData, path: string): string {
  switch (path.toLowerCase()) {
    case "sender.username":
    case "sender":
    case "user":
      return data.sender.username;
    case "sender.followers":
      return data.sender.followers;
    case "sender.followage":
    case "followage":
      return data.sender.followage || data.followage;
    case "sender.url":
      return data.sender.url;
    case "streamer.username":
    case "streamer":
      return data.streamer.username;
    case "streamer.followers":
      return data.streamer.followers;
    case "streamer.url":
      return data.streamer.url;
    case "param":
      return data.param || data.sender.username;
    case "taggeduser.username":
    case "taggeduser":
      return data.taggedUser.username || data.sender.username;
    case "taggeduser.followers":
      return data.taggedUser.username ? data.taggedUser.followers : data.sender.followers;
    case "taggeduser.followage":
      return data.taggedUser.username
        ? data.taggedUser.followage
        : data.sender.followage || data.followage;
    case "stream.title":
      return data.stream.title;
    case "stream.category":
      return data.stream.category;
    case "stream.viewers":
      return data.stream.viewers;
    case "command":
      return data.command;
    case "target":
      return data.target;
    case "list":
      return data.list;
    default:
      return "";
  }
}

/**
 * Replaces every supported command token. Unknown or empty context becomes
 * an empty string so the chat line never keeps `{{...}}`.
 * `requests` maps a literal https URL to the already fetched `.value`.
 */
export function renderCommandTemplate(
  template: string,
  data: CommandTemplateData,
  requests: ReadonlyMap<string, string> = new Map(),
): string {
  let text = template.normalize("NFC");

  text = text.replace(
    /\{\{\s*request\(\s*(["'])(https:\/\/[^"']+)\1\s*\)\.value\s*\}\}/gi,
    (_match, _quote: string, url: string) => requests.get(url) ?? "",
  );

  text = text.replace(
    /\{\{\s*randomRange\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)\s*\}\}/gi,
    (_match, min: string, max: string) => pickRandomRange(min, max),
  );

  text = text.replace(/\{\{\s*randomItem\(\s*([\s\S]*?)\s*\)\s*\}\}/gi, (_match, body: string) =>
    pickRandomItem(body),
  );

  text = text.replace(/\{\{\s*([a-zA-Z][\w.]*)\s*\}\}|\{\s*([a-zA-Z][\w.]*)\s*\}/g, (_match, dotted: string | undefined, plain: string | undefined) =>
    fieldValue(data, dotted ?? plain ?? ""),
  );

  text = text.replace(/\{\{[^{}]{0,200}\}\}/g, "");
  return text.trim().slice(0, 480);
}
