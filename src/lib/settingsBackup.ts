import {
  DEFAULT_COMMAND_SETTINGS,
  deleteTestCommand,
  loadTestCommandState,
  normalizeTriggerMarker,
  resolveStoredMarker,
  sanitizeCommandName,
  saveTestCommandSettings,
  upsertTestCommand,
  type ChatCommandPlatform,
  type CustomChatCommandInput,
} from "@/lib/customCommands";

export const SETTINGS_BACKUP_VERSION = 1;
export const SETTINGS_BACKUP_PRODUCT = "cylix-studio";
/** Legacy product id still accepted on import. */
export const SETTINGS_BACKUP_PRODUCT_LEGACY = "creovix-studio";
export const SETTINGS_BACKUP_SIDEBAR_KEY = "creovix:sidebar-collapsed";
export const SETTINGS_BACKUP_LANG_KEY = "creovix.lang";

type Lang = "en" | "ar";

const PLATFORMS: ChatCommandPlatform[] = ["KICK", "TWITCH"];
const MAX_COMMANDS = 200;

export type SettingsBackupCommand = {
  name: string;
  prefix: string | null;
  response: string;
  enabled: boolean;
  platforms: ChatCommandPlatform[];
  roles: string[];
  cooldownSeconds: number;
};

export type SettingsBackupConnection = {
  platform: string;
  connected: boolean;
  username: string | null;
  platformUserId: string | null;
  isActive: boolean;
};

export type SettingsBackupPrefs = {
  language?: Lang;
  sidebarCollapsed?: boolean;
};

export type SettingsBackupClipCommand = {
  enabled: boolean;
  roles: string[];
  defaultLength: number;
  maxLength: number;
  response: string;
};

export type SettingsBackupFile = {
  version: typeof SETTINGS_BACKUP_VERSION;
  product: typeof SETTINGS_BACKUP_PRODUCT;
  exportedAt: string;
  prefs: SettingsBackupPrefs;
  customCommands: {
    defaultPrefix: string;
    commands: SettingsBackupCommand[];
  };
  clipCommand: SettingsBackupClipCommand | null;
  connections: SettingsBackupConnection[];
};

export type SettingsBackupParseError = "invalid" | "unsupported";

export type CommandImportMode = "merge" | "replace";

export type SettingsBackupSummary = {
  commandCount: number;
  defaultPrefix: string;
  language: Lang | null;
  hasClipCommand: boolean;
  connectionCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function field(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function sanitizeBackupCommand(raw: unknown): SettingsBackupCommand | null {
  if (!isRecord(raw)) return null;
  const name = sanitizeCommandName(typeof field(raw, "name") === "string" ? (field(raw, "name") as string) : "");
  if (!name) return null;
  const responseRaw = field(raw, "response");
  const response = typeof responseRaw === "string" ? responseRaw.trim().slice(0, 480) : "";
  if (!response) return null;
  const platforms = asStringArray(field(raw, "platforms")).filter((platform): platform is ChatCommandPlatform =>
    PLATFORMS.includes(platform as ChatCommandPlatform),
  );
  const roles = asStringArray(field(raw, "roles"));
  const cooldownRaw = field(raw, "cooldownSeconds");
  const cooldownAlt = field(raw, "cooldown_seconds");
  const cooldown =
    typeof cooldownRaw === "number" ? cooldownRaw : typeof cooldownAlt === "number" ? cooldownAlt : 0;
  const prefixField = field(raw, "prefix");
  const prefixRaw = prefixField === null || prefixField === undefined ? null : String(prefixField);
  return {
    name,
    prefix: resolveStoredMarker(prefixRaw, name),
    response,
    enabled: Boolean(field(raw, "enabled")),
    platforms: platforms.length ? platforms : ["KICK"],
    roles: roles.length ? roles : ["Everyone"],
    cooldownSeconds: Math.min(Math.max(Math.round(cooldown) || 0, 0), 3600),
  };
}

function parseClipCommand(raw: unknown): SettingsBackupClipCommand | null {
  if (raw == null) return null;
  if (!isRecord(raw)) return null;
  const roles = asStringArray(field(raw, "roles"));
  const maxRaw = field(raw, "maxLength");
  const defaultRaw = field(raw, "defaultLength");
  const maxLength = Math.min(
    Math.max(Math.round(typeof maxRaw === "number" ? maxRaw : 120) || 120, 5),
    240,
  );
  const defaultLength = Math.min(
    Math.max(Math.round(typeof defaultRaw === "number" ? defaultRaw : 30) || 30, 5),
    maxLength,
  );
  const responseRaw = field(raw, "response");
  const response =
    typeof responseRaw === "string" && responseRaw.trim()
      ? responseRaw.trim().slice(0, 240)
      : "@{user} {clip_url}";
  return {
    enabled: Boolean(field(raw, "enabled")),
    roles: roles.length ? roles : ["Everyone"],
    defaultLength,
    maxLength,
    response,
  };
}

function parseConnection(raw: unknown): SettingsBackupConnection | null {
  if (!isRecord(raw)) return null;
  const platformRaw = field(raw, "platform");
  if (typeof platformRaw !== "string" || !platformRaw.trim()) return null;
  const username = field(raw, "username");
  const platformUserId = field(raw, "platformUserId");
  return {
    platform: platformRaw.trim().toUpperCase(),
    connected: field(raw, "connected") !== false,
    username: typeof username === "string" ? username : null,
    platformUserId: typeof platformUserId === "string" ? platformUserId : null,
    isActive: Boolean(field(raw, "isActive")),
  };
}

function parsePrefs(raw: unknown): SettingsBackupPrefs {
  if (!isRecord(raw)) return {};
  const prefs: SettingsBackupPrefs = {};
  const language = field(raw, "language");
  const sidebarCollapsed = field(raw, "sidebarCollapsed");
  if (language === "ar" || language === "en") prefs.language = language;
  if (typeof sidebarCollapsed === "boolean") prefs.sidebarCollapsed = sidebarCollapsed;
  return prefs;
}

export function parseSettingsBackup(
  raw: unknown,
): { ok: true; data: SettingsBackupFile } | { ok: false; error: SettingsBackupParseError } {
  if (!isRecord(raw)) return { ok: false, error: "invalid" };
  if (field(raw, "version") !== SETTINGS_BACKUP_VERSION) return { ok: false, error: "unsupported" };
  const product = field(raw, "product");
  if (product !== SETTINGS_BACKUP_PRODUCT && product !== SETTINGS_BACKUP_PRODUCT_LEGACY) {
    return { ok: false, error: "invalid" };
  }

  const customCommands = field(raw, "customCommands");
  const commandsRaw = isRecord(customCommands) ? field(customCommands, "commands") : null;
  if (!Array.isArray(commandsRaw)) return { ok: false, error: "invalid" };
  if (commandsRaw.length > MAX_COMMANDS) return { ok: false, error: "invalid" };

  const commands: SettingsBackupCommand[] = [];
  const seen = new Set<string>();
  for (const entry of commandsRaw) {
    const command = sanitizeBackupCommand(entry);
    if (!command) return { ok: false, error: "invalid" };
    const key = command.name.toLowerCase();
    if (seen.has(key)) {
      const index = commands.findIndex((row) => row.name.toLowerCase() === key);
      if (index >= 0) commands[index] = command;
      continue;
    }
    seen.add(key);
    commands.push(command);
  }

  const prefixField = isRecord(customCommands) ? field(customCommands, "defaultPrefix") : null;
  const defaultPrefix = normalizeTriggerMarker(
    typeof prefixField === "string" ? prefixField : DEFAULT_COMMAND_SETTINGS.defaultPrefix,
  );

  const connectionsField = field(raw, "connections");
  const connectionsRaw = Array.isArray(connectionsField) ? connectionsField : [];
  const connections = connectionsRaw
    .map(parseConnection)
    .filter((row): row is SettingsBackupConnection => Boolean(row));

  const exportedAt = field(raw, "exportedAt");
  return {
    ok: true,
    data: {
      version: SETTINGS_BACKUP_VERSION,
      product: SETTINGS_BACKUP_PRODUCT,
      exportedAt: typeof exportedAt === "string" ? exportedAt : new Date().toISOString(),
      prefs: parsePrefs(field(raw, "prefs")),
      customCommands: { defaultPrefix, commands },
      clipCommand: parseClipCommand(field(raw, "clipCommand")),
      connections,
    },
  };
}

export function summarizeBackup(file: SettingsBackupFile): SettingsBackupSummary {
  return {
    commandCount: file.customCommands.commands.length,
    defaultPrefix: file.customCommands.defaultPrefix,
    language: file.prefs.language ?? null,
    hasClipCommand: Boolean(file.clipCommand),
    connectionCount: file.connections.length,
  };
}

export function readLocalPrefs(): SettingsBackupPrefs {
  if (typeof window === "undefined") return {};
  const prefs: SettingsBackupPrefs = {};
  const languageRaw = window.localStorage.getItem(SETTINGS_BACKUP_LANG_KEY);
  if (languageRaw === "ar" || languageRaw === "en") prefs.language = languageRaw;
  const sidebar = window.localStorage.getItem(SETTINGS_BACKUP_SIDEBAR_KEY);
  if (sidebar === "1") prefs.sidebarCollapsed = true;
  else if (sidebar === "0") prefs.sidebarCollapsed = false;
  return prefs;
}

export function writeLocalPrefs(prefs: SettingsBackupPrefs) {
  if (typeof window === "undefined") return;
  if (prefs.language === "ar" || prefs.language === "en") {
    window.localStorage.setItem(SETTINGS_BACKUP_LANG_KEY, prefs.language);
  }
  if (typeof prefs.sidebarCollapsed === "boolean") {
    window.localStorage.setItem(SETTINGS_BACKUP_SIDEBAR_KEY, prefs.sidebarCollapsed ? "1" : "0");
  }
}

export function backupFileName(exportedAt = new Date().toISOString()) {
  return `cylix-settings-${exportedAt.slice(0, 10)}.json`;
}

export function downloadSettingsBackup(file: SettingsBackupFile) {
  const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = backupFileName(file.exportedAt);
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildLocalSettingsBackup(partial: {
  customCommands?: SettingsBackupFile["customCommands"];
  clipCommand?: SettingsBackupClipCommand | null;
  connections?: SettingsBackupConnection[];
}): SettingsBackupFile {
  const testState = loadTestCommandState();
  return {
    version: SETTINGS_BACKUP_VERSION,
    product: SETTINGS_BACKUP_PRODUCT,
    exportedAt: new Date().toISOString(),
    prefs: readLocalPrefs(),
    customCommands: partial.customCommands ?? {
      defaultPrefix: testState.settings.defaultPrefix,
      commands: testState.commands.map((command) => ({
        name: command.name,
        prefix: command.prefix,
        response: command.response,
        enabled: command.enabled,
        platforms: command.platforms,
        roles: command.roles,
        cooldownSeconds: command.cooldownSeconds,
      })),
    },
    clipCommand: partial.clipCommand ?? null,
    connections: partial.connections ?? [],
  };
}

export function applyTestCommandImport(file: SettingsBackupFile, mode: CommandImportMode) {
  const incoming = file.customCommands.commands;
  if (mode === "replace") {
    const current = loadTestCommandState();
    for (const command of current.commands) deleteTestCommand(command.id);
  }
  saveTestCommandSettings(file.customCommands.defaultPrefix);
  for (const command of incoming) {
    const input: CustomChatCommandInput = {
      name: command.name,
      prefix: command.prefix,
      response: command.response,
      enabled: command.enabled,
      platforms: command.platforms,
      roles: command.roles,
      cooldownSeconds: command.cooldownSeconds,
    };
    upsertTestCommand(input);
  }
}
