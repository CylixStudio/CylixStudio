import { createServerFn } from "@tanstack/react-start";

import {
  normalizeLink,
  sanitizeAvatarUrl,
  sanitizeBio,
  sanitizeCardSizeOption,
  sanitizeDisplayName,
  sanitizeGalleryImages,
  sanitizeGridX,
  sanitizeGridY,
  sanitizeKind,
  sanitizeLinkUrl,
  sanitizePlatform,
  sanitizeProfile,
  sanitizeSlug,
  sanitizeColSpan,
  sanitizeRowSpan,
  linkInBioThemeRequiresPro,
  sanitizeTheme,
  slugError,
  applyUsernameClaim,
  type GalleryImage,
  type LinkInBioLink,
  type LinkInBioLinkInput,
  type LinkInBioProfile,
  type LinkInBioState,
  type LinkInBioTheme,
} from "@/lib/linkInBio";
import { FREE_PLAN_LIMITS } from "@/lib/plans";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { userHasActivePro } from "@/lib/subscription.server";

type ProfileRow = {
  slug: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  header_url?: string;
  published: boolean;
  published_at: string | null;
  setup_completed?: boolean;
  username_changed_at?: string | null;
};

type ThemeRow = {
  glass_intensity: number;
  hairline_borders: boolean;
  glow_strength: number;
  gradient_style: string;
  font_family: string;
  font_custom_name?: string;
  font_custom_href?: string;
  palette_bg: string;
  palette_fg: string;
  palette_accent: string;
  palette_muted: string;
  surface_style: string;
  layout: string;
  default_card_size: string;
  ambient_enabled?: boolean;
  ambient_preset?: string;
  schedule_enabled?: boolean;
  widget_banner_url?: string;
  countdown_enabled?: boolean;
  countdown_label?: string;
  countdown_ends_at?: string | null;
  bento_color_mode?: string;
  bento_custom_fill?: string;
  bento_custom_accent?: string;
};

type LinkRow = {
  id: string;
  title: string;
  url: string;
  platform: string;
  card_size: string;
  sort_order: number;
  featured: boolean;
  enabled: boolean;
  kind?: string;
  grid_x?: number;
  grid_y?: number;
  col_span?: number;
  row_span?: number;
  gallery_images?: unknown;
  created_at: string;
  updated_at: string;
};

function mapProfile(row: ProfileRow): LinkInBioProfile {
  return sanitizeProfile({
    slug: row.slug,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    headerUrl: row.header_url ?? "",
    published: row.published,
    publishedAt: row.published_at,
    setupCompleted: Boolean(row.setup_completed),
    usernameChangedAt: row.username_changed_at ?? null,
  });
}

function mapTheme(row: ThemeRow): LinkInBioTheme {
  return sanitizeTheme({
    glassIntensity: row.glass_intensity,
    hairlineBorders: row.hairline_borders,
    glowStrength: row.glow_strength,
    gradientStyle: row.gradient_style as LinkInBioTheme["gradientStyle"],
    fontFamily: row.font_family,
    fontCustomName: row.font_custom_name ?? "",
    fontCustomHref: row.font_custom_href ?? "",
    paletteBg: row.palette_bg,
    paletteFg: row.palette_fg,
    paletteAccent: row.palette_accent,
    paletteMuted: row.palette_muted,
    surfaceStyle: row.surface_style as LinkInBioTheme["surfaceStyle"],
    layout: row.layout as LinkInBioTheme["layout"],
    defaultCardSize: row.default_card_size as LinkInBioTheme["defaultCardSize"],
    ambientEnabled: row.ambient_enabled !== false,
    ambientPreset: row.ambient_preset as LinkInBioTheme["ambientPreset"],
    scheduleEnabled: Boolean(row.schedule_enabled),
    widgetBannerUrl: row.widget_banner_url ?? "",
    countdownEnabled: Boolean(row.countdown_enabled),
    countdownLabel: row.countdown_label ?? "",
    countdownEndsAt: row.countdown_ends_at ?? null,
    bentoColorMode: row.bento_color_mode as LinkInBioTheme["bentoColorMode"],
    bentoCustomFill: row.bento_custom_fill ?? "",
    bentoCustomAccent: row.bento_custom_accent ?? "",
  });
}

function mapLink(row: LinkRow): LinkInBioLink {
  return normalizeLink({
    id: row.id,
    title: row.title,
    url: row.url,
    platform: sanitizePlatform(row.platform),
    cardSize: sanitizeCardSizeOption(row.card_size),
    sortOrder: row.sort_order,
    featured: row.featured,
    enabled: row.enabled,
    kind: sanitizeKind(row.kind ?? "link"),
    gridX: row.grid_x,
    gridY: row.grid_y,
    colSpan: sanitizeColSpan(row.col_span),
    rowSpan: sanitizeRowSpan(row.row_span),
    galleryImages: sanitizeGalleryImages(row.gallery_images),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const PROFILE_COLS =
  "slug, display_name, bio, avatar_url, header_url, published, published_at, setup_completed, username_changed_at";
const THEME_COLS =
  "glass_intensity, hairline_borders, glow_strength, gradient_style, font_family, font_custom_name, font_custom_href, palette_bg, palette_fg, palette_accent, palette_muted, surface_style, layout, default_card_size, ambient_enabled, ambient_preset, schedule_enabled, widget_banner_url, countdown_enabled, countdown_label, countdown_ends_at, bento_color_mode, bento_custom_fill, bento_custom_accent";
const LINK_COLS =
  "id, title, url, platform, card_size, sort_order, featured, enabled, kind, grid_x, grid_y, col_span, row_span, gallery_images, created_at, updated_at";

async function persistImages(userId: string, images: GalleryImage[]): Promise<GalleryImage[]> {
  const { persistLinkInBioImageUrl } = await import("@/lib/linkInBio.storage.server");
  const next: GalleryImage[] = [];
  for (const image of images) {
    const url = await persistLinkInBioImageUrl(userId, image.url);
    if (url) next.push({ id: image.id || crypto.randomUUID(), url });
  }
  return next;
}

async function persistMaybeImage(userId: string, url: string): Promise<string> {
  const { persistLinkInBioImageUrl } = await import("@/lib/linkInBio.storage.server");
  return persistLinkInBioImageUrl(userId, url);
}

async function ensureRows(
  supabase: any,
  userId: string,
): Promise<{ profile: ProfileRow; theme: ThemeRow }> {
  let profile = (
    await supabase.from("link_in_bio_profiles").select(PROFILE_COLS).eq("user_id", userId).maybeSingle()
  ).data as ProfileRow | null;
  if (!profile) {
    profile = (
      await supabase
        .from("link_in_bio_profiles")
        .upsert({ user_id: userId, slug: `u${userId.replace(/-/g, "").slice(0, 10)}` }, { onConflict: "user_id" })
        .select(PROFILE_COLS)
        .maybeSingle()
    ).data as ProfileRow | null;
  }
  let theme = (await supabase.from("link_in_bio_themes").select(THEME_COLS).eq("user_id", userId).maybeSingle())
    .data as ThemeRow | null;
  if (!theme) {
    theme = (
      await supabase.from("link_in_bio_themes").upsert({ user_id: userId }, { onConflict: "user_id" }).select(THEME_COLS).maybeSingle()
    ).data as ThemeRow | null;
  }
  if (!profile || !theme) throw new Error("link_in_bio_init");
  return { profile, theme };
}

async function loadState(supabase: Parameters<typeof ensureRows>[0], userId: string): Promise<LinkInBioState> {
  const { profile, theme } = await ensureRows(supabase, userId);
  const [{ data: links }, { data: connections }, { data: schedule }] = await Promise.all([
    supabase.from("link_in_bio_links").select(LINK_COLS).eq("user_id", userId).order("sort_order", { ascending: true }),
    supabase.from("platform_connections").select("platform, username").eq("user_id", userId).eq("is_active", true),
    supabase.from("stream_schedule_settings").select("share_token, title").eq("user_id", userId).maybeSingle(),
  ]);
  const rows = (connections ?? []) as Array<{ platform: string; username: string | null }>;
  return {
    profile: mapProfile(profile),
    theme: mapTheme(theme),
    links: ((links ?? []) as LinkRow[]).map(mapLink),
    kickUsername: rows.find((row) => row.platform === "KICK")?.username ?? null,
    twitchUsername: rows.find((row) => row.platform === "TWITCH")?.username ?? null,
    scheduleShareToken: schedule?.share_token ?? null,
    scheduleTitle: schedule?.title ?? null,
  };
}

export const getLinkInBioState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LinkInBioState> => loadState(context.supabase, context.userId));

export const saveLinkInBioProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Omit<LinkInBioProfile, "publishedAt">) => input)
  .handler(async ({ data, context }) => {
    await ensureRows(context.supabase, context.userId);
    const slug = sanitizeSlug(data.slug);
    const error = slugError(slug);
    if (error) return { ok: false as const, error };
    const { data: taken } = await context.supabase
      .from("link_in_bio_profiles")
      .select("user_id")
      .eq("slug", slug)
      .neq("user_id", context.userId)
      .maybeSingle();
    if (taken) return { ok: false as const, error: "slug_taken" };

    const { data: current } = await context.supabase
      .from("link_in_bio_profiles")
      .select("slug, published, published_at, username_changed_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    const claim = applyUsernameClaim(
      { slug: current?.slug ?? "", usernameChangedAt: current?.username_changed_at ?? null },
      slug,
    );
    if ("error" in claim) return { ok: false as const, error: claim.error };
    const published = Boolean(data.published);
    const publishedAt = published
      ? (current?.published_at ?? new Date().toISOString())
      : (current?.published_at ?? null);

    const { error: writeError } = await context.supabase
      .from("link_in_bio_profiles")
      .update({
        slug,
        display_name: sanitizeDisplayName(data.displayName),
        bio: sanitizeBio(data.bio),
        avatar_url: await persistMaybeImage(context.userId, sanitizeAvatarUrl(data.avatarUrl)),
        header_url: await persistMaybeImage(context.userId, sanitizeAvatarUrl(data.headerUrl)),
        published,
        published_at: publishedAt,
        setup_completed: Boolean(data.setupCompleted) || published,
        username_changed_at: claim.usernameChangedAt,
      })
      .eq("user_id", context.userId);
    if (writeError) return { ok: false as const, error: "save_failed" };
    return { ok: true as const };
  });

export const saveLinkInBioTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: LinkInBioTheme) => input)
  .handler(async ({ data, context }) => {
    await ensureRows(context.supabase, context.userId);
    const theme = sanitizeTheme(data);
    const isPro = await userHasActivePro(context.supabase, context.userId);
    if (!isPro && linkInBioThemeRequiresPro(theme)) return { ok: false as const, error: "pro_required" };
    const { error } = await context.supabase
      .from("link_in_bio_themes")
      .update({
        glass_intensity: theme.glassIntensity,
        hairline_borders: theme.hairlineBorders,
        glow_strength: theme.glowStrength,
        gradient_style: theme.gradientStyle,
        font_family: theme.fontFamily,
        font_custom_name: theme.fontCustomName,
        font_custom_href: theme.fontCustomHref,
        palette_bg: theme.paletteBg,
        palette_fg: theme.paletteFg,
        palette_accent: theme.paletteAccent,
        palette_muted: theme.paletteMuted,
        surface_style: theme.surfaceStyle,
        layout: theme.layout,
        default_card_size: theme.defaultCardSize,
        ambient_enabled: theme.ambientEnabled,
        ambient_preset: theme.ambientPreset,
        schedule_enabled: theme.scheduleEnabled,
        widget_banner_url: await persistMaybeImage(context.userId, theme.widgetBannerUrl),
        countdown_enabled: theme.countdownEnabled,
        countdown_label: theme.countdownLabel,
        countdown_ends_at: theme.countdownEndsAt,
        bento_color_mode: theme.bentoColorMode,
        bento_custom_fill: theme.bentoCustomFill,
        bento_custom_accent: theme.bentoCustomAccent,
      })
      .eq("user_id", context.userId);
    if (error) return { ok: false as const, error: "save_failed" };
    return { ok: true as const };
  });

export const upsertLinkInBioLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: LinkInBioLinkInput) => input)
  .handler(async ({ data, context }) => {
    await ensureRows(context.supabase, context.userId);
    const isPro = await userHasActivePro(context.supabase, context.userId);
    const kind = sanitizeKind(data.kind ?? "link");
    if (!isPro && kind === "gallery") return { ok: false as const, error: "pro_required" };
    if (!isPro && !data.id) {
      const { count } = await context.supabase
        .from("link_in_bio_links")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId);
      if ((count ?? 0) >= FREE_PLAN_LIMITS.linkInBioLinks) {
        return { ok: false as const, error: "free_limit_links" };
      }
    }
    const title = sanitizeDisplayName(data.title) || (kind === "gallery" ? "Gallery" : "");
    const url = sanitizeLinkUrl(data.url);
    if (!title) return { ok: false as const, error: "title_required" };
    if (kind === "link" && !url) return { ok: false as const, error: "url_invalid" };
    const galleryImages = kind === "gallery" ? await persistImages(context.userId, sanitizeGalleryImages(data.galleryImages)) : [];
    const payload = {
      user_id: context.userId,
      title,
      url: kind === "gallery" ? url : url,
      platform: sanitizePlatform(data.platform),
      card_size: sanitizeCardSizeOption(data.cardSize),
      featured: Boolean(data.featured),
      enabled: Boolean(data.enabled),
      kind,
      grid_x: sanitizeGridX(data.gridX),
      grid_y: sanitizeGridY(data.gridY),
      col_span: sanitizeColSpan(data.colSpan),
      row_span: sanitizeRowSpan(data.rowSpan),
      gallery_images: galleryImages,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("link_in_bio_links")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) return { ok: false as const, error: "save_failed" };
      return { ok: true as const };
    }
    const { count } = await context.supabase
      .from("link_in_bio_links")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    const { error } = await context.supabase
      .from("link_in_bio_links")
      .insert({ ...payload, sort_order: count ?? 0 });
    if (error) return { ok: false as const, error: "save_failed" };
    return { ok: true as const };
  });

export const deleteLinkInBioLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("link_in_bio_links")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { ok: false as const, error: "save_failed" };
    return { ok: true as const };
  });

export const reorderLinkInBioLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => input)
  .handler(async ({ data, context }) => {
    const ids = data.ids.filter((id) => typeof id === "string" && id.length > 0).slice(0, 80);
    await Promise.all(
      ids.map((id, index) =>
        context.supabase
          .from("link_in_bio_links")
          .update({ sort_order: index })
          .eq("id", id)
          .eq("user_id", context.userId),
      ),
    );
    return { ok: true as const };
  });

export const previewLinkInBioStream = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const state = await loadState(context.supabase, context.userId);
    const { resolveLinkInBioStream } = await import("@/lib/linkInBio.server");
    const extras = await resolveLinkInBioStream(state);
    const { enrichLinkTilePreviews } = await import("@/lib/linkInBioLive.server");
    const tilePreviews = await enrichLinkTilePreviews(state, extras.tilePreviews);
    return { ...extras, tilePreviews };
  });

export const checkLinkInBioSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data, context }) => {
    const slug = sanitizeSlug(data.slug);
    const error = slugError(slug);
    if (error) return { available: false as const, error };
    const { data: taken } = await context.supabase
      .from("link_in_bio_profiles")
      .select("user_id")
      .eq("slug", slug)
      .neq("user_id", context.userId)
      .maybeSingle();
    if (taken) return { available: false as const, error: "slug_taken" };
    return { available: true as const, error: null };
  });

export const replaceLinkInBioLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { links: LinkInBioLinkInput[] }) => input)
  .handler(async ({ data, context }) => {
    await ensureRows(context.supabase, context.userId);
    const isPro = await userHasActivePro(context.supabase, context.userId);
    if (!isPro && data.links.length > FREE_PLAN_LIMITS.linkInBioLinks) {
      return { ok: false as const, error: "free_limit_links" };
    }
    if (!isPro && data.links.some((link) => (link.kind ?? "link") === "gallery")) {
      return { ok: false as const, error: "pro_required" };
    }
    const rows = [];
    for (const [index, input] of data.links.entries()) {
      const kind = sanitizeKind(input.kind ?? "link");
      const title = sanitizeDisplayName(input.title) || (kind === "gallery" ? "Gallery" : "");
      const url = sanitizeLinkUrl(input.url);
      if (!title) continue;
      if (kind === "link" && !url) continue;
      const galleryImages =
        kind === "gallery" ? await persistImages(context.userId, sanitizeGalleryImages(input.galleryImages)) : [];
      rows.push({
        ...(input.id ? { id: input.id } : {}),
        user_id: context.userId,
        title,
        url,
        platform: sanitizePlatform(input.platform),
        card_size: sanitizeCardSizeOption(input.cardSize ?? "inherit"),
        featured: Boolean(input.featured),
        enabled: input.enabled !== false,
        sort_order: index,
        kind,
        grid_x: sanitizeGridX(input.gridX),
        grid_y: sanitizeGridY(input.gridY),
        col_span: sanitizeColSpan(input.colSpan),
        row_span: sanitizeRowSpan(input.rowSpan),
        gallery_images: galleryImages,
      });
    }
    await context.supabase.from("link_in_bio_links").delete().eq("user_id", context.userId);
    if (rows.length) {
      const { error } = await context.supabase.from("link_in_bio_links").insert(rows);
      if (error) return { ok: false as const, error: "save_failed" };
    }
    return { ok: true as const };
  });
