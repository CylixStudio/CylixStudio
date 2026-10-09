export const GOAL_LAYOUTS = ["classic", "compact", "bold", "glass"] as const;
export type GoalLayout = (typeof GOAL_LAYOUTS)[number];

export const WHEEL_LAYOUTS = ["classic", "compact", "bare"] as const;
export type WheelLayout = (typeof WHEEL_LAYOUTS)[number];

export const EVENT_LABEL_LAYOUTS = ["island", "ticker", "stack", "cycle"] as const;
export type EventLabelLayout = (typeof EVENT_LABEL_LAYOUTS)[number];

export const CHROME_LAYOUTS = ["glass", "direct", "bold"] as const;
export type ChromeLayout = (typeof CHROME_LAYOUTS)[number];

export const VIEWER_LAYOUTS = ["island", "bar", "digits"] as const;
export type ViewerLayout = (typeof VIEWER_LAYOUTS)[number];

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const value = asRecord(raw)["layout"];
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Missing layout stays classic so overlays already on stream do not jump. */
export function parseGoalLayout(raw: unknown): GoalLayout {
  return pick(raw, GOAL_LAYOUTS, "classic");
}

export function parseWheelLayout(raw: unknown): WheelLayout {
  const value = asRecord(raw)["layout"];
  if (value === "glow") return "classic";
  return pick(raw, WHEEL_LAYOUTS, "classic");
}

/** Glass single-line overlays become the Dynamic Island. */
export function parseEventLabelLayout(raw: unknown): EventLabelLayout {
  const value = asRecord(raw)["layout"];
  if (value === "glass") return "island";
  return pick(raw, EVENT_LABEL_LAYOUTS, "island");
}

export function parseChromeLayout(raw: unknown): ChromeLayout {
  return pick(raw, CHROME_LAYOUTS, "glass");
}

export function parseViewerLayout(raw: unknown): ViewerLayout {
  const value = asRecord(raw)["layout"];
  if (value === "glass") return "island";
  if (value === "bold") return "bar";
  if (value === "direct") return "digits";
  return pick(raw, VIEWER_LAYOUTS, "island");
}

export function chromeLayoutClass(layout: ChromeLayout): string {
  if (layout === "direct") return "border border-zinc-700 bg-zinc-950 shadow-none backdrop-blur-none";
  if (layout === "bold") return "border-2 border-white/25 shadow-[0_18px_50px_rgba(0,0,0,0.45)]";
  return "";
}
