export const COMMAND_MIN_ROLES = [
  "everyone",
  "subscriber",
  "vip",
  "og",
  "moderator",
  "broadcaster",
] as const;

export type CommandMinRole = (typeof COMMAND_MIN_ROLES)[number];

/** Highest rank first. A sender may run a command when their rank is at least the minimum. */
const RANK: Record<CommandMinRole, number> = {
  everyone: 0,
  subscriber: 1,
  vip: 2,
  og: 3,
  moderator: 4,
  broadcaster: 5,
};

/**
 * Exact Kick `sender.identity.badges[].type` values.
 * `mod` is the short form already trusted by the points gate.
 * staff, editor, admin, and global_moderator are not channel moderators.
 */
const BADGE_ROLE: Record<string, CommandMinRole> = {
  broadcaster: "broadcaster",
  moderator: "moderator",
  mod: "moderator",
  og: "og",
  vip: "vip",
  subscriber: "subscriber",
};

export const COMMAND_PERMISSION_DENIED = "أنت لا تملك صلاحية استخدام هذا الأمر";

export function isCommandMinRole(value: unknown): value is CommandMinRole {
  return typeof value === "string" && (COMMAND_MIN_ROLES as readonly string[]).includes(value);
}

export function normalizeKickBadge(badge: string): string {
  return badge.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

export function senderCommandRank(input: {
  identityBadges: readonly string[];
  senderPlatformId?: string | null | undefined;
  broadcasterUserId?: string | null | undefined;
}): CommandMinRole {
  let best: CommandMinRole = "everyone";
  const senderId = input.senderPlatformId?.trim() ?? "";
  const ownerId = input.broadcasterUserId?.trim() ?? "";
  if (senderId && ownerId && senderId === ownerId) best = "broadcaster";
  for (const badge of input.identityBadges) {
    const role = BADGE_ROLE[normalizeKickBadge(badge)];
    if (role && RANK[role] > RANK[best]) best = role;
  }
  return best;
}

export function rankMeetsMinimum(held: CommandMinRole, required: CommandMinRole): boolean {
  return RANK[held] >= RANK[required];
}

export function senderMayRun(input: {
  minRole: CommandMinRole;
  identityBadges: readonly string[];
  senderPlatformId?: string | null | undefined;
  broadcasterUserId?: string | null | undefined;
}): boolean {
  return rankMeetsMinimum(senderCommandRank(input), input.minRole);
}
