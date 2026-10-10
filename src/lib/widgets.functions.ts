import { createServerFn } from "@tanstack/react-start";

import {
  eventLabelsOverFreeLimit,
  isProOnlyWidgetType,
  widgetAppearanceRequiresPro,
} from "@/lib/planLimits";
import { FREE_PLAN_LIMITS } from "@/lib/plans";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { userHasActivePro } from "@/lib/subscription.server";
import { WIDGET_TYPES, type WidgetType } from "@/lib/widgets";

type GoalSave = {
  id: string;
  title: string;
  unit: string;
  target: number;
  current: number;
};

/**
 * Persists a widget's name, config, and optional goal, then notifies Make.
 * The handler does not run on import.
 */
export const saveWidgetSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      widgetId: string;
      name?: string;
      config: Record<string, unknown>;
      goal?: GoalSave | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: readError } = await supabase
      .from("widgets")
      .select("id, type")
      .eq("id", data.widgetId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Widget not found");

    const isPro = await userHasActivePro(supabase, userId);
    if (!isPro && isProOnlyWidgetType(existing.type)) throw new Error("pro_required");
    if (!isPro && widgetAppearanceRequiresPro(existing.type, data.config)) throw new Error("pro_required");
    if (!isPro && existing.type === "EVENT_LABELS" && eventLabelsOverFreeLimit(data.config)) {
      throw new Error("free_limit_labels");
    }

    const patch: { config: Record<string, unknown>; name?: string } = {
      config: data.config,
    };
    if (typeof data.name === "string" && data.name.trim()) {
      patch.name = data.name.trim();
    }

    const { data: row, error } = await supabase
      .from("widgets")
      .update(patch as never)
      .eq("id", data.widgetId)
      .eq("user_id", userId)
      .select("id, name")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Widget not found");

    if (data.goal) {
      const { error: goalError } = await supabase
        .from("goals")
        .update({
          title: data.goal.title,
          unit: data.goal.unit,
          target_value: data.goal.target,
          current_value: data.goal.current,
        })
        .eq("id", data.goal.id)
        .eq("user_id", userId);
      if (goalError) throw new Error(goalError.message);
    }

    const { notifyWidgetSaved } = await import("@/lib/updateWebhook.server");
    await notifyWidgetSaved(row.name);
    return { ok: true as const };
  });

const WIDGET_TYPE_VALUES = new Set(WIDGET_TYPES.map((entry) => entry.value));

/** Inserts a widget for the signed-in user. Premium types are rejected for Free. */
export const createOwnedWidget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      type: string;
      name: string;
      subathonId: string | null;
      config: Record<string, unknown>;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    if (!WIDGET_TYPE_VALUES.has(data.type as WidgetType)) throw new Error("Unknown widget type");
    const isPro = await userHasActivePro(context.supabase, context.userId);
    if (!isPro && isProOnlyWidgetType(data.type)) throw new Error("pro_required");
    if (!isPro && widgetAppearanceRequiresPro(data.type, data.config)) throw new Error("pro_required");
    const config =
      !isPro && data.type === "EVENT_LABELS" && Array.isArray(data.config["labels"])
        ? { ...data.config, labels: data.config["labels"].slice(0, FREE_PLAN_LIMITS.eventLabels) }
        : data.config;

    let subathonId = data.subathonId;
    if (subathonId) {
      const { data: subathon } = await context.supabase
        .from("subathons")
        .select("id")
        .eq("id", subathonId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!subathon) subathonId = null;
    }

    const { data: widget, error } = await context.supabase
      .from("widgets")
      .insert({
        user_id: context.userId,
        subathon_id: subathonId,
        type: data.type as WidgetType,
        name: data.name.trim() || data.type,
        config: config as never,
        public_token: crypto.randomUUID(),
      })
      .select("id, public_token")
      .single();
    if (error) throw new Error(error.message);
    if (!widget?.id || !widget.public_token) throw new Error("Widget was created but no id was returned.");
    return { id: widget.id, public_token: widget.public_token };
  });
