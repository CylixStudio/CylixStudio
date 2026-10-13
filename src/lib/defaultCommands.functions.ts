import { createServerFn } from "@tanstack/react-start";

import type { ChatCommandPlatform } from "@/lib/customCommands";
import { isCommandMinRole, type CommandMinRole } from "@/lib/commandAccess";
import {
  catalogDefaultCommands,
  isDefaultCommandId,
  isRuntimeCommandId,
  mergeDefaultCommands,
  sanitizeCooldown,
  type DefaultCommand,
  type DefaultCommandInput,
} from "@/lib/defaultCommands";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

const PLATFORMS: ChatCommandPlatform[] = ["KICK", "TWITCH"];

function mapRow(row: {
  command_id: string;
  enabled: boolean;
  response: string;
  fallback_response: string;
  platforms: string[];
  cooldown_seconds: number;
  min_role?: string | null;
  updated_at: string;
}): (Partial<DefaultCommand> & { id: DefaultCommand["id"] }) | null {
  if (!isRuntimeCommandId(row.command_id)) return null;
  const platforms = row.platforms.filter((platform): platform is ChatCommandPlatform =>
    PLATFORMS.includes(platform as ChatCommandPlatform),
  );
  return {
    id: row.command_id,
    enabled: row.enabled,
    response: row.response,
    fallbackResponse: row.fallback_response,
    platforms: platforms.length ? platforms : ["KICK"],
    cooldownSeconds: row.cooldown_seconds,
    ...(isCommandMinRole(row.min_role) ? { minRole: row.min_role } : {}),
    updatedAt: row.updated_at,
  };
}

const DEFAULT_COLUMNS =
  "command_id, enabled, response, fallback_response, platforms, cooldown_seconds, min_role, updated_at";
const DEFAULT_COLUMNS_LEGACY =
  "command_id, enabled, response, fallback_response, platforms, cooldown_seconds, updated_at";

export const listDefaultCommands = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DefaultCommand[]> => {
    const withRole = await context.supabase
      .from("default_chat_commands")
      .select(DEFAULT_COLUMNS)
      .eq("user_id", context.userId);
    const rows = withRole.error
      ? (
          await context.supabase
            .from("default_chat_commands")
            .select(DEFAULT_COLUMNS_LEGACY)
            .eq("user_id", context.userId)
        ).data
      : withRole.data;
    return mergeDefaultCommands(
      (rows ?? []).flatMap((row) => {
        const mapped = mapRow(row);
        return mapped ? [mapped] : [];
      }),
      "en",
    );
  });

export const upsertDefaultCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DefaultCommandInput) => input)
  .handler(async ({ data, context }) => {
    if (!isDefaultCommandId(data.id)) return { ok: false as const, error: "unknown_command" };
    const catalog = catalogDefaultCommands("en").find((item) => item.id === data.id);
    const response = data.response.trim().slice(0, 480) || catalog?.response || "";
    if (!response) return { ok: false as const, error: "response_required" };
    const platforms = data.platforms.filter((platform) => PLATFORMS.includes(platform));
    const minRole: CommandMinRole = isCommandMinRole(data.minRole)
      ? data.minRole
      : (catalog?.minRole ?? "everyone");
    const { error } = await context.supabase.from("default_chat_commands").upsert(
      {
        user_id: context.userId,
        command_id: data.id,
        enabled: Boolean(data.enabled),
        response,
        fallback_response: data.fallbackResponse.trim().slice(0, 480),
        platforms: platforms.length ? platforms : ["KICK"],
        cooldown_seconds: sanitizeCooldown(data.cooldownSeconds),
        min_role: minRole,
      },
      { onConflict: "user_id,command_id" },
    );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const setDefaultCommandEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; enabled: boolean }) => input)
  .handler(async ({ data, context }) => {
    if (!isDefaultCommandId(data.id)) return { ok: false as const, error: "unknown_command" };
    const catalog = catalogDefaultCommands("en").find((item) => item.id === data.id);
    const { data: existing } = await context.supabase
      .from("default_chat_commands")
      .select("command_id")
      .eq("user_id", context.userId)
      .eq("command_id", data.id)
      .maybeSingle();
    if (!existing) {
      const { error } = await context.supabase.from("default_chat_commands").insert({
        user_id: context.userId,
        command_id: data.id,
        enabled: Boolean(data.enabled),
        response: catalog?.response ?? data.id,
        fallback_response: catalog?.fallbackResponse ?? "",
        platforms: ["KICK", "TWITCH"],
        cooldown_seconds: 5,
        min_role: catalog?.minRole ?? "everyone",
      });
      return { ok: !error, error: error?.message };
    }
    const { error } = await context.supabase
      .from("default_chat_commands")
      .update({ enabled: Boolean(data.enabled) })
      .eq("user_id", context.userId)
      .eq("command_id", data.id);
    return { ok: !error, error: error?.message };
  });

export const setDefaultCommandRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; minRole: string }) => input)
  .handler(async ({ data, context }) => {
    if (!isDefaultCommandId(data.id) || !isCommandMinRole(data.minRole)) {
      return { ok: false as const, error: "unknown_command" };
    }
    const stored = catalogDefaultCommands("en").find((item) => item.id === data.id);
    const { data: existing } = await context.supabase
      .from("default_chat_commands")
      .select("command_id")
      .eq("user_id", context.userId)
      .eq("command_id", data.id)
      .maybeSingle();
    if (!existing) {
      const { error } = await context.supabase.from("default_chat_commands").insert({
        user_id: context.userId,
        command_id: data.id,
        enabled: true,
        response: stored?.response ?? data.id,
        fallback_response: stored?.fallbackResponse ?? "",
        platforms: ["KICK", "TWITCH"],
        cooldown_seconds: 5,
        min_role: data.minRole,
      });
      return { ok: !error, error: error?.message };
    }
    const { error } = await context.supabase
      .from("default_chat_commands")
      .update({ min_role: data.minRole })
      .eq("user_id", context.userId)
      .eq("command_id", data.id);
    return { ok: !error, error: error?.message };
  });
