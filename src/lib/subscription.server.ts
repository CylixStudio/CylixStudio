import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/** Active Pro / prepaid license — Free-tier limits do not apply when true. */
export async function userHasActivePro(supabase: Client, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("subscription_status, expires_at, is_lifetime")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  if (data.is_lifetime && data.subscription_status === "active") return true;
  if (data.subscription_status !== "active" || !data.expires_at) return false;
  return new Date(data.expires_at).getTime() > Date.now();
}

/** Throws `pro_required` when the account has no active paid Pro subscription. */
export async function assertActivePro(supabase: Client, userId: string): Promise<void> {
  if (!(await userHasActivePro(supabase, userId))) throw new Error("pro_required");
}
