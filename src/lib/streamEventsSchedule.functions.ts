import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { assertActivePro } from "@/lib/subscription.server";
import {
  normalizeScheduleEvents,
  previousBonusDelta,
  skipBonusDelta,
  type StreamEventsRuntime,
  type StreamScheduleEvent,
} from "@/lib/streamEventsSchedule";
import { parseStreamEventsScheduleConfig, parseStreamEventsScheduleState } from "@/lib/widgets";

type WidgetRow = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  config: unknown;
  state: unknown;
};

async function loadOwnedScheduleWidget(widgetId: string, userId: string): Promise<WidgetRow> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { data: widget } = await supabaseAdmin
    .from("widgets")
    .select("id, user_id, name, type, config, state")
    .eq("id", widgetId)
    .maybeSingle();
  if (!widget || widget.user_id !== userId) throw new Error("Widget not found");
  if (widget.type !== "STREAM_EVENTS_SCHEDULE") throw new Error("Wrong widget type");
  return widget as WidgetRow;
}

async function persistRuntime(
  widget: WidgetRow,
  runtime: StreamEventsRuntime,
  configPatch?: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const prevState =
    widget.state && typeof widget.state === "object"
      ? (widget.state as Record<string, unknown>)
      : {};
  const nextState = {
    ...prevState,
    streamEvents: {
      startedAt: runtime.startedAt,
      bonusElapsedSeconds: runtime.bonusElapsedSeconds,
      revision: runtime.revision + 1,
    },
  };

  const update: Record<string, unknown> = { state: nextState };
  if (configPatch) {
    const cfg = parseStreamEventsScheduleConfig(widget.config);
    update["config"] = { ...cfg, ...configPatch };
  }

  const { error } = await supabaseAdmin.from("widgets").update(update as never).eq("id", widget.id);
  if (error) throw new Error(error.message);

  const { broadcastToWidgets } = await import("@/lib/realtime.server");
  await broadcastToWidgets([widget.id], "refresh", { reason: "stream_events" });

  return {
    ok: true as const,
    runtime: {
      ...runtime,
      revision: runtime.revision + 1,
    },
  };
}

export const startStreamEventsClock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { widgetId: string; startedAt?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const widget = await loadOwnedScheduleWidget(data.widgetId, context.userId);
    const startedAt =
      typeof data.startedAt === "string" && data.startedAt.trim()
        ? data.startedAt
        : new Date().toISOString();
    return persistRuntime(widget, {
      startedAt,
      bonusElapsedSeconds: 0,
      revision: parseStreamEventsScheduleState(widget.state).revision,
    });
  });

export const stopStreamEventsClock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { widgetId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const widget = await loadOwnedScheduleWidget(data.widgetId, context.userId);
    return persistRuntime(widget, {
      startedAt: null,
      bonusElapsedSeconds: 0,
      revision: parseStreamEventsScheduleState(widget.state).revision,
    });
  });

export const skipStreamEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { widgetId: string; direction: "next" | "previous" }) => input)
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const widget = await loadOwnedScheduleWidget(data.widgetId, context.userId);
    const config = parseStreamEventsScheduleConfig(widget.config);
    const runtime = parseStreamEventsScheduleState(widget.state);
    if (!runtime.startedAt) throw new Error("Start the stream clock first");

    const delta =
      data.direction === "next"
        ? skipBonusDelta(config.events, runtime)
        : previousBonusDelta(config.events, runtime);

    return persistRuntime(widget, {
      ...runtime,
      bonusElapsedSeconds: runtime.bonusElapsedSeconds + delta,
    });
  });

export const saveStreamEventsList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      widgetId: string;
      events: StreamScheduleEvent[];
      title?: string;
      showUptime?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const widget = await loadOwnedScheduleWidget(data.widgetId, context.userId);
    const runtime = parseStreamEventsScheduleState(widget.state);
    const events = normalizeScheduleEvents(data.events);
    const patch: Record<string, unknown> = { events };
    if (typeof data.title === "string") {
      patch["title"] = data.title.trim().slice(0, 60) || "جدول فعاليات البث";
    }
    if (typeof data.showUptime === "boolean") patch["showUptime"] = data.showUptime;

    const saved = await persistRuntime(widget, runtime, patch);
    const { notifyWidgetSaved } = await import("@/lib/updateWebhook.server");
    await notifyWidgetSaved(widget.name);
    return saved;
  });
