import { blankCommandTemplate, renderCommandTemplate } from "@/lib/commandTemplate";
import { type CommandMinRole, isCommandMinRole } from "@/lib/commandAccess";
import type { ChatCommandPlatform } from "@/lib/customCommands";
import { messageStartsWithTrigger } from "@/lib/messageStartsWithTrigger";

export const DEFAULT_COMMAND_IDS = [
  "addcom",
  "commands",
  "delcom",
  "editcom",
  "followage",
  "level",
  "points",
  "points_add",
  "promo",
  "shop",
] as const;
export type DefaultCommandId = (typeof DEFAULT_COMMAND_IDS)[number];

/** Still executed, but not shown in the default-command settings list. */
export const LEGACY_COMMAND_IDS = ["lurk", "so", "welcome"] as const;
export type LegacyCommandId = (typeof LEGACY_COMMAND_IDS)[number];
export type RuntimeCommandId = DefaultCommandId | LegacyCommandId;

export const RESERVED_COMMAND_NAMES: readonly string[] = [
  "addcom",
  "commands",
  "delcom",
  "editcom",
  "followage",
  "level",
  "points",
  "promo",
  "shop",
  "lurk",
  "so",
  "welcome",
];

const TEST_KEY = "creovix:default-commands";

export type DefaultCommand = {
  id: RuntimeCommandId;
  trigger: string;
  enabled: boolean;
  response: string;
  fallbackResponse: string;
  platforms: ChatCommandPlatform[];
  cooldownSeconds: number;
  minRole: CommandMinRole;
  /** False for settings-only rows that do not have a chat handler yet. */
  runsInChat: boolean;
  updatedAt: string;
};

export type DefaultCommandInput = {
  id: DefaultCommandId;
  enabled: boolean;
  response: string;
  fallbackResponse: string;
  platforms: ChatCommandPlatform[];
  cooldownSeconds: number;
  minRole: CommandMinRole;
};

type CatalogEntry = {
  id: RuntimeCommandId;
  trigger: string;
  response: { en: string; ar: string };
  fallbackResponse: { en: string; ar: string };
  minRole: CommandMinRole;
  runsInChat: boolean;
};

const FOLLOWAGE_RESPONSE =
  "$(username) لا يتابع هذه القناة حتى الآن.\n$(username) يتابع هذه القناة لـ $(time) !";
const POINTS_RESPONSE =
  "$(username) ليس لديك ما يكفي من النقاط للقيام بذلك.\n$(username) لديه نقاط $(points) .";

const CATALOG: CatalogEntry[] = [
  {
    id: "addcom",
    trigger: "!addcom",
    response: { en: "يتيح لك إنشاء أمر مباشرة من الدردشة", ar: "يتيح لك إنشاء أمر مباشرة من الدردشة" },
    fallbackResponse: { en: "", ar: "" },
    minRole: "moderator",
    runsInChat: false,
  },
  {
    id: "commands",
    trigger: "!commands",
    response: { en: "$(url) :قائمة الأوامر", ar: "$(url) :قائمة الأوامر" },
    fallbackResponse: { en: "", ar: "" },
    minRole: "everyone",
    runsInChat: true,
  },
  {
    id: "delcom",
    trigger: "!delcom",
    response: { en: "يتيح لك حذف أمر مباشرة من الدردشة", ar: "يتيح لك حذف أمر مباشرة من الدردشة" },
    fallbackResponse: { en: "", ar: "" },
    minRole: "moderator",
    runsInChat: false,
  },
  {
    id: "editcom",
    trigger: "!editcom",
    response: { en: "يتيح لك تعديل أمر مباشرة من الدردشة", ar: "يتيح لك تعديل أمر مباشرة من الدردشة" },
    fallbackResponse: { en: "", ar: "" },
    minRole: "moderator",
    runsInChat: false,
  },
  {
    id: "followage",
    trigger: "!followage",
    response: { en: FOLLOWAGE_RESPONSE, ar: FOLLOWAGE_RESPONSE },
    fallbackResponse: { en: "", ar: "" },
    minRole: "everyone",
    runsInChat: true,
  },
  {
    id: "level",
    trigger: "!level",
    response: {
      en: "$(username) ليس لديه مستوى حتى الآن.\n$(username) في المستوى $(level) .",
      ar: "$(username) ليس لديه مستوى حتى الآن.\n$(username) في المستوى $(level) .",
    },
    fallbackResponse: { en: "", ar: "" },
    minRole: "everyone",
    runsInChat: false,
  },
  {
    id: "points",
    trigger: "!points",
    response: { en: POINTS_RESPONSE, ar: POINTS_RESPONSE },
    fallbackResponse: { en: "", ar: "" },
    minRole: "everyone",
    runsInChat: false,
  },
  {
    id: "points_add",
    trigger: "!points add",
    response: { en: "(إضافة نقاط)", ar: "(إضافة نقاط)" },
    fallbackResponse: { en: "", ar: "" },
    minRole: "broadcaster",
    runsInChat: false,
  },
  {
    id: "promo",
    trigger: "!promo",
    response: { en: "$(url) على $(name) إتبع قناة", ar: "$(url) على $(name) إتبع قناة" },
    fallbackResponse: { en: "", ar: "" },
    minRole: "moderator",
    runsInChat: false,
  },
  {
    id: "shop",
    trigger: "!shop",
    response: {
      en: "$(url) يمكنك رؤية متجر القناة في $(username)",
      ar: "$(url) يمكنك رؤية متجر القناة في $(username)",
    },
    fallbackResponse: { en: "", ar: "" },
    minRole: "everyone",
    runsInChat: false,
  },
];

const LEGACY_CATALOG: CatalogEntry[] = [
  {
    id: "lurk",
    trigger: "!lurk",
    response: {
      en: "{user} is lurking. Enjoy the stream!",
      ar: "{user} يختبئ في الخلفية. استمتع بالبث!",
    },
    fallbackResponse: { en: "", ar: "" },
    minRole: "everyone",
    runsInChat: true,
  },
  {
    id: "so",
    trigger: "!so",
    response: {
      en: "Check out {target}! https://kick.com/{target}",
      ar: "شجعوا {target}! https://kick.com/{target}",
    },
    fallbackResponse: {
      en: "Usage: !so <user>",
      ar: "الاستخدام: !so <user>",
    },
    minRole: "everyone",
    runsInChat: true,
  },
  {
    id: "welcome",
    trigger: "!welcome",
    response: {
      en: "Welcome to the stream, {user}!",
      ar: "أهلاً بك في البث، {user}!",
    },
    fallbackResponse: { en: "", ar: "" },
    minRole: "everyone",
    runsInChat: true,
  },
];

export function isDefaultCommandId(value: string): value is DefaultCommandId {
  return (DEFAULT_COMMAND_IDS as readonly string[]).includes(value);
}

export function isRuntimeCommandId(value: string): value is RuntimeCommandId {
  return isDefaultCommandId(value) || (LEGACY_COMMAND_IDS as readonly string[]).includes(value);
}

export function isReservedCommandName(name: string): boolean {
  return RESERVED_COMMAND_NAMES.includes(name.trim().toLowerCase());
}

function materialize(entries: CatalogEntry[], lang: "en" | "ar"): DefaultCommand[] {
  return entries.map((entry) => ({
    id: entry.id,
    trigger: entry.trigger,
    enabled: true,
    response: entry.response[lang],
    fallbackResponse: entry.fallbackResponse[lang],
    platforms: ["KICK", "TWITCH"],
    cooldownSeconds: 5,
    minRole: entry.minRole,
    runsInChat: entry.runsInChat,
    updatedAt: "",
  }));
}

export function catalogDefaultCommands(lang: "en" | "ar" = "en"): DefaultCommand[] {
  return materialize(CATALOG, lang);
}

export function catalogDefaultCommand(id: string, lang: "en" | "ar" = "en"): DefaultCommand | null {
  return catalogDefaultCommands(lang).find((item) => item.id === id) ?? null;
}

function mergeCatalog(
  catalog: DefaultCommand[],
  english: DefaultCommand[],
  saved: Array<Partial<DefaultCommand> & { id: string }>,
): DefaultCommand[] {
  const byId = new Map(saved.map((row) => [row.id, row]));
  return catalog.map((item) => {
    const row = byId.get(item.id);
    if (!row) return item;
    const englishRow = english.find((entry) => entry.id === item.id);
    const response = row.response?.trim()
      ? englishRow && row.response === englishRow.response
        ? item.response
        : row.response
      : item.response;
    const fallbackResponse = row.fallbackResponse?.trim()
      ? englishRow && row.fallbackResponse === englishRow.fallbackResponse
        ? item.fallbackResponse
        : row.fallbackResponse
      : item.fallbackResponse;
    return {
      ...item,
      enabled: row.enabled ?? item.enabled,
      response: response.slice(0, 480),
      fallbackResponse: fallbackResponse.slice(0, 480),
      platforms: row.platforms?.length ? row.platforms : item.platforms,
      cooldownSeconds: sanitizeCooldown(row.cooldownSeconds ?? item.cooldownSeconds),
      minRole: isCommandMinRole(row.minRole) ? row.minRole : item.minRole,
      runsInChat: item.runsInChat,
      updatedAt: row.updatedAt ?? "",
    };
  });
}

export function mergeDefaultCommands(
  saved: Array<Partial<DefaultCommand> & { id: string }>,
  lang: "en" | "ar" = "en",
): DefaultCommand[] {
  return mergeCatalog(catalogDefaultCommands(lang), catalogDefaultCommands("en"), saved);
}

/** Settings rows plus lurk / so / welcome, which already reply in chat. */
export function mergeRuntimeDefaultCommands(
  saved: Array<Partial<DefaultCommand> & { id: string }>,
  lang: "en" | "ar" = "en",
): DefaultCommand[] {
  return [
    ...mergeDefaultCommands(saved, lang),
    ...mergeCatalog(materialize(LEGACY_CATALOG, lang), materialize(LEGACY_CATALOG, "en"), saved),
  ];
}

export function sanitizeCooldown(raw: number | undefined): number {
  return Math.min(Math.max(Math.round(raw ?? 5) || 0, 0), 3600);
}

/**
 * Chat commands that declare a parameter. Everything else is exact-match only.
 * `so` takes one username: `!so` or `!so name`. Extra words do not run it.
 */
const PARAMETERIZED_DEFAULT_COMMANDS = new Set<RuntimeCommandId>(["so"]);

export function matchDefaultCommand(
  text: string,
  commands: DefaultCommand[],
  platform: ChatCommandPlatform,
): { command: DefaultCommand; argument: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/^!?(?:commands|الأوامر)$/i.test(trimmed)) {
    const command = commands.find((item) => item.id === "commands");
    if (!command) return null;
    // Reserved even when disabled, so a custom command of the same name cannot also reply.
    return { command, argument: "" };
  }
  const runnable = commands
    .filter((command) => command.runsInChat && command.enabled && command.platforms.includes(platform))
    .sort((a, b) => b.trigger.length - a.trigger.length);
  for (const command of runnable) {
    if (PARAMETERIZED_DEFAULT_COMMANDS.has(command.id)) {
      if (command.id !== "so") continue;
      const shoutout = /^!so(?:\s+(\S+))?$/i.exec(trimmed);
      if (!shoutout) continue;
      return { command, argument: (shoutout[1] ?? "").trim() };
    }
    if (messageStartsWithTrigger(trimmed, command.trigger)) return { command, argument: "" };
  }
  return null;
}

export function formatDefaultReply(
  template: string,
  vars: { user: string; command: string; target?: string; list?: string; followage?: string },
): string {
  return renderCommandTemplate(
    template,
    blankCommandTemplate({
      command: vars.command,
      param: vars.target ?? "",
      target: vars.target ?? "",
      list: vars.list ?? "",
      followage: vars.followage ?? "",
      sender: {
        username: vars.user,
        followers: "",
        url: "",
        followage: vars.followage ?? "",
      },
      taggedUser: {
        username: (vars.target ?? "").replace(/^@+/, ""),
        followers: "",
        followage: "",
      },
    }),
  );
}

export function parseShoutoutTarget(argument: string): string {
  return argument.replace(/^@+/, "").replace(/[^\w.-]/g, "").slice(0, 32);
}

export function formatFollowDuration(ms: number, arabic: boolean): string {
  const totalMinutes = Math.max(Math.floor(ms / 60_000), 0);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (arabic) {
    const parts: string[] = [];
    if (days) parts.push(`${days} يوم`);
    if (hours) parts.push(`${hours} ساعة`);
    if (!days && minutes) parts.push(`${minutes} دقيقة`);
    return parts.join(" و ") || "أقل من دقيقة";
  }
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (!days && minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  return parts.join(", ") || "less than a minute";
}

export function applyDollarPlaceholders(
  template: string,
  vars: {
    username?: string;
    time?: string;
    url?: string;
    points?: string;
    level?: string;
    name?: string;
  },
): string {
  return template
    .replaceAll("$(username)", vars.username ?? "")
    .replaceAll("$(time)", vars.time ?? "")
    .replaceAll("$(url)", vars.url ?? "")
    .replaceAll("$(points)", vars.points ?? "")
    .replaceAll("$(level)", vars.level ?? "")
    .replaceAll("$(name)", vars.name ?? "");
}

type StoredState = {
  commands: Array<Partial<DefaultCommand> & { id: string }>;
};

export function loadTestDefaultCommands(lang: "en" | "ar" = "en"): DefaultCommand[] {
  if (typeof window === "undefined") return catalogDefaultCommands(lang);
  try {
    const raw = window.localStorage.getItem(TEST_KEY);
    if (!raw) return catalogDefaultCommands(lang);
    const parsed = JSON.parse(raw) as StoredState;
    return mergeDefaultCommands(Array.isArray(parsed.commands) ? parsed.commands : [], lang);
  } catch {
    return catalogDefaultCommands(lang);
  }
}

function persistTestDefaults(commands: DefaultCommand[]) {
  window.localStorage.setItem(TEST_KEY, JSON.stringify({ commands }));
}

export function upsertTestDefaultCommand(
  input: DefaultCommandInput,
  lang: "en" | "ar" = "en",
): DefaultCommand[] {
  if (!isDefaultCommandId(input.id)) return loadTestDefaultCommands(lang);
  const current = loadTestDefaultCommands(lang);
  const now = new Date().toISOString();
  const next = current.map((command) =>
    command.id === input.id
      ? {
          ...command,
          enabled: Boolean(input.enabled),
          response: input.response.trim().slice(0, 480) || command.response,
          fallbackResponse: input.fallbackResponse.trim().slice(0, 480),
          platforms: input.platforms.length ? input.platforms : (["KICK"] as ChatCommandPlatform[]),
          cooldownSeconds: sanitizeCooldown(input.cooldownSeconds),
          minRole: isCommandMinRole(input.minRole) ? input.minRole : command.minRole,
          updatedAt: now,
        }
      : command,
  );
  persistTestDefaults(next);
  return next;
}

export function setTestDefaultCommandEnabled(
  id: DefaultCommandId,
  enabled: boolean,
  lang: "en" | "ar" = "en",
): DefaultCommand[] {
  const current = loadTestDefaultCommands(lang);
  const next = current.map((command) =>
    command.id === id ? { ...command, enabled, updatedAt: new Date().toISOString() } : command,
  );
  persistTestDefaults(next);
  return next;
}

export function setTestDefaultCommandRole(
  id: DefaultCommandId,
  minRole: CommandMinRole,
  lang: "en" | "ar" = "en",
): DefaultCommand[] {
  if (!isCommandMinRole(minRole)) return loadTestDefaultCommands(lang);
  const current = loadTestDefaultCommands(lang);
  const next = current.map((command) =>
    command.id === id ? { ...command, minRole, updatedAt: new Date().toISOString() } : command,
  );
  persistTestDefaults(next);
  return next;
}
