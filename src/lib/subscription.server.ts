import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type SubscriptionActivityRow = {
  subscription_status?: string | null;
  expires_at?: string | null;
  is_lifetime?: boolean | null;
};

/** True only for a lifetime license or an active subscription that has not expired. */
export function subscriptionIsActive(data: SubscriptionActivityRow | null | undefined, now = Date.now()): boolean {
  if (!data) return false;
  if (data.is_lifetime && data.subscription_status === "active") return true;
  if (data.subscription_status !== "active" || !data.expires_at) return false;
  return new Date(data.expires_at).getTime() > now;
}

/** Active Pro / prepaid license — Free-tier limits do not apply when true. */
export async function userHasActivePro(supabase: Client, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("subscription_status, expires_at, is_lifetime")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return subscriptionIsActive(data);
}

/** Throws `pro_required` when the account has no active paid Pro subscription. */
export async function assertActivePro(supabase: Client, userId: string): Promise<void> {
  if (!(await userHasActivePro(supabase, userId))) throw new Error("pro_required");
}
