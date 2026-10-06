import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { DarkSelect } from "@/components/ui/dark-select";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { useWidgets } from "@/hooks/useWidgets";
import { useWorkspace } from "@/hooks/useWorkspace";
import { createWidget, widgetErrorText } from "@/lib/createWidget";
import { GOAL_TYPES, goalTypePreset, type GoalTypeId } from "@/lib/goalTypes";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { SIGNED_OUT_ERROR } from "@/lib/supabase/sessionError";
import { isTestMode } from "@/lib/testMode";
import { parseGoalConfig } from "@/lib/widgets";

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-primary";
const labelClass = "text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground";

const TYPE_KEYS: Record<GoalTypeId, TranslationKey> = {
  DONATION: "goal.type.donation",
  FOLLOWER: "goal.type.follower",
  SUBSCRIBER: "goal.type.subscriber",
  CUSTOM: "goal.type.custom",
};

export function CombinedGoalScreen({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const widgets = useWidgets();
  const workspace = useWorkspace(userId);
  const existing = widgets.data?.widgets.find((widget) => widget.type === "GOAL_BAR") ?? null;
  const goalRow = widgets.data?.goals.find((goal) => goal.widget_id === existing?.id) ?? null;
  const initialConfig = parseGoalConfig(existing?.config);
  const initialType = initialConfig.goalType;
  const [goalType, setGoalType] = useState<GoalTypeId>(initialType);
  const [title, setTitle] = useState(goalRow?.title || goalTypePreset(initialType).title);
  const [current, setCurrent] = useState(String(goalRow?.current_value ?? 0));
  const [target, setTarget] = useState(String(goalRow?.target_value || goalTypePreset(initialType).target));
  const [unit, setUnit] = useState(goalRow?.unit || goalTypePreset(initialType).unit);
  const [accent, setAccent] = useState(initialConfig.accentColor);
  const [track, setTrack] = useState(initialConfig.backgroundColor);
  const [text, setText] = useState(initialConfig.textColor);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  useEffect(() => {
    if (!existing || hydratedId === existing.id) return;
    const next = parseGoalConfig(existing.config);
    const preset = goalTypePreset(next.goalType);
    setGoalType(next.goalType);
    setTitle(goalRow?.title || preset.title);
    setCurrent(String(goalRow?.current_value ?? 0));
    setTarget(String(goalRow?.target_value || preset.target));
    setUnit(goalRow?.unit || preset.unit);
    setAccent(next.accentColor);
    setTrack(next.backgroundColor);
    setText(next.textColor);
    setHydratedId(existing.id);
  }, [existing, goalRow, hydratedId]);

  const savedUnit = goalType === "DONATION" || goalType === "CUSTOM" ? unit.trim() : "";
  const previewConfig = {
    ...parseGoalConfig(existing?.config),
    goalType,
    label: title,
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
          type: "GOAL_BAR",
          name: title.trim() || "Goals",
          goalType,
        });
        widgetId = created.id;
      }
      const { error: widgetError } = await supabase
        .from("widgets")
        .update({
          name: title.trim() || "Goals",
          config: previewConfig as never,
        })
        .eq("id", widgetId)
        .eq("user_id", userId);
      if (widgetError) throw widgetError;
      const { error: goalError } = await supabase
        .from("goals")
        .update({
          title: title.trim() || goalTypePreset(goalType).title,
          unit: savedUnit,
          target_value: Math.max(1, Number(target) || 1),
          current_value: Math.max(0, Number(current) || 0),
        })
        .eq("widget_id", widgetId)
        .eq("user_id", userId);
      if (goalError) throw goalError;
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
          <span className={labelClass}>{t("goal.field.type")}</span>
          <DarkSelect
            className="mt-2 w-full"
            aria-label={t("goal.field.type")}
            value={goalType}
            onValueChange={(next) => setGoalType(next as GoalTypeId)}
            options={GOAL_TYPES.map((preset) => ({
              value: preset.id,
              label: t(TYPE_KEYS[preset.id]),
            }))}
          />
        </label>
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
        {goalType === "DONATION" ? (
          <label className="block">
            <span className={labelClass}>{t("goal.field.currency")}</span>
            <input className={`${fieldClass} mt-2`} value={unit} onChange={(event) => setUnit(event.target.value)} />
          </label>
        ) : null}
        {goalType === "CUSTOM" ? (
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
          type="GOAL_BAR"
          config={previewConfig}
          frame={null}
          remaining={0}
          goal={{
            title,
            unit: savedUnit,
            target: Math.max(1, Number(target) || 1),
            current: Math.max(0, Number(current) || 0),
          }}
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
