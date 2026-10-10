import { commandTrigger } from "@/lib/customCommands";
import { supabaseAdmin } from "@/lib/supabase/client.server";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,31})$/;

export type PublicCommand = {
  trigger: string;
  response: string;
};

export type PublicTimer = {
  message: string;
  intervalMinutes: number;
};

export type PublicShopItem = {
  name: string;
  description: string;
  cost: number;
  imageUrl: string | null;
  stock: number | null;
};

export type PublicChannel = {
  userId: string;
  slug: string;
  displayName: string;
  avatarUrl: string;
};

export function normalizePublicSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  return SLUG.test(slug) ? slug : null;
}

export async function publishedSlugForUser(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("link_in_bio_profiles")
    .select("slug")
    .eq("user_id", userId)
    .eq("published", true)
    .maybeSingle();
  const slug = data?.slug?.trim().toLowerCase() ?? "";
  return SLUG.test(slug) ? slug : null;
}

/** Public /commands path: Kick username, then other platforms, then a published link-in-bio slug. */
const COMMANDS_KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const AVATAR_PLATFORM_ORDER = ["KICK", "TWITCH", "YOUTUBE", "TIKTOK", "X"] as const;

const AVATAR_METADATA_KEYS = ["avatar_url", "profile_picture", "profile_pic", "image", "avatar", "thumbnail"] as const;

type ConnectionIdentity = {
  user_id?: string;
  platform: string;
  username: string | null;
  metadata?: unknown;
};

export function normalizeCommandsKey(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  return COMMANDS_KEY.test(key) ? key : null;
}

function platformRank(platform: string): number {
  const index = AVATAR_PLATFORM_ORDER.indexOf(platform as (typeof AVATAR_PLATFORM_ORDER)[number]);
  return index === -1 ? AVATAR_PLATFORM_ORDER.length : index;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function preferredUsername(rows: ConnectionIdentity[]): string {
  const ranked = [...rows].sort((a, b) => platformRank(a.platform) - platformRank(b.platform));
  for (const row of ranked) {
    const username = row.username?.trim();
    if (username) return username;
  }
  return "";
}

function avatarFromRows(rows: ConnectionIdentity[]): string {
  const ranked = [...rows].sort((a, b) => platformRank(a.platform) - platformRank(b.platform));
  for (const row of ranked) {
    const url = avatarFromMetadata(row.metadata);
    if (url) return url;
  }
  return "";
}

async function loadIdentityRows(userId: string): Promise<ConnectionIdentity[]> {
  const { data } = await supabaseAdmin
    .from("platform_connections")
    .select("platform, username, metadata")
    .eq("user_id", userId)
    .eq("is_active", true);
  return data ?? [];
}

/** Username used in https://cylixstudio.com/commands/{username}. */
export async function commandsPublicKeyForUser(userId: string): Promise<string | null> {
  const username = preferredUsername(await loadIdentityRows(userId)).toLowerCase();
  const key = normalizeCommandsKey(username);
  if (key) return key;
  return publishedSlugForUser(userId);
}

async function findUserIdByPlatformUsername(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("platform_connections")
    .select("user_id, platform, username")
    .eq("is_active", true)
    .ilike("username", escapeLike(key));
  const matches = (data ?? []).filter(
    (row) => Boolean(row.user_id) && row.username?.trim().toLowerCase() === key,
  );
  matches.sort((a, b) => platformRank(a.platform) - platformRank(b.platform));
  return matches[0]?.user_id ?? null;
}

/** Resolve /commands/{key} by connected platform username, then a published link-in-bio slug. */
export async function loadCommandsChannel(raw: string): Promise<PublicChannel | null> {
  const key = normalizeCommandsKey(raw);
  if (!key) return null;

  const byUsername = await findUserIdByPlatformUsername(key);
  const published = byUsername ? null : await loadPublishedChannel(key);
  const userId = byUsername ?? published?.userId ?? null;
  if (!userId) return null;

  const [rows, profileResult] = await Promise.all([
    loadIdentityRows(userId),
    supabaseAdmin
      .from("link_in_bio_profiles")
      .select("slug, display_name, avatar_url")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const profile = profileResult.data;
  const username = preferredUsername(rows);
  const profileAvatar = typeof profile?.avatar_url === "string" ? profile.avatar_url.trim() : "";
  const displayName = username || profile?.display_name?.trim() || published?.displayName || profile?.slug || key;
  const avatarUrl = avatarFromRows(rows) || profileAvatar || published?.avatarUrl || "";
  const publicKey = normalizeCommandsKey(username.toLowerCase()) || published?.slug || profile?.slug || key;
  return { userId, slug: publicKey, displayName, avatarUrl };
}

export async function loadPublishedChannel(slug: string): Promise<PublicChannel | null> {
  const normalized = normalizePublicSlug(slug);
  if (!normalized) return null;
  const { data } = await supabaseAdmin
    .from("link_in_bio_profiles")
    .select("user_id, slug, display_name, avatar_url")
    .eq("slug", normalized)
    .eq("published", true)
    .maybeSingle();
  if (!data?.user_id) return null;
  const displayName = data.display_name?.trim() || data.slug;
  const profileAvatar = typeof data.avatar_url === "string" ? data.avatar_url : "";
  const avatarUrl = (await loadConnectedAvatar(data.user_id)) || profileAvatar;
  return { userId: data.user_id, slug: data.slug, displayName, avatarUrl };
}

function avatarFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const record = metadata as Record<string, unknown>;
  for (const key of AVATAR_METADATA_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** Profile picture from an active Kick (then other) connection. Never logs metadata. */
async function loadConnectedAvatar(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("platform_connections")
    .select("platform, metadata")
    .eq("user_id", userId)
    .eq("is_active", true);
  const rows = data ?? [];
  for (const platform of AVATAR_PLATFORM_ORDER) {
    const match = rows.find((row) => row.platform === platform);
    const url = avatarFromMetadata(match?.metadata);
    if (url) return url;
  }
  for (const row of rows) {
    const url = avatarFromMetadata(row.metadata);
    if (url) return url;
  }
  return "";
}

export async function listPublicCommands(userId: string): Promise<PublicCommand[]> {
  const [{ data: settings }, { data: rows }] = await Promise.all([
    supabaseAdmin
      .from("custom_chat_command_settings")
      .select("default_prefix")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("custom_chat_commands")
      .select("name, prefix, response")
      .eq("user_id", userId)
      .eq("enabled", true)
      .order("name", { ascending: true }),
  ]);
  const defaultPrefix = settings?.default_prefix ?? "!";
  const commands: PublicCommand[] = [];
  for (const row of rows ?? []) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const response = typeof row.response === "string" ? row.response : "";
    if (!name || !response.trim()) continue;
    commands.push({
      trigger: commandTrigger(
        { name, prefix: row.prefix === null ? null : row.prefix },
        defaultPrefix,
      ),
      response,
    });
  }
  return commands;
}

export async function listPublicTimers(userId: string): Promise<PublicTimer[]> {
  const { data } = await supabaseAdmin
    .from("message_timers")
    .select("message, interval_minutes, enabled")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  const timers: PublicTimer[] = [];
  for (const row of data ?? []) {
    const message = typeof row.message === "string" ? row.message.trim() : "";
    if (!message) continue;
    timers.push({ message, intervalMinutes: row.interval_minutes });
  }
  return timers;
}

export async function listPublicShop(userId: string): Promise<PublicShopItem[]> {
  const { data } = await supabaseAdmin
    .from("loyalty_shop_items")
    .select("name, description, cost, image_url, stock, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  return (data ?? [])
    .filter((row) => row.is_active && row.name.trim())
    .map((row) => ({
      name: row.name,
      description: row.description ?? "",
      cost: row.cost,
      imageUrl: row.image_url?.trim() ? row.image_url : null,
      stock: row.stock,
    }));
}
