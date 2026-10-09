import { createServerFn } from "@tanstack/react-start";

import { FREE_PLAN_LIMITS } from "@/lib/plans";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { userHasActivePro } from "@/lib/subscription.server";
import {
  sanitizeBackupCommand,
  SETTINGS_BACKUP_PRODUCT,
  SETTINGS_BACKUP_VERSION,
  type CommandImportMode,
  type SettingsBackupCommand,
  type SettingsBackupConnection,
  type SettingsBackupFile,
} from "@/lib/settingsBackup";
import {
  DEFAULT_COMMAND_SETTINGS,
  normalizeTriggerMarker,
  type ChatCommandPlatform,
} from "@/lib/customCommands";

const PLATFORMS: ChatCommandPlatform[] = ["KICK", "TWITCH"];

function mapCommand(row: {
  name: string;
  prefix: string | null;
  response: string;
  enabled: boolean;
  platforms: string[];
  roles: string[];
  cooldown_seconds: number;
}): SettingsBackupCommand {
  const platforms = row.platforms.filter((platform): platform is ChatCommandPlatform =>
    PLATFORMS.includes(platform as ChatCommandPlatform),
  );
  return {
    name: row.name,
    prefix: row.prefix === null ? null : normalizeTriggerMarker(row.prefix),
    response: row.response,
    enabled: row.enabled,
    platforms: platforms.length ? platforms : ["KICK"],
    roles: row.roles.length ? row.roles : ["Everyone"],
    cooldownSeconds: row.cooldown_seconds,
  };
}

export const exportSettingsBackup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Omit<SettingsBackupFile, "prefs">> => {
    const { supabase, userId } = context;
    const [commandSettings, commands, connections] = await Promise.all([
      supabase
        .from("custom_chat_command_settings")
        .select("default_prefix")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("custom_chat_commands")
        .select("name, prefix, response, enabled, platforms, roles, cooldown_seconds")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("platform_connections")
        .select("platform, username, is_active, platform_user_id")
        .eq("user_id", userId),
    ]);

    const connectionRows: SettingsBackupConnection[] = (connections.data ?? []).map((row) => ({
      platform: row.platform,
      connected: true,
      username: row.username,
      platformUserId: row.platform_user_id,
      isActive: row.is_active,
    }));

    return {
      version: SETTINGS_BACKUP_VERSION,
      product: SETTINGS_BACKUP_PRODUCT,
      exportedAt: new Date().toISOString(),
      customCommands: {
        defaultPrefix: normalizeTriggerMarker(
          commandSettings.data?.default_prefix ?? DEFAULT_COMMAND_SETTINGS.defaultPrefix,
        ),
        commands: (commands.data ?? []).map(mapCommand),
      },
      connections: connectionRows,
    };
  });

type ImportPayload = {
  mode: CommandImportMode;
  defaultPrefix: string;
  commands: SettingsBackupCommand[];
};

export const importSettingsBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ImportPayload) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const commands = data.commands
      .map(sanitizeBackupCommand)
      .filter((row): row is SettingsBackupCommand => Boolean(row));
    const defaultPrefix = normalizeTriggerMarker(data.defaultPrefix);

    const { error: settingsError } = await supabase.from("custom_chat_command_settings").upsert(
      { user_id: userId, default_prefix: defaultPrefix },
      { onConflict: "user_id" },
    );
    if (settingsError) return { ok: false as const, error: settingsError.message };

    const { data: existing, error: existingError } = await supabase
      .from("custom_chat_commands")
      .select("id, name")
      .eq("user_id", userId);
    if (existingError) return { ok: false as const, error: existingError.message };

    const byName = new Map(
      (existing ?? []).map((row) => [row.name.toLowerCase(), row.id] as const),
    );

    // Free plan: importing must not push the account past the custom-command soft cap.
    const isPro = await userHasActivePro(supabase, userId);
    if (!isPro) {
      const existingCount = existing?.length ?? 0;
      const newInserts = commands.filter((command) => !byName.has(command.name.toLowerCase())).length;
      const removals =
        data.mode === "replace"
          ? (existing ?? []).filter(
              (row) => !commands.some((command) => command.name.toLowerCase() === row.name.toLowerCase()),
            ).length
          : 0;
      const projected = existingCount - removals + newInserts;
      if (projected > FREE_PLAN_LIMITS.customCommands) {
        return { ok: false as const, error: "free_limit_commands" };
      }
    }

    for (const command of commands) {
      const payload = {
        user_id: userId,
        name: command.name,
        prefix: command.prefix,
        response: command.response,
        enabled: command.enabled,
        platforms: command.platforms,
        roles: command.roles,
        cooldown_seconds: command.cooldownSeconds,
      };
      const existingId = byName.get(command.name.toLowerCase());
      const query = existingId
        ? supabase.from("custom_chat_commands").update(payload).eq("id", existingId).eq("user_id", userId)
        : supabase.from("custom_chat_commands").insert(payload);
      const { error } = await query;
      if (error) return { ok: false as const, error: error.message };
    }

    if (data.mode === "replace") {
      const keep = new Set(commands.map((command) => command.name.toLowerCase()));
      const remove = (existing ?? [])
        .filter((row) => !keep.has(row.name.toLowerCase()))
        .map((row) => row.id);
      if (remove.length > 0) {
        const { error } = await supabase
          .from("custom_chat_commands")
          .delete()
          .eq("user_id", userId)
          .in("id", remove);
        if (error) return { ok: false as const, error: error.message };
      }
    }

    return { ok: true as const };
  });
