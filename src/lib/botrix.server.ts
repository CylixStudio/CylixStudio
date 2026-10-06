import {
  normalizeBotRixPlatform,
  normalizeBotRixStreamerName,
  type BotRixCommand,
  type BotRixLeaderRow,
  type BotRixLookupResult,
  type BotRixSection,
  type BotRixShopItem,
} from "@/lib/botrix";

const ORIGIN = "https://botrix.live";
const HOST = "botrix.live";
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 2;
const MAX_BODY_CHARS = 1_000_000;

const PATHS = {
  commands: "/api/public/commands",
  shop: "/api/public/shop/items",
  leaderboard: "/api/public/leaderboard",
} as const;

function isBotrixUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.hostname === HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
}

function publicUrl(pathname: string, params: Record<string, string>): URL {
  const url = new URL(pathname, ORIGIN);
  if (url.origin !== ORIGIN || url.pathname !== pathname) {
    throw new Error("botrix_url");
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const keys = Object.keys(params);
  const actual = [...url.searchParams.keys()];
  if (actual.length !== keys.length || keys.some((key) => actual.filter((item) => item === key).length !== 1)) {
    throw new Error("botrix_url");
  }
  if (!isBotrixUrl(url)) throw new Error("botrix_url");
  return url;
}

async function readPublicJson(url: URL): Promise<unknown> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isBotrixUrl(current)) throw new Error("botrix_redirect");

    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal,
      headers: { accept: "application/json" },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) throw new Error("botrix_redirect");
      const next = new URL(location, current);
      if (!isBotrixUrl(next)) throw new Error("botrix_redirect");
      current = next;
      continue;
    }

    if (response.status === 0) throw new Error("botrix_redirect");
    if (response.status !== 200) throw new Error("botrix_http");

    let finalUrl: URL;
    try {
      finalUrl = new URL(response.url);
    } catch {
      throw new Error("botrix_redirect");
    }
    if (!isBotrixUrl(finalUrl)) throw new Error("botrix_redirect");

    const body = await response.text();
    if (body.length > MAX_BODY_CHARS) throw new Error("botrix_http");
    const trimmed = body.trim();
    if (!trimmed) return [];
    return JSON.parse(trimmed) as unknown;
  }

  throw new Error("botrix_redirect");
}

function sectionError(err: unknown): BotRixSection<never> {
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") return { ok: false, error: "timeout" };
  return { ok: false, error: "unavailable" };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function httpsImage(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function rejectErrorPayload(payload: unknown): boolean {
  const record = asRecord(payload);
  return Boolean(record && "error" in record);
}

function parseCommands(payload: unknown): BotRixSection<BotRixCommand> {
  if (rejectErrorPayload(payload)) return { ok: false, error: "unavailable" };
  if (!Array.isArray(payload)) return { ok: false, error: "unavailable" };
  const items: BotRixCommand[] = [];
  for (const row of payload) {
    const record = asRecord(row);
    if (!record) continue;
    const cmd = text(record["cmd"], 80);
    if (!cmd) continue;
    const mods = record["mods"];
    items.push({
      cmd,
      message: text(record["msg"], 500),
      mods: mods === true || (typeof mods === "number" && mods !== 0),
    });
    if (items.length >= 100) break;
  }
  return { ok: true, items };
}

function parseShop(payload: unknown): BotRixSection<BotRixShopItem> {
  if (rejectErrorPayload(payload)) return { ok: false, error: "unavailable" };
  if (!Array.isArray(payload)) return { ok: false, error: "unavailable" };
  const items: BotRixShopItem[] = [];
  for (const row of payload) {
    const record = asRecord(row);
    if (!record) continue;
    const name = text(record["name"], 80);
    if (!name) continue;
    items.push({
      name,
      description: text(record["description"], 400),
      price: finiteNumber(record["price"]),
      image: httpsImage(record["image"]),
    });
    if (items.length >= 100) break;
  }
  return { ok: true, items };
}

function parseLeaderboard(payload: unknown): BotRixSection<BotRixLeaderRow> {
  if (rejectErrorPayload(payload)) return { ok: false, error: "unavailable" };
  if (!Array.isArray(payload)) return { ok: false, error: "unavailable" };
  const items: BotRixLeaderRow[] = [];
  for (const row of payload) {
    const record = asRecord(row);
    if (!record) continue;
    const name = text(record["name"], 80);
    if (!name) continue;
    items.push({
      name,
      level: finiteNumber(record["level"]),
      points: finiteNumber(record["points"]),
      xp: finiteNumber(record["xp"]),
      watchtime: finiteNumber(record["watchtime"]),
    });
    if (items.length >= 100) break;
  }
  return { ok: true, items };
}

async function loadSection<T>(url: URL, parse: (payload: unknown) => BotRixSection<T>): Promise<BotRixSection<T>> {
  try {
    const payload = await readPublicJson(url);
    return parse(payload);
  } catch (err) {
    if (err instanceof SyntaxError) return { ok: false, error: "unavailable" };
    return sectionError(err);
  }
}

export async function lookupBotRixPublicData(input: {
  streamerName: string;
  platform: string;
}): Promise<BotRixLookupResult> {
  const streamerName = normalizeBotRixStreamerName(input.streamerName);
  if (!streamerName) return { ok: false, error: "invalid_name" };
  const platform = normalizeBotRixPlatform(input.platform);
  if (!platform) return { ok: false, error: "invalid_platform" };

  const commandsUrl = publicUrl(PATHS.commands, { user: streamerName, platform });
  const shopUrl = publicUrl(PATHS.shop, { u: streamerName, platform });
  const leaderboardUrl = publicUrl(PATHS.leaderboard, { platform, user: streamerName });

  const [commands, shop, leaderboard] = await Promise.all([
    loadSection(commandsUrl, parseCommands),
    loadSection(shopUrl, parseShop),
    loadSection(leaderboardUrl, parseLeaderboard),
  ]);

  return { ok: true, streamerName, platform, commands, shop, leaderboard };
}
