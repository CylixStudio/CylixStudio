import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { useWidgets } from "@/hooks/useWidgets";
import { useWorkspace } from "@/hooks/useWorkspace";
import { createWidget, widgetErrorText } from "@/lib/createWidget";
import { useLanguage } from "@/lib/i18n";
import type { StandaloneTool } from "@/lib/standaloneTools";
import { supabase } from "@/lib/supabase/client";
import { SIGNED_OUT_ERROR } from "@/lib/supabase/sessionError";
import { isTestMode } from "@/lib/testMode";
import { isSplitGoalKind, parseSplitGoalConfig, type SplitGoalKind } from "@/lib/widgets";

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-primary";
const labelClass = "text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground";

export function GoalKindScreen({ spec, userId }: { spec: StandaloneTool; userId: string }) {
  const kind = spec.type;
  if (!isSplitGoalKind(kind)) return null;
  return <GoalKindForm spec={spec} userId={userId} kind={kind} />;
}

function GoalKindForm({
  spec,
  userId,
  kind,
}: {
  spec: StandaloneTool;
  userId: string;
  kind: SplitGoalKind;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const widgets = useWidgets();
  const workspace = useWorkspace(userId);
  const existing = widgets.data?.widgets.find((widget) => widget.type === kind) ?? null;
  const initial = parseSplitGoalConfig(kind, existing?.config);
  const [title, setTitle] = useState(initial.title);
  const [current, setCurrent] = useState(String(initial.current));
  const [target, setTarget] = useState(String(initial.target));
  const [unit, setUnit] = useState(initial.unit);
  const [accent, setAccent] = useState(initial.accentColor);
  const [track, setTrack] = useState(initial.backgroundColor);
  const [text, setText] = useState(initial.textColor);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  useEffect(() => {
    if (!existing || hydratedId === existing.id) return;
    const next = parseSplitGoalConfig(kind, existing.config);
    setTitle(next.title);
    setCurrent(String(next.current));
    setTarget(String(next.target));
    setUnit(next.unit);
    setAccent(next.accentColor);
    setTrack(next.backgroundColor);
    setText(next.textColor);
    setHydratedId(existing.id);
  }, [existing, hydratedId, kind]);

  const config = {
    ...parseSplitGoalConfig(kind, null),
    title,
    current: Math.max(0, Number(current) || 0),
    target: Math.max(1, Number(target) || 1),
    unit: kind === "DONATION_GOAL" || kind === "CUSTOM_GOAL" ? unit.trim() : "",
    accentColor: accent,
    backgroundColor: track,
    textColor: text,
  };

  const save = async () => {
    if (isTestMode()) {
      setError(SIGNED_OUT_ERROR);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let widgetId = existing?.id;
      if (!widgetId) {
        const created = await createWidget({
          userId,
          subathonId: workspace.data?.subathons[0]?.id ?? null,
          type: kind,
          name: spec.name,
        });
        widgetId = created.id;
      }
      const { error: writeError } = await supabase
        .from("widgets")
        .update({ name: title.trim() || spec.name, config: config as never })
        .eq("id", widgetId)
        .eq("user_id", userId);
      if (writeError) throw writeError;
      await queryClient.invalidateQueries({ queryKey: ["widgets"] });
      await navigate({ to: "/widgets" });
    } catch (err) {
      setError(widgetErrorText(err, t("goal.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <form
        className="space-y-3 rounded-2xl border border-white/10 bg-zinc-950 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <SessionAwareError error={error} signedOutLabel={t("tools.signedOut")} />
        <label className="block">
          <span className={labelClass}>{t("goal.field.title")}</span>
          <input className={`${fieldClass} mt-2`} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>{t("goal.field.current")}</span>
            <input
              className={`${fieldClass} mt-2`}
              inputMode="numeric"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>{t("goal.field.target")}</span>
            <input
              className={`${fieldClass} mt-2`}
              inputMode="numeric"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>
        </div>
        {kind === "DONATION_GOAL" ? (
          <label className="block">
            <span className={labelClass}>{t("goal.field.currency")}</span>
            <input className={`${fieldClass} mt-2`} value={unit} onChange={(event) => setUnit(event.target.value)} />
          </label>
        ) : null}
        {kind === "CUSTOM_GOAL" ? (
          <label className="block">
            <span className={labelClass}>{t("goal.field.unit")}</span>
            <input className={`${fieldClass} mt-2`} value={unit} onChange={(event) => setUnit(event.target.value)} />
          </label>
        ) : null}
        <div className="flex flex-wrap gap-4">
          <ColorField label={t("goal.field.accent")} value={accent} onChange={setAccent} />
          <ColorField label={t("goal.field.track")} value={track} onChange={setTrack} />
          <ColorField label={t("goal.field.text")} value={text} onChange={setText} />
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-muted-foreground"
            onClick={() => void navigate({ to: "/widgets" })}
          >
            {t("goal.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {existing ? t("goal.save") : t("goal.create")}
          </button>
        </div>
      </form>
      <div className="grid min-h-[240px] place-items-center rounded-2xl border border-white/10 bg-[repeating-conic-gradient(#16171d_0%_25%,#101116_0%_50%)] bg-[length:32px_32px] p-6">
        <WidgetRenderer
          type={kind}
          config={config}
          frame={null}
          remaining={0}
          goal={null}
          events={[]}
          spin={null}
        />
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const safe = /^#([0-9a-f]{6})$/i.test(value) ? value : "#7C3AED";
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        type="color"
        value={safe}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-zinc-950"
      />
    </label>
  );
}
