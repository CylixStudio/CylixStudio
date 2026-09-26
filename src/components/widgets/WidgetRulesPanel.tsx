import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { DarkSelect } from "@/components/ui/dark-select";
import { ensureWidgetSubathon } from "@/lib/createWidget";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Platform = Database["public"]["Enums"]["platform_type"];
type EventType = Database["public"]["Enums"]["rule_event_type"];
type Rule = Database["public"]["Tables"]["rules"]["Row"];

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "TWITCH", label: "🟣 Twitch" },
  { value: "KICK", label: "🟢 Kick" },
  { value: "TIKTOK", label: "🎵 TikTok" },
  { value: "STREAMLABS", label: "🧪 Streamlabs" },
  { value: "STREAMELEMENTS", label: "🔹 StreamElements" },
  { value: "MANUAL", label: "⚙️ Manual" },
];

const EVENTS: { value: EventType; label: string }[] = [
  { value: "FOLLOW", label: "Follow" },
  { value: "SUBSCRIPTION", label: "Subscribe" },
  { value: "GIFT_SUB", label: "Gift sub" },
  { value: "BITS", label: "Bits / Coins" },
  { value: "DONATION", label: "Tip / Donation" },
  { value: "RAID", label: "Raid" },
];

const PLATFORM_STYLE: Record<Platform, string> = {
  TWITCH: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  KICK: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  TIKTOK: "border-pink-500/40 bg-pink-500/10 text-pink-300",
  STREAMLABS: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  STREAMELEMENTS: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  YOUTUBE: "border-red-500/40 bg-red-500/10 text-red-300",
  X: "border-zinc-400/40 bg-zinc-400/10 text-zinc-200",
  MANUAL: "border-border bg-secondary/40 text-muted-foreground",
};

const PRESETS: {
  label: string;
  platform: Platform;
  event_type: EventType;
  seconds: number;
  min_amount: number | null;
}[] = [
  { label: "🟣 Twitch Follow +60s", platform: "TWITCH", event_type: "FOLLOW", seconds: 60, min_amount: null },
  { label: "🟢 Kick Sub +300s", platform: "KICK", event_type: "SUBSCRIPTION", seconds: 300, min_amount: null },
  { label: "🎵 TikTok Gift +5s", platform: "TIKTOK", event_type: "GIFT_SUB", seconds: 5, min_amount: 1 },
  { label: "🧪 Streamlabs Tip $1 +60s", platform: "STREAMLABS", event_type: "DONATION", seconds: 60, min_amount: 1 },
  { label: "🟣 Twitch Raid +30s", platform: "TWITCH", event_type: "RAID", seconds: 30, min_amount: null },
];

function formatSeconds(seconds: number) {
  if (seconds >= 60 && seconds % 60 === 0) return `+${seconds / 60} min`;
  return `+${seconds}s`;
}

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const labelClass =
  "text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground";

/**
 * Per-widget Rules & Logic editor — embeddable in the Subathon sidebar tab
 * or the standalone `/widgets/$widgetId/rules` page.
 */
export function WidgetRulesPanel({
  widgetId,
  subathonId,
  compact = false,
}: {
  widgetId: string;
  subathonId: string | null;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    platform: "TWITCH" as Platform,
    event_type: "DONATION" as EventType,
    unit_amount: 1,
    seconds_per_unit: 60,
    goal_increment: 1,
    min_amount: "",
    priority: 100,
  });
  const [linkedSubathonId, setLinkedSubathonId] = useState<string | null>(subathonId);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    setLinkedSubathonId(subathonId);
  }, [subathonId]);

  useEffect(() => {
    if (linkedSubathonId) return;
    let cancelled = false;
    setLinking(true);
    void ensureWidgetSubathon(widgetId)
      .then((id) => {
        if (cancelled) return;
        setLinkedSubathonId(id);
        void queryClient.invalidateQueries({ queryKey: ["widget", widgetId] });
        void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Could not link this widget to a subathon.");
      })
      .finally(() => {
        if (!cancelled) setLinking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedSubathonId, queryClient, widgetId]);

  const activeSubathonId = linkedSubathonId;

  const rulesQuery = useQuery({
    queryKey: ["widget-rules", widgetId],
    queryFn: async () => {
      const { data, error: readError } = await supabase
        .from("rules")
        .select("*")
        .eq("widget_id", widgetId)
        .order("priority", { ascending: false });
      if (readError) throw readError;
      return data as Rule[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["widget-rules", widgetId] });

  const existingMatch = useMemo(
    () =>
      rulesQuery.data?.find(
        (rule) => rule.platform === draft.platform && rule.event_type === draft.event_type,
      ) ?? null,
    [rulesQuery.data, draft.platform, draft.event_type],
  );

  const saveRule = useMutation({
    mutationFn: async (input: {
      platform: Platform;
      event_type: EventType;
      seconds_per_unit: number;
      goal_increment: number;
      unit_amount: number;
      min_amount: number | null;
      priority: number;
    }) => {
      if (!activeSubathonId) throw new Error("Link this widget to a subathon first.");
      const { error: writeError } = await supabase.from("rules").upsert(
        {
          subathon_id: activeSubathonId,
          widget_id: widgetId,
          platform: input.platform,
          event_type: input.event_type,
          unit_amount: Math.max(1, input.unit_amount || 1),
          seconds_per_unit: Math.max(0, input.seconds_per_unit || 0),
          goal_increment: Math.max(0, input.goal_increment || 0),
          min_amount: input.min_amount,
          priority: input.priority || 0,
          is_enabled: true,
        },
        { onConflict: "subathon_id,platform,event_type" },
      );
      if (writeError) throw writeError;
    },
    onError: (err: Error) => {
      setNotice(null);
      setError(err.message);
      toast.error(err.message);
    },
    onSuccess: (_data, input) => {
      setError(null);
      setNotice(`Rule saved: ${input.platform} · ${input.event_type.replace("_", " ")}`);
      void invalidate();
    },
  });

  const patchRule = useMutation({
    mutationFn: async ({ ruleId, patch }: { ruleId: string; patch: Partial<Rule> }) => {
      const { error: writeError } = await supabase.from("rules").update(patch).eq("id", ruleId);
      if (writeError) throw writeError;
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message);
    },
    onSuccess: () => void invalidate(),
  });

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error: writeError } = await supabase.from("rules").delete().eq("id", ruleId);
      if (writeError) throw writeError;
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message);
    },
    onSuccess: () => void invalidate(),
  });

  const loadIntoForm = (rule: Rule) =>
    setDraft({
      platform: rule.platform,
      event_type: rule.event_type,
      unit_amount: rule.unit_amount,
      seconds_per_unit: rule.seconds_per_unit,
      goal_increment: Number(rule.goal_increment),
      min_amount: rule.min_amount == null ? "" : String(rule.min_amount),
      priority: rule.priority,
    });

  const sectionClass = cn(
    "rounded-2xl border border-border bg-card/70 backdrop-blur",
    compact ? "p-3" : "p-5",
  );

  return (
    <div className={cn("space-y-4", !compact && "space-y-6")}>
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
          {notice}
        </p>
      ) : null}

      {!activeSubathonId ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {linking
            ? "Linking this widget to your subathon…"
            : "Link this widget to a subathon before adding rules."}
        </p>
      ) : null}

      <section className={sectionClass}>
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Zap className="size-4 shrink-0" aria-hidden />
          Quick presets
        </h2>
        <div className={cn("mt-3 flex flex-wrap gap-2", !compact && "mt-4 gap-3")}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={saveRule.isPending || !activeSubathonId}
              onClick={() =>
                saveRule.mutate({
                  platform: preset.platform,
                  event_type: preset.event_type,
                  seconds_per_unit: preset.seconds,
                  goal_increment: 0,
                  unit_amount: 1,
                  min_amount: preset.min_amount,
                  priority: 100,
                })
              }
              className={cn(
                "rounded-full border border-border bg-secondary/40 font-medium transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-50",
                compact ? "px-2.5 py-1.5 text-[0.7rem]" : "px-4 py-2 text-sm",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {existingMatch ? "Update rule" : "New rule"}
        </h2>
        <form
          className={cn(
            "mt-3 grid gap-3",
            compact ? "grid-cols-1" : "mt-4 gap-4 lg:grid-cols-6",
          )}
          onSubmit={(event) => {
            event.preventDefault();
            saveRule.mutate({
              platform: draft.platform,
              event_type: draft.event_type,
              seconds_per_unit: Number(draft.seconds_per_unit),
              goal_increment: Number(draft.goal_increment),
              unit_amount: Number(draft.unit_amount),
              min_amount: draft.min_amount === "" ? null : Number(draft.min_amount),
              priority: Number(draft.priority),
            });
          }}
        >
          <label>
            <span className={labelClass}>Platform</span>
            <DarkSelect
              className="mt-2"
              value={draft.platform}
              onValueChange={(next) => {
                const platform = next as Platform;
                const match = rulesQuery.data?.find(
                  (rule) => rule.platform === platform && rule.event_type === draft.event_type,
                );
                if (match) loadIntoForm(match);
                else setDraft((prev) => ({ ...prev, platform }));
              }}
              options={PLATFORMS}
            />
          </label>
          <label>
            <span className={labelClass}>Event</span>
            <DarkSelect
              className="mt-2"
              value={draft.event_type}
              onValueChange={(next) => {
                const eventType = next as EventType;
                const match = rulesQuery.data?.find(
                  (rule) => rule.platform === draft.platform && rule.event_type === eventType,
                );
                if (match) loadIntoForm(match);
                else setDraft((prev) => ({ ...prev, event_type: eventType }));
              }}
              options={EVENTS}
            />
          </label>
          <label>
            <span className={labelClass}>Time added</span>
            <div className="relative mt-2">
              <input
                type="number"
                min={0}
                className={`${fieldClass} pe-12`}
                value={draft.seconds_per_unit}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, seconds_per_unit: Number(event.target.value) }))
                }
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                sec
              </span>
            </div>
          </label>
          <label>
            <span className={labelClass}>Goal +</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${fieldClass} mt-2`}
              value={draft.goal_increment}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, goal_increment: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            <span className={labelClass}>Min amount</span>
            <input
              type="number"
              min={0}
              placeholder="any"
              className={`${fieldClass} mt-2`}
              value={draft.min_amount}
              onChange={(event) => setDraft((prev) => ({ ...prev, min_amount: event.target.value }))}
            />
          </label>
          <div className={cn("flex items-end", compact && "pt-1")}>
            <button
              type="submit"
              disabled={saveRule.isPending || !activeSubathonId}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-violet-500 px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden />
              {existingMatch ? "Update rule" : "Add rule"}
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          One rule per platform + event. Saving an existing combination updates it.
        </p>
      </section>

      <section className={cn("grid gap-3", !compact && "md:grid-cols-2")}>
        {rulesQuery.data?.length ? (
          rulesQuery.data.map((rule) => (
            <article
              key={rule.id}
              className={cn(
                "rounded-2xl border border-border bg-card/70 backdrop-blur transition-colors hover:border-primary/40",
                compact ? "p-3" : "p-5",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold ${PLATFORM_STYLE[rule.platform]}`}
                >
                  {PLATFORMS.find((p) => p.value === rule.platform)?.label ?? rule.platform}
                </span>
                <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {rule.event_type.replace("_", " ")}
                </span>
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[0.65rem] font-semibold text-primary">
                  {formatSeconds(rule.seconds_per_unit)}
                </span>
                {Number(rule.goal_increment) > 0 ? (
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[0.65rem] font-semibold text-emerald-300">
                    goal +{rule.goal_increment}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                every {rule.unit_amount} unit(s)
                {rule.min_amount != null ? ` · min ${rule.min_amount}` : ""} · priority{" "}
                {rule.priority}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={rule.is_enabled}
                    onChange={(event) =>
                      patchRule.mutate({
                        ruleId: rule.id,
                        patch: { is_enabled: event.target.checked },
                      })
                    }
                  />
                  <span className="relative h-6 w-11 rounded-full bg-secondary transition-colors peer-checked:bg-primary after:absolute after:start-1 after:top-1 after:size-4 after:rounded-full after:bg-foreground after:transition-transform peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5" />
                  <span className="text-xs text-muted-foreground">
                    {rule.is_enabled ? "Active" : "Disabled"}
                  </span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Edit rule"
                    onClick={() => loadIntoForm(rule)}
                    className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete rule"
                    onClick={() => deleteRule.mutate(rule.id)}
                    className="rounded-lg border border-border p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No widget rules yet — use a quick preset above.
          </p>
        )}
      </section>
    </div>
  );
}
