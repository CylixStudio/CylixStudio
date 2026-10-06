import { useMemo } from "react";

import { DarkSelect } from "@/components/ui/dark-select";
import { useLanguage } from "@/lib/i18n";
import { lookupChannel } from "@/lib/liveCounter.functions";
import {
  parseEventLabelsConfig,
  parseKicksGoalConfig,
  parseSpinConfig,
  parseViewerCounterConfig,
  type SpinPrize,
  type ViewerPlatform,
  type WidgetType,
} from "@/lib/widgets";
import { useState } from "react";

const fieldClass =
  "w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-primary";
const labelClass = "text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground";

const VIEWER_CHOICES: ViewerPlatform[] = ["KICK", "TWITCH", "YOUTUBE", "X"];

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function draftPrizes(config: Record<string, unknown>): SpinPrize[] {
  const raw = config["prizes"];
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.slice(0, 24).map((item) => {
      const row = asRecord(item);
      const weight = Number(row["weight"]);
      return {
        label: typeof row["label"] === "string" ? row["label"].slice(0, 40) : "",
        weight: Number.isFinite(weight) ? Math.min(100, Math.max(1, Math.round(weight))) : 1,
      };
    });
  }
  return parseSpinConfig(config).prizes;
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
    return (
      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <label className="block">
          <span className={labelClass}>{t("widget.wheel.title")}</span>
          <input
            className={`${fieldClass} mt-2`}
            value={typeof config["title"] === "string" ? config["title"] : parseSpinConfig(config).title}
            onChange={(event) => set("title", event.target.value)}
          />
        </label>
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
              <input
                type="number"
                min={1}
                max={100}
                className={`${fieldClass} w-20 shrink-0`}
                value={prize.weight}
                aria-label={t("widget.wheel.weight")}
                onChange={(event) => {
                  const next = prizes.slice();
                  const current = next[index];
                  if (!current) return;
                  next[index] = { label: current.label, weight: Number(event.target.value) };
                  writePrizes(next);
                }}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg border border-border px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => writePrizes(prizes.filter((_, item) => item !== index))}
              >
                {t("widget.wheel.remove")}
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
          onClick={() => writePrizes([...prizes, { label: "", weight: 1 }])}
        >
          {t("widget.wheel.add")}
        </button>
        {onSpin ? (
          <button
            type="button"
            onClick={onSpin}
            disabled={spinning}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {spinning ? "…" : t("widget.wheel.spin")}
          </button>
        ) : null}
      </div>
    );
  }

  if (type === "EVENT_LABELS") {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <label className="block">
          <span className={labelClass}>{t("widget.labels.title")}</span>
          <input
            className={`${fieldClass} mt-2`}
            value={typeof config["title"] === "string" ? config["title"] : parseEventLabelsConfig(config).title}
            onChange={(event) => set("title", event.target.value)}
          />
        </label>
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
