import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { commandTrigger } from "../src/lib/customCommands.ts";
import { channelFromUsernameMatches } from "../src/lib/publicChannelMatch.ts";

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[trimmed.slice(0, index).trim()] = value;
  }
  return env;
}
const env = loadEnv("E:/Store/Cylix/CylixStudio/.env");
const db = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const KEY = "creovixstudio";
const ORDER = ["KICK", "TWITCH", "YOUTUBE", "TIKTOK", "X"];
const AVATAR_KEYS = ["avatar_url", "profile_picture", "profile_pic", "image", "avatar", "thumbnail"];
function rank(platform) {
  const index = ORDER.indexOf(platform);
  return index === -1 ? ORDER.length : index;
}
function avatarFrom(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  for (const key of AVATAR_KEYS) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
function preferredUsername(rows) {
  const ranked = [...rows].sort((a, b) => rank(a.platform) - rank(b.platform));
  for (const row of ranked) if (row.username?.trim()) return row.username.trim();
  return "";
}
function avatarFromRows(rows) {
  const ranked = [...rows].sort((a, b) => rank(a.platform) - rank(b.platform));
  for (const row of ranked) {
    const url = avatarFrom(row.metadata);
    if (url) return url;
  }
  return "";
}

const found = await db.from("platform_connections").select("user_id, platform, username, metadata").eq("is_active", true).ilike("username", KEY);
const matches = (found.data ?? []).filter((row) => row.username?.trim().toLowerCase() === KEY);
matches.sort((a, b) => rank(a.platform) - rank(b.platform));
const userId = matches[0]?.user_id;
const [identity, profile, settings, commands, timers] = await Promise.all([
  db.from("platform_connections").select("platform, username, metadata").eq("user_id", userId).eq("is_active", true),
  db.from("link_in_bio_profiles").select("slug, display_name, avatar_url").eq("user_id", userId).maybeSingle(),
  db.from("custom_chat_command_settings").select("default_prefix").eq("user_id", userId).maybeSingle(),
  db.from("custom_chat_commands").select("name, prefix, response").eq("user_id", userId).eq("enabled", true).order("name"),
  db.from("message_timers").select("message, interval_minutes").eq("user_id", userId).eq("enabled", true).order("created_at"),
]);
const rows = identity.data ?? [];
const username = preferredUsername(rows);
const profileAvatar = typeof profile.data?.avatar_url === "string" ? profile.data.avatar_url.trim() : "";
const oldPage = {
  slug: username.toLowerCase(),
  displayName: username || profile.data?.display_name?.trim() || KEY,
  avatarUrl: avatarFromRows(rows) || profileAvatar,
};
const direct = channelFromUsernameMatches(KEY, matches);
const prefix = settings.data?.default_prefix ?? "!";
const commandList = (commands.data ?? [])
  .filter((row) => row.name?.trim() && row.response?.trim())
  .map((row) => ({
    trigger: commandTrigger({ name: row.name.trim(), prefix: row.prefix === null ? null : row.prefix }, prefix),
    response: row.response,
  }));
const timerList = (timers.data ?? [])
  .filter((row) => row.message?.trim())
  .map((row) => ({ message: row.message.trim(), intervalMinutes: row.interval_minutes }));
const newPage = direct
  ? { slug: direct.slug, displayName: direct.displayName, avatarUrl: direct.avatarUrl }
  : oldPage;
const sameIdentity = JSON.stringify(oldPage) === JSON.stringify(newPage);
console.log(JSON.stringify({
  platforms: rows.map((row) => row.platform),
  kickHasAvatar: Boolean(avatarFrom(matches.find((row) => row.platform === "KICK")?.metadata)),
  sameIdentity,
  slugEqual: oldPage.slug === newPage.slug,
  nameEqual: oldPage.displayName === newPage.displayName,
  avatarEqual: oldPage.avatarUrl === newPage.avatarUrl,
  commandCount: commandList.length,
  timerCount: timerList.length,
  uniqueTriggers: new Set(commandList.map((row) => row.trigger)).size,
  skippedSecondRead: Boolean(direct),
  privateInCommands: commandList.some((row) => /service_role|access_token|refresh_token/.test(row.response)),
}, null, 2));
