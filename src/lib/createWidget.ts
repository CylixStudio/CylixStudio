import { supabase } from "@/lib/supabase/client";
import { SIGNED_OUT_ERROR, isMissingViewerSession } from "@/lib/supabase/sessionError";
import { isTestMode } from "@/lib/testMode";
import { DEFAULT_OVERLAY_THEME } from "@/lib/overlayTheme";
import { goalTypePreset, type GoalTypeId } from "@/lib/goalTypes";
import { mintWidgetPublicToken } from "@/lib/widgetOverlayUrl";
import {
  DEFAULT_STYLE,
  WIDGET_LABEL,
  parseGoalConfig,
  parseEmoteRainConfig,
  parseSpinConfig,
  parseSpotlightConfig,
  parseStreamEventsScheduleConfig,
  parseTappersConfig,
  parseTapGoalConfig,
  parseKicksGoalConfig,
  parseViewerCounterConfig,
  parseEventLabelsConfig,
  parseSplitGoalConfig,
  type WidgetType,
} from "@/lib/widgets";

const SINGLETON_WIDGETS = new Set<WidgetType>([
  "KICKS_GOAL",
  "VIEWER_COUNTER",
  "SPIN_WHEEL",
  "EVENT_LABELS",
  "GOAL_BAR",
  "DONATION_GOAL",
  "FOLLOWER_GOAL",
  "SUBSCRIBER_GOAL",
  "CUSTOM_GOAL",
]);

const singletonInflight = new Map<string, Promise<{ id: string; public_token: string }>>();

function defaultConfig(type: WidgetType, goalType?: GoalTypeId): Record<string, unknown> {
  switch (type) {
    case "SUBATHON_TIMER":
      return { ...DEFAULT_OVERLAY_THEME };
    case "GOAL_BAR": {
      const preset = goalTypePreset(goalType);
      return {
        ...parseGoalConfig(null),
        goalType: preset.id,
        label: preset.overlayLabel,
        accentColor: preset.accentColor,
      };
    }
    case "SPIN_WHEEL":
      return { ...parseSpinConfig(null) };
    case "EMOTE_RAIN":
      return { ...parseEmoteRainConfig(null) };
    case "CHAT_SPOTLIGHT":
      return { ...parseSpotlightConfig(null) };
    case "STREAM_EVENTS_SCHEDULE":
      return { ...parseStreamEventsScheduleConfig(null) };
    case "TIKTOK_TAPPERS":
      return { ...parseTappersConfig(null) };
    case "TIKTOK_TAP_GOAL":
      return { ...parseTapGoalConfig(null) };
    case "KICKS_GOAL":
      return { ...parseKicksGoalConfig(null) };
    case "VIEWER_COUNTER":
      return { ...parseViewerCounterConfig(null) };
    case "EVENT_LABELS":
      return { ...parseEventLabelsConfig(null) };
    case "DONATION_GOAL":
      return { ...parseSplitGoalConfig("DONATION_GOAL", null) };
    case "FOLLOWER_GOAL":
      return { ...parseSplitGoalConfig("FOLLOWER_GOAL", null) };
    case "SUBSCRIBER_GOAL":
      return { ...parseSplitGoalConfig("SUBSCRIBER_GOAL", null) };
    case "CUSTOM_GOAL":
      return { ...parseSplitGoalConfig("CUSTOM_GOAL", null) };
    default:
      return { ...DEFAULT_STYLE };
  }
}

/** Pull a readable message from Error / Postgrest / plain `{ message }` throws. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

/** Missing viewer session becomes a stable sentinel. Every other error keeps its message. */
export function widgetErrorText(err: unknown, fallback: string): string {
  if (isMissingViewerSession(err)) return SIGNED_OUT_ERROR;
  return errorMessage(err, fallback);
}

export class SignedOutError extends Error {
  readonly code = "signed_out";

  constructor() {
    super(SIGNED_OUT_ERROR);
    this.name = "SignedOutError";
  }
}

/**
 * widgets.user_id → public.users(id). Auth users from OAuth can exist without a
 * public.users row if the callback upsert failed — ensure the row before insert.
 */
export async function ensureUserProfile(userId: string): Promise<void> {
  if (isTestMode()) throw new SignedOutError();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (isMissingViewerSession(authError)) throw new SignedOutError();
  if (authError) throw authError;
  if (!user || user.id !== userId) throw new SignedOutError();

  const meta = user.user_metadata ?? {};
  const { error } = await supabase.from("users").upsert(
    {
      id: userId,
      email: user.email ?? null,
      name:
        (typeof meta.name === "string" && meta.name) ||
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.preferred_username === "string" && meta.preferred_username) ||
        (typeof meta.username === "string" && meta.username) ||
        null,
      image:
        (typeof meta.avatar_url === "string" && meta.avatar_url) ||
        (typeof meta.picture === "string" && meta.picture) ||
        (typeof meta.image === "string" && meta.image) ||
        null,
    },
    { onConflict: "id" },
  );
  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if (
      message.includes("schema cache") ||
      message.includes("could not find the table") ||
      error.code === "PGRST205" ||
      error.code === "42P01"
    ) {
      throw new Error(
        "public.users is missing in Supabase. Run migration 20260925010000_secure_public_users_profile.sql (SQL Editor or node scripts/apply-users-migration.mjs with DATABASE_URL), then retry.",
      );
    }
    throw error;
  }
}

/**
 * Creates a widget (plus its goal row when it is a goal bar) for the signed-in
 * user. RLS scopes every write to the owner.
 */
export async function createWidget(args: {
  userId: string;
  subathonId: string | null;
  type: WidgetType;
  name?: string;
  goalType?: GoalTypeId;
  _lock?: boolean;
}): Promise<{ id: string; public_token: string }> {
  if (SINGLETON_WIDGETS.has(args.type) && !args._lock) {
    const key = `${args.userId}:${args.type}`;
    const pending = singletonInflight.get(key);
    if (pending) return pending;
    const work: Promise<{ id: string; public_token: string }> = createWidget({ ...args, _lock: true }).finally(
      () => {
        singletonInflight.delete(key);
      },
    );
    singletonInflight.set(key, work);
    return work;
  }

  if (args.type === "TIKTOK_TAPPERS" || args.type === "TIKTOK_TAP_GOAL") {
    throw new Error("TikTok overlays are Coming Soon until OAuth is ready.");
  }

  await ensureUserProfile(args.userId);

  if (SINGLETON_WIDGETS.has(args.type)) {
    const { data: existing, error: existingError } = await supabase
      .from("widgets")
      .select("id, public_token")
      .eq("user_id", args.userId)
      .eq("type", args.type)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingError) {
      if (isMissingViewerSession(existingError)) throw new SignedOutError();
      throw existingError;
    }
    if (existing?.id && existing.public_token) return existing;
  }

  // Ignore a stale / deleted subathon id so the FK does not block creation.
  let subathonId = args.subathonId;
  if (subathonId) {
    const { data: subathon } = await supabase
      .from("subathons")
      .select("id")
      .eq("id", subathonId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (!subathon) subathonId = null;
  }

  const { data: widget, error } = await supabase
    .from("widgets")
    .insert({
      user_id: args.userId,
      subathon_id: subathonId,
      type: args.type,
      name: args.name?.trim() || WIDGET_LABEL[args.type],
      config: defaultConfig(args.type, args.goalType) as never,
      // Assigned once. Later settings and token refreshes must not replace it.
      public_token: mintWidgetPublicToken(),
    })
    .select("id, public_token")
    .single();
  if (error) throw error;
  if (!widget?.id) throw new Error("Widget was created but no id was returned.");

  if (args.type === "GOAL_BAR") {
    const { error: goalError } = await supabase.from("goals").insert({
      widget_id: widget.id,
      user_id: args.userId,
      title: goalTypePreset(args.goalType).title,
      unit: goalTypePreset(args.goalType).unit,
      target_value: goalTypePreset(args.goalType).target,
      current_value: 0,
    });
    if (goalError) throw goalError;
  }

  if (args.type === "SUBATHON_TIMER") {
    await ensureWidgetSubathon(widget.id, { seedTimer: true });
  }

  return widget;
}

/** First-open subathon clock: exactly two hours. */
export const DEFAULT_SUBATHON_SECONDS = 2 * 60 * 60;

/**
 * Ensures the widget is tied to a subathon (creating one when needed) so rules
 * and the timer can be saved. Seeds a 02:00:00 clock when the timer was never started.
 */
export async function ensureWidgetSubathon(
  widgetId: string,
  options?: { seedTimer?: boolean },
): Promise<string> {
  if (isTestMode()) throw new SignedOutError();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (isMissingViewerSession(authError)) throw new SignedOutError();
  if (authError) throw authError;
  if (!user) throw new SignedOutError();

  const { data: widget, error: widgetError } = await supabase
    .from("widgets")
    .select("id, subathon_id")
    .eq("id", widgetId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (widgetError) throw widgetError;
  if (!widget) throw new Error("Widget not found.");

  let subathonId = widget.subathon_id;
  if (!subathonId) {
    const { data: existing } = await supabase
      .from("subathons")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      subathonId = existing.id;
    } else {
      const slug = `subathon-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
      const { data: created, error: createError } = await supabase
        .from("subathons")
        .insert({
          user_id: user.id,
          title: "Subathon",
          slug,
          initial_seconds: DEFAULT_SUBATHON_SECONDS,
          is_active: true,
        })
        .select("id")
        .single();
      if (createError) throw createError;
      if (!created?.id) throw new Error("Could not create a subathon for this widget.");
      subathonId = created.id;
    }

    const { error: linkError } = await supabase
      .from("widgets")
      .update({ subathon_id: subathonId })
      .eq("id", widgetId)
      .eq("user_id", user.id);
    if (linkError) throw linkError;
  }

  if (options?.seedTimer) {
    const { data: timer, error: timerError } = await supabase
      .from("timer_states")
      .select("id, remaining_seconds, status, started_at, total_added_seconds")
      .eq("subathon_id", subathonId)
      .maybeSingle();
    if (timerError) throw timerError;

    const untouched =
      !timer ||
      (timer.status === "IDLE" &&
        !timer.started_at &&
        timer.total_added_seconds === 0 &&
        timer.remaining_seconds === 0);

    if (untouched) {
      if (timer) {
        const { error: updateError } = await supabase
          .from("timer_states")
          .update({ remaining_seconds: DEFAULT_SUBATHON_SECONDS, status: "IDLE" })
          .eq("id", timer.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("timer_states").insert({
          subathon_id: subathonId,
          status: "IDLE",
          remaining_seconds: DEFAULT_SUBATHON_SECONDS,
        });
        if (insertError) throw insertError;
      }
      await supabase
        .from("subathons")
        .update({ initial_seconds: DEFAULT_SUBATHON_SECONDS })
        .eq("id", subathonId)
        .eq("user_id", user.id);
    }
  }

  return subathonId;
}
