import { COMMAND_PERMISSION_DENIED, isCommandMinRole, type CommandMinRole } from "@/lib/commandAccess";
import { catalogDefaultCommand } from "@/lib/defaultCommands";
import { sendKickChatMessage } from "@/lib/kickChat.server";
import type { ReceiptSession } from "@/lib/kickCommandReceipt";
import { isPointsCommandAttempt, parsePointsCommand, pointsCommandPermitted } from "@/lib/pointsCommand";
import { recentChatterNames } from "@/lib/recentChatters";
import { supabaseAdmin } from "@/lib/supabase/client.server";

const POINTS_DENIED = COMMAND_PERMISSION_DENIED;

export { parsePointsCommand };

async function loadPointsGate(userId: string, commandId: "points" | "points_add") {
  const fallback: CommandMinRole = catalogDefaultCommand(commandId)?.minRole ?? "everyone";
  const { data, error } = await supabaseAdmin
    .from("default_chat_commands")
    .select("enabled, min_role")
    .eq("user_id", userId)
    .eq("command_id", commandId)
    .maybeSingle();
  if (error || !data) return { enabled: true, minRole: fallback };
  return {
    enabled: data.enabled,
    minRole: isCommandMinRole(data.min_role) ? data.min_role : fallback,
  };
}

async function members(userId: string) {
  const { data } = await supabaseAdmin
    .from("loyalty_members")
    .select("id, display_name, points")
    .eq("user_id", userId);
  return data ?? [];
}

function findMember(rows: { id: string; display_name: string; points: number }[], name: string) {
  const needle = name.trim().toLowerCase();
  return rows.find((row) => row.display_name.trim().toLowerCase() === needle) ?? null;
}

export async function handlePointsCommand(input: {
  userId: string;
  broadcasterUserId: string;
  text: string;
  sender: string;
  senderPlatformId?: string | null;
  identityBadges?: readonly string[];
  receiptSession?: ReceiptSession | null;
}): Promise<{ status: string; reason?: string; command?: string }> {
  const action = parsePointsCommand(input.text);
  if (!action) {
    if (isPointsCommandAttempt(input.text)) {
      return { status: "ignored", reason: "invalid_args", command: "!points" };
    }
    return { status: "ignored", reason: "no_match" };
  }

  const lookup = await loadPointsGate(input.userId, "points");
  const add = await loadPointsGate(input.userId, "points_add");
  if (action.kind === "balance" && !lookup.enabled) return { status: "ignored", reason: "disabled" };
  if (action.kind === "add" && !add.enabled) return { status: "ignored", reason: "disabled" };

  if (
    !pointsCommandPermitted({
      kind: action.kind,
      identityBadges: input.identityBadges ?? [],
      senderPlatformId: input.senderPlatformId,
      broadcasterUserId: input.broadcasterUserId,
      lookupMinRole: lookup.minRole,
      addMinRole: add.minRole,
    })
  ) {
    const sent = await sendKickChatMessage(input.userId, input.broadcasterUserId, POINTS_DENIED, null, { ...(input.receiptSession !== undefined ? { receiptSession: input.receiptSession } : {}) });
    if (!sent) return { status: "error", reason: "not_permitted", command: "!points" };
    return { status: "replied", reason: "not_permitted", command: "!points" };
  }

  const rows = await members(input.userId);
  let reply = "";

  if (action.kind === "balance") {
    const member = findMember(rows, input.sender);
    reply = `${input.sender}: ${member?.points ?? 0} points`;
  } else if (action.target === "all") {
    const present = recentChatterNames(input.userId);
    if (present.length === 0) {
      reply = "No recent Kick chatters on this server to update.";
    } else {
      let touched = 0;
      for (const name of present) {
        const member = findMember(rows, name);
        if (action.kind === "add") {
          if (member) {
            await supabaseAdmin
              .from("loyalty_members")
              .update({ points: member.points + action.amount })
              .eq("id", member.id);
          } else {
            await supabaseAdmin.from("loyalty_members").insert({
              user_id: input.userId,
              display_name: name.slice(0, 80),
              points: action.amount,
            });
          }
          touched += 1;
        } else if (member) {
          await supabaseAdmin
            .from("loyalty_members")
            .update({ points: Math.max(0, member.points - action.amount) })
            .eq("id", member.id);
          touched += 1;
        }
      }
      reply =
        action.kind === "add"
          ? `Added ${action.amount} points to ${touched} recent chatters.`
          : `Removed ${action.amount} points from ${touched} recent chatters.`;
    }
  } else {
    const member = findMember(rows, action.target);
    if (action.kind === "add") {
      const next = (member?.points ?? 0) + action.amount;
      if (member) {
        await supabaseAdmin.from("loyalty_members").update({ points: next }).eq("id", member.id);
      } else {
        await supabaseAdmin.from("loyalty_members").insert({
          user_id: input.userId,
          display_name: action.target.slice(0, 80),
          points: action.amount,
        });
      }
      reply = `${action.target}: ${next} points`;
    } else if (!member) {
      reply = `${action.target}: 0 points`;
    } else {
      const next = Math.max(0, member.points - action.amount);
      await supabaseAdmin.from("loyalty_members").update({ points: next }).eq("id", member.id);
      reply = `${action.target}: ${next} points`;
    }
  }

  const sent = await sendKickChatMessage(input.userId, input.broadcasterUserId, reply, null, { ...(input.receiptSession !== undefined ? { receiptSession: input.receiptSession } : {}) });
  if (!sent) return { status: "error", reason: "send_failed", command: "!points" };
  return { status: "replied", command: "!points" };
}
