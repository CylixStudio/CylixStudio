import { sendKickChatMessage } from "@/lib/clipCommand.server";
import { matchLoyaltyMember } from "@/lib/shopBuy";
import { supabaseAdmin } from "@/lib/supabase/client.server";
import type { ChatCommandPlatform } from "@/lib/customCommands";
import { parseSpinConfig } from "@/lib/widgets";
import {
  decideWheelSpin,
  matchWheelCommand,
  wheelChatReply,
  type WheelMemberSnapshot,
} from "@/lib/wheelCommand";

export async function handleWheelChatCommand(input: {
  userId: string;
  broadcasterUserId: string;
  platform: ChatCommandPlatform;
  text: string;
  sender: { username: string };
  isTest?: boolean;
}): Promise<{ status: string; reason?: string; command?: string }> {
  if (!matchWheelCommand(input.text)) return { status: "ignored", reason: "no_match" };
  if (input.isTest) return { status: "ignored", reason: "test", command: "!spin" };

  // Several spin-wheel widgets: the chat command uses the most recently updated one.
  const { data: widget } = await supabaseAdmin
    .from("widgets")
    .select("id, config")
    .eq("user_id", input.userId)
    .eq("type", "SPIN_WHEEL")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const spinConfig = parseSpinConfig(widget?.config ?? null);
  let member: WheelMemberSnapshot | null = null;
  if (spinConfig.spinCost > 0) {
    const { data: memberRows } = await supabaseAdmin
      .from("loyalty_members")
      .select("id, display_name, points")
      .eq("user_id", input.userId);
    const matched = matchLoyaltyMember(
      (memberRows ?? []).map((row) => ({
        id: row.id,
        displayName: row.display_name,
        points: row.points,
      })),
      input.sender.username,
    );
    member = matched;
  }

  const decision = decideWheelSpin({
    isTest: false,
    cost: spinConfig.spinCost,
    prizes: spinConfig.prizes,
    member,
  });

  if (decision.ok && decision.cost > 0 && decision.memberId && decision.nextPoints !== null && member) {
    const { data: updated, error } = await supabaseAdmin
      .from("loyalty_members")
      .update({ points: decision.nextPoints })
      .eq("id", decision.memberId)
      .eq("user_id", input.userId)
      .eq("points", member.points)
      .select("id");
    if (error || !updated?.length) {
      const reply = wheelChatReply(input.sender.username, { ok: false, reason: "insufficient_points" });
      if (reply && input.platform === "KICK") {
        const sent = await sendKickChatMessage(input.userId, input.broadcasterUserId, reply);
        if (!sent) return { status: "error", reason: "send_failed", command: "!spin" };
      }
      return { status: "replied", reason: "insufficient_points", command: "!spin" };
    }
  }

  if (decision.ok && widget) {
    const nonce = Date.now();
    await supabaseAdmin
      .from("widgets")
      .update({
        state: { spin: { result: decision.prize, spunAt: new Date().toISOString(), nonce } },
      })
      .eq("id", widget.id)
      .eq("user_id", input.userId);
  }

  const reply = wheelChatReply(input.sender.username, decision);
  if (!reply) return { status: "ignored", reason: decision.ok ? "empty_reply" : decision.reason, command: "!spin" };

  if (input.platform === "KICK") {
    const sent = await sendKickChatMessage(input.userId, input.broadcasterUserId, reply);
    if (!sent) return { status: "error", reason: "send_failed", command: "!spin" };
  }

  return { status: "replied", command: "!spin" };
}
