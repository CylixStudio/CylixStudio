import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { DarkSelect } from "@/components/ui/dark-select";
import { InfoTip } from "@/components/ui/info-tip";
import { TestSimulatePanel } from "@/components/widgets/TestSimulatePanel";
import { SubathonElementControlPanel } from "@/components/widgets/SubathonElementControlPanel";
import { WidgetRulesPanel } from "@/components/widgets/WidgetRulesPanel";
import { useLanguage } from "@/lib/i18n";
import { OVERLAY_LAYOUTS, OVERLAY_TIME_FORMATS, parseOverlayTheme } from "@/lib/overlayTheme";
import type { TimerFrame } from "@/lib/timer";

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const labelClass =
  "text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground";

type TabId = "general" | "controls" | "test" | "rules";

export function SubathonTimerSidebar({
  widgetId,
  subathonId,
  publicToken,
  name,
  onNameChange,
  config,
  onConfigChange,
  frame,
  remaining,
  onSaveConfig,
  onCopyUrl,
  copied,
  lang,
}: {
  widgetId: string;
  subathonId: string | null;
  publicToken: string;
  name: string;
  onNameChange: (next: string) => void;
  config: Record<string, unknown>;
  onConfigChange: (key: string, value: unknown) => void;
  frame: TimerFrame | null;
  remaining: number;
  onSaveConfig: () => Promise<unknown> | void;
  onCopyUrl: () => void;
  copied: boolean;
  lang: "ar" | "en";
}) {
  const [tab, setTab] = useState<TabId>("general");
  const { t } = useLanguage();
  const theme = parseOverlayTheme(config);

  const tabs: { id: TabId; label: string }[] = [
    { id: "general", label: "General & Layout" },
    { id: "controls", label: "Controls & Actions" },
    { id: "test", label: "Test & Integration" },
    { id: "rules", label: "Rules & Logic" },
  ];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Subathon settings"
        className="flex gap-1 rounded-xl border border-white/8 bg-black/20 p-1"
      >
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-center text-[0.62rem] font-semibold leading-tight transition sm:text-[0.68rem] ${
              tab === entry.id
                ? "border border-primary/60 bg-primary/15 text-primary shadow-[0_0_14px_hsl(var(--primary)/0.35)]"
                : "border border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "general" ? (
        <div className="space-y-4">
          <label className="block">
            <span className={labelClass}>{"Name"}</span>
            <input
              className={`${fieldClass} mt-2`}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              dir="auto"
            />
          </label>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{"Show Title"}</span>
              <span className="block text-[10px] text-muted-foreground">
                {"Hides the SUBATHON text label next to the timer in the OBS preview"}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={theme.showLabel}
              onClick={() => onConfigChange("showLabel", !theme.showLabel)}
              className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${
                theme.showLabel ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
                  theme.showLabel ? "start-[22px]" : "start-0.5"
                }`}
              />
            </button>
          </div>

          <label className="block">
            <span className={`${labelClass} inline-flex items-center gap-1.5`}>
              {"Layout Style"}
              <InfoTip text={t("tooltips.subathon.layout")} />
            </span>
            <DarkSelect
              className="mt-2 text-foreground"
              contentClassName="bg-popover text-popover-foreground"
              value={theme.layout}
              onValueChange={(next) => onConfigChange("layout", next)}
              options={OVERLAY_LAYOUTS.map((entry) => ({
                value: entry.value,
                label: entry.label,
              }))}
            />
          </label>

          <label className="block">
            <span className={`${labelClass} inline-flex items-center gap-1.5`}>
              {"Time format"}
              <InfoTip text={t("tooltips.subathon.timeFormat")} />
            </span>
            <DarkSelect
              className="mt-2 text-foreground"
              contentClassName="bg-popover text-popover-foreground"
              value={theme.timeFormat}
              onValueChange={(next) => onConfigChange("timeFormat", next)}
              options={OVERLAY_TIME_FORMATS.map((entry) => ({
                value: entry.value,
                label: entry.label,
              }))}
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "accentColor", value: theme.accentColor, label: "Accent" },
              { key: "textColor", value: theme.textColor, label: "Text" },
              {
                key: "backgroundColor",
                value: theme.backgroundColor,
                label: "Background",
              },
            ].map((entry) => (
              <label key={entry.key} className="block">
                <span className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  {entry.label}
                </span>
                <input
                  type="color"
                  className="mt-2 h-9 w-full cursor-pointer rounded-lg border border-border bg-background"
                  value={entry.value}
                  onChange={(event) => onConfigChange(entry.key, event.target.value)}
                />
              </label>
            ))}
          </div>

          <label className="block">
            <span className={`${labelClass} inline-flex items-center gap-1.5`}>
              {"Background opacity"} ({theme.backgroundOpacity}%)
              <InfoTip text={t("tooltips.subathon.opacity")} />
            </span>
            <input
              type="range"
              min={0}
              max={100}
              className="mt-3 w-full accent-primary"
              value={theme.backgroundOpacity}
              disabled={theme.hideBackground}
              onChange={(event) =>
                onConfigChange("backgroundOpacity", Number(event.target.value))
              }
            />
          </label>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{"Hide background container"}</span>
              <span className="block text-[10px] text-muted-foreground">
                {"Shows only the timer text and icons on a fully transparent background"}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={theme.hideBackground}
              onClick={() => onConfigChange("hideBackground", !theme.hideBackground)}
              className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${
                theme.hideBackground ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
                  theme.hideBackground ? "start-[22px]" : "start-0.5"
                }`}
              />
            </button>
          </div>

          <label className="block">
            <span className={labelClass}>
              {"Font size"} ({theme.fontSize}px)
            </span>
            <input
              type="range"
              min={12}
              max={160}
              className="mt-3 w-full accent-primary"
              value={theme.fontSize}
              onChange={(event) => onConfigChange("fontSize", Number(event.target.value))}
            />
          </label>
        </div>
      ) : null}

      {tab === "controls" ? (
        <SubathonElementControlPanel
          widgetId={widgetId}
          subathonId={subathonId}
          frame={frame}
          remaining={remaining}
          config={config}
          onConfigChange={onConfigChange}
          onSaveConfig={onSaveConfig}
          lang={lang}
        />
      ) : null}

      {tab === "test" ? (
        <div className="space-y-4">
          <TestSimulatePanel widgetId={widgetId} />

          <div className="rounded-xl border border-border bg-background p-4">
            <p className={labelClass}>OBS browser source</p>
            <button
              type="button"
              onClick={onCopyUrl}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary"
            >
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {"Copy OBS URL"}
            </button>
            <code className="mt-3 block break-all text-xs text-muted-foreground">
              {`/overlay/${publicToken}`}
            </code>
          </div>
        </div>
      ) : null}

      {tab === "rules" ? (
        <WidgetRulesPanel widgetId={widgetId} subathonId={subathonId} compact />
      ) : null}
    </div>
  );
}
