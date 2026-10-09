import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { clipPlaybackUrl, publicClipPageUrl } from "@/lib/clipStorage";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

export type ClipCommandSettingsInput = {
  enabled: boolean;
  roles: string[];
  defaultLength: number;
  maxLength: number;
  response: string;
};

const ClipCommandSettingsSchema = z.object({
  enabled: z.boolean(),
  roles: z.array(z.string().min(1).max(40)).max(20),
  defaultLength: z.number().int().min(5).max(300),
  maxLength: z.number().int().min(5).max(300),
  response: z.string().max(500),
});

export const getClipCommandState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: settings }, { data: clips }] = await Promise.all([
      supabase
        .from("clip_command_settings")
        .select("enabled, roles, default_length, max_length, response")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("clips")
        .select("id, title, url, external_id, thumbnail_url, duration_seconds, view_count, clipped_by, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return {
      settings: settings
        ? {
            enabled: settings.enabled,
            roles: settings.roles?.length ? settings.roles : ["Everyone"],
            defaultLength: settings.default_length,
            maxLength: settings.max_length,
            response: settings.response,
          }
        : null,
      clips: (clips ?? []).map((clip) => ({
        id: clip.id,
        title: clip.title,
        url: clipPlaybackUrl({ id: clip.id, url: clip.url, externalId: clip.external_id }),
        thumbnail: clip.thumbnail_url,
        duration: clip.duration_seconds,
        views: clip.view_count,
        clippedBy: clip.clipped_by,
        createdAt: clip.created_at,
      })),
    };
  });

export const saveClipCommandSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ClipCommandSettingsInput) => ClipCommandSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const maxLength = Math.min(Math.max(Math.round(data.maxLength) || 120, 5), 240);
    const defaultLength = Math.min(Math.max(Math.round(data.defaultLength) || 30, 5), maxLength);
    const { error } = await supabase.from("clip_command_settings").upsert(
      {
        user_id: userId,
        enabled: Boolean(data.enabled),
        roles: data.roles.length ? data.roles : ["Everyone"],
        default_length: defaultLength,
        max_length: maxLength,
        response: data.response.trim() || "@{user} {clip_url}",
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const deleteClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clips")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: !error };
  });

export const listChannelClips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clips")
      .select(
        "id, title, url, share_url, external_id, thumbnail_url, duration_seconds, view_count, clipped_by, created_at, platform",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[listChannelClips]", error.message);
      return [] as Array<{
        id: string;
        title: string;
        url: string;
        shareUrl: string | null;
        thumbnail: string | null;
        duration: number;
        views: number;
        clippedBy: string;
        createdAt: string;
        platform: string;
      }>;
    }

    return (data ?? [])
      .filter((clip) => typeof clip.url === "string" && clip.url.length > 0)
      .map((clip) => {
        const playback = clipPlaybackUrl({ id: clip.id, url: clip.url, externalId: clip.external_id });
        const storedPage = playback !== clip.url;
        return {
          id: clip.id,
          title: clip.title?.trim() || "Clip",
          url: playback,
          shareUrl: storedPage ? publicClipPageUrl(clip.id) : (clip.share_url ?? null),
          thumbnail: clip.thumbnail_url ?? null,
          duration: Number.isFinite(clip.duration_seconds) ? clip.duration_seconds : 0,
          views: Number.isFinite(clip.view_count) ? clip.view_count : 0,
          clippedBy: clip.clipped_by?.trim() || "viewer",
          createdAt: clip.created_at || new Date(0).toISOString(),
          platform: clip.platform || "KICK",
        };
      });
  });
