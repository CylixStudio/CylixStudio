import { pickWeightedPrize, type SpinPrize } from "@/lib/widgets";

/** `!wheel` / `wheel` / `!spin` / `spin`, case-insensitive. */
export function matchWheelCommand(text: string): boolean {
  return /^!?(?:wheel|spin)$/i.test(text.trim());
}

export type WheelMemberSnapshot = {
  id: string;
  displayName: string;
  points: number;
};

export type WheelSpinRefusal = "test" | "no_prizes" | "no_member" | "insufficient_points";

export type WheelSpinDecision =
  | { ok: false; reason: WheelSpinRefusal }
  | {
      ok: true;
      prize: string;
      cost: number;
      memberId: string | null;
      nextPoints: number | null;
    };

/** Pure spin rules. Does not create members, deduct points, or write rows. */
export function decideWheelSpin(input: {
  isTest: boolean;
  cost: number;
  prizes: SpinPrize[];
  member: WheelMemberSnapshot | null;
}): WheelSpinDecision {
  if (input.isTest) return { ok: false, reason: "test" };
  const cost = Number.isFinite(input.cost) ? Math.max(0, Math.round(input.cost)) : 0;
  const prize = pickWeightedPrize(input.prizes);
  if (!prize) return { ok: false, reason: "no_prizes" };
  if (cost === 0) {
    return { ok: true, prize, cost: 0, memberId: null, nextPoints: null };
  }
  const member = input.member;
  if (!member) return { ok: false, reason: "no_member" };
  if (member.points < cost) return { ok: false, reason: "insufficient_points" };
  return {
    ok: true,
    prize,
    cost,
    memberId: member.id,
    nextPoints: member.points - cost,
  };
}

export function wheelChatReply(username: string, decision: WheelSpinDecision): string | null {
  if (!decision.ok) {
    if (decision.reason === "test") return null;
    return "ما تقدر تدور العجلة.";
  }
  const name = username.trim();
  const mention = name ? `@${name} ` : "";
  const spent = decision.cost > 0 ? ` (−${decision.cost})` : "";
  return `${mention}${decision.prize}${spent}`;
}
