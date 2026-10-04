/** Plan catalog for the onboarding gateway and comparison table. */

export type PlanId = "free" | "pro";

export type FeatureAvailability = boolean | string;

export type PlanFeatureRow = {
  id: string;
  labelKey: string;
  free: FeatureAvailability;
  pro: FeatureAvailability;
  /** Highlighted in the short Free / Pro cards. */
  card?: "free" | "pro" | "both" | "free-missing" | "pro-highlight";
};

export const PLAN_PRICES = {
  free: { amount: 0, currency: "SAR" as const },
  /** Pro list price shown in the comparison table (monthly). */
  pro: { amount: 39, currency: "SAR" as const },
} as const;

/** Pro billing intervals shown on the welcome plan card. */
export type ProBillingInterval = "monthly" | "six_months" | "yearly";

export type ProBillingOption = {
  id: ProBillingInterval;
  /** Total amount charged for this interval, in SAR. */
  amount: number;
  currency: "SAR";
  /** Numeric amount shown next to the riyal mark. */
  label: string;
  /** Covered months in this purchase. */
  months: number;
  /** Effective monthly rate, in SAR. */
  perMonthAmount: number;
  /** Optional savings badge versus 12× the monthly price. */
  savePercent: number | null;
  /** Yearly is the highlighted best-value interval. */
  bestValue?: boolean;
};

export const PRO_BILLING_OPTIONS: Record<ProBillingInterval, ProBillingOption> = {
  monthly: {
    id: "monthly",
    amount: 39,
    currency: "SAR",
    label: "39",
    months: 1,
    perMonthAmount: 39,
    savePercent: null,
  },
  six_months: {
    id: "six_months",
    amount: 169,
    currency: "SAR",
    label: "169",
    months: 6,
    perMonthAmount: 28,
    savePercent: null,
  },
  yearly: {
    id: "yearly",
    amount: 279,
    currency: "SAR",
    label: "279",
    months: 12,
    perMonthAmount: 23,
    /** vs 12 × 39 SAR (468). */
    savePercent: 40,
    bestValue: true,
  },
};

export const PRO_BILLING_ORDER: ProBillingInterval[] = ["monthly", "six_months", "yearly"];

export const DEFAULT_PRO_BILLING: ProBillingInterval = "yearly";

/** Selected Pro plan stored for a later checkout adapter. */
export type ProPurchaseType = "direct" | "gift";

export type ProCheckoutPayload = {
  planId: "pro";
  interval: ProBillingInterval;
  amount: number;
  currency: "SAR";
  months: number;
  label: string;
  productName: string;
  /** direct = activate on buyer account; gift = email an activation code */
  purchaseType: ProPurchaseType;
  /** Buyer account (required for direct). */
  userId?: string | null;
  buyerEmail?: string | null;
  /** Gift-only optional fields */
  giftRecipientEmail?: string | null;
  giftMessage?: string | null;
};

export type PrepareProCheckoutOptions = {
  purchaseType?: ProPurchaseType;
  userId?: string | null;
  buyerEmail?: string | null;
  giftRecipientEmail?: string | null;
  giftMessage?: string | null;
};

export const PENDING_PRO_CHECKOUT_KEY = "cylix.pending-pro-checkout";

export function buildProCheckoutPayload(
  interval: ProBillingInterval,
  options?: PrepareProCheckoutOptions,
): ProCheckoutPayload {
  const option = PRO_BILLING_OPTIONS[interval];
  const purchaseType = options?.purchaseType ?? "direct";
  return {
    planId: "pro",
    interval: option.id,
    amount: option.amount,
    currency: option.currency,
    months: option.months,
    label: option.label,
    productName: `CylixStudio Pro ${option.amount} SAR (${option.months === 1 ? "Monthly" : option.months === 6 ? "6 Months" : "Yearly"})`,
    purchaseType,
    userId: options?.userId ?? null,
    buyerEmail: options?.buyerEmail?.trim().toLowerCase() || null,
    giftRecipientEmail:
      purchaseType === "gift"
        ? options?.giftRecipientEmail?.trim().toLowerCase() || null
        : null,
    giftMessage:
      purchaseType === "gift" ? options?.giftMessage?.trim().slice(0, 500) || null : null,
  };
}

/**
 * Persists the selected Pro plan so a later checkout adapter can read the exact total.
 * Returns the payload for immediate use.
 */
export function prepareProCheckout(
  interval: ProBillingInterval,
  options?: PrepareProCheckoutOptions,
): ProCheckoutPayload {
  const payload = buildProCheckoutPayload(interval, options);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(PENDING_PRO_CHECKOUT_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota / private mode */
    }
  }
  return payload;
}

/** Soft caps for Free accounts — enforced server-side on create. */
export const FREE_PLAN_LIMITS = {
  customCommands: 10,
  messageTimers: 3,
} as const;

/** Dashboard hub tool ids that require an active Pro subscription. */
export const PRO_ONLY_HUB_TOOL_IDS = new Set([
  "emote-rain",
  "giveaway",
  "kick-media-requests",
  "stream-events-schedule",
]);

/** Widget `type` values that require Pro (direct /widgets/$id access). */
export const PRO_ONLY_WIDGET_TYPES = new Set([
  "EMOTE_RAIN",
  "STREAM_EVENTS_SCHEDULE",
] as const);

/** Full feature matrix — source of truth for cards + detailed table. */
export const PLAN_FEATURES: PlanFeatureRow[] = [
  {
    id: "platforms",
    labelKey: "gateway.feature.platforms",
    free: true,
    pro: true,
    card: "both",
  },
  {
    id: "commands",
    labelKey: "gateway.feature.commands",
    free: "Up to 10",
    pro: "Unlimited",
    card: "both",
  },
  {
    id: "timers",
    labelKey: "gateway.feature.timers",
    free: "Up to 3",
    pro: "Unlimited",
    card: "both",
  },
  {
    id: "basicWidgets",
    labelKey: "gateway.feature.basicWidgets",
    free: true,
    pro: true,
    card: "both",
  },
  {
    id: "advancedWidgets",
    labelKey: "gateway.feature.advancedWidgets",
    free: false,
    pro: true,
    card: "pro-highlight",
  },
  {
    id: "emoteRain",
    labelKey: "gateway.feature.emoteRain",
    free: false,
    pro: true,
    card: "pro-highlight",
  },
  {
    id: "giveaways",
    labelKey: "gateway.feature.giveaways",
    free: false,
    pro: true,
    card: "free-missing",
  },
  {
    id: "mediaRequests",
    labelKey: "gateway.feature.mediaRequests",
    free: false,
    pro: true,
    card: "free-missing",
  },
  {
    id: "streamEvents",
    labelKey: "gateway.feature.streamEvents",
    free: false,
    pro: true,
    card: "pro-highlight",
  },
  {
    id: "linkInBio",
    labelKey: "gateway.feature.linkInBio",
    free: false,
    pro: true,
    card: "free-missing",
  },
  {
    id: "analytics",
    labelKey: "gateway.feature.analytics",
    free: false,
    pro: true,
    card: "free-missing",
  },
  {
    id: "export",
    labelKey: "gateway.feature.export",
    free: false,
    pro: true,
    card: "pro-highlight",
  },
  {
    id: "overlays",
    labelKey: "gateway.feature.overlays",
    free: true,
    pro: true,
  },
  {
    id: "activityFeed",
    labelKey: "gateway.feature.activityFeed",
    free: true,
    pro: true,
  },
  {
    id: "schedule",
    labelKey: "gateway.feature.schedule",
    free: true,
    pro: true,
  },
  {
    id: "priority",
    labelKey: "gateway.feature.priority",
    free: false,
    pro: true,
  },
];

export const GATEWAY_STORAGE_KEY = "creovix.gateway.completed";

export function isGatewayCompleted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GATEWAY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGatewayCompleted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GATEWAY_STORAGE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}
