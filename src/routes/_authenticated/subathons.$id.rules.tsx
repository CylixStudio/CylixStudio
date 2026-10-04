import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { InfoTip } from "@/components/ui/info-tip";
import { supabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useApplyDefaultPlatform } from "@/lib/defaultPlatform";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { eventsForPlatform, triggerPhrase, type StreamEventType } from "@/lib/platformEvents";
import type { Database } from "@/lib/supabase/types";
import { DarkSelect } from "@/components/ui/dark-select";

type Platform = Database["public"]["Enums"]["platform_type"];
type EventType = Database["public"]["Enums"]["rule_event_type"];
type Rule = Database["public"]["Tables"]["rules"]["Row"];

const PLATFORMS: Platform[] = [
  "TWITCH",
  "KICK",
  "YOUTUBE",
  "TIKTOK",
  "STREAMELEMENTS",
  "STREAMLABS",
  "MANUAL",
];
function triggerKey(platform: string, eventType: string): TranslationKey {
  return `rules.event.${triggerPhrase(platform, eventType)}` as TranslationKey;
}

function eventForPlatform(platform: Platform, current: EventType): EventType {
  const allowed = eventsForPlatform(platform);
  if (allowed.includes(current as StreamEventType)) return current;
  return (allowed[0] ?? "FOLLOW") as EventType;
}

const UNIT_LABEL: Record<EventType, string> = {
  FOLLOW: "follow",
  SUBSCRIPTION: "sub (tier weighted)",
  GIFT_SUB: "gifted sub",
  BITS: "bits",
  DONATION: "currency unit",
  RAID: "raid",
  LIKE: "like",
};

export const Route = createFileRoute("/_authenticated/subathons/$id/rules")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Rules Builder" },
      {
        name: "description",
        content:
          "Create rules that convert follows, subs, gift subs, bits and donations into subathon seconds.",
      },
      { property: "og:title", content: "CylixStudio — Rules Builder" },
      {
        property: "og:description",
        content: "Visual rule builder: platform + event + condition to seconds added.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RulesPage,
});

function RulesPage() {
  const { user } = Route.useRouteContext();
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: workspace } = useWorkspace(user.id);
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    platform: "TWITCH" as Platform,
    event_type: "SUBSCRIPTION" as EventType,
    unit_amount: 1,
    seconds_per_unit: 300,
    min_amount: "",
    max_seconds_per_event: "",
    priority: 100,
  });
  useApplyDefaultPlatform(workspace?.profile?.default_platform, (platform) => {
    if (!PLATFORMS.includes(platform)) return;
    setDraft((prev) => ({ ...prev, platform, event_type: eventForPlatform(platform, prev.event_type) }));
  });

  const rules = useQuery({
    queryKey: ["rules", id],
    queryFn: async () => {
      const { data, error: readError } = await supabase
        .from("rules")
        .select("*")
        .eq("subathon_id", id)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true });
      if (readError) throw readError;
      return data as Rule[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rules", id] });

  const createRule = useMutation({
    mutationFn: async () => {
      const { error: writeError } = await supabase.from("rules").upsert(
        {
          subathon_id: id,
          platform: draft.platform,
          event_type: draft.event_type,
          unit_amount: Math.max(1, Number(draft.unit_amount) || 1),
          seconds_per_unit: Math.max(0, Number(draft.seconds_per_unit) || 0),
          min_amount: draft.min_amount === "" ? null : Number(draft.min_amount),
          max_seconds_per_event:
            draft.max_seconds_per_event === "" ? null : Number(draft.max_seconds_per_event),
          priority: Number(draft.priority) || 0,
        },
        { onConflict: "subathon_id,platform,event_type" },
      );
      if (writeError) throw writeError;
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message);
    },
    onSuccess: () => {
      setError(null);
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

  const fieldClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  const labelClass =
    "text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground";

  return (
    <AppShell
      user={user}
      profile={workspace?.profile}
      subathons={workspace?.subathons ?? []}
      activeSubathonId={id}
      title="Rules builder"
      subtitle="Platform + event + condition → seconds added."
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          New rule
        </h2>
        <form
          className="mt-4 grid gap-4 lg:grid-cols-7"
          onSubmit={(event) => {
            event.preventDefault();
            createRule.mutate();
          }}
        >
          <label className="lg:col-span-1">
            <span className={labelClass}>Platform</span>
            <DarkSelect
              className="mt-2"
              value={draft.platform}
              onValueChange={(next) => {
                const platform = next as Platform;
                setDraft((prev) => ({
                  ...prev,
                  platform,
                  event_type: eventForPlatform(platform, prev.event_type),
                }));
              }}
              options={PLATFORMS.map((platform) => ({ value: platform, label: platform }))}
            />
          </label>
          <label className="lg:col-span-1">
            <span className={labelClass}>Event</span>
            <DarkSelect
              className="mt-2"
              value={draft.event_type}
              onValueChange={(next) =>
                setDraft((prev) => ({ ...prev, event_type: next as EventType }))
              }
              options={eventsForPlatform(draft.platform).map((eventType) => ({
                value: eventType,
                label: t(triggerKey(draft.platform, eventType)),
              }))}
            />
          </label>
          <label>
            <span className={`${labelClass} inline-flex items-center gap-1.5`}>
              Per units
              <InfoTip text={t("tooltips.rules.perUnits")} />
            </span>
            <input
              type="number"
              min={1}
              className={`${fieldClass} mt-2`}
              value={draft.unit_amount}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, unit_amount: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            <span className={`${labelClass} inline-flex items-center gap-1.5`}>
              Seconds
              <InfoTip text={t("tooltips.rules.timeAdded")} />
            </span>
            <input
              type="number"
              min={0}
              className={`${fieldClass} mt-2`}
              value={draft.seconds_per_unit}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, seconds_per_unit: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            <span className={`${labelClass} inline-flex items-center gap-1.5`}>
              Min amount
              <InfoTip text={t("tooltips.rules.minAmount")} />
            </span>
            <input
              type="number"
              min={0}
              placeholder="any"
              className={`${fieldClass} mt-2`}
              value={draft.min_amount}
              onChange={(event) => setDraft((prev) => ({ ...prev, min_amount: event.target.value }))}
            />
          </label>
          <label>
            <span className={`${labelClass} inline-flex items-center gap-1.5`}>
              Max / event
              <InfoTip text={t("tooltips.rules.maxPerEvent")} />
            </span>
            <input
              type="number"
              min={0}
              placeholder="none"
              className={`${fieldClass} mt-2`}
              value={draft.max_seconds_per_event}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, max_seconds_per_event: event.target.value }))
              }
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={createRule.isPending}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Add rule
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Reads as: every {draft.unit_amount} {UNIT_LABEL[draft.event_type]} on {draft.platform} adds{" "}
          {draft.seconds_per_unit}s
          {draft.min_amount ? ` (minimum ${draft.min_amount})` : ""}.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        {rules.data?.length ? (
          rules.data.map((rule) => (
            <article
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {rule.platform} · {t(triggerKey(rule.platform, rule.event_type))}
                </p>
                <p className="text-sm text-muted-foreground">
                  every {rule.unit_amount} {UNIT_LABEL[rule.event_type]} → +{rule.seconds_per_unit}s
                  {rule.min_amount != null ? ` · min ${rule.min_amount}` : ""}
                  {rule.max_seconds_per_event != null
                    ? ` · cap ${rule.max_seconds_per_event}s`
                    : ""}{" "}
                  · priority {rule.priority}
                </p>
              </div>
              <div className="flex items-center gap-3">
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
                  <span className="text-muted-foreground">
                    {rule.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                </label>
                <button
                  type="button"
                  aria-label="Delete rule"
                  onClick={() => deleteRule.mutate(rule.id)}
                  className="rounded-lg border border-border p-2 text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            No rules yet — add your first conversion above.
          </p>
        )}
      </section>
    </AppShell>
  );
}
