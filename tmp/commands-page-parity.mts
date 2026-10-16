// Read-only parity of the old 3-wave channel load and the Kick fast path.
// Prints counts and durations only. Does not print command text or secrets.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

import { commandTrigger } from "../src/lib/customCommands.ts";
import { channelFromUsernameMatches } from "../src/lib/publicChannelMatch.ts";

const ORDER = ["KICK", "TWITCH", "YOUTUBE", "TIKTOK", "X"];
const AVATAR_KEYS = ["avatar_url", "profile_picture", "profile_pic", "image", "avatar", "thumbnail"];
const KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,31})$/;

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, index).trim()] = value;
  }
  return env;
}

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
  for (const row of ranked) {
    const username = row.username?.trim();
    if (username) return username;
  }
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

function commandsFor(userId, settingsRows, commandRows) {
  const settings = settingsRows.find((row) => row.user_id === userId);
  const defaultPrefix = settings?.default_prefix ?? "!";
  const commands = [];
  for (const row of commandRows) {
    if (row.user_id !== userId) continue;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const response = typeof row.response === "string" ? row.response : "";
    if (!name || !response.trim()) continue;
    commands.push({
      trigger: commandTrigger({ name, prefix: row.prefix === null ? null : row.prefix }, defaultPrefix),
      response,
    });
  }
  return commands;
}

function timersFor(userId, timerRows) {
  return timerRows
    .filter((row) => row.user_id === userId && typeof row.message === "string" && row.message.trim())
    .map((row) => ({ message: row.message.trim(), intervalMinutes: row.interval_minutes }));
}

function oldChannel(key, connections, profiles) {
  const matches = connections
    .filter((row) => row.is_active && row.user_id && row.username?.trim().toLowerCase() === key)
    .sort((a, b) => rank(a.platform) - rank(b.platform));
  const byUsername = matches[0]?.user_id ?? null;
  const published = byUsername
    ? null
    : profiles.find((row) => row.published && row.slug?.trim().toLowerCase() === key && SLUG.test(key)) ?? null;
  const userId = byUsername ?? published?.user_id ?? null;
  if (!userId) return null;
  const rows = connections.filter((row) => row.user_id === userId && row.is_active);
  const profile = profiles.find((row) => row.user_id === userId) ?? null;
  const username = preferredUsername(rows);
  const profileAvatar = typeof profile?.avatar_url === "string" ? profile.avatar_url.trim() : "";
  const publishedAvatar = typeof published?.avatar_url === "string" ? published.avatar_url.trim() : "";
  const displayName = username || profile?.display_name?.trim() || published?.display_name?.trim() || profile?.slug || key;
  const avatarUrl = avatarFromRows(rows) || profileAvatar || publishedAvatar || "";
  const publicKey = (KEY.test(username.toLowerCase()) ? username.toLowerCase() : "") || published?.slug || profile?.slug || key;
  return { userId, slug: publicKey, displayName, avatarUrl };
}

function newChannel(key, connections, profiles) {
  const matches = connections
    .filter((row) => row.is_active && row.user_id && row.username?.trim().toLowerCase() === key)
    .sort((a, b) => rank(a.platform) - rank(b.platform));
  const direct = channelFromUsernameMatches(key, matches);
  if (direct) return direct;
  return oldChannel(key, connections, profiles);
}

function pageFor(channel, settingsRows, commandRows, timerRows) {
  if (!channel) return null;
  return {
    slug: channel.slug,
    displayName: channel.displayName,
    avatarUrl: channel.avatarUrl,
    commands: commandsFor(channel.userId, settingsRows, commandRows),
    timers: timersFor(channel.userId, timerRows),
  };
}

function samePage(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const env = loadEnv("E:/Store/Cylix/CylixStudio/.env");
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) {
  console.log(JSON.stringify({ error: "missing supabase env" }));
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function allRows(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const [connections, profiles, settingsRows, commandRows, timerRows] = await Promise.all([
  allRows("platform_connections", "user_id, platform, username, metadata, is_active"),
  allRows("link_in_bio_profiles", "user_id, slug, display_name, avatar_url, published"),
  allRows("custom_chat_command_settings", "user_id, default_prefix"),
  allRows("custom_chat_commands", "user_id, name, prefix, response, enabled"),
  allRows("message_timers", "user_id, message, interval_minutes, enabled"),
]);
const enabledCommands = commandRows.filter((row) => row.enabled);
const enabledTimers = timerRows.filter((row) => row.enabled);

const keys = new Set();
for (const row of connections) {
  if (!row.is_active) continue;
  const key = row.username?.trim().toLowerCase() ?? "";
  if (KEY.test(key)) keys.add(key);
}
for (const row of profiles) {
  if (!row.published) continue;
  const key = row.slug?.trim().toLowerCase() ?? "";
  if (SLUG.test(key)) keys.add(key);
}

const categories = {
  multiPlatform: 0,
  kickNameAndAvatar: 0,
  missingAvatarOrName: 0,
  bioChangesPage: 0,
  noCommands: 0,
  manyCommands: 0,
  hasTimers: 0,
  publishedSlugOnly: 0,
};
const mismatches = [];
let compared = 0;
for (const key of keys) {
  const before = pageFor(oldChannel(key, connections, profiles), settingsRows, enabledCommands, enabledTimers);
  const after = pageFor(newChannel(key, connections, profiles), settingsRows, enabledCommands, enabledTimers);
  compared += 1;
  if (!samePage(before, after)) {
    const fields = ["slug", "displayName", "avatarUrl", "commands", "timers"].filter(
      (field) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]),
    );
    mismatches.push({ key, fields, beforeFound: Boolean(before), afterFound: Boolean(after) });
    continue;
  }
  if (!before) continue;
  const userRows = connections.filter((row) => row.user_id === before.userId && row.is_active);
  const platforms = new Set(userRows.map((row) => row.platform));
  if (platforms.size > 1) categories.multiPlatform += 1;
  const kick = userRows.find((row) => row.platform === "KICK");
  if (kick?.username?.trim() && avatarFrom(kick.metadata)) categories.kickNameAndAvatar += 1;
  if (!kick?.username?.trim() || !avatarFrom(kick?.metadata)) categories.missingAvatarOrName += 1;
  const profile = profiles.find((row) => row.user_id === before.userId);
  const bioName = profile?.display_name?.trim() ?? "";
  const bioAvatar = typeof profile?.avatar_url === "string" ? profile.avatar_url.trim() : "";
  if ((bioName && bioName !== before.displayName) || (bioAvatar && bioAvatar !== before.avatarUrl)) {
    if (before.displayName === bioName || before.avatarUrl === bioAvatar) categories.bioChangesPage += 1;
  }
  if (before.commands.length === 0) categories.noCommands += 1;
  if (before.commands.length >= 20) categories.manyCommands += 1;
  if (before.timers.length > 0) categories.hasTimers += 1;
  if (!userRows.some((row) => row.username?.trim().toLowerCase() === key)) categories.publishedSlugOnly += 1;
}

const fixtureConnections = [
  { user_id: "bio-user", platform: "KICK", username: "bioname", metadata: {}, is_active: true },
  { user_id: "bio-user", platform: "TWITCH", username: "othername", metadata: { profile_picture: "https://example.com/twitch.png" }, is_active: true },
];
const fixtureProfiles = [
  { user_id: "bio-user", slug: "bioname", display_name: "Custom Bio", avatar_url: "https://example.com/bio.png", published: true },
];
const fixtureBefore = oldChannel("bioname", fixtureConnections, fixtureProfiles);
const fixtureAfter = newChannel("bioname", fixtureConnections, fixtureProfiles);
const kickFullBefore = oldChannel("creovixstudio", [
  { user_id: "k", platform: "KICK", username: "creovixstudio", metadata: { profile_picture: "https://example.com/kick.png" }, is_active: true },
  { user_id: "k", platform: "TWITCH", username: "creovixstudio", metadata: { profile_picture: "https://example.com/twitch.png" }, is_active: true },
], [{ user_id: "k", slug: "bio", display_name: "Different", avatar_url: "https://example.com/bio.png", published: true }]);
const kickFullAfter = newChannel("creovixstudio", [
  { user_id: "k", platform: "KICK", username: "creovixstudio", metadata: { profile_picture: "https://example.com/kick.png" }, is_active: true },
  { user_id: "k", platform: "TWITCH", username: "creovixstudio", metadata: { profile_picture: "https://example.com/twitch.png" }, is_active: true },
], [{ user_id: "k", slug: "bio", display_name: "Different", avatar_url: "https://example.com/bio.png", published: true }]);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

async function timed(run) {
  const started = performance.now();
  const result = await run();
  return { ms: Math.round((performance.now() - started) * 10) / 10, result };
}

async function liveOld() {
  const find = await timed(() =>
    db.from("platform_connections").select("user_id, platform, username").eq("is_active", true).ilike("username", "creovixstudio"),
  );
  const matches = (find.result.data ?? []).filter((row) => row.username?.trim().toLowerCase() === "creovixstudio");
  matches.sort((a, b) => rank(a.platform) - rank(b.platform));
  const userId = matches[0]?.user_id;
  const second = await timed(() =>
    Promise.all([
      db.from("platform_connections").select("platform, username, metadata").eq("user_id", userId).eq("is_active", true),
      db.from("link_in_bio_profiles").select("slug, display_name, avatar_url").eq("user_id", userId).maybeSingle(),
    ]),
  );
  const third = await timed(() =>
    Promise.all([
      db.from("custom_chat_command_settings").select("default_prefix").eq("user_id", userId).maybeSingle(),
      db.from("custom_chat_commands").select("name, prefix, response").eq("user_id", userId).eq("enabled", true).order("name"),
      db.from("message_timers").select("message, interval_minutes").eq("user_id", userId).eq("enabled", true).order("created_at"),
    ]),
  );
  return {
    total: Math.round((find.ms + second.ms + third.ms) * 10) / 10,
    queries: 6,
    commandCount: (third.result[1].data ?? []).filter((row) => row.name?.trim() && row.response?.trim()).length,
  };
}

async function liveNew() {
  const find = await timed(() =>
    db.from("platform_connections").select("user_id, platform, username, metadata").eq("is_active", true).ilike("username", "creovixstudio"),
  );
  const matches = (find.result.data ?? []).filter((row) => row.username?.trim().toLowerCase() === "creovixstudio");
  const direct = channelFromUsernameMatches("creovixstudio", matches);
  let extra = 0;
  let userId = direct?.userId ?? null;
  if (!direct) {
    const second = await timed(() =>
      Promise.all([
        db.from("platform_connections").select("platform, username, metadata").eq("user_id", matches[0].user_id).eq("is_active", true),
        db.from("link_in_bio_profiles").select("slug, display_name, avatar_url").eq("user_id", matches[0].user_id).maybeSingle(),
      ]),
    );
    extra = second.ms;
    userId = matches[0]?.user_id ?? null;
  }
  const third = await timed(() =>
    Promise.all([
      db.from("custom_chat_command_settings").select("default_prefix").eq("user_id", userId).maybeSingle(),
      db.from("custom_chat_commands").select("name, prefix, response").eq("user_id", userId).eq("enabled", true).order("name"),
      db.from("message_timers").select("message, interval_minutes").eq("user_id", userId).eq("enabled", true).order("created_at"),
    ]),
  );
  return {
    total: Math.round((find.ms + extra + third.ms) * 10) / 10,
    skippedSecondRead: Boolean(direct),
    queries: direct ? 4 : 6,
    commandCount: (third.result[1].data ?? []).filter((row) => row.name?.trim() && row.response?.trim()).length,
  };
}

const oldTimes = [];
const newTimes = [];
let skipped = 0;
let commandCount = null;
for (let i = 0; i < 8; i += 1) {
  const before = await liveOld();
  const after = await liveNew();
  oldTimes.push(before.total);
  newTimes.push(after.total);
  if (after.skippedSecondRead) skipped += 1;
  commandCount = after.commandCount;
}
const missing = newChannel("no-such-channel-wave-c", connections, profiles);

console.log(JSON.stringify({
  compared,
  mismatches: mismatches.length,
  mismatchFields: mismatches.slice(0, 5),
  categories,
  fixtures: {
    bioKeepsFullRead: samePage(fixtureBefore, fixtureAfter) && fixtureBefore?.avatarUrl === "https://example.com/twitch.png" && fixtureBefore?.displayName === "bioname",
    kickAvatarIgnoresDifferentBio: samePage(kickFullBefore, kickFullAfter) && kickFullAfter?.avatarUrl === "https://example.com/kick.png" && kickFullAfter?.displayName === "creovixstudio",
    missingChannel: missing === null,
  },
  live: {
    before: oldTimes,
    after: newTimes,
    beforeMedian: median(oldTimes),
    afterMedian: median(newTimes),
    skippedSecondRead: skipped,
    commandCount,
  },
}, null, 2));
