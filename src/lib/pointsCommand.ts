import { senderMayRun, type CommandMinRole } from "@/lib/commandAccess";

type PointsAction =
  | { kind: "balance" }
  | { kind: "add" | "remove"; target: "all" | string; amount: number };

/** Kick `sender.identity.badges[].type` (text only when type is absent). */
const CHANNEL_STAFF_BADGES = new Set(["moderator", "mod", "broadcaster"]);

/** True for `!points` and for `!points …`, so a bad argument list cannot run another command. */
export function isPointsCommandAttempt(text: string): boolean {
  return /^!points(?:\s|$)/i.test(text.trim());
}

export function parsePointsCommand(text: string): PointsAction | null {
  const trimmed = text.trim();
  if (!isPointsCommandAttempt(trimmed)) return null;
  const rest = trimmed.replace(/^!points/i, "").trim();
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

export function pointsCommandChangesBalance(text: string): boolean {
  const action = parsePointsCommand(text);
  return action != null && action.kind !== "balance";
}

/**
 * Channel broadcaster or channel moderator only.
 * Trusted fields: Kick `sender.identity.badges[].type` (`moderator` / `broadcaster`, plus `mod`),
 * and `sender.user_id` when it equals the channel `broadcaster.user_id`.
 */
export function canManageLoyaltyPoints(input: {
  identityBadges: readonly string[];
  senderPlatformId?: string | null | undefined;
  broadcasterUserId?: string | null | undefined;
}): boolean {
  const senderId = input.senderPlatformId?.trim() ?? "";
  const ownerId = input.broadcasterUserId?.trim() ?? "";
  if (senderId && ownerId && senderId === ownerId) return true;
  return input.identityBadges.some((badge) => {
    const type = badge.toLowerCase().replace(/[_\s]+/g, "-");
    return CHANNEL_STAFF_BADGES.has(type);
  });
}

/**
 * Lookup uses the saved !points minimum (default everyone).
 * Add uses the saved !points add minimum (default broadcaster).
 * Remove stays on the moderator/broadcaster gate and ignores a looser setting.
 */
export function pointsCommandPermitted(input: {
  kind: "balance" | "add" | "remove";
  identityBadges: readonly string[];
  senderPlatformId?: string | null | undefined;
  broadcasterUserId?: string | null | undefined;
  lookupMinRole?: CommandMinRole;
  addMinRole?: CommandMinRole;
}): boolean {
  if (input.kind === "remove") return canManageLoyaltyPoints(input);
  const minRole = input.kind === "add" ? (input.addMinRole ?? "broadcaster") : (input.lookupMinRole ?? "everyone");
  return senderMayRun({
    minRole,
    identityBadges: input.identityBadges,
    senderPlatformId: input.senderPlatformId,
    broadcasterUserId: input.broadcasterUserId,
  });
}
