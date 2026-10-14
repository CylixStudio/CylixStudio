import { createServerFn } from "@tanstack/react-start";

import { sanitizePlatform } from "@/lib/linkInBio";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

export const previewPlatformLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { platform: string; value: string; youtubeLatest?: boolean }) => ({
    platform: sanitizePlatform(input.platform),
    value: String(input.value ?? "").trim().slice(0, 2048),
    youtubeLatest: input.youtubeLatest,
  }))
  .handler(async ({ data, context }) => {
    const { previewPlatformLive: load } = await import("@/lib/linkInBioLive.server");
    let includeLatest = data.youtubeLatest;
    if (data.platform === "youtube" && includeLatest === undefined) {
      const { data: row, error } = await context.supabase
        .from("link_in_bio_themes")
        .select("youtube_latest_enabled")
        .eq("user_id", context.userId)
        .maybeSingle();
      includeLatest = error || typeof row?.youtube_latest_enabled !== "boolean" ? true : row.youtube_latest_enabled !== false;
    }
    return load(data.platform, data.value, { includeLatest: includeLatest !== false });
  });
