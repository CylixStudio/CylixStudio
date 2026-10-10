import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { assertActivePro } from "@/lib/subscription.server";
import {
  applyUpdate,
  clampInput,
  findUndoTarget,
  frameFor,
  loadTimerContext,
  pauseUpdate,
  rebase,
  resetUpdate,
  startUpdate,
  currentRemaining,
  TimerError,
} from "@/lib/timer.server";

export const getTimer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subathonId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const ctx = await loadTimerContext(context.supabase, data.subathonId);
    return { subathonId: ctx.subathonId, frame: frameFor(ctx) };
  });

export const startTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subathonId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const ctx = await loadTimerContext(context.supabase, data.subathonId);
    const action = ctx.row.status === "PAUSED" ? "timer.resume" : "timer.start";
    return applyUpdate(context.supabase, ctx, action, startUpdate(ctx));
  });

export const pauseTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subathonId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const ctx = await loadTimerContext(context.supabase, data.subathonId);
    if (ctx.row.status !== "RUNNING") throw new TimerError("timer_not_running");
    return applyUpdate(context.supabase, ctx, "timer.pause", pauseUpdate(ctx));
  });

export const resetTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subathonId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const ctx = await loadTimerContext(context.supabase, data.subathonId);
    return applyUpdate(context.supabase, ctx, "timer.reset", resetUpdate(ctx));
  });

export const adjustTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { seconds: number; subathonId?: string; reason?: string }) => ({
    seconds: clampInput(input.seconds, -86_400, 86_400),
    subathonId: input.subathonId,
    reason: typeof input.reason === "string" ? input.reason.slice(0, 200) : undefined,
  }))
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const ctx = await loadTimerContext(context.supabase, data.subathonId);
    const next = currentRemaining(ctx) + data.seconds;
    const update = rebase(ctx, next);
    if (data.seconds > 0) {
      update.total_added_seconds = ctx.row.total_added_seconds + data.seconds;
    }
    return applyUpdate(context.supabase, ctx, "timer.adjust", update, {
      seconds: data.seconds,
      reason: data.reason ?? null,
    });
  });

export const setTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { seconds: number; subathonId?: string }) => ({
    seconds: clampInput(input.seconds, 0, 30 * 86_400),
    subathonId: input.subathonId,
  }))
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const ctx = await loadTimerContext(context.supabase, data.subathonId);
    return applyUpdate(context.supabase, ctx, "timer.set", rebase(ctx, data.seconds), {
      seconds: data.seconds,
    });
  });

export const undoTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subathonId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertActivePro(context.supabase, context.userId);
    const ctx = await loadTimerContext(context.supabase, data.subathonId);
    const target = await findUndoTarget(context.supabase, ctx);
    if (!target) throw new TimerError("nothing_to_undo");
    return applyUpdate(context.supabase, ctx, "timer.undo", target.prev, {
      undo_of: target.id,
      undone_action: target.action,
    });
  });
