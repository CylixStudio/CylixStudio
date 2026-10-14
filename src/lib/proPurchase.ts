import type { ProBillingInterval } from "@/lib/plans";
import { PRO_BILLING_OPTIONS } from "@/lib/plans";

/** Add calendar months in UTC, clamping short months (31 Jan + 1 month → 28/29 Feb). */
export function addUtcCalendarMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const monthIndex = from.getUTCMonth() + months;
  const day = from.getUTCDate();
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      Math.min(day, lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/** Catalog terms grant calendar months. Lifetime and custom codes stay day-based. */
export function entitlementMonthsForInterval(
  interval: ProBillingInterval | "lifetime" | "custom",
): number | null {
  if (interval === "lifetime" || interval === "custom") return null;
  return PRO_BILLING_OPTIONS[interval].months;
}

/**
 * Day count stored on a purchase or gift code.
 * Catalog terms use the calendar span from `from` (1, 6, or 14 months).
 * Direct activation still sets expiry with `addUtcCalendarMonths`, not this day count.
 */
export function durationDaysForInterval(
  interval: ProBillingInterval | "lifetime" | "custom",
  customDays?: number,
  from: Date = new Date(),
): number {
  if (interval === "lifetime") return 36500;
  if (interval === "custom") return Math.min(Math.max(Math.round(customDays ?? 30), 1), 36500);
  const months = PRO_BILLING_OPTIONS[interval].months;
  const span = addUtcCalendarMonths(from, months).getTime() - from.getTime();
  return Math.max(1, Math.round(span / 86_400_000));
}

export function intervalLabel(interval: ProBillingInterval | "lifetime" | "custom", durationDays: number): string {
  if (interval === "lifetime" || durationDays >= 36500) return "Lifetime";
  if (interval === "yearly") return "14 months";
  if (interval === "six_months" || durationDays >= 180) return "6 months";
  if (interval === "monthly" || durationDays >= 28) return "1 month";
  return `${durationDays} days`;
}

/** Format 16-char code as XXXX-XXXX-XXXX-XXXX for email / SMS. */
export function formatActivationCode(code: string): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return clean.replace(/(.{4})(?=.)/g, "$1-");
}
