import { DEFAULT_OVERLAY_THEME } from "@/lib/overlayTheme";
import { FREE_PLAN_LIMITS, PRO_ONLY_WIDGET_TYPES } from "@/lib/plans";
import {
  DEFAULT_STYLE,
  parseChatConfig,
  parseEmoteRainConfig,
  parseEventLabelsConfig,
  parseKicksGoalConfig,
  parseSpinConfig,
  isSplitGoalKind,
  parseSpotlightConfig,
  parseSplitGoalConfig,
  parseStreamEventsScheduleConfig,
  parseViewerCounterConfig,
} from "@/lib/widgets";

const APPEARANCE_KEYS = [
  "fontFamily",
  "fontSize",
  "textColor",
  "backgroundColor",
  "backgroundOpacity",
  "accentColor",
  "layout",
  "chatLayout",
  "themeId",
] as const;

export function isProOnlyWidgetType(type: string): boolean {
  return (PRO_ONLY_WIDGET_TYPES as Set<string>).has(type);
}

/** Default colors and layout for a widget type. Free accounts may save only these. */
export function defaultWidgetAppearance(type: string): Record<string, unknown> {
  switch (type) {
    case "SUBATHON_TIMER":
      return { ...DEFAULT_OVERLAY_THEME };
    case "CHAT_BOX":
      return { ...parseChatConfig(null) };
    case "SPIN_WHEEL":
      return { ...parseSpinConfig(null) };
    case "EMOTE_RAIN":
      return { ...parseEmoteRainConfig(null) };
    case "CHAT_SPOTLIGHT":
      return { ...parseSpotlightConfig(null) };
    case "STREAM_EVENTS_SCHEDULE":
      return { ...parseStreamEventsScheduleConfig(null) };
    case "KICKS_GOAL":
      return { ...parseKicksGoalConfig(null) };
    case "VIEWER_COUNTER":
      return { ...parseViewerCounterConfig(null) };
    case "EVENT_LABELS":
      return { ...parseEventLabelsConfig(null) };
    default:
      if (isSplitGoalKind(type)) return { ...parseSplitGoalConfig(type, null) };
      return { ...DEFAULT_STYLE };
  }
}

/** True when the payload changes colors, layout, theme, or raw CSS away from the basic preset. */
export function widgetAppearanceRequiresPro(type: string, config: Record<string, unknown>): boolean {
  const css = config["customCss"] ?? config["css"];
  if (typeof css === "string" && css.trim()) return true;
  const themeId = config["themeId"];
  if (typeof themeId === "string" && themeId.trim() && themeId !== "dark-glass") return true;
  const defaults = defaultWidgetAppearance(type);
  for (const key of APPEARANCE_KEYS) {
    if (!(key in config) || config[key] == null || config[key] === "") continue;
    if (!(key in defaults) || defaults[key] == null || defaults[key] === "") continue;
    if (String(config[key]).trim().toLowerCase() !== String(defaults[key]).trim().toLowerCase()) return true;
  }
  return false;
}

export function eventLabelsOverFreeLimit(config: Record<string, unknown>): boolean {
  const labels = config["labels"];
  return Array.isArray(labels) && labels.length > FREE_PLAN_LIMITS.eventLabels;
}

/** Overlay read path: keep functional settings, reset premium appearance for Free. */
export function clampFreeWidgetConfig(type: string, config: unknown): Record<string, unknown> {
  const record =
    config && typeof config === "object" && !Array.isArray(config)
      ? { ...(config as Record<string, unknown>) }
      : {};
  if (!widgetAppearanceRequiresPro(type, record) && !eventLabelsOverFreeLimit(record)) return record;
  const defaults = defaultWidgetAppearance(type);
  const next = { ...record };
  for (const key of APPEARANCE_KEYS) {
    if (key in defaults) next[key] = defaults[key];
  }
  delete next["customCss"];
  delete next["css"];
  next["themeId"] = "dark-glass";
  if (type === "EVENT_LABELS" && Array.isArray(next["labels"])) {
    next["labels"] = next["labels"].slice(0, FREE_PLAN_LIMITS.eventLabels);
  }
  return next;
}
