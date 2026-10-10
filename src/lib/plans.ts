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
  /** Regular monthly Pro price. The launch offer charges less while it is active. */
  pro: { amount: 39, currency: "SAR" as const },
} as const;

/**
 * Opening-week price for monthly Pro.
 * Set `active` to false to charge the regular 39 SAR again.
 */
export const LAUNCH_OFFER = {
  active: true,
  interval: "monthly" as const,
  /** Amount sent to checkout while the offer is on. */
  amount: 20,
  /** Regular monthly price, shown crossed out. */
  listAmount: 39,
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
  /** Regular price shown crossed out while a launch offer replaces `amount`. */
  listAmount: number | null;
  /** Opening-week launch price is active for this interval. */
  launchOffer: boolean;
  /** Optional savings badge versus 12× the monthly price. */
  savePercent: number | null;
  /** Yearly is the highlighted best-value interval. */
  bestValue?: boolean;
};

export const PRO_BILLING_OPTIONS: Record<ProBillingInterval, ProBillingOption> = {
  monthly: {
    id: "monthly",
    amount: LAUNCH_OFFER.active ? LAUNCH_OFFER.amount : PLAN_PRICES.pro.amount,
    currency: "SAR",
    label: LAUNCH_OFFER.active ? String(LAUNCH_OFFER.amount) : String(PLAN_PRICES.pro.amount),
    months: 1,
    perMonthAmount: LAUNCH_OFFER.active ? LAUNCH_OFFER.amount : PLAN_PRICES.pro.amount,
    listAmount: LAUNCH_OFFER.active ? LAUNCH_OFFER.listAmount : null,
    launchOffer: LAUNCH_OFFER.active,
    savePercent: null,
  },
  six_months: {
    id: "six_months",
    amount: 169,
    currency: "SAR",
    label: "169",
    months: 6,
    perMonthAmount: 28,
    listAmount: null,
    launchOffer: false,
    savePercent: null,
  },
  yearly: {
    id: "yearly",
    amount: 279,
    currency: "SAR",
    label: "279",
    months: 12,
    perMonthAmount: 23,
    listAmount: null,
    launchOffer: false,
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
  /** Regular price when `amount` is a launch offer. */
  listAmount: number | null;
  launchOffer: boolean;
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
    listAmount: option.listAmount,
    launchOffer: option.launchOffer,
    productName: option.launchOffer
      ? `CylixStudio Pro Launch Offer ${option.amount} SAR (Monthly)`
      : `CylixStudio Pro ${option.amount} SAR (${option.months === 1 ? "Monthly" : option.months === 6 ? "6 Months" : "Yearly"})`,
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

/** Soft caps for Free accounts — enforced server-side on create and query. */
export const FREE_PLAN_LIMITS = {
  customCommands: 10,
  messageTimers: 3,
  analyticsDays: 7,
  activityEvents: 10,
  bookmarksPerStream: 3,
  loyaltyLeaderboard: 50,
  linkInBioLinks: 8,
  eventLabels: 3,
} as const;

/**
 * Dashboard hub tool ids that require an active Pro subscription.
 * Follower and subscriber goals stay on Free.
 */
export const PRO_ONLY_HUB_TOOL_IDS = new Set([
  "subathon-timer",
  "emote-rain",
  "wheel-of-fortune",
  "kick-media-requests",
  "giveaway",
  "donation-goal",
  "kicks-goal",
  "stream-events-schedule",
  "poll",
  "prediction",
]);

/** Widget `type` values that require Pro (create, editor, and public overlay). */
export const PRO_ONLY_WIDGET_TYPES = new Set([
  "SUBATHON_TIMER",
  "EMOTE_RAIN",
  "SPIN_WHEEL",
  "DONATION_GOAL",
  "KICKS_GOAL",
  "STREAM_EVENTS_SCHEDULE",
  "POLL",
  "PREDICTION",
] as const);

/** Full feature matrix — source of truth for cards + detailed table. String cells are i18n keys. */
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
    free: "gateway.value.commandsFree",
    pro: "gateway.value.unlimited",
    card: "both",
  },
  {
    id: "timers",
    labelKey: "gateway.feature.timers",
    free: "gateway.value.timersFree",
    pro: "gateway.value.unlimited",
    card: "both",
  },
  {
    id: "analytics",
    labelKey: "gateway.feature.analytics",
    free: "gateway.value.analyticsFree",
    pro: "gateway.value.analyticsPro",
    card: "both",
  },
  {
    id: "activityFeed",
    labelKey: "gateway.feature.activityFeed",
    free: "gateway.value.activityFree",
    pro: "gateway.value.unlimited",
    card: "both",
  },
  {
    id: "bookmarks",
    labelKey: "gateway.feature.bookmarks",
    free: "gateway.value.marksFree",
    pro: "gateway.value.unlimited",
  },
  {
    id: "schedule",
    labelKey: "gateway.feature.schedule",
    free: "gateway.value.scheduleFree",
    pro: "gateway.value.schedulePro",
    card: "both",
  },
  {
    id: "loyalty",
    labelKey: "gateway.feature.loyalty",
    free: "gateway.value.loyaltyFree",
    pro: "gateway.value.unlimited",
  },
  {
    id: "counter",
    labelKey: "gateway.feature.counterVs",
    free: "gateway.value.counterFree",
    pro: "gateway.value.counterPro",
  },
  {
    id: "themes",
    labelKey: "gateway.feature.themes",
    free: "gateway.value.themesFree",
    pro: "gateway.value.themesPro",
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
    id: "subathon",
    labelKey: "gateway.feature.subathon",
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
    id: "wheel",
    labelKey: "gateway.feature.wheel",
    free: false,
    pro: true,
    card: "pro-highlight",
  },
  {
    id: "mediaRequests",
    labelKey: "gateway.feature.mediaRequests",
    free: false,
    pro: true,
    card: "free-missing",
  },
  {
    id: "giveaways",
    labelKey: "gateway.feature.giveaways",
    free: false,
    pro: true,
    card: "free-missing",
  },
  {
    id: "donationGoal",
    labelKey: "gateway.feature.donationGoal",
    free: false,
    pro: true,
  },
  {
    id: "kicksGoal",
    labelKey: "gateway.feature.kicksGoal",
    free: false,
    pro: true,
  },
  {
    id: "streamEvents",
    labelKey: "gateway.feature.streamEvents",
    free: false,
    pro: true,
  },
  {
    id: "export",
    labelKey: "gateway.feature.export",
    free: false,
    pro: true,
    card: "pro-highlight",
  },
  {
    id: "mods",
    labelKey: "gateway.feature.mods",
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
