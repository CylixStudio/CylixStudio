import { useMemo, useState } from "react";

import { LayoutPicker } from "@/components/widgets/LayoutPicker";
import { DarkSelect } from "@/components/ui/dark-select";
import { playWheelSpinSound } from "@/components/widgets/SpinWheel";
import { EVENT_LABEL_I18N, EVENT_LABEL_OPTIONS } from "@/lib/eventLabels";
import { useLanguage } from "@/lib/i18n";
import { lookupChannel } from "@/lib/liveCounter.functions";
import {
  draftSpinPrizes,
  parseEventLabelsConfig,
  parseKicksGoalConfig,
  parseSpinConfig,
  parseSpinCost,
  parseViewerCounterConfig,
  type SpinPrize,
  type ViewerPlatform,
  type WidgetType,
} from "@/lib/widgets";
import {
  CHROME_LAYOUTS,
  EVENT_LABEL_LAYOUTS,
  GOAL_LAYOUTS,
  WHEEL_LAYOUTS,
  parseChromeLayout,
  parseEventLabelLayout,
  parseGoalLayout,
  parseWheelLayout,
} from "@/lib/widgetLayouts";

const fieldClass =
  "w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-primary";
const labelClass = "text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground";

const VIEWER_CHOICES: ViewerPlatform[] = ["KICK", "TWITCH", "YOUTUBE", "X"];

function draftPrizes(config: Record<string, unknown>): SpinPrize[] {
  return draftSpinPrizes(config);
}

export function StandaloneWidgetFields({
  type,
  config,
  set,
  onSpin,
  spinning,
}: {
  type: WidgetType;
  config: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  onSpin?: () => void;
  spinning?: boolean;
}) {
  const { t } = useLanguage();
  const kicks = parseKicksGoalConfig(config);
  const viewer = parseViewerCounterConfig(config);
  const prizes = useMemo(() => draftPrizes(config), [config]);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [lookupCount, setLookupCount] = useState<number | null>(null);

  const writePrizes = (next: SpinPrize[]) => {
    set("prizes", next);
    set("entries", next.map((prize) => prize.label.trim()).filter((label) => label.length > 0));
  };

  if (type === "KICKS_GOAL") {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <LayoutPicker
          value={parseGoalLayout(config)}
          options={GOAL_LAYOUTS.map((id) => ({ id, label: t(`layout.goal.${id}`) }))}
          onChange={(id) => set("layout", id)}
        />
        <label className="block">
          <span className={labelClass}>{t("widget.kicks.title")}</span>
          <input
            className={`${fieldClass} mt-2`}
            value={typeof config["title"] === "string" ? config["title"] : kicks.title}
            onChange={(event) => set("title", event.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>{t("widget.kicks.target")}</span>
            <input
              type="number"
              min={1}
              className={`${fieldClass} mt-2`}
              value={kicks.target}
              onChange={(event) => set("target", Number(event.target.value))}
            />
          </label>
          <label className="block">
            <span className={labelClass}>{t("widget.kicks.current")}</span>
            <input
              type="number"
              min={0}
              className={`${fieldClass} mt-2`}
              value={kicks.current}
              onChange={(event) => set("current", Number(event.target.value))}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          <ColorField label={t("widget.kicks.accent")} value={kicks.accentColor} onChange={(value) => set("accentColor", value)} />
          <ColorField
            label={t("widget.kicks.track")}
            value={kicks.backgroundColor}
            onChange={(value) => set("backgroundColor", value)}
          />
          <ColorField label={t("widget.kicks.text")} value={kicks.textColor} onChange={(value) => set("textColor", value)} />
        </div>
      </div>
    );
  }

  if (type === "VIEWER_COUNTER") {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <LayoutPicker
          value={parseChromeLayout(config)}
          options={CHROME_LAYOUTS.map((id) => ({ id, label: t(`layout.chrome.${id}`) }))}
          onChange={(id) => set("layout", id)}
        />
        <label className="block">
          <span className={labelClass}>{t("widget.viewer.platform")}</span>
          <DarkSelect
            className="mt-2"
            value={VIEWER_CHOICES.includes(viewer.platform) ? viewer.platform : "KICK"}
            onValueChange={(next) => set("platform", next)}
            options={VIEWER_CHOICES.map((platform) => ({ value: platform, label: platform }))}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t("widget.viewer.channel")}</span>
          <input
            className={`${fieldClass} mt-2`}
            value={viewer.channel}
            placeholder="channel"
            onChange={(event) => set("channel", event.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t("widget.viewer.metric")}</span>
          <DarkSelect
            className="mt-2"
            value={viewer.metric}
            onValueChange={(next) => set("metric", next)}
            options={[
              { value: "viewers", label: t("widget.viewer.viewers") },
              { value: "followers", label: t("widget.viewer.followers") },
            ]}
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          onClick={() => {
            setLookupNote(null);
            void lookupChannel({ data: { platform: viewer.platform, username: viewer.channel } })
              .then((snapshot) => {
                const count = viewer.metric === "followers" ? snapshot.followers : snapshot.viewers;
                setLookupCount(count);
                setLookupNote(snapshot.note);
              })
              .catch((error: unknown) => {
                setLookupCount(null);
                setLookupNote(error instanceof Error ? error.message : t("widget.viewer.comingSoon"));
              });
          }}
        >
          {t("widget.viewer.preview")}
        </button>
        {lookupCount !== null ? (
          <p className="text-sm tabular-nums" dir="ltr">
            {lookupCount.toLocaleString("en-US")}
          </p>
        ) : null}
        {lookupNote ? <p className="text-xs text-muted-foreground">{lookupNote}</p> : null}
      </div>
    );
  }

  if (type === "SPIN_WHEEL") {
    const cost = parseSpinCost(config);
    const named = prizes.some((prize) => prize.label.trim().length > 0);
    return (
      <div className="relative z-10 flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <label className="block">
          <span className={labelClass}>{t("widget.wheel.title")}</span>
          <input
            className={`${fieldClass} mt-2`}
            value={typeof config["title"] === "string" ? config["title"] : parseSpinConfig(config).title}
            onChange={(event) => set("title", event.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t("widget.wheel.cost")}</span>
          <input
            type="number"
            min={0}
            className={`${fieldClass} mt-2`}
            value={cost}
            onChange={(event) => set("spinCost", Math.max(0, Number(event.target.value) || 0))}
          />
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t("widget.wheel.costHint")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("widget.wheel.commands")}</p>
        </label>
        <LayoutPicker
          value={parseWheelLayout(config)}
          options={WHEEL_LAYOUTS.map((id) => ({ id, label: t(`layout.wheel.${id}`) }))}
          onChange={(id) => set("layout", id)}
        />
        <div className="space-y-2">
          {prizes.map((prize, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                className={fieldClass}
                value={prize.label}
                placeholder={t("widget.wheel.prize")}
                onChange={(event) => {
                  const next = prizes.slice();
                  const current = next[index];
                  if (!current) return;
                  next[index] = { label: event.target.value, weight: current.weight };
                  writePrizes(next);
                }}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:text-zinc-100"
                onClick={() => writePrizes(prizes.filter((_, item) => item !== index))}
              >
                {t("widget.wheel.remove")}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100"
            onClick={() => writePrizes([...prizes, { label: "", weight: 1 }])}
          >
            {t("widget.wheel.add")}
          </button>
        </div>
        {onSpin ? (
          <button
            type="button"
            onClick={() => {
              if (spinning || !named) return;
              playWheelSpinSound();
              onSpin();
            }}
            disabled={spinning || !named}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {spinning ? "…" : t("widget.wheel.spin")}
          </button>
        ) : null}
      </div>
    );
  }

  if (type === "EVENT_LABELS") {
    const selected = new Set(parseEventLabelsConfig(config).labels);
    return (
      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <LayoutPicker
          value={parseEventLabelLayout(config)}
          options={EVENT_LABEL_LAYOUTS.map((id) => ({ id, label: t(`layout.events.${id}`) }))}
          onChange={(id) => set("layout", id)}
        />
        <label className="block">
          <span className={labelClass}>{t("widget.labels.title")}</span>
          <input
            className={`${fieldClass} mt-2`}
            value={typeof config["title"] === "string" ? config["title"] : parseEventLabelsConfig(config).title}
            onChange={(event) => set("title", event.target.value)}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className={labelClass}>{t("widget.labels.options")}</legend>
          {EVENT_LABEL_OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={selected.has(option)}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(option);
                  else next.delete(option);
                  set(
                    "labels",
                    EVENT_LABEL_OPTIONS.filter((id) => next.has(id)),
                  );
                }}
              />
              <span>{t(EVENT_LABEL_I18N[option])}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("widget.labels.liveHint")}</p>
      </div>
    );
  }

  return null;
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
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        type="color"
        value={/^#([0-9a-f]{6})$/i.test(value) ? value : "#53FC18"}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-zinc-950"
      />
    </label>
  );
}
