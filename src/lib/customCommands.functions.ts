import { createServerFn } from "@tanstack/react-start";

import {
  DEFAULT_COMMAND_SETTINGS,
  normalizeTriggerMarker,
  resolveStoredMarker,
  isReservedCustomCommandName,
  sanitizeCommandName,
  type ChatCommandPlatform,
  type CustomChatCommand,
  type CustomChatCommandInput,
  type CustomChatCommandState,
} from "@/lib/customCommands";
import { FREE_PLAN_LIMITS } from "@/lib/plans";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { userHasActivePro } from "@/lib/subscription.server";

const PLATFORMS: ChatCommandPlatform[] = ["KICK", "TWITCH"];

function mapCommand(row: {
  id: string;
  name: string;
  prefix: string | null;
  response: string;
  enabled: boolean;
  platforms: string[];
  roles: string[];
  cooldown_seconds: number;
  created_at: string;
  updated_at: string;
}): CustomChatCommand {
  const platforms = row.platforms.filter((platform): platform is ChatCommandPlatform =>
    PLATFORMS.includes(platform as ChatCommandPlatform),
  );
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix === null ? null : normalizeTriggerMarker(row.prefix),
    response: row.response,
    enabled: row.enabled,
    platforms: platforms.length ? platforms : ["KICK"],
    roles: row.roles.length ? row.roles : ["Everyone"],
    cooldownSeconds: row.cooldown_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeInput(input: CustomChatCommandInput): CustomChatCommandInput | { error: string } {
  const name = sanitizeCommandName(input.name);
  if (!name) return { error: "name_required" };
  if (isReservedCustomCommandName(name)) {
    return { error: "reserved_name" };
  }
  const response = input.response.normalize("NFC").trim().slice(0, 480);
  if (!response) return { error: "response_required" };
  const platforms = input.platforms.filter((platform) => PLATFORMS.includes(platform));
  const normalized: CustomChatCommandInput = {
    name,
    prefix: resolveStoredMarker(input.prefix, name),
    response,
    enabled: Boolean(input.enabled),
    platforms: platforms.length ? platforms : ["KICK"],
    roles: input.roles.length ? input.roles : ["Everyone"],
    cooldownSeconds: Math.min(Math.max(Math.round(Number(input.cooldownSeconds)) || 0, 0), 3600),
  };
  if (input.id) normalized.id = input.id;
  return normalized;
}

export const getCustomCommandsState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomChatCommandState> => {
    const { supabase, userId } = context;
    const [{ data: settings }, { data: commands }] = await Promise.all([
      supabase
        .from("custom_chat_command_settings")
        .select("default_prefix")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("custom_chat_commands")
        .select(
          "id, name, prefix, response, enabled, platforms, roles, cooldown_seconds, created_at, updated_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    return {
      settings: {
        defaultPrefix: normalizeTriggerMarker(
          settings?.default_prefix ?? DEFAULT_COMMAND_SETTINGS.defaultPrefix,
        ),
      },
      commands: (commands ?? []).map(mapCommand),
    };
  });

export const saveCustomCommandSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { defaultPrefix: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("custom_chat_command_settings").upsert(
      {
        user_id: context.userId,
        default_prefix: normalizeTriggerMarker(data.defaultPrefix),
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const upsertCustomCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CustomChatCommandInput) => input)
  .handler(async ({ data, context }) => {
    try {
      const normalized = normalizeInput(data);
      if ("error" in normalized) return { ok: false as const, error: normalized.error };

      // Free plan: block creating beyond the soft cap (edits of existing rows still allowed).
      if (!normalized.id) {
        const isPro = await userHasActivePro(context.supabase, context.userId);
        if (!isPro) {
          const { count, error: countError } = await context.supabase
            .from("custom_chat_commands")
            .select("id", { count: "exact", head: true })
            .eq("user_id", context.userId);
          if (countError) return { ok: false as const, error: countError.message };
          if ((count ?? 0) >= FREE_PLAN_LIMITS.customCommands) {
            return { ok: false as const, error: "free_limit_commands" };
          }
        }
      }

      const payload = {
        user_id: context.userId,
        name: normalized.name,
        prefix: normalized.prefix,
        response: normalized.response,
        enabled: normalized.enabled,
        platforms: normalized.platforms,
        roles: normalized.roles,
        cooldown_seconds: normalized.cooldownSeconds,
      };

      if (normalized.id) {
        const { error } = await context.supabase
          .from("custom_chat_commands")
          .update(payload)
          .eq("id", normalized.id)
          .eq("user_id", context.userId);
        if (error) {
          if (error.code === "23505") return { ok: false as const, error: "duplicate_name" };
          return { ok: false as const, error: error.message };
        }
        return { ok: true as const };
      }

      const { error } = await context.supabase.from("custom_chat_commands").insert(payload);
      if (error) {
        if (error.code === "23505") return { ok: false as const, error: "duplicate_name" };
        const message = error.message || "Could not save the command.";
        if (
          error.code === "PGRST205" ||
          message.toLowerCase().includes("schema cache") ||
          message.toLowerCase().includes("could not find the table")
        ) {
          return {
            ok: false as const,
            error:
              "Chat commands table is missing from the database. Apply migration 20260925030000_custom_commands_unicode_names.sql (or run supabase db push), then retry.",
          };
        }
        return { ok: false as const, error: message };
      }
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the command.";
      return { ok: false as const, error: message };
    }
  });

export const setCustomCommandEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("custom_chat_commands")
      .update({ enabled: Boolean(data.enabled) })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: !error, error: error?.message };
  });

export const deleteCustomCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("custom_chat_commands")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: !error };
  });
