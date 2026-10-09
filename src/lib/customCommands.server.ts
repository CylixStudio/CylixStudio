import { sendKickChatMessage } from "@/lib/kickChat.server";
import { resolveCommandTemplate } from "@/lib/commandTemplate.server";
import {
  commandTrigger,
  matchCustomCommand,
  normalizeChatText,
  normalizeTriggerMarker,
  sanitizeCommandName,
  type ChatCommandPlatform,
  type CustomChatCommand,
} from "@/lib/customCommands";
import { supabaseAdmin } from "@/lib/supabase/client.server";

type ChatSender = {
  username: string;
  identityBadges: string[];
};

const cooldowns = new Map<string, number>();

function senderRoles(badges: string[]): Set<string> {
  const roles = new Set<string>(["Everyone"]);
  for (const badge of badges) {
    const type = badge.toLowerCase();
    if (type.includes("moderator") || type.includes("broadcaster")) roles.add("Mods");
    if (type.includes("vip")) roles.add("VIPs");
    if (type.includes("sub") || type.includes("founder")) roles.add("Subs");
  }
  return roles;
}

function isAllowed(command: CustomChatCommand, badges: string[]): boolean {
  if (command.roles.includes("Everyone")) return true;
  const held = senderRoles(badges);
  return command.roles.some((role) => held.has(role));
}

async function loadCommands(userId: string): Promise<{
  defaultPrefix: string;
  commands: CustomChatCommand[];
}> {
  const [{ data: settings, error: settingsError }, { data: rows, error: rowsError }] =
    await Promise.all([
      supabaseAdmin
        .from("custom_chat_command_settings")
        .select("default_prefix")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("custom_chat_commands")
        .select(
          "id, name, prefix, response, enabled, platforms, roles, cooldown_seconds, created_at, updated_at",
        )
        .eq("user_id", userId)
        .eq("enabled", true),
    ]);

  if (settingsError) {
    console.warn("[custom-commands] settings load failed", settingsError.message);
  }
  if (rowsError) {
    console.warn("[custom-commands] commands load failed", rowsError.message);
  }

  return {
    defaultPrefix: normalizeTriggerMarker(settings?.default_prefix ?? "!"),
    commands: (rows ?? [])
      .map((row) => {
        const platforms = (row.platforms ?? []).filter(
          (platform): platform is ChatCommandPlatform =>
            platform === "KICK" || platform === "TWITCH",
        );
        const name = sanitizeCommandName(row.name ?? "");
        if (!name) return null;
        return {
          id: row.id,
          name,
          prefix: row.prefix === null ? null : normalizeTriggerMarker(row.prefix),
          response: typeof row.response === "string" ? row.response.normalize("NFC") : "",
          enabled: row.enabled,
          platforms: platforms.length ? platforms : (["KICK"] as ChatCommandPlatform[]),
          roles: row.roles?.length ? row.roles : ["Everyone"],
          cooldownSeconds: row.cooldown_seconds,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        } satisfies CustomChatCommand;
      })
      .filter((command): command is CustomChatCommand => command != null),
  };
}

export async function handleCustomChatCommand(input: {
  userId: string;
  broadcasterUserId: string;
  platform: ChatCommandPlatform;
  text: string;
  sender: ChatSender;
}): Promise<{ status: string; reason?: string; command?: string }> {
  const { defaultPrefix, commands } = await loadCommands(input.userId);
  const text = normalizeChatText(input.text);
  if (!text) return { status: "ignored", reason: "empty_text" };

  const matched = matchCustomCommand(text, commands, defaultPrefix, input.platform);
  if (!matched) {
    console.log("[custom-commands] no_match", {
      platform: input.platform,
      text,
      commandCount: commands.length,
      defaultPrefix,
    });
    return { status: "ignored", reason: "no_match" };
  }
  if (!isAllowed(matched, input.sender.identityBadges)) {
    return { status: "ignored", reason: "not_permitted", command: matched.name };
  }

  if (matched.cooldownSeconds > 0) {
    const key = `${input.userId}:${matched.id}`;
    const last = cooldowns.get(key) ?? 0;
    if (Date.now() - last < matched.cooldownSeconds * 1000) {
      return { status: "ignored", reason: "cooldown", command: matched.name };
    }
    cooldowns.set(key, Date.now());
  }

  const trigger = commandTrigger(matched, defaultPrefix);
  const reply = await resolveCommandTemplate({
    template: matched.response,
    message: text,
    command: trigger,
    platform: input.platform,
    userId: input.userId,
    senderUsername: input.sender.username,
  });
  if (!reply) return { status: "ignored", reason: "empty_reply", command: trigger };

  if (input.platform === "KICK") {
    const sent = await sendKickChatMessage(input.userId, input.broadcasterUserId, reply);
    if (!sent) {
      console.warn("[custom-commands] kick send_failed", {
        userId: input.userId,
        trigger,
        replyLength: reply.length,
      });
      return { status: "error", reason: "send_failed", command: trigger };
    }
  }

  return { status: "replied", command: trigger };
}
