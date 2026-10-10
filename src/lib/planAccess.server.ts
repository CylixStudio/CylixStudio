import { userHasActivePro } from "@/lib/subscription.server";

export type SharedFeatureSubject =
  | { locked: true }
  | { locked: false; userId: string; isPro: boolean; viaGrant: boolean };

/**
 * Analytics and bookmarks may follow a granted channel only when that owner
 * has active Pro. Every other limit stays on the signed-in account so a Free
 * owner cannot bypass caps by switching channel.
 */
export async function resolveSharedFeatureSubject(memberId: string): Promise<SharedFeatureSubject> {
  const { resolveWorkspaceOwner } = await import("@/lib/managedChannels.server");
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const ownerId = await resolveWorkspaceOwner(memberId);
  if (ownerId !== memberId) {
    const ownerPro = await userHasActivePro(supabaseAdmin, ownerId);
    if (!ownerPro) return { locked: true };
    return { locked: false, userId: ownerId, isPro: true, viaGrant: true };
  }
  return {
    locked: false,
    userId: memberId,
    isPro: await userHasActivePro(supabaseAdmin, memberId),
    viaGrant: false,
  };
}
