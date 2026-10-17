/** Alert schema and validation shared by the authenticated studio and OBS renderer. */

export const ALERT_ACCENT = "#bee1fc";
export const FREE_MEDIA_BYTES = 5 * 1024 * 1024;
export const PRO_MEDIA_BYTES = 60 * 1024 * 1024;
export const ALERT_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Cairo:wght@600;700&family=Tajawal:wght@500;700&display=swap";

export type AlertPlan = "free" | "pro";
export type AlertPlatform = "KICK" | "TWITCH";
export type AlertKind =
  | "follow"
  | "subscription"
  | "resubscription"
  | "gift"
  | "gift-bomb"
  | "raid"
  | "donation"
  | "host"
  | "cheer"
  | "kicks";
export type MediaSlot = "visual" | "audio";
export type AlertMediaSource = "upload" | "url" | "none";
export type AlertLayout = "stack" | "media-start" | "media-end" | "text" | "overlap";
export type AlertEnter = "fade" | "rise" | "pop" | "slide";
export type AlertExit = "fade" | "drop" | "pop";
export type AlertTextMotion = "none" | "wiggle" | "pulse";
export type AlertTts = "none" | "browser";
export type SupportLevel = "webhook" | "partial" | "derived" | "unavailable";

export type PlatformSupport = {
  level: SupportLevel;
  badge: string;
  note: string;
};

export type AlertDefinition = {
  id: AlertKind;
  title: string;
  detail: string;
  defaultMessage: string;
  kick: PlatformSupport;
  twitch: PlatformSupport;
};

export const ALERT_KINDS: AlertKind[] = [
  "follow",
  "subscription",
  "resubscription",
  "gift",
  "gift-bomb",
  "raid",
  "donation",
  "host",
  "cheer",
  "kicks",
];

const webhook = (note: string): PlatformSupport => ({
  level: "webhook",
  badge: "ويب هوك موجود",
  note,
});
const partial = (note: string): PlatformSupport => ({
  level: "partial",
  badge: "غير موصول كتنبيه",
  note,
});
const derived = (note: string): PlatformSupport => ({
  level: "derived",
  badge: "يُشتق من العدد",
  note,
});
const unavailable = (note: string): PlatformSupport => ({
  level: "unavailable",
  badge: "غير مدعوم",
  note,
});
const simulated = (note: string): PlatformSupport => ({
  level: "partial",
  badge: "محاكاة",
  note,
});

export const ALERT_CATALOG: AlertDefinition[] = [
  {
    id: "follow",
    title: "New Follow",
    detail: "New Follow",
    defaultMessage: "{username} تابع القناة",
    kick: webhook("Kick يشترك في channel.followed ويحفظه كمتابعة."),
    twitch: webhook("Twitch يشترك في channel.follow ويحفظه كمتابعة."),
  },
  {
    id: "subscription",
    title: "New Subscription",
    detail: "New Subscription",
    defaultMessage: "{username} اشترك في القناة",
    kick: webhook("Kick يشترك في channel.subscription.new ويحفظه كاشتراك."),
    twitch: webhook("Twitch يشترك في channel.subscribe ويحفظه كاشتراك."),
  },
  {
    id: "resubscription",
    title: "Resubscription",
    detail: "Resubscription",
    defaultMessage: "{username} جدّد اشتراكه منذ {months} شهر",
    kick: partial("channel.subscription.renewal يصل، ويُحفظ اليوم كاشتراك عادي لا كتنبيه مستقل."),
    twitch: partial(
      "channel.subscription.message يصل ثم يُتجاهل في الحفظ، لذلك التجديد غير موصول كتنبيه.",
    ),
  },
  {
    id: "gift",
    title: "Gifted Subs",
    detail: "Gifted Subscription",
    defaultMessage: "{username} أهدى {count} اشتراك",
    kick: webhook("Kick يشترك في channel.subscription.gifts ويحفظ العدد."),
    twitch: webhook("Twitch يشترك في channel.subscription.gift ويحفظ العدد."),
  },
  {
    id: "gift-bomb",
    title: "قنبلة هدايا",
    detail: "Gift Bomb",
    defaultMessage: "{username} أطلق قنبلة من {count} اشتراك",
    kick: derived("ليس حدثًا مستقلًا. يظهر عندما يتجاوز عدد هدايا Kick حد القنبلة."),
    twitch: derived("ليس حدثًا مستقلًا. يظهر عندما يتجاوز total في هدية Twitch حد القنبلة."),
  },
  {
    id: "raid",
    title: "Raid",
    detail: "Raid",
    defaultMessage: "{username} عمل ريد بـ {count} مشاهد",
    kick: simulated("Raid تجريبي فقط؛ لا يوجد استقبال أحداث Raid حقيقية من Kick هنا."),
    twitch: partial("channel.raid مشترك ويُحفظ، لكن عدد المشاهدين غير ممرر في الحفظ الحالي."),
  },
  {
    id: "donation",
    title: "تبرع",
    detail: "Donation",
    defaultMessage: "{username} تبرع بـ {count}",
    kick: simulated("محاكاة فقط. لا يوجد تسليم تبرع مباشر من Kick في هذه الصفحة."),
    twitch: simulated("محاكاة فقط. تبرعات Twitch لا تصل من EventSub في هذه الصفحة."),
  },
  {
    id: "host",
    title: "رد",
    detail: "Host",
    defaultMessage: "{username} أرسل ردًا",
    kick: simulated("محاكاة فقط. لا يوجد حدث رد مربوط في هذه الصفحة."),
    twitch: simulated("محاكاة فقط. لا يوجد حدث رد مربوط في هذه الصفحة."),
  },
  {
    id: "cheer",
    title: "Cheer / Bits",
    detail: "Cheer / Bits",
    defaultMessage: "{username} أرسل {count} Bits",
    kick: unavailable("Kick لا يرسل Cheer. حدث Kicks مختلف وغير مربوط في هذه الصفحة."),
    twitch: webhook("Twitch يشترك في channel.cheer ويحفظ عدد Bits."),
  },
  {
    id: "kicks",
    title: "KICKs",
    detail: "KICKs",
    defaultMessage: "{username} أرسل {amount} KICKs!",
    kick: simulated("تنبيه تجريبي لـ Kick فقط. لا يوجد ربط أحداث KICKs حقيقي في هذا الإصدار."),
    twitch: unavailable("KICKs خاصة بمنصة Kick وليست Bits الخاصة بـ Twitch."),
  },
];

export const ALERT_FONTS = [
  { id: "Saudi, sans-serif", label: "Saudi — سعودي" },
  { id: "Cairo, sans-serif", label: "Cairo" },
  { id: "Tajawal, sans-serif", label: "Tajawal" },
  { id: "'IBM Plex Sans Arabic', sans-serif", label: "IBM Plex Sans Arabic" },
] as const;

export type AlertConfig = {
  style: "classic" | "compact";
  hideUserMessage: boolean;
  textStartMs: number;
  textEndMs: number;
  customCode: AlertCustomCode;
  variations: AlertVariation[];
  enabled: boolean;
  message: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  secondaryColor: string;
  textShadow: number;
  offsetX: number;
  offsetY: number;
  textMotion: AlertTextMotion;
  tts: AlertTts;
  imageSize: number;
  layout: AlertLayout;
  durationMs: number;
  enter: AlertEnter;
  exit: AlertExit;
  volume: number;
  delayMs: number;
  minCount: number;
  /** Direct HTTPS media URL. Loaded by the viewer only; the server never fetches it. */
  visualUrl: string;
  audioUrl: string;
  visualSource: AlertMediaSource;
  audioSource: AlertMediaSource;
};

export type AlertCustomCode = {
  enabled: boolean;
  html: string;
  javascript: string;
  css: string;
  fields: string;
};
export type AlertVariation = {
  id: string;
  name: string;
  condition: "random" | "min-count" | "min-months" | "min-amount";
  threshold: number;
  config: AlertConfig;
};

export type MediaAsset = {
  variationId?: string | undefined;
  id: string;
  platform: AlertPlatform;
  alertId: AlertKind;
  slot: MediaSlot;
  name: string;
  bytes: number;
  mime: string;
  ext: string;
};

export type AlertSimulation = {
  username: string;
  platform: AlertPlatform;
  count: number;
  months: number;
  amount?: number | undefined;
  message?: string | undefined;
};

export type AlertStudioState = {
  plan: AlertPlan;
  token: string;
  limitBytes: number;
  overlaySeenAt: number;
  simulation: AlertSimulation;
  alerts: PlatformAlerts;
  media: MediaAsset[];
};

export type AlertEvent = {
  variationId?: string | undefined;
  amount?: number | undefined;
  message?: string | undefined;
  id: string;
  alertId: AlertKind;
  platform: AlertPlatform;
  username: string;
  count: number;
  months: number;
  text: string;
  config: AlertConfig;
  visualId: string | null;
  visualMime: string | null;
  visualUrl?: string | undefined;
  audioId: string | null;
  createdAt: number;
};

const LAYOUTS: AlertLayout[] = ["stack", "media-start", "media-end", "text", "overlap"];
const MOTIONS: AlertTextMotion[] = ["none", "wiggle", "pulse"];
const TTS: AlertTts[] = ["none", "browser"];

export const ALERT_TEMPLATES = [
  { id: "classic", label: "كلاسيكي", layout: "stack", enter: "rise", fontSize: 42 },
  { id: "banner", label: "شريط", layout: "media-start", enter: "slide", fontSize: 32 },
  { id: "text", label: "نص فقط", layout: "text", enter: "fade", fontSize: 48 },
] as const;

export type PlatformAlerts = Record<AlertPlatform, Record<AlertKind, AlertConfig>>;
const ENTERS: AlertEnter[] = ["fade", "rise", "pop", "slide"];
const EXITS: AlertExit[] = ["fade", "drop", "pop"];

export function alertDefinition(id: string): AlertDefinition | null {
  return ALERT_CATALOG.find((item) => item.id === id) ?? null;
}

export function mediaLimit(plan: AlertPlan): number {
  return plan === "pro" ? PRO_MEDIA_BYTES : FREE_MEDIA_BYTES;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function supportFor(definition: AlertDefinition, platform: AlertPlatform): PlatformSupport {
  return platform === "KICK" ? definition.kick : definition.twitch;
}

export function visibleOnPlatform(
  definition: AlertDefinition,
  platform: "ALL" | AlertPlatform,
): boolean {
  if (platform === "ALL")
    return definition.kick.level !== "unavailable" || definition.twitch.level !== "unavailable";
  return supportFor(definition, platform).level !== "unavailable";
}

export function renderAlertText(
  template: string,
  vars: {
    username: string;
    count: number;
    months: number;
    amount?: number | undefined;
    message?: string | undefined;
  },
): string {
  const username =
    vars.username
      .replace(/[\u0000-\u001f<>]/g, "")
      .trim()
      .slice(0, 40) || "مشاهد";
  return template
    .replaceAll("{username}", username)
    .replaceAll("{name}", username)
    .replaceAll("{count}", String(vars.count))
    .replaceAll("{months}", String(vars.months))
    .replaceAll("{amount}", String(vars.amount ?? vars.count))
    .replaceAll("{message}", (vars.message ?? "").replace(/[\u0000-\u001f<>]/g, "").slice(0, 180));
}

export function defaultConfig(definition: AlertDefinition): AlertConfig {
  return {
    style: "classic",
    hideUserMessage: false,
    textStartMs: 0,
    textEndMs: 6000,
    customCode: {
      enabled: false,
      html: '<div class="alert">{username}</div>',
      javascript: "// تشغيل الكود المخصص غير مفعل في الوصول المبكر.\n",
      css: ".alert { color: #bee1fc; }",
      fields: '{\n  "title": "مرحبًا بالمشاهد"\n}',
    },
    variations: [],
    enabled: definition.kick.level !== "unavailable" || definition.twitch.level !== "unavailable",
    message: definition.defaultMessage,
    fontFamily: ALERT_FONTS[0].id,
    fontSize: 42,
    textColor: "#ffffff",
    secondaryColor: ALERT_ACCENT,
    textShadow: 0,
    offsetX: 0,
    offsetY: 0,
    textMotion: "none",
    tts: "none",
    imageSize: 180,
    layout: "stack",
    durationMs: 6000,
    enter: "rise",
    exit: "fade",
    volume: 80,
    delayMs: 0,
    minCount: definition.id === "gift-bomb" ? 5 : 1,
    visualUrl: "",
    audioUrl: "",
    visualSource: "upload",
    audioSource: "upload",
  };
}

export function defaultSimulation(): AlertSimulation {
  return { username: "CreovixFan", platform: "KICK", count: 5, months: 3 };
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function hexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export function normalizeConfig(
  raw: unknown,
  definition: AlertDefinition,
  includeVariations = true,
): AlertConfig {
  const base = defaultConfig(definition);
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const color = hexColor(record["textColor"], base.textColor);
  const secondaryColor = hexColor(
    record["secondaryColor"] === "#ffd7d4" ? base.secondaryColor : record["secondaryColor"],
    base.secondaryColor,
  );
  const message =
    typeof record["message"] === "string"
      ? record["message"].replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 180)
      : base.message;
  const durationMs = clamp(Number(record["durationMs"]), 1000, 30000, base.durationMs);
  const textStartMs = clamp(Number(record["textStartMs"]), 0, durationMs - 50, 0);
  const code =
    record["customCode"] && typeof record["customCode"] === "object"
      ? (record["customCode"] as Record<string, unknown>)
      : {};
  const codeText = (key: "html" | "javascript" | "css" | "fields") =>
    typeof code[key] === "string" ? code[key].slice(0, 50000) : base.customCode[key];
  const ids = new Set<string>();
  const variations: AlertVariation[] =
    includeVariations && Array.isArray(record["variations"])
      ? record["variations"].slice(0, 20).flatMap((item): AlertVariation[] => {
          if (!item || typeof item !== "object" || !isVariationId(item.id) || ids.has(item.id))
            return [];
          ids.add(item.id);
          return [
            {
              id: item.id,
              name: typeof item.name === "string" ? item.name.slice(0, 60) : "تنويعة",
              condition: pick(
                item.condition,
                ["random", "min-count", "min-months", "min-amount"] as const,
                "random",
              ),
              threshold: clamp(Number(item.threshold), 1, 100000, 1),
              config: normalizeConfig(item.config, definition, false),
            },
          ];
        })
      : [];
  return {
    style: pick(record["style"], ["classic", "compact"] as const, base.style),
    hideUserMessage: record["hideUserMessage"] === true,
    textStartMs,
    textEndMs: clamp(Number(record["textEndMs"]), textStartMs + 50, durationMs, durationMs),
    customCode: {
      enabled: code["enabled"] === true,
      html: codeText("html"),
      javascript: codeText("javascript"),
      css: codeText("css"),
      fields: codeText("fields"),
    },
    variations,
    enabled: record["enabled"] !== false,
    message: message.trim() || base.message,
    fontFamily: ALERT_FONTS.some((font) => font.id === record["fontFamily"])
      ? String(record["fontFamily"])
      : base.fontFamily,
    fontSize: clamp(Number(record["fontSize"]), 16, 96, base.fontSize),
    textColor: color,
    secondaryColor,
    textShadow: clamp(Number(record["textShadow"]), 0, 100, base.textShadow),
    offsetX: clamp(Number(record["offsetX"]), -240, 240, base.offsetX),
    offsetY: clamp(Number(record["offsetY"]), -240, 240, base.offsetY),
    textMotion: pick(record["textMotion"], MOTIONS, base.textMotion),
    tts: pick(record["tts"], TTS, base.tts),
    imageSize: clamp(Number(record["imageSize"]), 48, 480, base.imageSize),
    layout: pick(record["layout"], LAYOUTS, base.layout),
    durationMs,
    enter: pick(record["enter"], ENTERS, base.enter),
    exit: pick(record["exit"], EXITS, base.exit),
    volume: clamp(Number(record["volume"]), 0, 100, base.volume),
    delayMs: clamp(Number(record["delayMs"]), 0, 10000, base.delayMs),
    minCount: clamp(Number(record["minCount"]), 1, 500, base.minCount),
    visualUrl: normalizeAlertMediaUrl(record["visualUrl"], "visual"),
    audioUrl: normalizeAlertMediaUrl(record["audioUrl"], "audio"),
    visualSource: pick(
      record["visualSource"],
      ["upload", "url", "none"] as const,
      record["visualUrl"] ? "url" : "upload",
    ),
    audioSource: pick(
      record["audioSource"],
      ["upload", "url", "none"] as const,
      record["audioUrl"] ? "url" : "upload",
    ),
  };
}

export function normalizeSimulation(raw: unknown): AlertSimulation {
  const base = defaultSimulation();
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const platform = record["platform"] === "TWITCH" ? "TWITCH" : "KICK";
  const username =
    typeof record["username"] === "string"
      ? record["username"]
          .replace(/[\u0000-\u001f<>]/g, "")
          .trim()
          .slice(0, 40)
      : base.username;
  return {
    username: username || base.username,
    platform,
    count: clamp(Number(record["count"]), 1, 100000, base.count),
    months: clamp(Number(record["months"]), 1, 36, base.months),
    amount: clamp(Number(record["amount"]), 1, 100000, 25),
    message:
      typeof record["message"] === "string"
        ? record["message"].replace(/[\u0000-\u001f<>]/g, "").slice(0, 180)
        : "بث جميل، استمر!",
  };
}

export function isVariationId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export function selectAlertVariation(
  config: AlertConfig,
  simulation: AlertSimulation,
  random = Math.random,
): AlertVariation | null {
  const active = config.variations.filter((item) => item.config.enabled);
  const matched = active.filter(
    (item) =>
      item.condition !== "random" &&
      (item.condition === "min-count"
        ? simulation.count
        : item.condition === "min-months"
          ? simulation.months
          : (simulation.amount ?? simulation.count)) >= item.threshold,
  );
  if (matched.length) return matched.sort((a, b) => b.threshold - a.threshold)[0] ?? null;
  const pool = active.filter((item) => item.condition === "random");
  return pool.length
    ? (pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? null)
    : null;
}

export function emptyAlerts(): Record<AlertKind, AlertConfig> {
  return Object.fromEntries(
    ALERT_CATALOG.map((definition) => [definition.id, defaultConfig(definition)]),
  ) as Record<AlertKind, AlertConfig>;
}

export function emptyPlatformAlerts(): PlatformAlerts {
  return { KICK: emptyAlerts(), TWITCH: emptyAlerts() };
}

export function normalizePlatformAlerts(raw: unknown): PlatformAlerts {
  const next = emptyPlatformAlerts();
  if (!raw || typeof raw !== "object") return applyAvailability(next);
  const record = raw as Record<string, unknown>;
  const legacy = record["follow"] != null && record["KICK"] == null && record["TWITCH"] == null;
  if (legacy) {
    for (const platform of ["KICK", "TWITCH"] as const) {
      for (const definition of ALERT_CATALOG) {
        const source = record[definition.id];
        const config = normalizeConfig(source, definition);
        const flag =
          source && typeof source === "object"
            ? (source as Record<string, unknown>)[platform === "KICK" ? "kick" : "twitch"]
            : undefined;
        if (flag === false) config.enabled = false;
        next[platform][definition.id] = config;
      }
    }
    return applyAvailability(next);
  }
  for (const platform of ["KICK", "TWITCH"] as const) {
    const group = record[platform];
    const source = group && typeof group === "object" ? (group as Record<string, unknown>) : {};
    for (const definition of ALERT_CATALOG) {
      next[platform][definition.id] = normalizeConfig(source[definition.id], definition);
    }
  }
  return applyAvailability(next);
}

function applyAvailability(alerts: PlatformAlerts): PlatformAlerts {
  for (const platform of ["KICK", "TWITCH"] as const) {
    for (const definition of ALERT_CATALOG) {
      if (supportFor(definition, platform).level === "unavailable")
        alerts[platform][definition.id].enabled = false;
    }
  }
  return alerts;
}

export function isAlertToken(value: string): boolean {
  return /^alerts-[a-f0-9]{64}$/.test(value);
}

const VISUAL = new Set(["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm"]);
const AUDIO = new Set(["mp3", "wav", "ogg"]);

function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

function has(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function textAt(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let index = 0; index < length && offset + index < bytes.length; index += 1) {
    out += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return out;
}

export function detectMedia(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (has(bytes, [0x89, 0x50, 0x4e, 0x47])) return { mime: "image/png", ext: "png" };
  if (has(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (textAt(bytes, 0, 6) === "GIF87a" || textAt(bytes, 0, 6) === "GIF89a")
    return { mime: "image/gif", ext: "gif" };
  if (textAt(bytes, 0, 4) === "RIFF" && textAt(bytes, 8, 4) === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  if (textAt(bytes, 0, 4) === "RIFF" && textAt(bytes, 8, 4) === "WAVE")
    return { mime: "audio/wav", ext: "wav" };
  if (textAt(bytes, 0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  if (has(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "video/webm", ext: "webm" };
  if (textAt(bytes, 4, 4) === "ftyp") return { mime: "video/mp4", ext: "mp4" };
  if (
    textAt(bytes, 0, 3) === "ID3" ||
    (bytes.length > 1 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
  ) {
    return { mime: "audio/mpeg", ext: "mp3" };
  }
  return null;
}

export function inspectUpload(
  bytes: Uint8Array,
  filename: string,
  slot: MediaSlot,
  plan: AlertPlan,
): { ok: true; mime: string; ext: string } | { ok: false; message: string } {
  const limit = mediaLimit(plan);
  if (bytes.byteLength === 0) return { ok: false, message: "الملف فارغ." };
  if (bytes.byteLength > limit) {
    const planName = plan === "pro" ? "Pro" : "المجانية";
    return {
      ok: false,
      message: `حجم الملف ${formatBytes(bytes.byteLength)} يتجاوز حد الخطة ${planName} (${formatBytes(limit)}).`,
    };
  }
  const claimed = extensionOf(filename);
  const allowed = slot === "visual" ? VISUAL : AUDIO;
  if (!allowed.has(claimed)) {
    return {
      ok: false,
      message:
        slot === "visual"
          ? "صيغة الصورة أو الفيديو غير مدعومة. المسموح: PNG, JPG, JPEG, WEBP, GIF, MP4, WEBM."
          : "صيغة الصوت غير مدعومة. المسموح: MP3, WAV, OGG.",
    };
  }
  const detected = detectMedia(bytes);
  if (!detected || !allowed.has(detected.ext)) {
    return { ok: false, message: "محتوى الملف لا يطابق صيغة مدعومة." };
  }
  const same = claimed === detected.ext || (claimed === "jpeg" && detected.ext === "jpg");
  if (!same) return { ok: false, message: "امتداد الملف لا يطابق محتواه." };
  return { ok: true, mime: detected.mime, ext: detected.ext };
}

/** Archived types remain in storage and exports, but are not selectable or played. */
export function selectableAlert(definition: AlertDefinition, platform: AlertPlatform): boolean {
  return (
    !["gift-bomb", "donation", "host"].includes(definition.id) &&
    supportFor(definition, platform).level !== "unavailable"
  );
}

/** No server fetch. Reject credentials, local/IP hosts and non-media URLs before rendering. */
export function normalizeAlertMediaUrl(raw: unknown, slot: MediaSlot): string {
  if (typeof raw !== "string" || raw.length > 2048 || !raw.trim()) return "";
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      return "";
    if (
      !host.includes(".") ||
      host.includes(":") ||
      host.includes("[") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host)
    )
      return "";
    if (/(^|\.)(localhost|local|internal|lan|test|invalid)$/.test(host)) return "";
    if (!/^[a-z0-9.-]+$/.test(host)) return "";
    const ext = extensionOf(decodeURIComponent(url.pathname));
    if (!(slot === "visual" ? VISUAL : AUDIO).has(ext)) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function alertUrlIsVideo(url: string): boolean {
  try {
    return /\.(mp4|webm)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
