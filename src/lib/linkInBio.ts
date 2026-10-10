export const LINK_IN_BIO_TEST_KEY = "creovix:link-in-bio";
export const LINK_IN_BIO_SLUG_LIST_KEY = "creovix:link-in-bio-slugs";
export const LINK_IN_BIO_WIZARD_STEP_KEY = "creovix:link-in-bio-wizard-step";
export const LINK_IN_BIO_PUBLIC_PREFIX = "/u";
export const WIZARD_STEPS = 4;
export const MAX_CUSTOM_LINKS = 20;
export const USERNAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export type LinkPlatform =
  | "kick"
  | "twitch"
  | "youtube"
  | "tiktok"
  | "instagram"
  | "snapchat"
  | "x"
  | "discord"
  | "whatsapp"
  | "custom";

export type CardSize = "s" | "m" | "l";
export type CardSizeOption = "inherit" | CardSize;
export type BioLayout = "bento" | "list" | "grid" | "spotlight" | "banner";
export type BentoSize = "1x1" | "2x1" | "1x2" | "2x2";
export type BentoColSpan = 1 | 2 | 3 | 4;
export type BentoRowSpan = 1 | 2 | 3;
export type LinkKind = "link" | "gallery";
export type SurfaceStyle = "flat" | "glass";
export type BentoColorMode = "brand" | "mono" | "gradient" | "glow" | "glass" | "custom";
export type GradientStyle = "none" | "soft" | "aurora" | "horizon";
export type AmbientPreset = "none" | "glow" | "orbits" | "haze" | "ripple";
export type StreamPlatform = "twitch" | "youtube" | "kick";
export type GalleryImage = { id: string; url: string };

export type StreamStatus =
  | {
      kind: "live";
      platform: StreamPlatform;
      title: string | null;
      viewers: number | null;
      watchUrl: string;
    }
  | {
      kind: "offline";
      platform: StreamPlatform | "profile";
      latest: { title: string; url: string; thumbnailUrl: string | null } | null;
      channelUrl: string | null;
    };

export type LivePlatformFlags = { kick: boolean; twitch: boolean; youtube: boolean };

export type LinkTilePreview = {
  live: boolean;
  thumbnailUrl: string | null;
};

export type LinkInBioLink = {
  id: string;
  title: string;
  url: string;
  platform: LinkPlatform;
  cardSize: CardSizeOption;
  sortOrder: number;
  featured: boolean;
  enabled: boolean;
  kind: LinkKind;
  gridX: number;
  gridY: number;
  colSpan: BentoColSpan;
  rowSpan: BentoRowSpan;
  galleryImages: GalleryImage[];
  createdAt: string;
  updatedAt: string;
};

export type LinkInBioLinkInput = {
  id?: string;
  title: string;
  url: string;
  platform: LinkPlatform;
  cardSize: CardSizeOption;
  featured: boolean;
  enabled: boolean;
  kind?: LinkKind;
  gridX?: number;
  gridY?: number;
  colSpan?: number;
  rowSpan?: number;
  galleryImages?: GalleryImage[];
};

export type PublicBioLink = Pick<
  LinkInBioLink,
  "id" | "title" | "url" | "platform" | "cardSize" | "featured" | "kind" | "gridX" | "gridY" | "colSpan" | "rowSpan" | "galleryImages"
>;

export type LinkInBioProfile = {
  slug: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  headerUrl: string;
  published: boolean;
  publishedAt: string | null;
  setupCompleted: boolean;
  usernameChangedAt: string | null;
};

export type LinkInBioTheme = {
  glassIntensity: number;
  hairlineBorders: boolean;
  glowStrength: number;
  gradientStyle: GradientStyle;
  fontFamily: string;
  fontCustomName: string;
  fontCustomHref: string;
  paletteBg: string;
  paletteFg: string;
  paletteAccent: string;
  paletteMuted: string;
  surfaceStyle: SurfaceStyle;
  bentoColorMode: BentoColorMode;
  bentoCustomFill: string;
  bentoCustomAccent: string;
  layout: BioLayout;
  defaultCardSize: CardSize;
  ambientEnabled: boolean;
  ambientPreset: AmbientPreset;
  scheduleEnabled: boolean;
  widgetBannerUrl: string;
  countdownEnabled: boolean;
  countdownLabel: string;
  countdownEndsAt: string | null;
};

export type LinkInBioState = {
  profile: LinkInBioProfile;
  theme: LinkInBioTheme;
  links: LinkInBioLink[];
  kickUsername: string | null;
  twitchUsername: string | null;
  scheduleShareToken: string | null;
  scheduleTitle: string | null;
};

export type PublicLinkInBio = {
  profile: Pick<LinkInBioProfile, "slug" | "displayName" | "bio" | "avatarUrl" | "headerUrl">;
  theme: LinkInBioTheme;
  links: PublicBioLink[];
  kickLive: boolean;
  stream: StreamStatus | null;
  livePlatforms: LivePlatformFlags;
  tilePreviews: Partial<Record<LinkPlatform, LinkTilePreview>>;
  schedule: { title: string; url: string } | null;
};

export const LINK_PLATFORMS: ReadonlyArray<{
  id: LinkPlatform;
  label: string;
  hint: string;
  comingSoon?: boolean;
}> = [
  { id: "kick", label: "Kick", hint: "https://kick.com/you" },
  { id: "twitch", label: "Twitch", hint: "https://twitch.tv/you" },
  { id: "youtube", label: "YouTube", hint: "https://youtube.com/@you" },
  { id: "tiktok", label: "TikTok", hint: "@you or a video URL" },
  { id: "instagram", label: "Instagram", hint: "@you or a post / reel URL" },
  { id: "x", label: "X", hint: "@you or a post URL" },
  { id: "discord", label: "Discord", hint: "discord.gg/invite" },
  { id: "snapchat", label: "Snapchat", hint: "@you or snapchat.com/add/…" },
  { id: "whatsapp", label: "WhatsApp Community", hint: "https://chat.whatsapp.com/… or whatsapp.com/channel/…" },
  { id: "custom", label: "Link", hint: "https://…" },
];

/**
 * Baseline popularity for streamer/creator audiences (higher = more used).
 * Custom extras always sort last among platform *types*.
 */
export const PLATFORM_POPULARITY: Record<LinkPlatform, number> = {
  kick: 100,
  twitch: 96,
  youtube: 92,
  tiktok: 88,
  instagram: 82,
  x: 76,
  discord: 64,
  snapchat: 52,
  whatsapp: 40,
  custom: 10,
};

export const PLATFORM_USAGE_STORAGE_KEY = "creovix:link-platform-usage";

export function readPlatformUsageCounts(): Partial<Record<LinkPlatform, number>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PLATFORM_USAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<Record<LinkPlatform, number>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key in PLATFORM_POPULARITY && typeof value === "number" && Number.isFinite(value)) {
        out[key as LinkPlatform] = Math.max(0, Math.floor(value));
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function bumpPlatformUsage(platform: LinkPlatform, amount = 1): void {
  if (typeof window === "undefined" || amount <= 0) return;
  try {
    const next = { ...readPlatformUsageCounts() };
    next[platform] = (next[platform] ?? 0) + amount;
    window.localStorage.setItem(PLATFORM_USAGE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function platformUsageScore(
  platform: LinkPlatform,
  usage: Partial<Record<LinkPlatform, number>> = {},
): number {
  return (PLATFORM_POPULARITY[platform] ?? 0) + (usage[platform] ?? 0) * 12;
}

/** Filled platforms rise first, then score (popularity + local usage). Custom types stay last. */
export function sortPlatformsByUsage<T extends { id: LinkPlatform }>(
  platforms: ReadonlyArray<T>,
  options?: {
    filled?: Partial<Record<LinkPlatform, boolean>> | ReadonlySet<LinkPlatform>;
    usage?: Partial<Record<LinkPlatform, number>>;
  },
): T[] {
  const usage = options?.usage ?? {};
  const isFilled = (id: LinkPlatform) => {
    if (!options?.filled) return false;
    if (options.filled instanceof Set) return options.filled.has(id);
    return Boolean(options.filled[id]);
  };

  return [...platforms].sort((a, b) => {
    const aCustom = a.id === "custom" ? 1 : 0;
    const bCustom = b.id === "custom" ? 1 : 0;
    if (aCustom !== bCustom) return aCustom - bCustom;

    const aFilled = isFilled(a.id) ? 1 : 0;
    const bFilled = isFilled(b.id) ? 1 : 0;
    if (aFilled !== bFilled) return bFilled - aFilled;

    return platformUsageScore(b.id, usage) - platformUsageScore(a.id, usage);
  });
}

export type PrefixedPlatform = Exclude<LinkPlatform, "custom" | "whatsapp">;

export const PLATFORM_HANDLE_PREFIX: Record<PrefixedPlatform, string> = {
  kick: "https://kick.com/",
  twitch: "https://www.twitch.tv/",
  youtube: "https://www.youtube.com/@",
  tiktok: "https://www.tiktok.com/@",
  instagram: "https://www.instagram.com/",
  snapchat: "https://www.snapchat.com/add/",
  x: "https://x.com/",
  discord: "https://discord.gg/",
};

export function usesFullUrl(platform: LinkPlatform): platform is "custom" | "whatsapp" {
  return platform === "custom" || platform === "whatsapp";
}

export const FONT_CHOICES: ReadonlyArray<{
  id: string;
  label: string;
  kind: string;
  sample: string;
  stack: string;
  href: string;
}> = [
  {
    id: "manrope",
    label: "Manrope",
    kind: "Grotesque",
    sample: "Aa",
    stack: '"Manrope", system-ui, sans-serif',
    href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap",
  },
  {
    id: "source-sans",
    label: "Source Sans",
    kind: "Humanist",
    sample: "Hg",
    stack: '"Source Sans 3", "Segoe UI", sans-serif',
    href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap",
  },
  {
    id: "source-serif",
    label: "Source Serif",
    kind: "Serif",
    sample: "Qq",
    stack: '"Source Serif 4", Georgia, serif',
    href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&display=swap",
  },
  {
    id: "fraunces",
    label: "Fraunces",
    kind: "Display",
    sample: "Qf",
    stack: '"Fraunces", Georgia, serif',
    href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap",
  },
  {
    id: "ibm-plex-mono",
    label: "IBM Plex Mono",
    kind: "Mono",
    sample: "01",
    stack: '"IBM Plex Mono", ui-monospace, monospace',
    href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap",
  },
  {
    id: "syne",
    label: "Syne",
    kind: "Geometric",
    sample: "SY",
    stack: '"Syne", system-ui, sans-serif',
    href: "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap",
  },
];

export const BENTO_COLS = 4;
export const BENTO_MAX_COL = 4;
export const BENTO_MAX_ROW = 3;
export const BENTO_ROW_PX = 160;
export const BENTO_GAP_PX = 12;
export const GALLERY_MAX_IMAGES = 8;

export const BENTO_SIZES: ReadonlyArray<{
  id: BentoSize;
  label: string;
  hint: string;
  colSpan: BentoColSpan;
  rowSpan: BentoRowSpan;
}> = [
  { id: "1x1", label: "1×1", hint: "Square tile", colSpan: 1, rowSpan: 1 },
  { id: "2x1", label: "Wide", hint: "Two columns", colSpan: 2, rowSpan: 1 },
  { id: "1x2", label: "Tall", hint: "Two rows", colSpan: 1, rowSpan: 2 },
  { id: "2x2", label: "2×2", hint: "Featured block", colSpan: 2, rowSpan: 2 },
];

export const LAYOUT_CHOICES: ReadonlyArray<{ id: BioLayout; label: string; hint: string }> = [
  { id: "bento", label: "Bento", hint: "Modular tiles you can size and place" },
  { id: "list", label: "Compact list", hint: "Classic stacked links" },
  { id: "grid", label: "Even grid", hint: "Equal two-column tiles" },
  { id: "spotlight", label: "Spotlight", hint: "One featured card on top" },
  { id: "banner", label: "Banner", hint: "Immersive header first" },
];

export const GRADIENT_CHOICES: ReadonlyArray<{ id: GradientStyle; label: string }> = [
  { id: "none", label: "None" },
  { id: "soft", label: "Soft wash" },
  { id: "aurora", label: "Aurora" },
  { id: "horizon", label: "Horizon" },
];

export const BACKGROUND_PRESETS: ReadonlyArray<{
  id: "paper" | "dark";
  label: string;
  hint: string;
  paletteBg: string;
  paletteFg: string;
  paletteAccent: string;
  paletteMuted: string;
  gradientStyle: GradientStyle;
}> = [
  {
    id: "paper",
    label: "Light Theme",
    hint: "Light page, dark type",
    paletteBg: "#f8f9fa",
    paletteFg: "#171717",
    paletteAccent: "#525252",
    paletteMuted: "#6b6b6b",
    gradientStyle: "none",
  },
  {
    id: "dark",
    label: "Dark Theme",
    hint: "Quiet charcoal — no glow",
    paletteBg: "#0a0a0a",
    paletteFg: "#f5f5f5",
    paletteAccent: "#e5e5e5",
    paletteMuted: "#a3a3a3",
    gradientStyle: "none",
  },
];

export const BENTO_COLOR_MODES: ReadonlyArray<{
  id: BentoColorMode;
  label: string;
  hint: string;
}> = [
  { id: "brand", label: "Brand Colors", hint: "Theme surface, brand hairline and wash" },
  { id: "mono", label: "Monochrome Sleek", hint: "Neutral cards, Black/White marks" },
  { id: "gradient", label: "Gradient", hint: "Soft brand wash at the edge" },
  { id: "glow", label: "Glow", hint: "Theme accent glow on the surface" },
  { id: "glass", label: "Glass-Tinted", hint: "Frosted glass, translucent cards" },
  { id: "custom", label: "Custom Palette", hint: "Your color as border, glow, and wash" },
];

export const AMBIENT_CHOICES: ReadonlyArray<{ id: AmbientPreset; label: string; hint: string }> = [
  { id: "glow", label: "Ambient glow", hint: "Soft color orbs (Light Theme only)." },
  { id: "orbits", label: "Orbits", hint: "Slow circling glass lights around the page." },
  { id: "haze", label: "Glass haze", hint: "Frosted panels that tilt as you move." },
  { id: "ripple", label: "Ripple", hint: "Rings bloom from the pointer." },
  { id: "none", label: "Static only", hint: "Background color only — no motion." },
];

const RESERVED_SLUGS = new Set([
  "api",
  "auth",
  "bio",
  "dashboard",
  "login",
  "logout",
  "marks",
  "mod-queue",
  "overlay",
  "privacy",
  "settings",
  "terms",
  "u",
  "widgets",
]);

const HEX = /^#[0-9A-Fa-f]{6}$/;
const AVATAR_MAX = 80_000;

export const DEFAULT_THEME: LinkInBioTheme = {
  glassIntensity: 45,
  hairlineBorders: true,
  glowStrength: 35,
  gradientStyle: "none",
  fontFamily: "manrope",
  fontCustomName: "",
  fontCustomHref: "",
  paletteBg: "#0a0a0a",
  paletteFg: "#f5f5f5",
  paletteAccent: "#e5e5e5",
  paletteMuted: "#a3a3a3",
  surfaceStyle: "glass",
  bentoColorMode: "brand",
  bentoCustomFill: "#171717",
  bentoCustomAccent: "#e5e5e5",
  layout: "bento",
  defaultCardSize: "m",
  ambientEnabled: false,
  ambientPreset: "none",
  scheduleEnabled: false,
  widgetBannerUrl: "",
  countdownEnabled: false,
  countdownLabel: "Going live",
  countdownEndsAt: null,
};

/** Free pages may use the paper or dark preset only. Custom fonts, motion, and layouts are Pro. */
export function linkInBioThemeRequiresPro(theme: LinkInBioTheme): boolean {
  const preset = BACKGROUND_PRESETS.find(
    (entry) => entry.paletteBg.toLowerCase() === theme.paletteBg.toLowerCase(),
  );
  if (!preset) return true;
  if (theme.paletteFg.toLowerCase() !== preset.paletteFg.toLowerCase()) return true;
  if (theme.paletteAccent.toLowerCase() !== preset.paletteAccent.toLowerCase()) return true;
  if (theme.paletteMuted.toLowerCase() !== preset.paletteMuted.toLowerCase()) return true;
  if (theme.fontFamily !== DEFAULT_THEME.fontFamily) return true;
  if (theme.fontCustomName.trim() || theme.fontCustomHref.trim()) return true;
  if (theme.layout !== "bento" && theme.layout !== "list") return true;
  if (theme.ambientEnabled || theme.ambientPreset !== "none") return true;
  if (theme.countdownEnabled || theme.widgetBannerUrl.trim()) return true;
  if (theme.bentoColorMode !== "brand" && theme.bentoColorMode !== "mono") return true;
  if (theme.glowStrength !== DEFAULT_THEME.glowStrength) return true;
  if (theme.glassIntensity !== DEFAULT_THEME.glassIntensity) return true;
  if (theme.surfaceStyle !== DEFAULT_THEME.surfaceStyle) return true;
  return false;
}

export const DEFAULT_PROFILE: LinkInBioProfile = {
  slug: "",
  displayName: "",
  bio: "",
  avatarUrl: "",
  headerUrl: "",
  published: false,
  publishedAt: null,
  setupCompleted: false,
  usernameChangedAt: null,
};

export function publicBioPath(slug: string): string {
  return `${LINK_IN_BIO_PUBLIC_PREFIX}/${encodeURIComponent(slug)}`;
}

export function clampWizardStep(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return 1;
  return Math.min(WIZARD_STEPS, Math.max(1, Math.round(value)));
}

export function parseLinkInBioSearch(search: Record<string, unknown>): {
  setup?: boolean | undefined;
  step?: number | undefined;
} {
  const rawStep = search["step"];
  const hasStep = rawStep !== undefined && rawStep !== "" && rawStep !== null;
  const setupRaw = search["setup"];
  const setup =
    setupRaw === true || setupRaw === 1 || setupRaw === "1" || setupRaw === "true" || hasStep;
  return {
    setup: setup || undefined,
    step: hasStep ? clampWizardStep(rawStep) : undefined,
  };
}

export function linkToInput(link: LinkInBioLink): LinkInBioLinkInput {
  return {
    id: link.id,
    title: link.title,
    url: link.url,
    platform: link.platform,
    cardSize: link.cardSize,
    featured: link.featured,
    enabled: link.enabled,
    kind: link.kind,
    gridX: link.gridX,
    gridY: link.gridY,
    colSpan: link.colSpan,
    rowSpan: link.rowSpan,
    galleryImages: link.galleryImages,
  };
}

export function fontById(id: string) {
  return FONT_CHOICES.find((font) => font.id === id) ?? FONT_CHOICES[0]!;
}

export function sanitizeFontCustomName(raw: string): string {
  return raw.replace(/[<>"'\\]/g, "").trim().slice(0, 40);
}

export function sanitizeFontCustomHref(raw: string): string {
  const value = raw.trim();
  if (!value || value.length > 2048) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return value;
  } catch {
    return "";
  }
}

export function resolveBioFont(theme: Pick<LinkInBioTheme, "fontFamily" | "fontCustomName" | "fontCustomHref">): {
  id: string;
  stack: string;
  href: string;
  faceName: string;
} {
  if (theme.fontFamily === "custom") {
    const faceName = sanitizeFontCustomName(theme.fontCustomName) || "Custom";
    return {
      id: "custom",
      stack: `"${faceName}", system-ui, sans-serif`,
      href: sanitizeFontCustomHref(theme.fontCustomHref),
      faceName,
    };
  }
  const preset = fontById(theme.fontFamily);
  return { id: preset.id, stack: preset.stack, href: preset.href, faceName: preset.label };
}

export function sanitizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function slugError(slug: string): string | null {
  if (!slug) return "slug_required";
  if (RESERVED_SLUGS.has(slug)) return "slug_reserved";
  if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(slug)) return "slug_invalid";
  return null;
}

export function sanitizeTimestamp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function usernameCooldownUntil(changedAt: string | null | undefined): Date | null {
  const stamped = sanitizeTimestamp(changedAt);
  if (!stamped) return null;
  return new Date(new Date(stamped).getTime() + USERNAME_COOLDOWN_MS);
}

export function usernameCooldownActive(changedAt: string | null | undefined, now = Date.now()): boolean {
  const until = usernameCooldownUntil(changedAt);
  return Boolean(until && until.getTime() > now);
}

export function usernameUnlockLabel(changedAt: string | null | undefined): string | null {
  const until = usernameCooldownUntil(changedAt);
  if (!until || until.getTime() <= Date.now()) return null;
  return until.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function applyUsernameClaim(
  current: Pick<LinkInBioProfile, "slug" | "usernameChangedAt">,
  nextSlug: string,
  now = new Date(),
): { usernameChangedAt: string | null } | { error: "slug_cooldown" } {
  const previous = sanitizeSlug(current.slug);
  const next = sanitizeSlug(nextSlug);
  if (previous === next) return { usernameChangedAt: current.usernameChangedAt };
  if (usernameCooldownActive(current.usernameChangedAt, now.getTime())) return { error: "slug_cooldown" };
  return { usernameChangedAt: now.toISOString() };
}

export function sanitizeHex(raw: string, fallback: string): string {
  const value = raw.trim();
  return HEX.test(value) ? value.toLowerCase() : fallback;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function sanitizeDisplayName(raw: string): string {
  return raw.trim().slice(0, 80);
}

export function sanitizeBio(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\n+|\n+$/g, "").slice(0, 400);
}

export function isAvatarDataUrl(value: string): boolean {
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value.trim());
}

export function sanitizeAvatarUrl(raw: string, allowDataUrl = true): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https:\/\//i.test(value) && value.length <= 2048) return value;
  if (allowDataUrl && isAvatarDataUrl(value) && value.length <= AVATAR_MAX) return value;
  return "";
}

export function isValidHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function looksLikeHttpUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value) || /^www\./i.test(value)) return true;
  if (/^(discord\.gg|discord\.com|chat\.whatsapp\.com)\b/i.test(value)) return true;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}[/:?#]/i.test(value);
}

export function coerceHttpUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return sanitizeLinkUrl(value);
  if (looksLikeHttpUrl(value)) return sanitizeLinkUrl(`https://${value.replace(/^\/+/, "")}`);
  return "";
}

export function hostnameFromLink(raw: string): string | null {
  const trimmed = raw.trim();
  const url =
    coerceHttpUrl(trimmed) ||
    (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(trimmed) ? `https://${trimmed}` : "");
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

/** Site favicon for custom links. Callers must onError → Link chain mark. */
export function googleFaviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

export function customLinkFaviconUrl(urlOrHost: string): string | null {
  const host = hostnameFromLink(urlOrHost);
  return host ? googleFaviconUrl(host) : null;
}

export function sanitizeLinkUrl(raw: string): string {
  const value = raw.trim();
  if (!isValidHttpUrl(value) || value.length > 2048) return "";
  return value;
}

export function sanitizePlatform(raw: string): LinkPlatform {
  return LINK_PLATFORMS.some((item) => item.id === raw) ? (raw as LinkPlatform) : "custom";
}

export function sanitizeCardSize(raw: string): CardSize {
  return raw === "s" || raw === "l" ? raw : "m";
}

export function sanitizeCardSizeOption(raw: string): CardSizeOption {
  return raw === "inherit" || raw === "s" || raw === "m" || raw === "l" ? raw : "inherit";
}

export function sanitizeLayout(raw: string): BioLayout {
  return raw === "list" || raw === "grid" || raw === "spotlight" || raw === "banner" ? raw : "bento";
}

export function sanitizeKind(raw: string): LinkKind {
  return raw === "gallery" ? "gallery" : "link";
}

export function sanitizeColSpan(raw: number | undefined): BentoColSpan {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(BENTO_MAX_COL, n) as BentoColSpan;
}

export function sanitizeRowSpan(raw: number | undefined): BentoRowSpan {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(BENTO_MAX_ROW, n) as BentoRowSpan;
}

export function sanitizeSpan(raw: number | undefined): BentoColSpan {
  return sanitizeColSpan(raw);
}

export function sanitizeGridX(raw: number | undefined): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(BENTO_COLS - 1, Math.max(0, Math.round(Number(raw))));
}

export function sanitizeGridY(raw: number | undefined): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(40, Math.max(0, Math.round(Number(raw))));
}

export function bentoSizeOf(colSpan: number, rowSpan: number): BentoSize | null {
  const found = BENTO_SIZES.find((item) => item.colSpan === colSpan && item.rowSpan === rowSpan);
  return found?.id ?? null;
}

export function spanFromBentoSize(size: BentoSize): { colSpan: BentoColSpan; rowSpan: BentoRowSpan } {
  const found = BENTO_SIZES.find((item) => item.id === size) ?? BENTO_SIZES[0]!;
  return { colSpan: found.colSpan, rowSpan: found.rowSpan };
}

export function sanitizeGalleryImages(raw: unknown): GalleryImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as { id?: unknown; url?: unknown };
      const url = sanitizeAvatarUrl(String(record.url ?? ""), true);
      if (!url) return null;
      return {
        id: typeof record.id === "string" && record.id ? record.id : `img-${index}`,
        url,
      };
    })
    .filter((item): item is GalleryImage => Boolean(item))
    .slice(0, GALLERY_MAX_IMAGES);
}

export function platformAccent(platform: LinkPlatform): { color: string; css: string } {
  if (platform === "kick") return { color: "#53FC18", css: "#53FC18" };
  if (platform === "twitch") return { color: "#6B21A8", css: "#6B21A8" };
  if (platform === "youtube") return { color: "#E62117", css: "#E62117" };
  if (platform === "instagram") return { color: "#C2185B", css: "#C2185B" };
  if (platform === "tiktok") return { color: "#25F4EE", css: "#141414" };
  if (platform === "x") return { color: "#E7E9EA", css: "#000000" };
  if (platform === "discord") return { color: "#5865F2", css: "#5865F2" };
  if (platform === "whatsapp") return { color: "#25D366", css: "#25D366" };
  if (platform === "snapchat") return { color: "#FFFC00", css: "#FFFC00" };
  return { color: "#229ED9", css: "#229ED9" };
}

export function normalizeLink(partial: Partial<LinkInBioLink> & { id: string }, index = 0): LinkInBioLink {
  const kind = sanitizeKind(partial.kind ?? (partial.galleryImages?.length ? "gallery" : "link"));
  const title = sanitizeDisplayName(partial.title ?? "") || (kind === "gallery" ? "Gallery" : "");
  const url = kind === "gallery" ? sanitizeLinkUrl(partial.url ?? "") : sanitizeLinkUrl(partial.url ?? "");
  return {
    id: String(partial.id),
    title,
    url,
    platform: sanitizePlatform(partial.platform ?? "custom"),
    cardSize: sanitizeCardSizeOption(partial.cardSize ?? "inherit"),
    sortOrder: Number.isFinite(partial.sortOrder) ? Number(partial.sortOrder) : index,
    featured: Boolean(partial.featured),
    enabled: partial.enabled !== false,
    kind,
    gridX: sanitizeGridX(partial.gridX),
    gridY: sanitizeGridY(partial.gridY),
    colSpan: sanitizeColSpan(partial.colSpan),
    rowSpan: sanitizeRowSpan(partial.rowSpan),
    galleryImages: kind === "gallery" ? sanitizeGalleryImages(partial.galleryImages) : [],
    createdAt: partial.createdAt ?? new Date().toISOString(),
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
  };
}

export function packBento<T extends Pick<LinkInBioLink, "id" | "gridX" | "gridY" | "colSpan" | "rowSpan">>(
  items: T[],
  cols = BENTO_COLS,
): Array<T & { gridX: number; gridY: number; colSpan: BentoColSpan; rowSpan: BentoRowSpan }> {
  const occupied = new Set<string>();
  const key = (x: number, y: number) => `${x}:${y}`;
  const fits = (x: number, y: number, colSpan: number, rowSpan: number) => {
    if (x < 0 || y < 0 || x + colSpan > cols) return false;
    for (let row = y; row < y + rowSpan; row += 1) {
      for (let col = x; col < x + colSpan; col += 1) {
        if (occupied.has(key(col, row))) return false;
      }
    }
    return true;
  };
  const mark = (x: number, y: number, colSpan: number, rowSpan: number) => {
    for (let row = y; row < y + rowSpan; row += 1) {
      for (let col = x; col < x + colSpan; col += 1) {
        occupied.add(key(col, row));
      }
    }
  };
  const findSlot = (colSpan: number, rowSpan: number, preferredX: number, preferredY: number) => {
    const preferX = Math.min(cols - colSpan, Math.max(0, preferredX));
    const preferY = Math.max(0, preferredY);
    if (fits(preferX, preferY, colSpan, rowSpan)) return { gridX: preferX, gridY: preferY };
    for (let y = 0; y <= 40; y += 1) {
      for (let x = 0; x <= cols - colSpan; x += 1) {
        if (fits(x, y, colSpan, rowSpan)) return { gridX: x, gridY: y };
      }
    }
    return { gridX: 0, gridY: 0 };
  };
  return items.map((item) => {
    const colSpan = sanitizeColSpan(item.colSpan);
    const rowSpan = sanitizeRowSpan(item.rowSpan);
    const slot = findSlot(colSpan, rowSpan, item.gridX, item.gridY);
    mark(slot.gridX, slot.gridY, colSpan, rowSpan);
    return { ...item, ...slot, colSpan, rowSpan };
  });
}

export function applyBentoPlacement(
  links: LinkInBioLink[],
  id: string,
  patch: Partial<{ gridX: number; gridY: number; colSpan: number; rowSpan: number }>,
): LinkInBioLink[] {
  const updated = links.map((link) => {
    if (link.id !== id) return link;
    const colSpan = sanitizeColSpan(patch.colSpan ?? link.colSpan);
    const rowSpan = sanitizeRowSpan(patch.rowSpan ?? link.rowSpan);
    const gridX = sanitizeGridX(Math.min(BENTO_COLS - colSpan, patch.gridX ?? link.gridX));
    const gridY = sanitizeGridY(patch.gridY ?? link.gridY);
    return { ...link, colSpan, rowSpan, gridX, gridY };
  });
  const focused = updated.find((link) => link.id === id);
  const rest = updated.filter((link) => link.id !== id);
  const packed = packBento(focused ? [focused, ...rest] : updated);
  const now = new Date().toISOString();
  const byId = new Map(packed.map((item) => [item.id, item]));
  return updated
    .map((link) => {
      const slot = byId.get(link.id);
      if (!slot) return link;
      return {
        ...link,
        gridX: slot.gridX,
        gridY: slot.gridY,
        colSpan: slot.colSpan,
        rowSpan: slot.rowSpan,
        sortOrder: slot.gridY * BENTO_COLS + slot.gridX,
        updatedAt: link.id === id ? now : link.updatedAt,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sanitizeSurface(raw: string): SurfaceStyle {
  return raw === "flat" ? "flat" : "glass";
}

export function sanitizeGradient(raw: string): GradientStyle {
  return raw === "none" || raw === "aurora" || raw === "horizon" ? raw : "soft";
}

export function sanitizeFont(raw: string): string {
  if (raw === "custom") return "custom";
  return FONT_CHOICES.some((font) => font.id === raw) ? raw : "manrope";
}

export function sanitizeAmbientPreset(raw: string): AmbientPreset {
  return raw === "none" || raw === "orbits" || raw === "haze" || raw === "ripple" ? raw : "glow";
}

export function sanitizeBentoColorMode(raw: string | null | undefined): BentoColorMode {
  if (raw === "mono" || raw === "gradient" || raw === "glow" || raw === "glass" || raw === "custom") return raw;
  if (raw === "accent") return "glow";
  return "brand";
}

/** True when the page background is the Light Theme paper family (high luminance). */
export function isLightBioTheme(bg: string): boolean {
  return hexLuminance(bg) > 0.45;
}

const LEGACY_NAVY_BG = new Set(["#0f1117", "#0b0d12", "#0a0b10", "#08090e", "#0d0e12"]);
const LEGACY_PAPER_BG = new Set(["#f7f7f5", "#f8f8f6", "#f6f6f4"]);
const LEGACY_PAPER_ACCENT = new Set(["#6d28d9", "#7c3aed", "#8b5cf6"]);

function migrateLegacyDarkBg(hex: string): string {
  return LEGACY_NAVY_BG.has(hex.toLowerCase()) ? "#0a0a0a" : hex;
}

function migrateLegacyPaperBg(hex: string): string {
  return LEGACY_PAPER_BG.has(hex.toLowerCase()) ? "#f8f9fa" : hex;
}

export function hexLuminance(hex: string): number {
  const n = hex.replace("#", "");
  if (n.length !== 6) return 0;
  const toLin = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * toLin(Number.parseInt(n.slice(0, 2), 16)) +
    0.7152 * toLin(Number.parseInt(n.slice(2, 4), 16)) +
    0.0722 * toLin(Number.parseInt(n.slice(4, 6), 16))
  );
}

export type BentoTilePaint = {
  fill: string;
  wash?: string;
  ink: string;
  onLight: boolean;
  /** Glow mode — White marks on dark, Black on light. */
  whiteIcons: boolean;
  /** Monochrome Sleek — grayscale White/Black marks, no glow. */
  monoIcons: boolean;
  glass: boolean;
  border?: string;
  glowColor: string;
  boxShadow?: string;
  backdropFilter?: string;
};

function themeSurface(light: boolean): string {
  return light
    ? "color-mix(in oklab, #ffffff 92%, var(--bio-bg))"
    : "color-mix(in oklab, #ffffff 7%, var(--bio-bg))";
}

function officialInk(platform: LinkPlatform, lightSurface: boolean): string {
  if (platform === "x") return lightSurface ? "#000000" : "#E7E9EA";
  if (platform === "tiktok") return lightSurface ? "#111111" : "#25F4EE";
  if (platform === "twitch") return "#9146FF";
  return platformAccent(platform).color;
}

export function bentoTilePaint(
  platform: LinkPlatform,
  theme: Pick<
    LinkInBioTheme,
    "bentoColorMode" | "paletteBg" | "paletteAccent" | "bentoCustomFill" | "bentoCustomAccent"
  >,
): BentoTilePaint {
  const brand = platformAccent(platform);
  const mode = sanitizeBentoColorMode(theme.bentoColorMode);
  const pageLight = hexLuminance(theme.paletteBg) > 0.45;
  const fill = themeSurface(pageLight);
  const ink = officialInk(platform, pageLight);
  const whiteIcons = mode === "glow";
  const monoIcons = mode === "mono";
  const glass = mode === "glass";
  const hairline = pageLight
    ? "1px solid color-mix(in oklab, #000000 12%, transparent)"
    : "1px solid color-mix(in oklab, #ffffff 12%, transparent)";
  const base = { onLight: pageLight, whiteIcons, monoIcons, glass } as const;

  if (mode === "mono") {
    return {
      ...base,
      fill: pageLight ? "#eceef1" : "#161616",
      ink: pageLight ? "#111111" : "#f5f5f5",
      border: pageLight ? "1px solid #cfd4da" : "1px solid rgba(255,255,255,0.14)",
      glowColor: pageLight ? "#6b7280" : "#d4d4d4",
      boxShadow: pageLight ? "0 10px 22px rgba(15,23,32,0.06)" : "0 14px 30px rgba(0,0,0,0.5)",
    };
  }

  if (mode === "gradient") {
    return {
      ...base,
      fill,
      wash: `linear-gradient(165deg, transparent 38%, color-mix(in oklab, ${brand.color} 16%, transparent) 100%)`,
      ink,
      border: hairline,
      glowColor: brand.color,
    };
  }

  if (mode === "glow") {
    return {
      ...base,
      fill,
      wash: `radial-gradient(120% 90% at 50% 120%, color-mix(in oklab, ${theme.paletteAccent} 18%, transparent), transparent 62%)`,
      ink,
      border: `1px solid color-mix(in oklab, ${theme.paletteAccent} 42%, transparent)`,
      glowColor: theme.paletteAccent,
      boxShadow: `inset 0 0 28px color-mix(in oklab, ${theme.paletteAccent} 16%, transparent), 0 14px 28px color-mix(in oklab, ${theme.paletteAccent} 22%, transparent)`,
    };
  }

  if (mode === "glass") {
    return {
      ...base,
      fill: pageLight ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.08)",
      wash: pageLight
        ? "linear-gradient(165deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.08) 46%, transparent 100%)"
        : "linear-gradient(165deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.03) 48%, transparent 100%)",
      ink,
      border: pageLight ? "1px solid rgba(255,255,255,0.78)" : "1px solid rgba(255,255,255,0.2)",
      glowColor: pageLight ? "#ffffff" : "#fafafa",
      boxShadow: pageLight
        ? "0 12px 40px rgba(15,23,32,0.08), inset 0 1px 0 rgba(255,255,255,0.92)"
        : "0 18px 48px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.18)",
      backdropFilter: "blur(24px) saturate(1.7)",
    };
  }

  if (mode === "custom") {
    const customFill = sanitizeHex(theme.bentoCustomFill, DEFAULT_THEME.bentoCustomFill);
    const accent = sanitizeHex(theme.bentoCustomAccent, DEFAULT_THEME.bentoCustomAccent);
    return {
      ...base,
      fill,
      wash: `color-mix(in oklab, ${customFill} 12%, transparent)`,
      ink,
      border: `1.5px solid color-mix(in oklab, ${accent} 55%, transparent)`,
      glowColor: accent,
      boxShadow: `inset 0 0 22px color-mix(in oklab, ${accent} 14%, transparent)`,
    };
  }

  return {
    ...base,
    fill,
    wash: `color-mix(in oklab, ${brand.color} 10%, transparent)`,
    ink,
    border: `1.5px solid color-mix(in oklab, ${brand.color} 58%, transparent)`,
    glowColor: brand.color,
    boxShadow: `inset 0 0 20px color-mix(in oklab, ${brand.color} 10%, transparent)`,
  };
}

export function sanitizeTheme(partial: Partial<LinkInBioTheme> | null | undefined): LinkInBioTheme {
  const src = partial ?? {};
  let paletteBg = migrateLegacyPaperBg(
    migrateLegacyDarkBg(
      sanitizeHex(src.paletteBg ?? DEFAULT_THEME.paletteBg, DEFAULT_THEME.paletteBg),
    ),
  );
  if (hexLuminance(paletteBg) > 0.45) paletteBg = "#f8f9fa";
  const darkPage = !isLightBioTheme(paletteBg);
  const paperPage = paletteBg.toLowerCase() === "#f8f9fa";
  let paletteFg = sanitizeHex(src.paletteFg ?? DEFAULT_THEME.paletteFg, DEFAULT_THEME.paletteFg);
  let paletteAccent = sanitizeHex(src.paletteAccent ?? DEFAULT_THEME.paletteAccent, DEFAULT_THEME.paletteAccent);
  let paletteMuted = sanitizeHex(src.paletteMuted ?? DEFAULT_THEME.paletteMuted, DEFAULT_THEME.paletteMuted);
  let bentoCustomFill = sanitizeHex(src.bentoCustomFill ?? DEFAULT_THEME.bentoCustomFill, DEFAULT_THEME.bentoCustomFill);
  let bentoCustomAccent = sanitizeHex(
    src.bentoCustomAccent ?? DEFAULT_THEME.bentoCustomAccent,
    DEFAULT_THEME.bentoCustomAccent,
  );
  if (darkPage) {
    if (paletteFg.toLowerCase() === "#f4f4f5") paletteFg = "#f5f5f5";
    if (paletteAccent.toLowerCase() === "#7c8cff") paletteAccent = "#e5e5e5";
    if (paletteMuted.toLowerCase() === "#a1a1aa") paletteMuted = "#a3a3a3";
    if (bentoCustomFill.toLowerCase() === "#1a1c24") bentoCustomFill = "#171717";
    if (bentoCustomAccent.toLowerCase() === "#7c8cff") bentoCustomAccent = "#e5e5e5";
  }
  if (paperPage) {
    if (LEGACY_PAPER_ACCENT.has(paletteAccent.toLowerCase())) paletteAccent = "#525252";
    if (paletteMuted.toLowerCase() === "#5c5c57") paletteMuted = "#6b6b6b";
  }
  return {
    glassIntensity: clampPercent(src.glassIntensity ?? DEFAULT_THEME.glassIntensity),
    hairlineBorders: Boolean(src.hairlineBorders ?? DEFAULT_THEME.hairlineBorders),
    glowStrength: clampPercent(src.glowStrength ?? DEFAULT_THEME.glowStrength),
    gradientStyle: "none",
    fontFamily: sanitizeFont(src.fontFamily ?? DEFAULT_THEME.fontFamily),
    fontCustomName: sanitizeFontCustomName(src.fontCustomName ?? DEFAULT_THEME.fontCustomName),
    fontCustomHref: sanitizeFontCustomHref(src.fontCustomHref ?? DEFAULT_THEME.fontCustomHref),
    paletteBg,
    paletteFg,
    paletteAccent,
    paletteMuted,
    surfaceStyle: sanitizeSurface(src.surfaceStyle ?? DEFAULT_THEME.surfaceStyle),
    bentoColorMode: sanitizeBentoColorMode(src.bentoColorMode ?? DEFAULT_THEME.bentoColorMode),
    bentoCustomFill,
    bentoCustomAccent,
    layout: sanitizeLayout(src.layout ?? DEFAULT_THEME.layout),
    defaultCardSize: sanitizeCardSize(src.defaultCardSize ?? DEFAULT_THEME.defaultCardSize),
    ambientEnabled: darkPage ? false : Boolean(src.ambientEnabled),
    ambientPreset: darkPage ? "none" : sanitizeAmbientPreset(src.ambientPreset ?? DEFAULT_THEME.ambientPreset),
    scheduleEnabled: Boolean(src.scheduleEnabled),
    widgetBannerUrl: sanitizeAvatarUrl(src.widgetBannerUrl ?? ""),
    countdownEnabled: Boolean(src.countdownEnabled),
    countdownLabel: sanitizeDisplayName(src.countdownLabel ?? DEFAULT_THEME.countdownLabel) || DEFAULT_THEME.countdownLabel,
    countdownEndsAt: sanitizeCountdownEndsAt(src.countdownEndsAt),
  };
}

export function sanitizeCountdownEndsAt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function sanitizeProfile(partial: Partial<LinkInBioProfile> | null | undefined): LinkInBioProfile {
  const src = partial ?? {};
  return {
    slug: sanitizeSlug(src.slug ?? ""),
    displayName: sanitizeDisplayName(src.displayName ?? ""),
    bio: sanitizeBio(src.bio ?? ""),
    avatarUrl: sanitizeAvatarUrl(src.avatarUrl ?? ""),
    headerUrl: sanitizeAvatarUrl(src.headerUrl ?? ""),
    published: Boolean(src.published),
    publishedAt: src.publishedAt ?? null,
    setupCompleted: Boolean(src.setupCompleted),
    usernameChangedAt: sanitizeTimestamp(src.usernameChangedAt),
  };
}

export function sanitizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").replace(/\s+/g, "").slice(0, 64);
}

export function sanitizeWhatsappCommunityUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^(\+|00)?[\d\s()-]{6,}$/.test(trimmed) || trimmed.toLowerCase().startsWith("tel:")) return "";
  const url = sanitizeLinkUrl(trimmed);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "chat.whatsapp.com") return parsed.pathname.replace(/\/+$/, "").length > 0 ? url : "";
    if (host === "whatsapp.com" && /^\/(channel|invite)\//i.test(parsed.pathname)) return url;
    return "";
  } catch {
    return "";
  }
}

export function instagramPostUrl(raw: string): string | null {
  const url = coerceHttpUrl(raw);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] && ["p", "reel", "reels", "tv"].includes(parts[0].toLowerCase()) && parts[1]) return url;
    return null;
  } catch {
    return null;
  }
}

export function tiktokVideoUrl(raw: string): string | null {
  const url = coerceHttpUrl(raw);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return parsed.pathname.length > 1 ? url : null;
    if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const videoAt = parts.findIndex((part) => part.toLowerCase() === "video");
    if (videoAt >= 0 && parts[videoAt + 1]) return url;
    if (parts[0]?.toLowerCase() === "t" && parts[1]) return url;
    return null;
  } catch {
    return null;
  }
}

export function twitterStatusUrl(raw: string): string | null {
  const url = coerceHttpUrl(raw);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)(twitter|x)\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const statusAt = parts.findIndex((part) => part.toLowerCase() === "status");
    if (statusAt >= 1 && parts[statusAt + 1]) return url;
    return null;
  } catch {
    return null;
  }
}

export function discordInviteCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const url = coerceHttpUrl(trimmed);
  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (host === "discord.gg") {
        const code = parts[0] ?? "";
        return /^[a-zA-Z0-9-]{2,64}$/.test(code) ? code : null;
      }
      if (host === "discord.com" || host === "discordapp.com") {
        const code = parts[0]?.toLowerCase() === "invite" ? (parts[1] ?? "") : (parts[0] ?? "");
        return /^[a-zA-Z0-9-]{2,64}$/.test(code) ? code : null;
      }
      return null;
    } catch {
      return null;
    }
  }
  return /^[a-zA-Z0-9-]{2,64}$/.test(trimmed) ? trimmed : null;
}

export function urlFromHandle(platform: LinkPlatform, handleOrUrl: string): string {
  if (platform === "whatsapp") return sanitizeWhatsappCommunityUrl(handleOrUrl);
  if (platform === "custom") {
    const asUrl = coerceHttpUrl(handleOrUrl);
    if (asUrl) return asUrl;
    const hostOnly = handleOrUrl.trim();
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(hostOnly)) return sanitizeLinkUrl(`https://${hostOnly}`);
    return "";
  }
  const asUrl = coerceHttpUrl(handleOrUrl);
  if (asUrl) return asUrl;
  const handle = sanitizeHandle(handleOrUrl);
  if (!handle) return "";
  return `${PLATFORM_HANDLE_PREFIX[platform]}${encodeURIComponent(handle)}`;
}

export function handleFromUrl(platform: LinkPlatform, url: string): string {
  if (usesFullUrl(platform)) return url;
  if (instagramPostUrl(url) || tiktokVideoUrl(url) || twitterStatusUrl(url)) return url;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (platform === "youtube" || platform === "tiktok") {
      const last = parts[parts.length - 1] ?? "";
      return decodeURIComponent(last).replace(/^@/, "");
    }
    if (platform === "discord") {
      return decodeURIComponent(parts[parts.length - 1] ?? "");
    }
    if (platform === "snapchat") {
      const first = parts[0] ?? "";
      if (first.toLowerCase() === "add" && parts[1]) {
        return decodeURIComponent(parts[1]).replace(/^@/, "");
      }
      return decodeURIComponent(first).replace(/^@/, "");
    }
    return decodeURIComponent(parts[0] ?? "");
  } catch {
    return "";
  }
}

export function publicSchedulePath(token: string): string {
  return `/overlay/schedule?token=${encodeURIComponent(token)}`;
}

export function kickUsernameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)kick\.com$/i.test(parsed.hostname)) return null;
    const part = parsed.pathname.split("/").filter(Boolean)[0];
    return part ? decodeURIComponent(part).toLowerCase() : null;
  } catch {
    return null;
  }
}

export function twitchUsernameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)twitch\.tv$/i.test(parsed.hostname)) return null;
    const part = parsed.pathname.split("/").filter(Boolean)[0];
    if (!part || ["videos", "directory", "p", "settings"].includes(part.toLowerCase())) return null;
    return decodeURIComponent(part).toLowerCase();
  } catch {
    return null;
  }
}

export type YoutubeTarget = { handle: string | null; channelId: string | null };

export function youtubeTargetFromUrl(url: string): YoutubeTarget | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const first = parts[0] ?? "";
    if (first.startsWith("@")) return { handle: first.slice(1), channelId: null };
    if (first === "channel" && parts[1]?.startsWith("UC")) return { handle: null, channelId: parts[1] };
    if (first === "c" && parts[1]) return { handle: parts[1], channelId: null };
    if (first === "user" && parts[1]) return { handle: parts[1], channelId: null };
    if (first === "watch" || first === "embed" || first === "shorts" || parsed.hostname.includes("youtu.be")) {
      return null;
    }
    return first ? { handle: first.replace(/^@/, ""), channelId: null } : null;
  } catch {
    return null;
  }
}

export function collectStreamTargets(state: LinkInBioState): {
  kickUsername: string | null;
  twitchUsername: string | null;
  youtube: YoutubeTarget | null;
  kickUrl: string | null;
  twitchUrl: string | null;
  youtubeUrl: string | null;
} {
  const kickFromLink = state.links.find((link) => link.enabled && (link.platform === "kick" || kickUsernameFromUrl(link.url)));
  const twitchFromLink = state.links.find(
    (link) => link.enabled && (link.platform === "twitch" || twitchUsernameFromUrl(link.url)),
  );
  const youtubeFromLink = state.links.find((link) => link.enabled && (link.platform === "youtube" || youtubeTargetFromUrl(link.url)));
  const kickUsername = state.kickUsername ?? (kickFromLink ? kickUsernameFromUrl(kickFromLink.url) : null);
  const twitchUsername = state.twitchUsername ?? (twitchFromLink ? twitchUsernameFromUrl(twitchFromLink.url) : null);
  const youtube = youtubeFromLink ? youtubeTargetFromUrl(youtubeFromLink.url) : null;
  return {
    kickUsername: kickUsername?.toLowerCase() ?? null,
    twitchUsername: twitchUsername?.toLowerCase() ?? null,
    youtube,
    kickUrl: kickUsername ? `https://kick.com/${encodeURIComponent(kickUsername)}` : (kickFromLink?.url ?? null),
    twitchUrl: twitchUsername ? `https://www.twitch.tv/${encodeURIComponent(twitchUsername)}` : (twitchFromLink?.url ?? null),
    youtubeUrl: youtubeFromLink?.url ?? null,
  };
}

export function resolveCardSize(link: Pick<LinkInBioLink, "cardSize">, theme: LinkInBioTheme): CardSize {
  return link.cardSize === "inherit" ? theme.defaultCardSize : link.cardSize;
}

const EMPTY_LIVE: LivePlatformFlags = { kick: false, twitch: false, youtube: false };

export function publicLinkInBioPayload(
  state: LinkInBioState,
  extras?: {
    stream?: StreamStatus | null;
    livePlatforms?: LivePlatformFlags;
    tilePreviews?: Partial<Record<LinkPlatform, LinkTilePreview>>;
  },
): PublicLinkInBio {
  const livePlatforms = extras?.livePlatforms ?? EMPTY_LIVE;
  return {
    profile: {
      slug: state.profile.slug,
      displayName: state.profile.displayName,
      bio: state.profile.bio,
      avatarUrl: state.profile.avatarUrl,
      headerUrl: state.profile.headerUrl,
    },
    theme: sanitizeTheme(state.theme),
    links: state.links
      .filter((link) => link.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((link) => ({
        id: link.id,
        title: link.title,
        url: link.url,
        platform: link.platform,
        cardSize: link.cardSize,
        featured: link.featured,
        kind: link.kind,
        gridX: link.gridX,
        gridY: link.gridY,
        colSpan: link.colSpan,
        rowSpan: link.rowSpan,
        galleryImages: link.galleryImages,
      })),
    kickLive: livePlatforms.kick,
    stream: extras?.stream ?? null,
    livePlatforms,
    tilePreviews: extras?.tilePreviews ?? {},
    schedule:
      state.theme.scheduleEnabled && state.scheduleShareToken
        ? {
            title: state.scheduleTitle || "Stream schedule",
            url: publicSchedulePath(state.scheduleShareToken),
          }
        : null,
  };
}

function emptyState(): LinkInBioState {
  return {
    profile: { ...DEFAULT_PROFILE },
    theme: { ...DEFAULT_THEME },
    links: [],
    kickUsername: null,
    twitchUsername: null,
    scheduleShareToken: null,
    scheduleTitle: null,
  };
}

export function loadTestLinkInBio(): LinkInBioState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(LINK_IN_BIO_TEST_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LinkInBioState>;
    const links = Array.isArray(parsed.links) ? parsed.links : [];
    return {
      profile: sanitizeProfile({
        ...parsed.profile,
        setupCompleted:
          Boolean(parsed.profile?.setupCompleted) ||
          Boolean(parsed.profile?.published) ||
          Boolean(parsed.profile?.slug && (parsed.profile.displayName || links.length)),
      }),
      theme: sanitizeTheme(parsed.theme),
      kickUsername: typeof parsed.kickUsername === "string" ? parsed.kickUsername : null,
      twitchUsername: typeof parsed.twitchUsername === "string" ? parsed.twitchUsername : null,
      scheduleShareToken: typeof parsed.scheduleShareToken === "string" ? parsed.scheduleShareToken : null,
      scheduleTitle: typeof parsed.scheduleTitle === "string" ? parsed.scheduleTitle : null,
      links: links
        .filter((link): link is LinkInBioLink => Boolean(link && typeof link === "object" && "id" in link))
        .map((link, index) => normalizeLink(link, index))
        .filter((link) => (link.kind === "gallery" ? link.galleryImages.length > 0 || Boolean(link.title) : Boolean(link.title && link.url))),
    };
  } catch {
    return emptyState();
  }
}

export function saveTestLinkInBio(state: LinkInBioState): void {
  window.localStorage.setItem(LINK_IN_BIO_TEST_KEY, JSON.stringify(state));
  if (state.profile.slug) rememberTestSlug(state.profile.slug);
}

export function loadTestTakenSlugs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LINK_IN_BIO_SLUG_LIST_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function rememberTestSlug(slug: string): void {
  const next = Array.from(new Set([...loadTestTakenSlugs(), sanitizeSlug(slug)].filter(Boolean)));
  window.localStorage.setItem(LINK_IN_BIO_SLUG_LIST_KEY, JSON.stringify(next));
}

export function checkTestSlugAvailable(slug: string, ownSlug: string): { available: boolean; error: string | null } {
  const normalized = sanitizeSlug(slug);
  const error = slugError(normalized);
  if (error) return { available: false, error };
  if (normalized === sanitizeSlug(ownSlug)) return { available: true, error: null };
  if (loadTestTakenSlugs().includes(normalized)) return { available: false, error: "slug_taken" };
  return { available: true, error: null };
}

export function replaceTestLinks(inputs: LinkInBioLinkInput[]): LinkInBioState {
  const state = loadTestLinkInBio();
  const now = new Date().toISOString();
  const links: LinkInBioLink[] = inputs
    .map((input, index) => {
      const kind = sanitizeKind(input.kind ?? "link");
      const title = sanitizeDisplayName(input.title) || (kind === "gallery" ? "Gallery" : "");
      const url = kind === "gallery" ? sanitizeLinkUrl(input.url) : sanitizeLinkUrl(input.url);
      if (!title) return null;
      if (kind === "link" && !url) return null;
      return normalizeLink(
        {
          id: input.id && state.links.some((link) => link.id === input.id) ? input.id : crypto.randomUUID(),
          title,
          url,
          platform: input.platform,
          cardSize: input.cardSize ?? "inherit",
          featured: input.featured,
          enabled: input.enabled,
          kind,
          gridX: input.gridX,
          gridY: input.gridY,
          colSpan: sanitizeColSpan(input.colSpan),
          rowSpan: sanitizeRowSpan(input.rowSpan),
          galleryImages: input.galleryImages,
          createdAt: now,
          updatedAt: now,
        },
        index,
      );
    })
    .filter((link): link is LinkInBioLink => Boolean(link));
  const saved = { ...state, links };
  saveTestLinkInBio(saved);
  return saved;
}

export function upsertTestLink(input: LinkInBioLinkInput): LinkInBioState | { error: string } {
  const kind = sanitizeKind(input.kind ?? "link");
  const title = sanitizeDisplayName(input.title) || (kind === "gallery" ? "Gallery" : "");
  const url = sanitizeLinkUrl(input.url);
  if (!title) return { error: "title_required" };
  if (kind === "link" && !url) return { error: "url_invalid" };
  const state = loadTestLinkInBio();
  const now = new Date().toISOString();
  if (input.id) {
    const next = state.links.map((link) =>
      link.id === input.id
        ? normalizeLink(
            {
              ...link,
              title,
              url,
              platform: input.platform,
              cardSize: input.cardSize,
              featured: input.featured,
              enabled: input.enabled,
              kind,
              gridX: input.gridX ?? link.gridX,
              gridY: input.gridY ?? link.gridY,
              colSpan: sanitizeColSpan(input.colSpan ?? link.colSpan),
              rowSpan: sanitizeRowSpan(input.rowSpan ?? link.rowSpan),
              galleryImages: input.galleryImages ?? link.galleryImages,
              updatedAt: now,
            },
            link.sortOrder,
          )
        : link,
    );
    const saved = { ...state, links: next };
    saveTestLinkInBio(saved);
    return saved;
  }
  const created = normalizeLink(
    {
      id: crypto.randomUUID(),
      title,
      url,
      platform: input.platform,
      cardSize: input.cardSize,
      featured: input.featured,
      enabled: input.enabled,
      kind,
      gridX: input.gridX,
      gridY: input.gridY,
      colSpan: sanitizeColSpan(input.colSpan),
      rowSpan: sanitizeRowSpan(input.rowSpan),
      galleryImages: input.galleryImages,
      createdAt: now,
      updatedAt: now,
    },
    state.links.length,
  );
  const saved = { ...state, links: [...state.links, created] };
  saveTestLinkInBio(saved);
  return saved;
}

export function deleteTestLink(id: string): LinkInBioState {
  const state = loadTestLinkInBio();
  const saved = {
    ...state,
    links: state.links.filter((link) => link.id !== id).map((link, index) => ({ ...link, sortOrder: index })),
  };
  saveTestLinkInBio(saved);
  return saved;
}

export function reorderTestLinks(ids: string[]): LinkInBioState {
  const state = loadTestLinkInBio();
  const byId = new Map(state.links.map((link) => [link.id, link]));
  const ordered = ids.map((id) => byId.get(id)).filter((link): link is LinkInBioLink => Boolean(link));
  const rest = state.links.filter((link) => !ids.includes(link.id));
  const saved = {
    ...state,
    links: [...ordered, ...rest].map((link, index) => ({ ...link, sortOrder: index })),
  };
  saveTestLinkInBio(saved);
  return saved;
}

export async function compressBannerFile(file: File): Promise<string> {
  return compressImageFile(file, 960, 360);
}

export async function compressAvatarFile(file: File): Promise<string> {
  return compressImageFile(file, 320, 320);
}

export async function compressGalleryFile(file: File): Promise<string> {
  return compressImageFile(file, 720, 720);
}

async function compressImageFile(file: File, width: number, height: number): Promise<string> {
  if (!file.type.startsWith("image/")) return "";
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const srcRatio = bitmap.width / bitmap.height;
    const destRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (srcRatio > destRatio) {
      sw = bitmap.height * destRatio;
      sx = (bitmap.width - sw) / 2;
    } else {
      sh = bitmap.width / destRatio;
      sy = (bitmap.height - sh) / 2;
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    bitmap.close();
    let quality = 0.82;
    let url = canvas.toDataURL("image/jpeg", quality);
    while (url.length > AVATAR_MAX && quality > 0.4) {
      quality -= 0.1;
      url = canvas.toDataURL("image/jpeg", quality);
    }
    return url.length > AVATAR_MAX ? "" : url;
  } catch {
    return "";
  }
}
