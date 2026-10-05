import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { GoalBarView } from "@/components/widgets/WidgetRenderer";
import { widgetErrorText } from "@/lib/createWidget";
import { isMissingViewerSession } from "@/lib/supabase/sessionError";
import { useLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";

export const Route = createFileRoute("/_authenticated/widgets/$widgetId/goal")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Goal Control" },
      {
        name: "description",
        content:
          "Live goal control centre: raise the target, log contributions and watch the OBS progress bar update instantly.",
      },
      { property: "og:title", content: "CylixStudio — Goal Control" },
      {
        property: "og:description",
        content: "Track and adjust your live stream goal in real time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GoalControl,
});

const QUICK = [1, 5, 10, 25, 50, 100];

function GoalControl() {
  const { t } = useLanguage();
  const { user } = Route.useRouteContext();
  const { widgetId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: workspace } = useWorkspace(user.id);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [targetDraft, setTargetDraft] = useState("");

  const query = useQuery({
    queryKey: ["goal-control", widgetId],
    refetchInterval: 5000,
    queryFn: async () => {
      const [widget, goal] = await Promise.all([
        supabase.from("widgets").select("id, name, config, public_token").eq("id", widgetId).single(),
        supabase
          .from("goals")
          .select("id, title, unit, target_value, current_value")
          .eq("widget_id", widgetId)
          .maybeSingle(),
      ]);
      if (widget.error) throw widget.error;
      if (goal.error) throw goal.error;
      return {
        widget: widget.data,
        goal: goal.data
          ? {
              ...goal.data,
              target_value: Number(goal.data.target_value),
              current_value: Number(goal.data.current_value),
            }
          : null,
      };
    },
  });

  const goal = query.data?.goal ?? null;
  const widget = query.data?.widget ?? null;

  const mutate = useMutation({
    mutationFn: async (patch: { current_value?: number; target_value?: number }) => {
      if (!goal) throw new Error("This widget has no goal attached.");
      const { error: writeError } = await supabase.from("goals").update(patch).eq("id", goal.id);
      if (writeError) throw writeError;
    },
    onError: (err: Error) => {
      const message = widgetErrorText(err, "Could not update this goal.");
      setError(message);
      if (!isMissingViewerSession(message)) toast.error(message);
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["goal-control", widgetId] });
      await queryClient.invalidateQueries({ queryKey: ["widgets"] });
    },
  });

  const add = (amount: number) => {
    if (!goal) return;
    mutate.mutate({ current_value: Math.max(0, Number((goal.current_value + amount).toFixed(2))) });
  };

  const percent =
    goal && goal.target_value > 0
      ? Math.min(100, (goal.current_value / goal.target_value) * 100)
      : 0;

  const buttonClass =
    "rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-50";

  return (
    <AppShell
      user={user}
      profile={workspace?.profile}
      subathons={workspace?.subathons ?? []}
      title={widget ? `${widget.name} — goal control` : "Goal control"}
      subtitle="Server-side goal math; every change is pushed to OBS instantly."
      actions={
        <Link
          to="/widgets/$widgetId"
          params={{ widgetId }}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary"
        >
          Widget settings
        </Link>
      }
    >
      <SessionAwareError error={error} signedOutLabel={t("widget.signedOut")} />

      {!goal ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          {query.isLoading ? "Loading goal…" : "This widget doesn't have a goal attached."}
        </p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
          <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Progress
              </p>
              <p className="mt-2 font-mono text-4xl font-bold tabular-nums">
                <span dir="ltr">
                  {goal.current_value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
                <span className="text-muted-foreground">
                  {" / "}
                  <span dir="ltr">
                    {goal.target_value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </span>
                  {" "}
                  {goal.unit}
                </span>
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{percent.toFixed(1)}% complete</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={buttonClass}
                  disabled={mutate.isPending}
                  onClick={() => add(amount)}
                >
                  +{amount}
                </button>
              ))}
              <button
                type="button"
                className={buttonClass}
                disabled={mutate.isPending}
                onClick={() => add(-5)}
              >
                −5
              </button>
            </div>

            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(custom);
                if (!Number.isFinite(value) || value === 0) return;
                add(value);
                setCustom("");
              }}
            >
              <input
                inputMode="decimal"
                placeholder="Custom amount"
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Apply
              </button>
            </form>

            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const value = Number(targetDraft);
                if (!Number.isFinite(value) || value <= 0) return;
                mutate.mutate({ target_value: value });
                setTargetDraft("");
              }}
            >
              <input
                inputMode="decimal"
                placeholder={`New target (now ${goal.target_value})`}
                value={targetDraft}
                onChange={(event) => setTargetDraft(event.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button type="submit" className={buttonClass}>
                Set target
              </button>
            </form>

            <button
              type="button"
              className={buttonClass}
              disabled={mutate.isPending}
              onClick={() => mutate.mutate({ current_value: 0 })}
            >
              Reset progress
            </button>
          </section>

          <section className="grid min-h-[320px] place-items-center rounded-2xl border border-border bg-[repeating-conic-gradient(#16171d_0%_25%,#101116_0%_50%)] bg-[length:32px_32px] p-6">
            <GoalBarView
              config={widget?.config}
              goal={{
                title: goal.title,
                unit: goal.unit,
                target: goal.target_value,
                current: goal.current_value,
              }}
            />
          </section>
        </div>
      )}
    </AppShell>
  );
}
