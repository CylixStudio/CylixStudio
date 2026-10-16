import { sendKickChatMessage } from "@/lib/kickChat.server";
import type { ReceiptSession } from "@/lib/kickCommandReceipt";
import { resolveCommandTemplate } from "@/lib/commandTemplate.server";
import { type ChatCommandPlatform } from "@/lib/customCommands";
import { COMMAND_PERMISSION_DENIED, isCommandMinRole, senderMayRun } from "@/lib/commandAccess";
import {
  applyDollarPlaceholders,
  catalogDefaultCommands,
  formatFollowDuration,
  matchDefaultCommand,
  isRuntimeCommandId,
  mergeRuntimeDefaultCommands,
  parseShoutoutTarget,
  type DefaultCommand,
} from "@/lib/defaultCommands";
import { commandsPublicKeyForUser } from "@/lib/publicChannel.server";
import { supabaseAdmin } from "@/lib/supabase/client.server";

type ChatSender = {
  username: string;
  identityBadges?: readonly string[];
  senderPlatformId?: string | null;
};

const cooldowns = new Map<string, number>();
const ARABIC_LETTER = /[\u0600-\u06FF]/;

async function loadDefaultCommands(userId: string): Promise<DefaultCommand[]> {
  const { data, error } = await supabaseAdmin
    .from("default_chat_commands")
    .select("command_id, enabled, response, fallback_response, platforms, cooldown_seconds, min_role, updated_at")
    .eq("user_id", userId);
  const rows = error
    ? (
        await supabaseAdmin
          .from("default_chat_commands")
          .select("command_id, enabled, response, fallback_response, platforms, cooldown_seconds, updated_at")
          .eq("user_id", userId)
      ).data
    : data;
  return mergeRuntimeDefaultCommands(
    (rows ?? []).flatMap((row) => {
      if (!isRuntimeCommandId(row.command_id)) return [];
      const minRole = "min_role" in row && isCommandMinRole(row.min_role) ? row.min_role : undefined;
      return [
        {
          id: row.command_id,
          enabled: row.enabled,
          response: row.response,
          fallbackResponse: row.fallback_response,
          platforms: (row.platforms ?? []).filter(
            (platform): platform is ChatCommandPlatform => platform === "KICK" || platform === "TWITCH",
          ),
          cooldownSeconds: row.cooldown_seconds,
          ...(minRole ? { minRole } : {}),
          updatedAt: row.updated_at,
        },
      ];
    }),
    "en",
  );
}

async function lookupKickFollowage(
  userId: string,
  viewer: string,
  arabic: boolean,
): Promise<string | null> {
  const { data: connection } = await supabaseAdmin
    .from("platform_connections")
    .select("username")
    .eq("user_id", userId)
    .eq("platform", "KICK")
    .eq("is_active", true)
    .maybeSingle();
  const slug = connection?.username?.trim();
  if (!slug || !viewer) return null;

  try {
    const response = await fetch(
      `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/users/${encodeURIComponent(viewer)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      following_since?: string;
      followed_at?: string;
      follower_since?: string;
    };
    const raw = payload.following_since ?? payload.followed_at ?? payload.follower_since;
    if (!raw) return null;
    const started = Date.parse(raw);
    if (!Number.isFinite(started)) return null;
    return formatFollowDuration(Date.now() - started, arabic);
  } catch {
    return null;
  }
}

export async function handleDefaultChatCommand(input: {
  userId: string;
  broadcasterUserId: string;
  platform: ChatCommandPlatform;
  text: string;
  sender: ChatSender;
  origin?: string;
  replyToMessageId?: string | null;
  receiptSession?: ReceiptSession | null;
}): Promise<{ status: string; reason?: string; command?: string }> {
  const commands = await loadDefaultCommands(input.userId);
  const matched = matchDefaultCommand(input.text, commands, input.platform);
  if (!matched) return { status: "ignored", reason: "no_match" };

  const { command, argument } = matched;
  if (!command.runsInChat) return { status: "ignored", reason: "no_match" };
  if (!command.enabled || !command.platforms.includes(input.platform)) {
    return {
      status: "ignored",
      reason: command.id === "commands" ? "reserved" : "disabled",
      command: command.trigger,
    };
  }
  const allowed = senderMayRun({
    minRole: command.minRole,
    identityBadges: input.sender.identityBadges ?? [],
    senderPlatformId: input.sender.senderPlatformId,
    broadcasterUserId: input.broadcasterUserId,
  });
  if (!allowed) {
    if (input.platform === "KICK" && command.enabled) {
      await sendKickChatMessage(input.userId, input.broadcasterUserId, COMMAND_PERMISSION_DENIED, null, { ...(input.receiptSession !== undefined ? { receiptSession: input.receiptSession } : {}) });
    }
    return { status: "ignored", reason: "not_permitted", command: command.trigger };
  }
  if (command.cooldownSeconds > 0) {
    const key = `${input.userId}:${command.id}`;
    const last = cooldowns.get(key) ?? 0;
    if (Date.now() - last < command.cooldownSeconds * 1000) {
      return { status: "ignored", reason: "cooldown" };
    }
    cooldowns.set(key, Date.now());
  }

  const arabic = ARABIC_LETTER.test(command.response + command.fallbackResponse);
  const vars = {
    user: input.sender.username,
    command: command.trigger,
    target: parseShoutoutTarget(argument),
    list: "",
    followage: "",
  };

  if (command.id === "commands") {
    const username = await commandsPublicKeyForUser(input.userId);
    if (!username) return { status: "ignored", reason: "unpublished", command: "!commands" };
    const url = `https://cylixstudio.com/commands/${username}`;
    const templated = applyDollarPlaceholders(command.response, {
      url,
      username: input.sender.username,
      name: input.sender.username,
    }).trim();
    const reply = templated.includes(url)
      ? templated
      : `You can find a list of all Commands here :${url}`;
    if (input.platform === "KICK") {
      const sent = await sendKickChatMessage(
        input.userId,
        input.broadcasterUserId,
        reply,
        input.replyToMessageId,
        { ...(input.receiptSession !== undefined ? { receiptSession: input.receiptSession } : {}) },
      );
      if (!sent) return { status: "error", reason: "send_failed", command: "!commands" };
    }
    return { status: "replied", command: "!commands" };
  }

  let template = command.response;
  if (command.id === "followage") {
    const duration = await lookupKickFollowage(input.userId, input.sender.username, arabic);
    const lines = command.response
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (duration) {
      vars.followage = duration;
      template = lines.length > 1 ? lines[1]! : command.response;
    } else {
      template =
        lines[0] ||
        command.fallbackResponse ||
        catalogDefaultCommands("en").find((item) => item.id === "followage")?.fallbackResponse ||
        command.response;
    }
    template = applyDollarPlaceholders(template, {
      username: input.sender.username,
      name: input.sender.username,
      time: duration ?? "",
    });
  } else if (command.id === "so" && !vars.target) {
    template = command.fallbackResponse || command.response;
  }

  const reply = await resolveCommandTemplate({
    template,
    message: input.text,
    command: command.trigger,
    platform: input.platform,
    userId: input.userId,
    senderUsername: input.sender.username,
    target: vars.target,
    list: vars.list,
    followage: vars.followage,
  });
  if (!reply) return { status: "ignored", reason: "empty_reply" };

  if (input.platform === "KICK") {
    const sent = await sendKickChatMessage(input.userId, input.broadcasterUserId, reply, null, { ...(input.receiptSession !== undefined ? { receiptSession: input.receiptSession } : {}) });
    if (!sent) return { status: "error", reason: "send_failed", command: command.trigger };
  }

  return { status: "replied", command: command.trigger };
}
