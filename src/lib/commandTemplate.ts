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

export function profileUrl(platform: CommandPlatform, username: string): string {
  const name = username.trim().replace(/^@+/, "");
  if (!name) return "";
  return platform === "TWITCH" ? `https://twitch.tv/${name}` : `https://kick.com/${name}`;
}

/** Text after the command word. `!so @name extra` → `@name extra`. */
export function commandArgument(message: string): string {
  return message.trim().split(/\s+/).slice(1).join(" ").trim();
}

/** First @mention, otherwise a single bare username argument. */
export function taggedUsername(param: string): string {
  const mention = param.match(/@([A-Za-z0-9_]{2,25})/);
  if (mention?.[1]) return mention[1];
  const bare = param.trim().replace(/^@+/, "").split(/\s+/)[0] ?? "";
  return /^[A-Za-z0-9_]{2,25}$/.test(bare) ? bare : "";
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
      return data.param;
    case "taggeduser.username":
    case "taggeduser":
      return data.taggedUser.username;
    case "taggeduser.followers":
      return data.taggedUser.followers;
    case "taggeduser.followage":
      return data.taggedUser.followage;
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
