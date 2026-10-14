/**
 * Kick badge artwork resolver.
 *
 * Official `chat.message.sent` badges are `{ type, text, count }` only
 * (https://docs.kick.com/events/event-types). Image URLs are used when that
 * payload, or a channel badge list already on the same JSON, includes them.
 * There is no official public badge catalog: `GET /public/v1/channels` requires
 * auth and its schema has no badge images. This module does not call Kick.
 */

export type KickBadgeRecord = {
  type: string;
  text?: string | null;
  count?: number | null;
  imageUrl?: string | null;
};

export type KickSubscriberTier = {
  months: number;
  url: string;
};

export type KickBadgeCatalog = {
  /** Per-channel subscriber artwork. Keyed by months, never by badge type. */
  subscriberTiers: KickSubscriberTier[];
  /** Global badge type -> image URL. Subscriber tiers are not stored here. */
  global: Record<string, string>;
};

export type KickBadgeResolver = (badge: KickBadgeRecord) => string | null;

/** Local SVG files the owner placed in `src/assets/Kick Badges`. */
export type KickBadgeAssets = {
  broadcaster: string;
  founder: string;
  moderator: string;
  og: string;
  staff: string;
  subGifter: string;
  subGifter25: string;
  subGifter50: string;
  subGifter100: string;
  subGifter200: string;
  subscriber: string;
  verified: string;
  vip: string;
};

export type KickBadgeResolveOptions = {
  assets?: KickBadgeAssets | null;
  /**
   * Owner opt-in for Kick's stock subscriber.svg.
   * Missing or false keeps the previous behavior: no stock subscriber image.
   */
  useDefaultSubscriberBadge?: boolean;
};

/**
 * Kick identity types seen in the web client or docs that have no file in this folder.
 * Sidekick is in Kick's own badge map. The documented chat webhook sample does not include it.
 */
export const KICK_BADGE_TYPES_WITHOUT_FILE = [
  "sidekick",
  "bot",
  "host",
  "trainwreckstv",
  "editor",
  "admin",
  "global_moderator",
] as const;

const SUBSCRIBER_TYPES = new Set(["subscriber", "sub"]);
const GIFTER_TYPES = new Set(["sub_gifter", "subgifter"]);

export const EMPTY_KICK_BADGE_CATALOG: KickBadgeCatalog = {
  subscriberTiers: [],
  global: {},
};

export function httpsBadgeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://") || /\s/.test(trimmed)) return null;
  return trimmed.slice(0, 500);
}

function srcsetUrl(value: string): string | null {
  let best: { url: string; density: number } | null = null;
  for (const part of value.split(",")) {
    const bits = part.trim().split(/\s+/);
    const url = httpsBadgeUrl(bits[0]);
    if (!url) continue;
    const descriptor = bits[1] ?? "1x";
    const density = descriptor.endsWith("x") ? Number(descriptor.slice(0, -1)) : 1;
    const score = Number.isFinite(density) ? density : 1;
    if (!best || score > best.density) best = { url, density: score };
  }
  return best?.url ?? null;
}

function readUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return httpsBadgeUrl(value) ?? (value.includes(" ") || value.includes(",") ? srcsetUrl(value) : null);
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const src = httpsBadgeUrl(record["src"]);
  if (src) return src;
  if (typeof record["srcset"] === "string") {
    const fromSet = srcsetUrl(record["srcset"]);
    if (fromSet) return fromSet;
  }
  for (const key of ["url", "original"]) {
    const nested = httpsBadgeUrl(record[key]);
    if (nested) return nested;
  }
  return null;
}

/** Artwork URL from a Kick badge object, including `badge_image.src` / `srcset`. */
export function badgeAssetUrl(raw: Record<string, unknown>): string | null {
  for (const key of [
    "active_asset_url",
    "badge_image_url",
    "image_url",
    "image",
    "src",
    "asset_url",
    "badge_image",
    "imageUrl",
  ]) {
    const url = readUrl(raw[key]);
    if (url) return url;
  }
  return null;
}

function badgeType(value: string): string {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "subgifter") return "sub_gifter";
  if (key === "mod") return "moderator";
  return key;
}

/** True only when the owner explicitly opts in. Existing saved widgets stay off. */
export function readKickDefaultSubscriberBadge(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  return (config as Record<string, unknown>)["kickDefaultSubscriberBadge"] === true;
}

function gifterFile(count: number | null | undefined, assets: KickBadgeAssets): string {
  const gifted = typeof count === "number" && Number.isFinite(count) ? count : 0;
  if (gifted >= 200) return assets.subGifter200;
  if (gifted >= 100) return assets.subGifter100;
  if (gifted >= 50) return assets.subGifter50;
  if (gifted >= 25) return assets.subGifter25;
  return assets.subGifter;
}

function localBadgeFile(type: string, badge: KickBadgeRecord, assets: KickBadgeAssets | null | undefined): string | null {
  if (!assets) return null;
  if (GIFTER_TYPES.has(type)) return gifterFile(badge.count, assets);
  const file: Record<string, string | undefined> = {
    broadcaster: assets.broadcaster,
    founder: assets.founder,
    moderator: assets.moderator,
    og: assets.og,
    staff: assets.staff,
    verified: assets.verified,
    vip: assets.vip,
  };
  const url = file[type];
  return typeof url === "string" && url.length > 0 ? url : null;
}

export function parseKickBadges(raw: unknown): KickBadgeRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: KickBadgeRecord[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const type = item.trim();
      if (type) out.push({ type });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const type = String(record["type"] ?? record["text"] ?? "").trim();
    const text = typeof record["text"] === "string" ? record["text"] : null;
    const countRaw = record["count"] ?? record["months"];
    const count =
      typeof countRaw === "number" && Number.isFinite(countRaw) ? Math.max(0, Math.round(countRaw)) : null;
    const imageUrl = badgeAssetUrl(record);
    if (!type && !imageUrl) continue;
    const badge: KickBadgeRecord = { type: type.slice(0, 40) };
    if (text) badge.text = text.slice(0, 40);
    if (count != null) badge.count = count;
    if (imageUrl) badge.imageUrl = imageUrl;
    out.push(badge);
  }
  return out.slice(0, 12);
}

export function parseSubscriberTiers(raw: unknown): KickSubscriberTier[] {
  if (!Array.isArray(raw)) return [];
  const tiers: KickSubscriberTier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const monthsRaw = Number(record["months"] ?? record["count"]);
    const url = badgeAssetUrl(record);
    if (!url || !Number.isFinite(monthsRaw)) continue;
    tiers.push({ months: Math.max(0, Math.round(monthsRaw)), url });
  }
  tiers.sort((a, b) => a.months - b.months);
  return tiers.slice(0, 24);
}

/**
 * Highest tier whose months are less than or equal to the subscriber duration.
 * A missing count is not a duration, so it does not select an image.
 */
export function subscriberTierUrl(
  tiers: readonly KickSubscriberTier[],
  months: number | null | undefined,
): string | null {
  if (tiers.length === 0 || typeof months !== "number" || !Number.isFinite(months)) return null;
  const sorted = [...tiers].sort((a, b) => a.months - b.months);
  let chosen: KickSubscriberTier | null = null;
  for (const tier of sorted) {
    if (tier.months <= months) chosen = tier;
    else break;
  }
  return chosen?.url ?? null;
}

/** Existing public image bucket. Subscriber badges are stored under the owner's folder. */
export const SUBSCRIBER_BADGE_BUCKET = "link-in-bio";
export const SUBSCRIBER_BADGE_MAX_BYTES = 512 * 1024;
const SUBSCRIBER_BADGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function subscriberBadgeFileError(file: { type: string; size: number }): string | null {
  const type = file.type.toLowerCase() === "image/jpg" ? "image/jpeg" : file.type.toLowerCase();
  if (!SUBSCRIBER_BADGE_MIME.has(type)) return "Use a PNG, JPEG, or WebP file.";
  if (file.size < 24 || file.size > SUBSCRIBER_BADGE_MAX_BYTES) return "Image must be under 512 KB.";
  return null;
}

/** Accepts only an image this app stored for this channel. Other hosts are ignored. */
export function ownerSubscriberTier(months: number, imageUrl: string): KickSubscriberTier | null {
  if (!Number.isInteger(months) || months < 1 || months > 120) return null;
  const url = httpsBadgeUrl(imageUrl);
  if (!url) return null;
  if (!url.includes(`/storage/v1/object/public/${SUBSCRIBER_BADGE_BUCKET}/`)) return null;
  if (!url.includes("/kick-subscriber-badges/")) return null;
  return { months, url };
}

/** Tiers saved on this chat widget. Another channel's config is never read. */
export function readOwnerSubscriberTiers(config: unknown): KickSubscriberTier[] {
  const source =
    config && typeof config === "object" ? (config as Record<string, unknown>)["kickSubscriberBadges"] : null;
  if (!Array.isArray(source)) return [];
  const tiers: KickSubscriberTier[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const months = typeof record["months"] === "number" ? record["months"] : Number.NaN;
    const imageUrl = typeof record["imageUrl"] === "string" ? record["imageUrl"] : "";
    const tier = ownerSubscriberTier(months, imageUrl);
    if (tier) tiers.push(tier);
  }
  tiers.sort((a, b) => a.months - b.months);
  return tiers.slice(0, 24);
}

function addGlobal(global: Record<string, string>, raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const record = raw as Record<string, unknown>;
  const type = badgeType(String(record["type"] ?? ""));
  if (!type || SUBSCRIBER_TYPES.has(type)) return;
  const url = badgeAssetUrl(record);
  if (url) global[type] = url;
}

export function catalogFromPayload(payload: unknown): KickBadgeCatalog {
  const piles: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) piles.push(value as Record<string, unknown>);
  };
  visit(payload);
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    visit(record["data"]);
    visit(record["payload"]);
  }
  const global: Record<string, string> = {};
  let subscriberTiers: KickSubscriberTier[] = [];
  for (const pile of piles) {
    const tiers = parseSubscriberTiers(pile["subscriber_badges"]);
    if (tiers.length > 0) subscriberTiers = tiers;
    const roleBadges = pile["role_badges"];
    if (Array.isArray(roleBadges)) {
      for (const badge of roleBadges) addGlobal(global, badge);
    }
  }
  return { subscriberTiers, global };
}

/**
 * Subscriber months use only this channel's uploaded tiers.
 * A gifter count never selects a subscriber image.
 * Stock subscriber.svg is used only when the owner opted in and saved no custom tiers.
 */
export function resolveKickBadgeImage(
  badge: KickBadgeRecord,
  catalog: KickBadgeCatalog,
  options?: KickBadgeResolveOptions,
): string | null {
  const type = badgeType(badge.type);
  if (SUBSCRIBER_TYPES.has(type)) {
    const tier = subscriberTierUrl(catalog.subscriberTiers, badge.count);
    if (tier) return tier;
    const direct = httpsBadgeUrl(badge.imageUrl);
    if (direct) return direct;
    const customChannel = catalog.subscriberTiers.length > 0;
    if (!customChannel && options?.useDefaultSubscriberBadge === true) {
      const stock = options.assets?.subscriber;
      return stock || null;
    }
    return null;
  }
  const direct = httpsBadgeUrl(badge.imageUrl);
  if (direct) return direct;
  const local = localBadgeFile(type, badge, options?.assets);
  if (local) return local;
  if (!type) return null;
  return httpsBadgeUrl(catalog.global[type]);
}

export function kickBadgeDisplayUrl(
  badge: KickBadgeRecord,
  catalog: KickBadgeCatalog = EMPTY_KICK_BADGE_CATALOG,
  options?: KickBadgeResolveOptions,
): string | null {
  try {
    return resolveKickBadgeImage(badge, catalog, options);
  } catch {
    return null;
  }
}

export type KickBadgeCatalogLoader = {
  load: (slug: string) => Promise<KickBadgeCatalog>;
};

const CATALOG_SUCCESS_TTL_MS = 10 * 60 * 1000;
const CATALOG_FAILURE_TTL_MS = 15 * 60 * 1000;

type CachedCatalog = { catalog: KickBadgeCatalog; expires: number };

/**
 * Optional catalog cache. Chat webhooks must not call this.
 * A failed load stays empty until the TTL, so a blocked source is not retried per message.
 */
export function createKickBadgeCatalogCache(
  fetchCatalog: (slug: string) => Promise<unknown>,
  now: () => number = Date.now,
): KickBadgeCatalogLoader {
  const cache = new Map<string, CachedCatalog>();
  const inflight = new Map<string, Promise<KickBadgeCatalog>>();

  return {
    async load(slug: string): Promise<KickBadgeCatalog> {
      const key = slug.trim().toLowerCase();
      const cached = cache.get(key);
      if (cached && cached.expires > now()) return cached.catalog;
      const pending = inflight.get(key);
      if (pending) return pending;
      const request = (async () => {
        try {
          const body = await fetchCatalog(key);
          const catalog = catalogFromPayload(body);
          cache.set(key, { catalog, expires: now() + CATALOG_SUCCESS_TTL_MS });
          return catalog;
        } catch {
          cache.set(key, { catalog: EMPTY_KICK_BADGE_CATALOG, expires: now() + CATALOG_FAILURE_TTL_MS });
          return EMPTY_KICK_BADGE_CATALOG;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, request);
      return request;
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** `sender.identity.badges` from a chat.message.sent body, including wrapped copies. */
export function readKickMessageBadges(body: unknown): KickBadgeRecord[] {
  const root = asRecord(body);
  if (!root) return [];
  const sources = [root, asRecord(root["data"]), asRecord(root["payload"]), asRecord(root["event"])].filter(
    (source): source is Record<string, unknown> => source != null,
  );
  for (const source of sources) {
    const sender = asRecord(source["sender"]) ?? asRecord(source["chatter"]);
    const identity = asRecord(sender?.["identity"]);
    const badges = parseKickBadges(identity?.["badges"]);
    if (badges.length > 0) return badges;
  }
  return [];
}

/** Attaches tier artwork when the same payload already lists `subscriber_badges`. */
export function badgesWithPayloadArt(body: unknown): KickBadgeRecord[] {
  try {
    const catalog = catalogFromPayload(body);
    return readKickMessageBadges(body).map((badge) => {
      const imageUrl = badge.imageUrl ?? resolveKickBadgeImage(badge, catalog);
      if (!imageUrl || imageUrl === badge.imageUrl) return badge;
      return { ...badge, imageUrl };
    });
  } catch {
    return readKickMessageBadges(body);
  }
}
