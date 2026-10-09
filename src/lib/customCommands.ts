import { blankCommandTemplate, commandArgument, renderCommandTemplate, taggedUsername } from "@/lib/commandTemplate";

export type ChatCommandPlatform = "KICK" | "TWITCH";

export const COMMAND_ROLES = ["Everyone", "Subs", "VIPs", "Mods"] as const;
export type CommandRole = (typeof COMMAND_ROLES)[number];

export const PREFIX_MARKERS = ["!", "#"] as const;
export const QUESTION_SUFFIX = "?";

const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;

export type CustomChatCommand = {
  id: string;
  name: string;
  /** `null` inherits the streamer's default prefix. `""` is a direct trigger. */
  prefix: string | null;
  response: string;
  enabled: boolean;
  platforms: ChatCommandPlatform[];
  roles: string[];
  cooldownSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type CustomChatCommandSettings = {
  defaultPrefix: string;
};

export type CustomChatCommandState = {
  settings: CustomChatCommandSettings;
  commands: CustomChatCommand[];
};

export type CustomChatCommandInput = {
  id?: string;
  name: string;
  prefix: string | null;
  response: string;
  enabled: boolean;
  platforms: ChatCommandPlatform[];
  roles: string[];
  cooldownSeconds: number;
};

export const DEFAULT_COMMAND_SETTINGS: CustomChatCommandSettings = {
  defaultPrefix: "!",
};

const TEST_KEY = "creovix:custom-chat-commands";

/** Invisible / bidi formatting characters that break chat matching. */
const NAME_INVISIBLE = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u061C]/g;

/**
 * Normalize viewer chat (and stored names) before trigger comparison.
 * Collapses NBSP / odd spaces, strips RTL marks, NFC-normalizes Arabic.
 */
export function normalizeChatText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(NAME_INVISIBLE, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Normalizes a command name for storage + matching.
 * Supports Latin and Arabic (and other scripts), optional internal spaces
 * (e.g. "سلام عليكم"), and strips trigger punctuation from the edges only.
 */
export function sanitizeCommandName(raw: string): string {
  const normalized = normalizeChatText(raw);
  const withoutEdgeMarkers = normalized
    .replace(/^[-!?#./\\]+/u, "")
    .replace(/[?؟]+$/gu, "")
    .trim();
  // Drop ASCII punctuation/symbols that break triggers; keep letters/numbers from
  // any script plus space, underscore, and hyphen.
  const cleaned = [...withoutEdgeMarkers]
    .filter(
      (char) =>
        char === " " ||
        char === "_" ||
        char === "-" ||
        !/[\x21-\x2F\x3A-\x40\x5B-\x5E\x60\x7B-\x7E]/.test(char),
    )
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
  // char_length limit in Postgres is 32 characters (not UTF-16 units).
  return [...cleaned].slice(0, 32).join("");
}

const RESERVED_CUSTOM_NAMES = new Set(["commands", "followage", "lurk", "so", "welcome"]);

export function isReservedCustomCommandName(name: string): boolean {
  return RESERVED_CUSTOM_NAMES.has(name.trim().toLowerCase());
}

export function sanitizePrefix(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/gu, "").slice(0, 8);
}

export function isAllowedPrefixMarker(marker: string): boolean {
  return (PREFIX_MARKERS as readonly string[]).includes(marker);
}

export function isSuffixMarker(marker: string): boolean {
  return marker.length > 0 && [...marker].every((char) => char === "?" || char === "؟");
}

/** Drops `.` `/` and any unknown prefix; keeps `!`, `#`, suffix marks, or empty. */
export function normalizeTriggerMarker(marker: string): string {
  const cleaned = sanitizePrefix(marker);
  if (!cleaned) return "";
  if (isSuffixMarker(cleaned)) return QUESTION_SUFFIX;
  if (isAllowedPrefixMarker(cleaned)) return cleaned;
  return "";
}

/** Arabic vs Latin letters decide whether the suffix is `؟` or `?`. */
export function questionSuffixForText(text: string): "?" | "؟" {
  if (ARABIC_LETTER.test(text)) return "؟";
  if (LATIN_LETTER.test(text)) return "?";
  return "?";
}

export function resolveStoredMarker(marker: string | null, name: string): string | null {
  if (marker === null) return null;
  const normalized = normalizeTriggerMarker(marker);
  if (isSuffixMarker(normalized)) return questionSuffixForText(name);
  return normalized;
}

export type MarkerPlacement = "none" | "prefix" | "suffix";

export function markerPlacement(marker: string): MarkerPlacement {
  if (!marker) return "none";
  if (isSuffixMarker(marker)) return "suffix";
  return "prefix";
}

export function effectivePrefix(command: Pick<CustomChatCommand, "prefix">, defaultPrefix: string): string {
  const raw = command.prefix === null ? defaultPrefix : command.prefix;
  return normalizeTriggerMarker(raw);
}

export function commandTrigger(command: Pick<CustomChatCommand, "name" | "prefix">, defaultPrefix: string): string {
  const name = command.name;
  const marker = effectivePrefix(command, defaultPrefix);
  if (!marker) return name;
  if (isSuffixMarker(marker)) return `${name}${questionSuffixForText(name)}`;
  return `${marker}${name}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Legacy rows may have stored names without spaces — accept both forms. */
function nameMatchVariants(name: string): string[] {
  const primary = sanitizeCommandName(name);
  if (!primary) return [];
  const variants = new Set<string>([primary]);
  const compacted = primary.replace(/\s+/gu, "");
  if (compacted && compacted !== primary) variants.add(compacted);
  return [...variants];
}

function matchesTrigger(text: string, name: string, marker: string): boolean {
  const normalizedText = normalizeChatText(text);
  if (!normalizedText) return false;
  const placement = markerPlacement(marker);
  const flags = "iu";

  for (const variant of nameMatchVariants(name)) {
    const word = escapeRegExp(variant);
    if (placement === "none") {
      if (/^[!#./]/.test(normalizedText)) continue;
      if (new RegExp(`^${word}(?![?؟!#])(?:\\s|$)`, flags).test(normalizedText)) return true;
      continue;
    }
    if (placement === "suffix") {
      if (new RegExp(`(?:^|\\s)${word}[?؟]\\s*$`, flags).test(normalizedText)) return true;
      continue;
    }
    if (!isAllowedPrefixMarker(marker)) continue;
    const escapedMarker = escapeRegExp(marker);
    // Logical order: !name  — and RTL-typed order: name!
    if (new RegExp(`^${escapedMarker}${word}(?:\\s|$)`, flags).test(normalizedText)) return true;
    if (new RegExp(`^${word}${escapedMarker}(?:\\s|$)`, flags).test(normalizedText)) return true;
    // Arabic chat rarely leads with ASCII `!` — also accept the bare phrase at
    // message start when the command name is Arabic-script.
    if (
      ARABIC_LETTER.test(variant) &&
      !/^[!#./]/.test(normalizedText) &&
      new RegExp(`^${word}(?![?؟!#])(?:\\s|$)`, flags).test(normalizedText)
    ) {
      return true;
    }
  }
  return false;
}

export function matchCustomCommand(
  text: string,
  commands: CustomChatCommand[],
  defaultPrefix: string,
  platform: ChatCommandPlatform,
): CustomChatCommand | null {
  const trimmed = normalizeChatText(text);
  if (!trimmed) return null;
  const candidates = commands
    .filter((command) => command.enabled && command.platforms.includes(platform) && command.name)
    .sort(
      (a, b) => commandTrigger(b, defaultPrefix).length - commandTrigger(a, defaultPrefix).length,
    );
  for (const command of candidates) {
    if (matchesTrigger(trimmed, command.name, effectivePrefix(command, defaultPrefix))) return command;
  }
  return null;
}

/** Viewer who typed the command, without a leading @. */
export function commandSenderName(username: string): string {
  return username.trim().replace(/^@+/, "");
}

export function formatCommandReply(
  template: string,
  vars: { user: string; command: string; message?: string },
): string {
  const param = commandArgument(vars.message ?? "");
  return renderCommandTemplate(
    template,
    blankCommandTemplate({
      command: vars.command,
      platform: "KICK",
      param,
      sender: {
        username: commandSenderName(vars.user),
        followers: "",
        url: "",
        followage: "",
      },
      taggedUser: {
        username: taggedUsername(param),
        followers: "",
        followage: "",
      },
    }),
  );
}

export function emptyCommandDraft(): CustomChatCommandInput {
  return {
    name: "",
    prefix: null,
    response: "",
    enabled: true,
    platforms: ["KICK", "TWITCH"],
    roles: ["Everyone"],
    cooldownSeconds: 0,
  };
}

function emptyTestState(): CustomChatCommandState {
  return { settings: { ...DEFAULT_COMMAND_SETTINGS }, commands: [] };
}

export function loadTestCommandState(): CustomChatCommandState {
  if (typeof window === "undefined") return emptyTestState();
  try {
    const raw = window.localStorage.getItem(TEST_KEY);
    if (!raw) return emptyTestState();
    const parsed = JSON.parse(raw) as Partial<CustomChatCommandState>;
    return {
      settings: {
        defaultPrefix: normalizeTriggerMarker(parsed.settings?.defaultPrefix ?? "!"),
      },
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
    };
  } catch {
    return emptyTestState();
  }
}

function persistTestState(state: CustomChatCommandState) {
  window.localStorage.setItem(TEST_KEY, JSON.stringify(state));
}

export function saveTestCommandSettings(defaultPrefix: string): CustomChatCommandState {
  const state = loadTestCommandState();
  state.settings.defaultPrefix = normalizeTriggerMarker(defaultPrefix);
  persistTestState(state);
  return state;
}

export function upsertTestCommand(input: CustomChatCommandInput): CustomChatCommandState {
  const state = loadTestCommandState();
  const now = new Date().toISOString();
  const name = sanitizeCommandName(input.name);
  if (!name) throw new Error("name_required");
  if (isReservedCustomCommandName(name)) throw new Error("reserved_name");
  const response = input.response.normalize("NFC").trim().slice(0, 480);
  if (!response) throw new Error("response_required");
  const existing = input.id
    ? state.commands.find((command) => command.id === input.id)
    : state.commands.find((command) => command.name.toLowerCase() === name.toLowerCase());
  const row: CustomChatCommand = {
    id: existing?.id ?? crypto.randomUUID(),
    name,
    prefix: resolveStoredMarker(input.prefix, name),
    response,
    enabled: Boolean(input.enabled),
    platforms: input.platforms.length ? input.platforms : ["KICK"],
    roles: input.roles.length ? input.roles : ["Everyone"],
    cooldownSeconds: Math.min(Math.max(Math.round(Number(input.cooldownSeconds)) || 0, 0), 3600),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  state.commands = [row, ...state.commands.filter((command) => command.id !== row.id)];
  persistTestState(state);
  return state;
}

export function setTestCommandEnabled(id: string, enabled: boolean): CustomChatCommandState {
  const state = loadTestCommandState();
  state.commands = state.commands.map((command) =>
    command.id === id ? { ...command, enabled, updatedAt: new Date().toISOString() } : command,
  );
  persistTestState(state);
  return state;
}

export function deleteTestCommand(id: string): CustomChatCommandState {
  const state = loadTestCommandState();
  state.commands = state.commands.filter((command) => command.id !== id);
  persistTestState(state);
  return state;
}
