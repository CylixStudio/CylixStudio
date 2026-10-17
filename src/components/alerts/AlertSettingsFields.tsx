import { useLanguage } from "@/lib/i18n";
import { localizeAlertText } from "@/lib/i18n.alerts";
import { useId, useRef, useState, type ReactNode } from "react";
import * as Range from "@radix-ui/react-slider";
import { Code2, Image as ImageIcon } from "lucide-react";
import {
  ALERT_FONTS,
  type AlertConfig,
  type AlertCustomCode,
  type AlertKind,
  type AlertPlatform,
  type AlertStudioState,
} from "@/lib/alertStudio";
import { AlertMediaField } from "./AlertMediaField";

export function AlertRow({
  label,
  children,
  id,
}: {
  label: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="alert-row" data-field={label}>
      <label className="alert-label" htmlFor={id}>
        {label}
      </label>
      <div className="alert-control-wrap">{children}</div>
    </div>
  );
}

export function AlertSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <AlertRow label={label} id={id}>
      <input
        id={id}
        className="alert-slider"
        dir="ltr"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          background: `linear-gradient(to right, var(--alert-accent) ${((value - min) / (max - min)) * 100}%, #515151 0)`,
        }}
      />
      <output className="alert-range-value" htmlFor={id}>
        <bdi>
          {value} {unit}
        </bdi>
      </output>
    </AlertRow>
  );
}

export function AlertCodeEditor({
  code,
  onChange,
}: {
  code: AlertCustomCode;
  onChange: (value: AlertCustomCode) => void;
}) {
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState<"html" | "javascript" | "css" | "fields">("html");
  const id = useId();
  const numbers = useRef<HTMLDivElement>(null);
  // Untouched default snippets follow the UI language; edited code is kept verbatim.
  const shownCode =
    tab === "javascript"
      ? localizeAlertText(lang, code.javascript, "alerts.codeJsDefault")
      : tab === "fields"
        ? localizeAlertText(lang, code.fields, "alerts.codeFieldsDefault")
        : code[tab];
  const tabs = [
    { id: "html", name: "HTML" },
    { id: "javascript", name: "JavaScript" },
    { id: "css", name: "CSS" },
    { id: "fields", name: t("alerts.customFields") },
  ] as const;
  return (
    <section className="alert-code-section">
      <AlertRow label={t("alerts.customCode")} id={`${id}-enable`}>
        <label className="alert-check">
          <input
            id={`${id}-enable`}
            type="checkbox"
            checked={code.enabled}
            onChange={(event) => onChange({ ...code, enabled: event.target.checked })}
          />
          <span>{t("alerts.enableCode")} </span>
          <Code2 size={18} />
        </label>
      </AlertRow>
      {code.enabled && (
        <div className="alert-code-content">
          <p className="alert-hint">
            {t("alerts.variables")}{" "}
            <bdi className="alert-variables">
              {"{username}  {name}  {count}  {months}  {amount}  {message}"}
            </bdi>
          </p>
          <div
            className="alert-code-tabs"
            role="tablist"
            aria-label={t("alerts.codeLanguages")}
            dir="ltr"
          >
            {tabs.map((item, index) => (
              <button
                type="button"
                id={`${id}-${item.id}`}
                aria-controls={`${id}-editor`}
                role="tab"
                aria-selected={tab === item.id}
                tabIndex={tab === item.id ? 0 : -1}
                key={item.id}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    const next =
                      tabs[
                        (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
                      ]!;
                    setTab(next.id);
                    document.getElementById(`${id}-${next.id}`)?.focus();
                  }
                }}
                onClick={() => setTab(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div
            className="alert-code-editor"
            id={`${id}-editor`}
            role="tabpanel"
            aria-labelledby={`${id}-${tab}`}
            dir="ltr"
          >
            <div className="alert-code-lines" ref={numbers} aria-hidden="true">
              {shownCode.split("\n").map((_, index) => (
                <div key={index}>{index + 1}</div>
              ))}
            </div>
            <textarea
              aria-label={t("alerts.editor", {
                name: tabs.find((item) => item.id === tab)?.name ?? tab,
              })}
              spellCheck={false}
              value={shownCode}
              maxLength={50000}
              onScroll={(event) => {
                if (numbers.current) numbers.current.scrollTop = event.currentTarget.scrollTop;
              }}
              onChange={(event) => onChange({ ...code, [tab]: event.target.value })}
            />
          </div>
          <p className="alert-code-notice">{t("alerts.codeHint")} </p>
        </div>
      )}
    </section>
  );
}

export function AlertSettingsFields({
  config,
  onChange,
  studio,
  platform,
  kind,
  variationId,
  afterEnabled,
  disabled = false,
}: {
  config: AlertConfig;
  onChange: (patch: Partial<AlertConfig>) => void;
  studio: AlertStudioState;
  platform: AlertPlatform;
  kind: AlertKind;
  variationId?: string;
  afterEnabled?: ReactNode;
  disabled?: boolean;
}) {
  const { t, lang } = useLanguage();
  const prefix = useId();
  const select = (
    label: string,
    key: "style" | "enter" | "tts" | "fontFamily" | "textMotion",
    options: readonly (readonly [string, string])[],
  ) => (
    <AlertRow label={label} id={`${prefix}-${key}`}>
      <select
        id={`${prefix}-${key}`}
        className="alert-input"
        value={config[key]}
        onChange={(event) => onChange({ [key]: event.target.value })}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </AlertRow>
  );
  const color = (label: string, key: "textColor" | "secondaryColor") => (
    <AlertRow label={label} id={`${prefix}-${key}`}>
      <div className="alert-color">
        <input
          type="color"
          aria-label={t("alerts.chooseColor", { label })}
          value={/^#[0-9a-f]{6}$/i.test(config[key]) ? config[key] : "#bee1fc"}
          onChange={(event) => onChange({ [key]: event.target.value })}
        />
        <input
          id={`${prefix}-${key}`}
          className="alert-input"
          dir="ltr"
          value={config[key]}
          maxLength={7}
          pattern="#[0-9a-fA-F]{6}"
          onChange={(event) => onChange({ [key]: event.target.value })}
        />
      </div>
    </AlertRow>
  );
  // Untouched default message follows the UI language; typed text stays verbatim.
  const shownMessage = localizeAlertText(lang, config.message, `alerts.msg.${kind}`);
  return (
    <div className="alert-fields">
      <AlertRow label={t("alerts.active")} id={`${prefix}-enabled`}>
        <label className="alert-check">
          <input
            id={`${prefix}-enabled`}
            type="checkbox"
            checked={config.enabled}
            disabled={disabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          <span>
            {disabled
              ? t("alerts.unavailable")
              : config.enabled
                ? t("alerts.enabled")
                : t("alerts.disabled")}
          </span>
          <span className="alert-hint">{t("alerts.demoSimulation")} </span>
        </label>
      </AlertRow>
      {afterEnabled}
      {select(t("alerts.style"), "style", [
        ["classic", t("alerts.classic")],
        ["compact", t("alerts.compact")],
      ])}
      <AlertRow label={t("alerts.layout")}>
        <div className="alert-layout-options" role="group" aria-label={t("alerts.mediaLayout")}>
          {(
            [
              ["stack", t("alerts.above")],
              ["media-start", t("alerts.beside")],
              ["overlap", t("alerts.overlap")],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={`alert-layout-option ${config.layout === value ? "is-selected" : ""}`}
              aria-pressed={config.layout === value}
              onClick={() => onChange({ layout: value })}
            >
              <span className={`alert-layout-diagram layout-${value}`}>
                <ImageIcon size={28} />
                <span className="diagram-text">
                  <i />
                  <i />
                </span>
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </AlertRow>
      <AlertSlider
        label={t("alerts.duration")}
        min={1}
        max={30}
        value={config.durationMs / 1000}
        unit={t("alerts.seconds")}
        onChange={(value) =>
          onChange({
            durationMs: value * 1000,
            textStartMs: Math.min(config.textStartMs, value * 1000 - 50),
            textEndMs:
              config.textEndMs === config.durationMs
                ? value * 1000
                : Math.min(config.textEndMs, value * 1000),
          })
        }
      />
      {select(t("alerts.animation"), "enter", [
        ["fade", t("alerts.fadeIn")],
        ["rise", t("alerts.rise")],
        ["pop", t("alerts.pop")],
        ["slide", t("alerts.slide")],
      ])}
      <AlertRow label={t("alerts.image")}>
        <AlertMediaField
          key={`${platform}-${kind}-${variationId}-visual`}
          studio={studio}
          platform={platform}
          alertId={kind}
          variationId={variationId}
          slot="visual"
          source={config.visualSource}
          url={config.visualUrl}
          onSourceChange={(visualSource, visualUrl) => onChange({ visualSource, visualUrl })}
          label={t("alerts.image")}
        />
      </AlertRow>
      <AlertRow label={t("alerts.sound")}>
        <AlertMediaField
          key={`${platform}-${kind}-${variationId}-audio`}
          studio={studio}
          platform={platform}
          alertId={kind}
          variationId={variationId}
          slot="audio"
          source={config.audioSource}
          url={config.audioUrl}
          onSourceChange={(audioSource, audioUrl) => onChange({ audioSource, audioUrl })}
          label={t("alerts.sound")}
        />
      </AlertRow>
      <AlertSlider
        label={t("alerts.volume")}
        min={0}
        max={100}
        value={config.volume}
        unit="%"
        onChange={(volume) => onChange({ volume })}
      />
      {select(t("alerts.tts"), "tts", [
        ["none", t("alerts.none")],
        ["browser", t("alerts.browserVoice")],
      ])}
      <h2 className="alert-section-heading">
        {t("alerts.messageHeading")} <span>{t("alerts.messageHint")} </span>
      </h2>
      {color(t("alerts.upperColor"), "textColor")}
      {color(t("alerts.lowerColor"), "secondaryColor")}
      <AlertRow label={t("alerts.hideMessage")} id={`${prefix}-hide`}>
        <label className="alert-check">
          <input
            id={`${prefix}-hide`}
            type="checkbox"
            checked={config.hideUserMessage}
            onChange={(event) => onChange({ hideUserMessage: event.target.checked })}
          />
          <span>
            {t("alerts.hideContent")} {"{message}"} {t("alerts.fromAlert")}{" "}
          </span>
        </label>
      </AlertRow>
      <AlertSlider
        label={t("alerts.shadow")}
        min={0}
        max={100}
        value={config.textShadow}
        unit="%"
        onChange={(textShadow) => onChange({ textShadow })}
      />
      {select(
        t("alerts.font"),
        "fontFamily",
        ALERT_FONTS.map((font) => [font.id, font.id.startsWith("Saudi") ? "Saudi" : font.label]),
      )}
      <AlertSlider
        label={t("alerts.offsetY")}
        min={-240}
        max={240}
        value={config.offsetY}
        unit="px"
        onChange={(offsetY) => onChange({ offsetY })}
      />
      <AlertSlider
        label={t("alerts.offsetX")}
        min={-240}
        max={240}
        value={config.offsetX}
        unit="px"
        onChange={(offsetX) => onChange({ offsetX })}
      />
      {select(t("alerts.textMotion"), "textMotion", [
        ["none", t("alerts.none")],
        ["wiggle", t("alerts.wiggle")],
        ["pulse", t("alerts.pulse")],
      ])}
      <AlertSlider
        label={t("alerts.fontSize")}
        min={16}
        max={96}
        value={config.fontSize}
        unit="px"
        onChange={(fontSize) => onChange({ fontSize })}
      />
      <AlertRow label={t("alerts.text")} id={`${prefix}-message`}>
        <textarea
          id={`${prefix}-message`}
          className="alert-input alert-message"
          maxLength={180}
          value={shownMessage}
          onChange={(event) => onChange({ message: event.target.value })}
        />
        <div className="alert-variable-chips">
          {["username", "name", "count", "months", "amount", "message"].map((name) => (
            <button
              type="button"
              key={name}
              title={t("alerts.insertVariable")}
              onClick={() => onChange({ message: `${shownMessage} {${name}}`.slice(0, 180) })}
            >{`{${name}}`}</button>
          ))}
        </div>
      </AlertRow>
      <AlertRow label={t("alerts.timing")}>
        <Range.Root
          className="alert-dual-slider"
          dir="ltr"
          min={0}
          max={config.durationMs}
          step={50}
          minStepsBetweenThumbs={1}
          value={[config.textStartMs, config.textEndMs]}
          onValueChange={([textStartMs = 0, textEndMs = config.durationMs]) =>
            onChange({ textStartMs, textEndMs })
          }
        >
          <Range.Track className="alert-dual-track">
            <Range.Range className="alert-dual-range" />
          </Range.Track>
          <Range.Thumb className="alert-dual-thumb" aria-label={t("alerts.textStart")} />
          <Range.Thumb className="alert-dual-thumb" aria-label={t("alerts.textEnd")} />
        </Range.Root>
        <div className="alert-timing-values">
          <span>
            {t("alerts.start")} <bdi>{config.textStartMs} ms</bdi>
          </span>
          <span>
            {t("alerts.end")} <bdi>{config.textEndMs} ms</bdi>
          </span>
        </div>
      </AlertRow>
    </div>
  );
}
