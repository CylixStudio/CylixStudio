import { blankCommandTemplate, renderCommandTemplate } from "@/lib/commandTemplate";
import type { ChatCommandPlatform } from "@/lib/customCommands";

export const DEFAULT_COMMAND_IDS = ["commands", "followage", "lurk", "so", "welcome"] as const;
export type DefaultCommandId = (typeof DEFAULT_COMMAND_IDS)[number];

export const RESERVED_COMMAND_NAMES: readonly string[] = DEFAULT_COMMAND_IDS;

const TEST_KEY = "creovix:default-commands";

export type DefaultCommand = {
  id: DefaultCommandId;
  trigger: string;
  enabled: boolean;
  response: string;
  fallbackResponse: string;
  platforms: ChatCommandPlatform[];
  cooldownSeconds: number;
  updatedAt: string;
};

export type DefaultCommandInput = {
  id: DefaultCommandId;
  enabled: boolean;
  response: string;
  fallbackResponse: string;
  platforms: ChatCommandPlatform[];
  cooldownSeconds: number;
};

type CatalogEntry = {
  id: DefaultCommandId;
  trigger: string;
  response: { en: string; ar: string };
  fallbackResponse: { en: string; ar: string };
};

const CATALOG: CatalogEntry[] = [
  {
    id: "commands",
    trigger: "!commands",
    response: {
      en: "Commands: {list}",
      ar: "الأوامر: {list}",
    },
    fallbackResponse: { en: "", ar: "" },
  },
  {
    id: "followage",
    trigger: "!followage",
    response: {
      en: "{user} has followed for {followage}.",
      ar: "{user} يتابع منذ {followage}.",
    },
    fallbackResponse: {
      en: "Kick does not share how long {user} has followed this channel.",
      ar: "كيك لا يشارك منذ متى يتابع {user} هذه القناة.",
    },
  },
  {
    id: "lurk",
    trigger: "!lurk",
    response: {
      en: "{user} is lurking. Enjoy the stream!",
      ar: "{user} يختبئ في الخلفية. استمتع بالبث!",
    },
    fallbackResponse: { en: "", ar: "" },
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
  },
  {
    id: "welcome",
    trigger: "!welcome",
    response: {
      en: "Welcome to the stream, {user}!",
      ar: "أهلاً بك في البث، {user}!",
    },
    fallbackResponse: { en: "", ar: "" },
  },
];

export function isDefaultCommandId(value: string): value is DefaultCommandId {
  return (DEFAULT_COMMAND_IDS as readonly string[]).includes(value);
}

export function isReservedCommandName(name: string): boolean {
  return RESERVED_COMMAND_NAMES.includes(name.trim().toLowerCase());
}

export function catalogDefaultCommands(lang: "en" | "ar" = "en"): DefaultCommand[] {
  return CATALOG.map((entry) => ({
    id: entry.id,
    trigger: entry.trigger,
    enabled: true,
    response: entry.response[lang],
    fallbackResponse: entry.fallbackResponse[lang],
    platforms: ["KICK", "TWITCH"],
    cooldownSeconds: 5,
    updatedAt: "",
  }));
}

export function mergeDefaultCommands(
  saved: Array<Partial<DefaultCommand> & { id: string }>,
  lang: "en" | "ar" = "en",
): DefaultCommand[] {
  const catalog = catalogDefaultCommands(lang);
  const en = catalogDefaultCommands("en");
  const byId = new Map(saved.map((row) => [row.id, row]));
  return catalog.map((item) => {
    const row = byId.get(item.id);
    if (!row) return item;
    const english = en.find((entry) => entry.id === item.id);
    const response = row.response?.trim()
      ? english && row.response === english.response
        ? item.response
        : row.response
      : item.response;
    const fallbackResponse = row.fallbackResponse?.trim()
      ? english && row.fallbackResponse === english.fallbackResponse
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
      updatedAt: row.updatedAt ?? "",
    };
  });
}

export function sanitizeCooldown(raw: number | undefined): number {
  return Math.min(Math.max(Math.round(raw ?? 5) || 0, 0), 3600);
}

export function matchDefaultCommand(
  text: string,
  commands: DefaultCommand[],
  platform: ChatCommandPlatform,
): { command: DefaultCommand; argument: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/^!?(?:commands|الأوامر)$/i.test(trimmed)) {
    const command = commands.find((item) => item.id === "commands");
    if (command?.enabled && command.platforms.includes(platform)) {
      return { command, argument: "" };
    }
    return null;
  }
  for (const command of commands) {
    if (!command.enabled || !command.platforms.includes(platform)) continue;
    const match = trimmed.match(new RegExp(`^${escapeRegExp(command.trigger)}(?:\\s+|$)(.*)`, "i"));
    if (match) return { command, argument: (match[1] ?? "").trim() };
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
          platforms: input.platforms.length ? input.platforms : ["KICK"],
          cooldownSeconds: sanitizeCooldown(input.cooldownSeconds),
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
