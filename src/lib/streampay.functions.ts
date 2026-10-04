import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import type { ProBillingInterval, ProPurchaseType } from "@/lib/plans";
import { customerDisplayName } from "@/lib/streampay.server";
import { publicSiteUrl } from "@/lib/siteUrl.server";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

export const startStreamPayCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { interval?: string; purchaseType?: string; locale?: string }) => {
    const interval = input.interval;
    if (interval !== "monthly" && interval !== "six_months" && interval !== "yearly") {
      throw new Error("invalid_interval");
    }
    const purchaseType: ProPurchaseType = input.purchaseType === "gift" ? "gift" : "direct";
    const locale = input.locale === "en" ? "en" : "ar";
    return { interval: interval as ProBillingInterval, purchaseType, locale: locale as "ar" | "en" };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { createStreamPayCheckout } = await import("@/lib/streampay.server");
    const { userId } = context;
    const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !userData.user?.email) return { ok: false as const, error: "email_required" };

    const { data: profile } = await supabaseAdmin
      .from("link_in_bio_profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();

    const metadata =
      userData.user.user_metadata && typeof userData.user.user_metadata === "object"
        ? (userData.user.user_metadata as Record<string, unknown>)
        : null;
    const name = customerDisplayName({
      email: userData.user.email,
      metadata,
      profileName: profile?.display_name?.trim() || null,
    });
    const request = getRequest();
    return createStreamPayCheckout({
      userId,
      email: userData.user.email,
      name,
      interval: data.interval,
      purchaseType: data.purchaseType,
      locale: data.locale,
      origin: publicSiteUrl(request),
    });
  });
