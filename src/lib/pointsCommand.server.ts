import { sendKickChatMessage } from "@/lib/kickChat.server";
import { recentChatterNames } from "@/lib/recentChatters";
import { supabaseAdmin } from "@/lib/supabase/client.server";

type PointsAction =
  | { kind: "balance" }
  | { kind: "add" | "remove"; target: "all" | string; amount: number };

export function parsePointsCommand(text: string): PointsAction | null {
  const trimmed = text.trim();
  if (!/^!points\b/i.test(trimmed)) return null;
  const rest = trimmed.replace(/^!points\b/i, "").trim();
  if (!rest) return { kind: "balance" };
  const match = rest.match(/^(add|remove)\s+(all|@?\S+)\s+(\d+)$/i);
  if (!match) return null;
  const amount = Number(match[3]);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) return null;
  const rawTarget = match[2] ?? "";
  const target = /^all$/i.test(rawTarget) ? "all" : rawTarget.replace(/^@+/, "");
  if (!target) return null;
  return { kind: match[1]!.toLowerCase() === "remove" ? "remove" : "add", target, amount };
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
}): Promise<{ status: string; reason?: string; command?: string }> {
  const action = parsePointsCommand(input.text);
  if (!action) return { status: "ignored", reason: "no_match" };

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

  const sent = await sendKickChatMessage(input.userId, input.broadcasterUserId, reply);
  if (!sent) return { status: "error", reason: "send_failed", command: "!points" };
  return { status: "replied", command: "!points" };
}
