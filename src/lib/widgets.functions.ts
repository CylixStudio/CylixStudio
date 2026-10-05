import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

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
