/**
 * Managed-channel workspace context.
 *
 * A signed HttpOnly cookie names the channel owner. It is honored only while a
 * `channel_access_grants` row still exists for the signed-in member and includes
 * the `workspace` permission. Callers never supply a trusted user id.
 *
 * Surfaces that follow the switched owner id:
 * - `/_authenticated` route context `workspaceOwnerId`
 * - Home dashboard read of that owner's profile, connection names, and subathons
 *   (`useGrantedWorkspace`)
 *
 * Surfaces that stay on the signed-in account:
 * - Settings, including ConnectionsPanel
 * - Subscription, widget list, widget creation, and server functions that scope
 *   by the session user (`auth.uid()` / `requireSupabaseAuth` userId)
 * - Streamlabs and StreamElements bridges
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { deleteCookie, getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server";

import type { GrantedWorkspace, ManagedChannel, ManagedChannelMenu } from "@/lib/managedChannels";
import { linkSecret } from "@/lib/oauth.server";

const COOKIE = "cylix_workspace";
const TTL_SECONDS = 60 * 60 * 12;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GrantRow = {
  owner_user_id: string;
  role: string;
  permissions: string[] | null;
};

function isUuid(value: string): boolean {
  return UUID.test(value);
}

function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("does not exist") ||
    error?.code === "42P01" ||
    error?.code === "PGRST205"
  );
}

function cookieOptions(maxAge: number) {
  let secure = false;
  try {
    secure = getRequestUrl().protocol === "https:";
  } catch {
    secure = false;
  }
  return { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge, secure };
}

function signWorkspaceCookie(memberId: string, ownerId: string): string {
  const exp = Date.now() + TTL_SECONDS * 1000;
  const payload = `v1.${memberId}.${ownerId}.${exp}`;
  const mac = createHmac("sha256", linkSecret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function readSignedOwner(memberId: string): string | null {
  const raw = getCookie(COOKIE);
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 5) return null;
  const [version, member, owner, expRaw, mac] = parts;
  if (version !== "v1" || member !== memberId || !owner || !isUuid(owner) || !mac) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  let expected = "";
  try {
    expected = createHmac("sha256", linkSecret())
      .update(`v1.${member}.${owner}.${expRaw}`)
      .digest("base64url");
  } catch {
    return null;
  }
  const actual = Buffer.from(mac);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  return owner;
}

function clearWorkspaceCookie() {
  deleteCookie(COOKIE, cookieOptions(0));
}

function canOpenWorkspace(role: string, permissions: string[] | null): role is "moderator" | "granted" {
  return (role === "moderator" || role === "granted") && (permissions ?? []).includes("workspace");
}

async function admin() {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  return supabaseAdmin;
}

async function grantsForMember(memberId: string): Promise<GrantRow[]> {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("channel_access_grants")
    .select("owner_user_id, role, permissions")
    .eq("member_user_id", memberId);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data ?? []) as GrantRow[];
}

async function grantForOwner(memberId: string, ownerId: string): Promise<GrantRow | null> {
  const rows = await grantsForMember(memberId);
  return rows.find((row) => row.owner_user_id === ownerId) ?? null;
}

export async function listManagedChannels(memberId: string): Promise<ManagedChannelMenu> {
  const supabase = await admin();
  const [{ data: account }, grants] = await Promise.all([
    supabase.from("users").select("name, image").eq("id", memberId).maybeSingle(),
    grantsForMember(memberId),
  ]);

  const ownerIds = [...new Set(grants.map((row) => row.owner_user_id).filter(isUuid))];
  if (ownerIds.length === 0) {
    return {
      account: { name: account?.name ?? null, image: account?.image ?? null },
      channels: [],
    };
  }

  const [{ data: owners }, { data: connections }] = await Promise.all([
    supabase.from("users").select("id, name, image").in("id", ownerIds),
    supabase
      .from("platform_connections")
      .select("user_id, username, is_active, created_at")
      .in("user_id", ownerIds)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

  const byOwner = new Map((owners ?? []).map((row) => [row.id, row]));
  const usernameByOwner = new Map<string, string>();
  for (const row of connections ?? []) {
    const username = row.username?.trim();
    if (!username || usernameByOwner.has(row.user_id)) continue;
    usernameByOwner.set(row.user_id, username);
  }

  const channels: ManagedChannel[] = [];
  for (const grant of grants) {
    if (grant.role !== "moderator" && grant.role !== "granted") continue;
    if (!isUuid(grant.owner_user_id) || grant.owner_user_id === memberId) continue;
    const owner = byOwner.get(grant.owner_user_id);
    const name = owner?.name?.trim() || usernameByOwner.get(grant.owner_user_id) || null;
    channels.push({
      ownerUserId: grant.owner_user_id,
      name,
      image: owner?.image ?? null,
      role: grant.role,
      canOpen: canOpenWorkspace(grant.role, grant.permissions),
    });
  }

  channels.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  return {
    account: { name: account?.name ?? null, image: account?.image ?? null },
    channels,
  };
}

export async function resolveWorkspaceOwner(memberId: string): Promise<string> {
  let ownerId: string | null = null;
  try {
    ownerId = readSignedOwner(memberId);
  } catch {
    ownerId = null;
  }
  if (!ownerId || ownerId === memberId) {
    if (ownerId === memberId) clearWorkspaceCookie();
    return memberId;
  }
  const grant = await grantForOwner(memberId, ownerId);
  if (!grant || !canOpenWorkspace(grant.role, grant.permissions)) {
    clearWorkspaceCookie();
    return memberId;
  }
  return ownerId;
}

export async function switchWorkspaceOwner(memberId: string, ownerUserId: string | null): Promise<void> {
  if (!ownerUserId || ownerUserId === memberId) {
    clearWorkspaceCookie();
    return;
  }
  if (!isUuid(ownerUserId)) throw new Error("Invalid channel");
  const grant = await grantForOwner(memberId, ownerUserId);
  if (!grant || !canOpenWorkspace(grant.role, grant.permissions)) {
    clearWorkspaceCookie();
    throw new Error("Channel access is not granted");
  }
  setCookie(COOKIE, signWorkspaceCookie(memberId, ownerUserId), cookieOptions(TTL_SECONDS));
}

export async function loadGrantedWorkspace(memberId: string, ownerUserId: string): Promise<GrantedWorkspace> {
  if (!isUuid(ownerUserId)) throw new Error("Invalid channel");
  if (ownerUserId === memberId) throw new Error("Use the signed-in workspace");
  const grant = await grantForOwner(memberId, ownerUserId);
  if (!grant || !canOpenWorkspace(grant.role, grant.permissions)) {
    clearWorkspaceCookie();
    throw new Error("Channel access is not granted");
  }

  const supabase = await admin();
  const [profile, connections, subathons] = await Promise.all([
    supabase
      .from("users")
      .select("name, image, timezone, default_platform")
      .eq("id", ownerUserId)
      .maybeSingle(),
    supabase
      .from("platform_connections")
      .select("id, platform, username, is_active, platform_user_id, created_at")
      .eq("user_id", ownerUserId)
      .order("created_at", { ascending: true }),
    supabase
      .from("subathons")
      .select("id, title, slug, is_active, initial_seconds, max_duration_seconds, overlays(public_token, is_public)")
      .eq("user_id", ownerUserId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);

  if (profile.error) throw profile.error;
  if (connections.error) throw connections.error;
  if (subathons.error) throw subathons.error;

  const connectionName = (connections.data ?? []).find((row) => row.username?.trim())?.username?.trim() ?? null;

  return {
    profile: {
      name: profile.data?.name?.trim() || connectionName,
      email: null,
      image: profile.data?.image ?? null,
      timezone: profile.data?.timezone ?? "UTC",
      default_platform: profile.data?.default_platform ?? null,
    },
    connections: (connections.data ?? []).map((row) => ({
      id: row.id,
      platform: row.platform,
      username: row.username,
      is_active: row.is_active,
      token_expires_at: null,
      scopes: [],
      platform_user_id: row.platform_user_id,
      metadata: {},
      created_at: row.created_at,
    })),
    subathons: (subathons.data ?? []) as GrantedWorkspace["subathons"],
  };
}
