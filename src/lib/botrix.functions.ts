import { createServerFn } from "@tanstack/react-start";

import {
  normalizeBotRixPlatform,
  type BotRixLookupResult,
  type BotRixPlatform,
  type BotRixShopItem,
} from "@/lib/botrix";
import { lookupBotRixPublicData } from "@/lib/botrix.server";
import {
  isReservedCustomCommandName,
  resolveStoredMarker,
  sanitizeCommandName,
  type ChatCommandPlatform,
} from "@/lib/customCommands";
import { FREE_PLAN_LIMITS } from "@/lib/plans";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { userHasActivePro } from "@/lib/subscription.server";

const IMPORT_LIMIT = 100;

export type BotRixCommandImportInput = {
  platform: string;
  commands: { cmd: string; message: string; mods: boolean }[];
};

export type BotRixCommandImportResult =
  | { ok: true; imported: number; skipped: number; limited: boolean }
  | { ok: false; error: "invalid_platform" | "save_failed"; imported: number; skipped: number };

function readImport(input: unknown): BotRixCommandImportInput {
  if (!input || typeof input !== "object") return { platform: "", commands: [] };
  const record = input as Record<string, unknown>;
  const platform = typeof record["platform"] === "string" ? record["platform"] : "";
  const raw = Array.isArray(record["commands"]) ? record["commands"] : [];
  const commands: BotRixCommandImportInput["commands"] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const cmd = typeof item["cmd"] === "string" ? item["cmd"].slice(0, 80) : "";
    if (!cmd.trim()) continue;
    commands.push({
      cmd,
      message: typeof item["message"] === "string" ? item["message"].slice(0, 500) : "",
      mods: item["mods"] === true,
    });
    if (commands.length >= IMPORT_LIMIT) break;
  }
  return { platform, commands };
}

function commandPlatforms(platform: BotRixPlatform): ChatCommandPlatform[] {
  if (platform === "twitch") return ["TWITCH"];
  if (platform === "kick") return ["KICK"];
  return ["KICK", "TWITCH"];
}

function commandDraft(cmd: string, message: string, mods: boolean, platform: BotRixPlatform) {
  const trimmed = cmd.trim();
  const marker = trimmed.startsWith("!") ? "!" : trimmed.startsWith("#") ? "#" : "";
  const name = sanitizeCommandName(trimmed);
  if (!name || isReservedCustomCommandName(name)) return null;
  const response = message.normalize("NFC").trim().slice(0, 480);
  if (!response) return null;
  return {
    name,
    prefix: resolveStoredMarker(marker, name),
    response,
    platforms: commandPlatforms(platform),
    roles: mods ? ["Mods"] : ["Everyone"],
  };
}

function readInput(input: unknown): { streamerName: string; platform: string } {
  if (!input || typeof input !== "object") return { streamerName: "", platform: "" };
  const record = input as Record<string, unknown>;
  return {
    streamerName: typeof record["streamerName"] === "string" ? record["streamerName"] : "",
    platform: typeof record["platform"] === "string" ? record["platform"] : "",
  };
}

/** Public BotRix commands, shop, and leaderboard. Failures stay inside the result. */
export const lookupBotRixPublic = createServerFn({ method: "POST" })
  .inputValidator(readInput)
  .handler(async ({ data }): Promise<BotRixLookupResult> => {
    try {
      return await lookupBotRixPublicData(data);
    } catch {
      return { ok: false, error: "unavailable" };
    }
  });

/** Copies BotRix commands into the signed-in user's custom chat commands. Skips duplicates. */
export const importBotRixCommands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(readImport)
  .handler(async ({ data, context }): Promise<BotRixCommandImportResult> => {
    const platform = normalizeBotRixPlatform(data.platform);
    if (!platform) return { ok: false, error: "invalid_platform", imported: 0, skipped: 0 };

    const { supabase, userId } = context;
    try {
      const { data: existing, error: readError } = await supabase
        .from("custom_chat_commands")
        .select("name")
        .eq("user_id", userId);
      if (readError) return { ok: false, error: "save_failed", imported: 0, skipped: 0 };

      const seen = new Set((existing ?? []).map((row) => row.name.toLowerCase()));
      const isPro = await userHasActivePro(supabase, userId);
      let room = Number.POSITIVE_INFINITY;
      if (!isPro) {
        const { count, error: countError } = await supabase
          .from("custom_chat_commands")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        if (countError) return { ok: false, error: "save_failed", imported: 0, skipped: 0 };
        room = Math.max(0, FREE_PLAN_LIMITS.customCommands - (count ?? 0));
      }

      let imported = 0;
      let skipped = 0;
      let limited = false;
      for (const command of data.commands) {
        const draft = commandDraft(command.cmd, command.message, command.mods, platform);
        if (!draft) {
          skipped += 1;
          continue;
        }
        const key = draft.name.toLowerCase();
        if (seen.has(key)) {
          skipped += 1;
          continue;
        }
        if (room <= 0) {
          limited = true;
          skipped += 1;
          continue;
        }
        const { error } = await supabase.from("custom_chat_commands").insert({
          user_id: userId,
          name: draft.name,
          prefix: draft.prefix,
          response: draft.response,
          enabled: true,
          platforms: draft.platforms,
          roles: draft.roles,
          cooldown_seconds: 0,
        });
        if (error) {
          if (error.code === "23505") {
            seen.add(key);
            skipped += 1;
            continue;
          }
          return { ok: false, error: "save_failed", imported, skipped };
        }
        seen.add(key);
        imported += 1;
        room -= 1;
      }

      return { ok: true, imported, skipped, limited };
    } catch {
      return { ok: false, error: "save_failed", imported: 0, skipped: 0 };
    }
  });

function readShop(input: unknown): { items: BotRixShopItem[] } {
  if (!input || typeof input !== "object") return { items: [] };
  const raw = Array.isArray((input as { items?: unknown }).items) ? (input as { items: unknown[] }).items : [];
  const items: BotRixShopItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const name = typeof item["name"] === "string" ? item["name"].trim().slice(0, 80) : "";
    if (!name) continue;
    const price = typeof item["price"] === "number" && Number.isFinite(item["price"]) ? item["price"] : null;
    items.push({
      name,
      description: typeof item["description"] === "string" ? item["description"].slice(0, 400) : "",
      price,
      image: null,
    });
    if (items.length >= IMPORT_LIMIT) break;
  }
  return { items };
}

/** Copies BotRix shop rows into loyalty_shop_items. Skips duplicate names. */
export const importBotRixShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(readShop)
  .handler(async ({ data, context }): Promise<BotRixCommandImportResult> => {
    const { supabase, userId } = context;
    try {
      const { data: existing, error: readError } = await supabase
        .from("loyalty_shop_items")
        .select("name")
        .eq("user_id", userId);
      if (readError) return { ok: false, error: "save_failed", imported: 0, skipped: 0 };

      const seen = new Set((existing ?? []).map((row) => row.name.toLowerCase()));
      let imported = 0;
      let skipped = 0;
      for (const item of data.items) {
        const key = item.name.toLowerCase();
        if (seen.has(key)) {
          skipped += 1;
          continue;
        }
        const { error } = await supabase.from("loyalty_shop_items").insert({
          user_id: userId,
          name: item.name,
          description: item.description,
          cost: Math.max(0, Math.round(item.price ?? 0)),
          enabled: true,
        });
        if (error) {
          if (error.code === "23505") {
            seen.add(key);
            skipped += 1;
            continue;
          }
          return { ok: false, error: "save_failed", imported, skipped };
        }
        seen.add(key);
        imported += 1;
      }
      return { ok: true, imported, skipped, limited: false };
    } catch {
      return { ok: false, error: "save_failed", imported: 0, skipped: 0 };
    }
  });
