import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase/client";
import { isTestMode } from "@/lib/testMode";

export type SubscriptionState = {
  status: "active" | "expired" | "inactive";
  expiresAt: string | null;
  activeCode: string | null;
  daysLeft: number;
  lifetime: boolean;
  isActive: boolean;
};

const DAY = 86_400_000;

/** Current user's license state — drives every feature lock in the app. */
export function useSubscription(userId: string) {
  return useQuery({
    queryKey: ["subscription", userId],
    enabled: userId.length > 0,
    queryFn: async (): Promise<SubscriptionState> => {
      if (isTestMode()) {
        return {
          status: "active",
          expiresAt: null,
          activeCode: "TEST-MODE",
          daysLeft: 36500,
          lifetime: true,
          isActive: true,
        };
      }
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("subscription_status, expires_at, active_code, is_lifetime")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;

      const expiresAt = data?.expires_at ?? null;
      const expiryMs = expiresAt ? new Date(expiresAt).getTime() : 0;
      const lifetimeActive = Boolean(data?.is_lifetime) && data?.subscription_status === "active";
      const timedActive = data?.subscription_status === "active" && expiryMs > Date.now();
      const isActive = lifetimeActive || timedActive;
      const daysLeft = timedActive ? Math.max(0, Math.ceil((expiryMs - Date.now()) / DAY)) : lifetimeActive ? LIFETIME_DAYS : 0;

      return {
        status: isActive ? "active" : data ? "expired" : "inactive",
        expiresAt,
        activeCode: data?.active_code ?? null,
        daysLeft,
        lifetime: Boolean(data?.is_lifetime) || daysLeft > 3650,
        isActive,
      };
    },
    staleTime: 30_000,
  });
}

export const LIFETIME_DAYS = 36500;

/** "1 Year", "45 Days", "Lifetime" — used in the admin codes table. */
export function durationLabel(days: number, ar: boolean) {
  if (days >= LIFETIME_DAYS) return "Lifetime ♾️";
  if (days === 365) return "1 Year";
  if (days === 180) return "6 Months";
  if (days === 90) return "3 Months";
  if (days === 60) return "2 Months";
  if (days === 30) return "1 Month";
  return `${days} Days`;
}

/** "2 Months and 14 Days Remaining" / "28 Days Left". */
export function remainingLabel(daysLeft: number, lifetime: boolean, ar: boolean) {
  if (lifetime) return "Lifetime Access ♾️";
  if (daysLeft <= 0) return "Expired";

  const years = Math.floor(daysLeft / 365);
  const months = Math.floor((daysLeft % 365) / 30);
  const days = daysLeft - years * 365 - months * 30;

  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? "Year" : "Years"}`);
  if (months) parts.push(`${months} ${months === 1 ? "Month" : "Months"}`);
  if (days || parts.length === 0)
    parts.push(`${days} ${days === 1 ? "Day" : "Days"}`);

  const joined = parts.join(" and ");
  return `${joined} Remaining`;
}


/**
 * True when the signed-in user is an admin — either through the admin role row
 * or through one of the hardcoded store admin emails (checked server-side).
 */
export function useIsAdmin(userId: string, enabled = true) {
  return useQuery({
    queryKey: ["is-admin", userId],
    enabled: enabled && userId.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 60_000,
  });
}

export type ActivationCode = {
  id: string;
  code: string;
  duration_days: number;
  is_used: boolean;
  is_active: boolean;
  notes: string | null;
  used_by_user_id: string | null;
  redeemed_by_email: string | null;
  created_at: string;
  redeemed_at: string | null;
  is_revoked: boolean;
  revoked_at: string | null;
};

export function useActivationCodes(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["activation-codes"],
    queryFn: async (): Promise<ActivationCode[]> => {
      const { data, error } = await supabase
        .from("activation_codes")
        .select(
          "id, code, duration_days, is_used, is_active, notes, used_by_user_id, redeemed_by_email, created_at, redeemed_at, is_revoked, revoked_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function formatCode(raw: string) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return clean.replace(/(.{4})(?=.)/g, "$1-");
}

export function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}
