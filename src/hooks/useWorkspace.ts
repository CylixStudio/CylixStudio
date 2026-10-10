import { useQuery } from "@tanstack/react-query";

import { loadManagedWorkspace } from "@/lib/managedChannels.functions";
import { supabase } from "@/lib/supabase/client";
import { isMissingViewerSession } from "@/lib/supabase/sessionError";
import { isStoredTestRow } from "@/lib/testAlert";
import { isTestMode } from "@/lib/testMode";

export type Subathon = {
  id: string;
  title: string;
  slug: string;
  is_active: boolean;
  max_duration_seconds: number | null;
  initial_seconds: number;
  overlays: { public_token: string; is_public: boolean }[];
};

function isMissingRelationError(error: { message?: string; code?: string } | null): boolean {
  if (!error?.message) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("does not exist") ||
    error.code === "42P01" ||
    error.code === "PGRST205"
  );
}

async function profileFromAuth(userId: string) {
  let data: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"] = { user: null };
  let error: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"] = null;
  try {
    const result = await supabase.auth.getUser();
    data = result.data;
    error = result.error;
  } catch (caught) {
    if (!isMissingViewerSession(caught)) throw caught;
    error = null;
    data = { user: null };
  }
  const user = error ? null : (data?.user ?? null);
  if (!user?.id || user.id !== userId) {
    return {
      name: null as string | null,
      email: null as string | null,
      image: null as string | null,
      timezone: "UTC",
      default_platform: null as string | null,
    };
  }
  const meta = user.user_metadata ?? {};
  return {
    name:
      (typeof meta.name === "string" && meta.name) ||
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.preferred_username === "string" && meta.preferred_username) ||
      (typeof meta.username === "string" && meta.username) ||
      null,
    email: user.email ?? null,
    image:
      (typeof meta.avatar_url === "string" && meta.avatar_url) ||
      (typeof meta.picture === "string" && meta.picture) ||
      (typeof meta.image === "string" && meta.image) ||
      null,
    timezone: "UTC",
    default_platform: null as string | null,
  };
}

const testWorkspace = {
  profile: {
    name: "Test User",
    email: "test@creovixstudio.local",
    image: null,
    timezone: null,
    default_platform: null,
  },
  connections: [],
  subathons: [] as Subathon[],
};

/** Profile + subathons + connections — the data every dashboard screen needs. */
export function useWorkspace(userId: string) {
  return useQuery({
    queryKey: ["workspace", userId],
    enabled: userId.length > 0,
    queryFn: async () => {
      if (isTestMode()) return testWorkspace;

      const [profile, connections, subathons] = await Promise.all([
        supabase
          .from("users")
          .select("name, email, image, timezone, default_platform")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("platform_connections")
          .select(
            "id, platform, username, is_active, token_expires_at, scopes, platform_user_id, metadata, created_at",
          )
          .order("created_at", { ascending: true }),
        supabase
          .from("subathons")
          .select(
            "id, title, slug, is_active, initial_seconds, max_duration_seconds, overlays(public_token, is_public)",
          )
          .order("is_active", { ascending: false })
          .order("created_at", { ascending: true }),
      ]);

      let resolvedProfile = profile.data;
      if (profile.error) {
        if (isMissingRelationError(profile.error)) {
          console.warn(
            "[workspace] public.users missing from schema cache — falling back to auth.getUser(). Apply migration 20260925010000_secure_public_users_profile.sql",
            profile.error.message,
          );
          resolvedProfile = await profileFromAuth(userId);
        } else {
          throw profile.error;
        }
      }

      if (connections.error && !isMissingRelationError(connections.error)) {
        throw connections.error;
      }
      if (subathons.error && !isMissingRelationError(subathons.error)) {
        throw subathons.error;
      }

      return {
        profile: resolvedProfile,
        connections: connections.error ? [] : (connections.data ?? []),
        subathons: (subathons.error ? [] : (subathons.data ?? [])) as Subathon[],
      };
    },
  });
}

/**
 * Home-dashboard read of a channel the signed-in member is granted to open.
 * The server confirms the grant. Settings keep using `useWorkspace`.
 */
export function useGrantedWorkspace(ownerUserId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["workspace", "grant", ownerUserId],
    enabled: enabled && ownerUserId.length > 0 && !isTestMode(),
    queryFn: () => loadManagedWorkspace({ data: { ownerUserId } }),
  });
}

/** Aggregate counters for the dashboard stat row. */
export function useSubathonStats(subathonId: string | null) {
  return useQuery({
    enabled: Boolean(subathonId),
    queryKey: ["subathon-stats", subathonId],
    queryFn: async () => {
      const [timer, events, rules] = await Promise.all([
        supabase
          .from("timer_states")
          .select("total_added_seconds")
          .eq("subathon_id", subathonId!)
          .maybeSingle(),
        supabase.from("events").select("raw_payload").eq("subathon_id", subathonId!),
        supabase
          .from("rules")
          .select("id", { count: "exact", head: true })
          .eq("subathon_id", subathonId!)
          .eq("is_enabled", true),
      ]);
      return {
        totalAddedSeconds: timer.data?.total_added_seconds ?? 0,
        totalEvents: (events.data ?? []).filter((row) => !isStoredTestRow({ raw_payload: row.raw_payload }))
          .length,
        activeRules: rules.count ?? 0,
      };
    },
  });
}
