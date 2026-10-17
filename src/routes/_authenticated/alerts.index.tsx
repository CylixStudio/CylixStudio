import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  Pencil,
  Play,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useAlertStudioKey,
  loadAlertStudio,
  overlayUrl,
  saveAlertStudio,
} from "@/components/alerts/alertApi";
import { AlertStage, type AlertStageHandle } from "@/components/alerts/AlertStage";
import {
  AlertCodeEditor,
  AlertRow,
  AlertSettingsFields,
  AlertSlider,
} from "@/components/alerts/AlertSettingsFields";
import { AppShell } from "@/components/layout/AppShell";
import { AlertControl } from "@/components/alerts/AlertControl";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { localizeAlertText } from "@/lib/i18n.alerts";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ALERT_CATALOG,
  ALERT_FONT_HREF,
  normalizeConfig,
  type AlertConfig,
  type AlertEvent,
  type AlertKind,
  type AlertPlatform,
  type AlertVariation,
  type PlatformAlerts,
  supportFor,
  selectableAlert,
} from "@/lib/alertStudio";
import "@/components/alerts/alerts.css";

export const Route = createFileRoute("/_authenticated/alerts/")({
  head: () => ({
    meta: [{ title: "CylixStudio — التنبيهات" }],
    links: [{ rel: "stylesheet", href: ALERT_FONT_HREF }],
  }),
  component: AlertsPage,
});

function exportAlert(platform: AlertPlatform, kind: AlertKind, config: AlertConfig) {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { format: "cylix-alert", version: 1, platform, alertId: kind, config },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cylix-${platform.toLowerCase()}-${kind}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function AlertsPage() {
  const { dir, t, lang } = useLanguage();
  useEffect(() => {
    document.title = `CylixStudio — ${t("alerts.title")}`;
  }, [t]);
  const conditionLabels = {
    random: t("alerts.random"),
    "min-count": t("alerts.minCount"),
    "min-months": t("alerts.minMonths"),
    "min-amount": t("alerts.minAmount"),
  };
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const alertStudioKey = useAlertStudioKey();
  const studio = useQuery({
    queryKey: alertStudioKey,
    queryFn: loadAlertStudio,
    refetchInterval: 5000,
  });
  const data = studio.data;
  const [platform, setPlatform] = useState<AlertPlatform>("KICK");
  const visibleAlertCatalog = ALERT_CATALOG.filter((item) => selectableAlert(item, platform));
  const alertName = (id: AlertKind) => ALERT_CATALOG.find((item) => item.id === id)?.title ?? id;
  const [kind, setKind] = useState<AlertKind>("follow");
  const [drafts, setDrafts] = useState<PlatformAlerts | null>(null);
  const [hidden, setHidden] = useState(true);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<TranslationKey | "">("");
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [preview, setPreview] = useState(false);
  const [queue, setQueue] = useState<AlertEvent[]>([]);
  const [variation, setVariation] = useState<AlertVariation | null>(null);
  const [variationError, setVariationError] = useState<TranslationKey | "">("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [variationsOpen, setVariationsOpen] = useState(true);
  const [giftCount, setGiftCount] = useState("5");
  const giftInitialized = useRef(false);
  const testPending = useRef(false);
  const stageRef = useRef<AlertStageHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const variationForm = useRef<HTMLFormElement>(null);
  const current = queue[0];

  useEffect(() => {
    if (data) setDrafts((value) => value ?? data.alerts);
  }, [data]);
  useEffect(() => {
    if (data && !giftInitialized.current) {
      setGiftCount(String(data.simulation.count));
      giftInitialized.current = true;
    }
  }, [data?.simulation.count]);
  useEffect(() => {
    if (!current) return;
    const frame = window.requestAnimationFrame(() => stageRef.current?.play());
    const timer = window.setTimeout(
      () => setQueue((items) => items.slice(1)),
      current.config.delayMs + current.config.durationMs + 280,
    );
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [current]);

  const definition =
    visibleAlertCatalog.find((item) => item.id === kind) ?? visibleAlertCatalog[0]!;
  const config = drafts?.[platform][kind];
  const blocked = supportFor(definition, platform).level === "unavailable";
  const dirty = Boolean(data && drafts && JSON.stringify(data.alerts) !== JSON.stringify(drafts));
  const link = data
    ? overlayUrl(typeof window === "undefined" ? "" : window.location.origin, data.token)
    : "";
  const connected = Boolean(data && data.overlaySeenAt > Date.now() - 12000);
  const patch = (partial: Partial<AlertConfig>) =>
    setDrafts((value) =>
      value
        ? {
            ...value,
            [platform]: { ...value[platform], [kind]: { ...value[platform][kind], ...partial } },
          }
        : value,
    );
  const reportError = (error: unknown) =>
    setNotice(
      error instanceof Error && error.message.startsWith("alerts.")
        ? (error.message as TranslationKey)
        : "alerts.connectionFail",
    );

  const save = async (next = drafts) => {
    if (!next || busy) return false;
    if (!formRef.current?.reportValidity()) return false;
    setBusy(true);
    try {
      const saved = await saveAlertStudio({ alerts: next });
      queryClient.setQueryData(alertStudioKey, saved);
      setDrafts(saved.alerts);
      setNotice("alerts.saveOk");
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const test = async (alertId: AlertKind) => {
    if (!data || !drafts || busy || testPending.current) return;
    // An empty Gift Count is optional: it falls back to the saved quantity.
    const rawCount = giftCount.trim();
    const count = rawCount === "" ? data.simulation.count : Number(rawCount);
    if (alertId === "gift" && (!Number.isSafeInteger(count) || count < 1 || count > 100000)) {
      setNotice("alerts.positiveCount");
      return;
    }
    testPending.current = true;
    setBusy(true);
    try {
      if (alertId === "gift") {
        const saved = await saveAlertStudio({ simulation: { ...data.simulation, count } });
        queryClient.setQueryData(alertStudioKey, saved);
      }
      const response = await fetch("/api/alerts/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...data.simulation,
          count: alertId === "gift" ? count : data.simulation.count,
          platform,
          alertId,
          requestId: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as {
        queued: boolean;
        message: string;
        event: AlertEvent | null;
      };
      if (!response.ok) throw new Error("alerts.testFail");
      setNotice(payload.queued ? "alerts.queued" : "alerts.testDisabled");
      if (payload.queued && payload.event) {
        setQueue((items) =>
          items.some((item) => item.id === payload.event!.id) ? items : [...items, payload.event!],
        );
        setPreview(true);
      }
    } catch (error) {
      reportError(error);
    } finally {
      testPending.current = false;
      setBusy(false);
    }
  };

  const acceptVariation = async () => {
    if (!variation || !config || !drafts || !variationForm.current?.reportValidity()) return;
    const nextConfig = {
      ...config,
      variations: [...config.variations.filter((item) => item.id !== variation.id), variation],
    };
    const next = { ...drafts, [platform]: { ...drafts[platform], [kind]: nextConfig } };
    setVariationError("");
    if (await save(next)) setVariation(null);
    else setVariationError("alerts.variationFail");
  };

  const importAlert = async (file?: File) => {
    if (!file || !drafts) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("alerts.importSize");
      const parsed = JSON.parse(await file.text());
      const target = ALERT_CATALOG.find(
        (item) =>
          item.id === parsed.alertId && !["host", "gift-bomb", "donation"].includes(item.id),
      );
      if (
        parsed.format !== "cylix-alert" ||
        parsed.version !== 1 ||
        !target ||
        !["KICK", "TWITCH"].includes(parsed.platform) ||
        !parsed.config ||
        typeof parsed.config !== "object" ||
        Array.isArray(parsed.config)
      )
        throw new Error("alerts.importInvalid");
      const next = {
        ...drafts,
        [parsed.platform]: {
          ...drafts[parsed.platform as AlertPlatform],
          [target.id]: normalizeConfig(parsed.config, target),
        },
      };
      if (await save(next)) {
        setPlatform(parsed.platform);
        setKind(target.id);
        setNotice("alerts.importOk");
      }
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <AppShell title={t("alerts.title")} user={user}>
      <div className="alerts-studio" dir={dir}>
        <div className="alert-page-intro">
          <p>{t("alerts.intro")} </p>
          <span className="alert-demo-badge">
            <span /> {t("alerts.demo")}{" "}
          </span>
        </div>
        <section className="alert-widget-section" aria-label={t("alerts.obsSection")}>
          <p className="alert-secret-note">
            <ShieldCheck size={17} />
            {t("alerts.privateUrl")}{" "}
          </p>
          <div className="alert-widget-row">
            <label htmlFor="alert-widget-url">{t("alerts.widgetUrl")} </label>
            <div className="alert-url-field">
              <input
                id="alert-widget-url"
                dir="ltr"
                readOnly
                value={
                  data
                    ? hidden
                      ? link.replace(data.token, "••••••••••••••••")
                      : link
                    : t("alerts.loading")
                }
              />
              <button
                type="button"
                aria-label={hidden ? t("alerts.showUrl") : t("alerts.hideUrl")}
                onClick={() => setHidden(!hidden)}
              >
                {hidden ? <Eye size={17} /> : <EyeOff size={17} />}
              </button>
            </div>
            <button
              type="button"
              className="alert-button primary"
              disabled={!data}
              onClick={() => {
                void navigator.clipboard
                  .writeText(link)
                  .then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  })
                  .catch(() => setNotice("alerts.copyFail"));
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t("alerts.copied") : t("alerts.copy")}
            </button>
            <button
              type="button"
              className="alert-button"
              disabled={!config}
              onClick={() => setAdvanced(true)}
            >
              <Settings2 size={16} />
              {t("alerts.advanced")}{" "}
            </button>
            <a className="alert-button" href={link || undefined} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              {t("alerts.openPreview")}{" "}
            </a>
          </div>
          <div className="alert-widget-meta">
            <div className="alert-platforms" aria-label={t("alerts.platform")}>
              {(["KICK", "TWITCH"] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  disabled={busy}
                  aria-pressed={platform === item}
                  onClick={() => {
                    setPlatform(item);
                    if (!selectableAlert(definition, item)) setKind("follow");
                  }}
                >
                  <span className="platform-mark">{item === "KICK" ? "K" : "T"}</span>
                  {item === "KICK" ? "Kick" : "Twitch"}
                  <small>{t("alerts.simulated")} </small>
                </button>
              ))}
            </div>
            <span className="alert-hint">{t("alerts.demoOnly")} </span>
            <span className="alert-upload-limits">
              {t("alerts.fileLimit")} <bdi>Free: 5 MB</bdi>
              <span>·</span>
              <bdi>Pro: 60 MB</bdi>
            </span>
          </div>
        </section>
        {data ? <AlertControl token={data.token} /> : null}
        <section className="alert-tests">
          <div className="alert-tests-heading">
            <h2>{t("alerts.testHeading")} </h2>
            <span className="alert-hint">{t("alerts.savedTest")} </span>
          </div>
          <div className="alert-test-buttons">
            <label className="alert-gift-count" dir="ltr">
              <span>{t("alerts.giftCount")}</span>
              <input
                aria-label={t("alerts.giftCount")}
                type="number"
                min={1}
                max={100000}
                step={1}
                inputMode="numeric"
                value={giftCount}
                onChange={(event) => setGiftCount(event.target.value)}
                onBlur={(event) => {
                  const raw = event.target.value.trim();
                  // The field stays optional; only explicit entries are validated.
                  if (raw === "") return;
                  const count = Number(raw);
                  if (!Number.isSafeInteger(count) || count < 1 || count > 100000) {
                    setNotice("alerts.positiveCount");
                    return;
                  }
                  if (data)
                    void saveAlertStudio({ simulation: { ...data.simulation, count } })
                      .then((saved) => queryClient.setQueryData(alertStudioKey, saved))
                      .catch(reportError);
                }}
              />
            </label>
            {visibleAlertCatalog.map((item) => (
              <button
                type="button"
                className="alert-button test-button"
                key={item.id}
                disabled={busy || !data || supportFor(item, platform).level === "unavailable"}
                onClick={() => void test(item.id)}
              >
                <Plus size={17} />
                {alertName(item.id)}
              </button>
            ))}
          </div>
        </section>
        {notice && (
          <div className="alert-notice" role="status">
            {t(notice)}
          </div>
        )}
        {studio.isError && (
          <div role="alert" className="alert-error">
            {t("alerts.loadFail")}{" "}
            <button type="button" onClick={() => void studio.refetch()}>
              {t("alerts.retry")}{" "}
            </button>
          </div>
        )}
        <div className="alert-type-tabs" role="tablist" aria-label={t("alerts.types")}>
          {visibleAlertCatalog.map((item, index) => (
            <button
              type="button"
              role="tab"
              id={`alert-tab-${item.id}`}
              aria-controls="alert-settings"
              aria-selected={kind === item.id}
              tabIndex={kind === item.id ? 0 : -1}
              key={item.id}
              onClick={() => setKind(item.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  const next =
                    visibleAlertCatalog[
                      (index +
                        ((event.key === "ArrowLeft") === (dir === "rtl") ? 1 : -1) +
                        visibleAlertCatalog.length) %
                        visibleAlertCatalog.length
                    ]!;
                  setKind(next.id);
                  document.getElementById(`alert-tab-${next.id}`)?.focus();
                }
              }}
            >
              {alertName(item.id)}
            </button>
          ))}
        </div>
        <form
          ref={formRef}
          className="alert-settings-panel"
          id="alert-settings"
          role="tabpanel"
          aria-labelledby={`alert-tab-${kind}`}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {config && data ? (
            <fieldset disabled={busy}>
              <AlertSettingsFields
                config={config}
                onChange={patch}
                studio={data}
                platform={platform}
                kind={kind}
                disabled={blocked}
              />
              <section className="alert-variations">
                <button
                  type="button"
                  className="alert-accordion-trigger"
                  aria-expanded={variationsOpen}
                  aria-controls="alert-variation-list"
                  onClick={() => setVariationsOpen(!variationsOpen)}
                >
                  <span>
                    <Layers size={18} />
                    {t("alerts.variations")} <small>{config.variations.length}</small>
                  </span>
                  <ChevronDown size={18} className={variationsOpen ? "is-open" : ""} />
                </button>
                {variationsOpen && (
                  <div id="alert-variation-list">
                    <p className="alert-hint">{t("alerts.variationHelp")} </p>
                    {config.variations.length === 0 && (
                      <p className="alert-empty">{t("alerts.noVariations")} </p>
                    )}
                    {config.variations.map((item) => (
                      <div className="alert-variation-item" key={item.id}>
                        <span
                          className={`alert-status-dot ${item.config.enabled ? "active" : ""}`}
                        />
                        <div>
                          <strong>
                            {localizeAlertText(lang, item.name, "alerts.untitledVariation")}
                          </strong>
                          <small>
                            {conditionLabels[item.condition]}{" "}
                            {item.condition !== "random" && item.threshold} ·{" "}
                            {item.config.enabled
                              ? t("alerts.enabledVariation")
                              : t("alerts.disabledVariation")}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="alert-button"
                          aria-label={t("alerts.editNamed", { name: item.name })}
                          onClick={() => {
                            setVariation(structuredClone(item));
                            setVariationError("");
                          }}
                        >
                          <Pencil size={15} />
                          {t("alerts.edit")}{" "}
                        </button>
                        <button
                          type="button"
                          className="alert-button icon-button"
                          aria-label={t("alerts.deleteNamed", { name: item.name })}
                          onClick={() => setDeleting(item.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="alert-button"
                      disabled={config.variations.length >= 20 || blocked}
                      onClick={() => {
                        setVariation({
                          id: crypto.randomUUID(),
                          name: t("alerts.variationDefault", { n: config.variations.length + 1 }),
                          condition: "random",
                          threshold: 1,
                          config: { ...structuredClone(config), variations: [] },
                        });
                        setVariationError("");
                      }}
                    >
                      <Plus size={16} />
                      {t("alerts.addVariation")}{" "}
                    </button>
                  </div>
                )}
              </section>
              <AlertCodeEditor
                code={config.customCode}
                onChange={(customCode) => patch({ customCode })}
              />
              <div className="alert-export-row">
                <button
                  type="button"
                  className="alert-button"
                  onClick={() => exportAlert(platform, kind, config)}
                >
                  <Download size={16} />
                  {t("alerts.export")}{" "}
                </button>
                <span className="alert-hint">{t("alerts.jsonHint")} </span>
              </div>
              <footer className="alert-save-footer">
                <div className="alert-save-actions">
                  <button type="submit" className="alert-button primary">
                    <Save size={17} />
                    {busy ? t("alerts.saving") : t("alerts.save")}
                  </button>
                  <button
                    type="button"
                    className="alert-button"
                    onClick={() => importRef.current?.click()}
                  >
                    <Upload size={17} />
                    {t("alerts.import")}{" "}
                  </button>
                </div>
                <span className={`alert-save-status ${dirty ? "unsaved" : ""}`}>
                  {dirty ? t("alerts.unsaved") : t("alerts.saved")}
                </span>
              </footer>
            </fieldset>
          ) : (
            <p className="alert-loading">{t("alerts.loadingSettings")} </p>
          )}
        </form>
        <input
          ref={importRef}
          type="file"
          hidden
          accept=".json,application/json"
          aria-label={t("alerts.importFile")}
          onChange={(event) => {
            void importAlert(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      <Dialog
        open={Boolean(variation)}
        onOpenChange={(open) => {
          if (!open && !busy) setVariation(null);
        }}
      >
        <DialogContent
          closeLabel={t("alerts.close")}
          className="alerts-studio alert-modal"
          dir={dir}
        >
          <header className="alert-modal-header">
            <DialogTitle>
              {config?.variations.some((item) => item.id === variation?.id)
                ? t("alerts.editVariation")
                : t("alerts.newVariation")}
            </DialogTitle>
            <DialogDescription>
              {t("alerts.independent")} {alertName(definition.id)} · {platform}
            </DialogDescription>
          </header>
          <form
            ref={variationForm}
            className="alert-modal-body"
            onSubmit={(event) => {
              event.preventDefault();
              void acceptVariation();
            }}
          >
            {variation && data && (
              <fieldset disabled={busy}>
                <AlertSettingsFields
                  config={variation.config}
                  onChange={(partial) =>
                    setVariation((current) =>
                      current ? { ...current, config: { ...current.config, ...partial } } : current,
                    )
                  }
                  studio={data}
                  platform={platform}
                  kind={kind}
                  variationId={variation.id}
                  afterEnabled={
                    <AlertRow label={t("alerts.condition")} id="variation-condition">
                      <div className="alert-condition">
                        <select
                          id="variation-condition"
                          className="alert-input"
                          value={variation.condition}
                          onChange={(event) =>
                            setVariation({
                              ...variation,
                              condition: event.target.value as AlertVariation["condition"],
                            })
                          }
                        >
                          {Object.entries(conditionLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {variation.condition !== "random" && (
                          <input
                            className="alert-input"
                            type="number"
                            aria-label={t("alerts.threshold")}
                            min={1}
                            max={100000}
                            value={variation.threshold}
                            onChange={(event) =>
                              setVariation({ ...variation, threshold: Number(event.target.value) })
                            }
                          />
                        )}
                      </div>
                    </AlertRow>
                  }
                />
                <AlertCodeEditor
                  code={variation.config.customCode}
                  onChange={(customCode) =>
                    setVariation((current) =>
                      current ? { ...current, config: { ...current.config, customCode } } : current,
                    )
                  }
                />
                <div className="alert-export-row">
                  <button
                    type="button"
                    className="alert-button"
                    onClick={() => exportAlert(platform, kind, variation.config)}
                  >
                    <Download size={16} />
                    {t("alerts.export")}{" "}
                  </button>
                </div>
              </fieldset>
            )}
          </form>
          <footer className="alert-modal-footer">
            {variation && (
              <input
                className="alert-input variation-name"
                aria-label={t("alerts.variationName")}
                maxLength={60}
                value={localizeAlertText(lang, variation.name, "alerts.untitledVariation")}
                onChange={(event) => setVariation({ ...variation, name: event.target.value })}
              />
            )}
            <span role="alert" className="alert-error">
              {variationError ? t(variationError) : ""}
            </span>
            <button
              type="button"
              className="alert-button primary"
              disabled={busy}
              onClick={() => void acceptVariation()}
            >
              <Check size={17} />
              {t("alerts.accept")}{" "}
            </button>
          </footer>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent
          closeLabel={t("alerts.close")}
          className="alerts-studio alert-confirm"
          dir={dir}
        >
          <DialogTitle>{t("alerts.deleteVariation")} </DialogTitle>
          <DialogDescription>{t("alerts.deleteConfirmHint")} </DialogDescription>
          <div className="alert-save-actions">
            <button
              type="button"
              className="alert-button primary"
              disabled={busy}
              onClick={() => {
                if (!config || !drafts) return;
                const next = {
                  ...drafts,
                  [platform]: {
                    ...drafts[platform],
                    [kind]: {
                      ...config,
                      variations: config.variations.filter((item) => item.id !== deleting),
                    },
                  },
                };
                void save(next).then((ok) => {
                  if (ok) setDeleting(null);
                });
              }}
            >
              {t("alerts.confirmDelete")}{" "}
            </button>
            <button type="button" className="alert-button" onClick={() => setDeleting(null)}>
              {t("alerts.cancel")}{" "}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={advanced} onOpenChange={setAdvanced}>
        <DialogContent
          closeLabel={t("alerts.close")}
          className="alerts-studio alert-modal alert-advanced-modal"
          dir={dir}
        >
          <header className="alert-modal-header">
            <DialogTitle>{t("alerts.advanced")} </DialogTitle>
            <DialogDescription>{t("alerts.advancedHint")} </DialogDescription>
          </header>
          <div className="alert-modal-body">
            {config && data && (
              <>
                <AlertSlider
                  label={t("alerts.imageSize")}
                  min={48}
                  max={480}
                  value={config.imageSize}
                  unit="px"
                  onChange={(imageSize) => patch({ imageSize })}
                />
                <AlertRow label={t("alerts.exit")} id="alert-exit">
                  <select
                    id="alert-exit"
                    className="alert-input"
                    value={config.exit}
                    onChange={(event) => patch({ exit: event.target.value as AlertConfig["exit"] })}
                  >
                    <option value="fade">{t("alerts.fade")} </option>
                    <option value="drop">{t("alerts.drop")} </option>
                    <option value="pop">{t("alerts.shrink")} </option>
                  </select>
                </AlertRow>
                <AlertSlider
                  label={t("alerts.delay")}
                  min={0}
                  max={10000}
                  step={100}
                  value={config.delayMs}
                  unit="ms"
                  onChange={(delayMs) => patch({ delayMs })}
                />

                <h2 className="alert-section-heading">{t("alerts.simulation")} </h2>
                {(
                  [
                    ["username", t("alerts.username")],
                    ["count", t("alerts.count")],
                    ["months", t("alerts.months")],
                    ["amount", t("alerts.amount")],
                    ["message", t("alerts.userMessage")],
                  ] as const
                ).map(([key, label]) => (
                  <AlertRow key={key} label={label} id={`simulation-${key}`}>
                    <input
                      key={key === "message" ? `simulation-message-${lang}` : key}
                      id={`simulation-${key}`}
                      className="alert-input"
                      type={key === "username" || key === "message" ? "text" : "number"}
                      defaultValue={
                        key === "message"
                          ? localizeAlertText(
                              lang,
                              data.simulation.message ?? "",
                              "alerts.simMessage",
                            )
                          : (data.simulation[key] ?? "")
                      }
                      onBlur={(event) => {
                        const value =
                          key === "username" || key === "message"
                            ? event.target.value
                            : Number(event.target.value);
                        void saveAlertStudio({ simulation: { ...data.simulation, [key]: value } })
                          .then((saved) => queryClient.setQueryData(alertStudioKey, saved))
                          .catch(reportError);
                      }}
                    />
                  </AlertRow>
                ))}
              </>
            )}
          </div>
          <footer className="alert-modal-footer">
            <button
              type="button"
              className="alert-button primary"
              onClick={() => setAdvanced(false)}
            >
              {t("alerts.done")}{" "}
            </button>
          </footer>
        </DialogContent>
      </Dialog>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent
          closeLabel={t("alerts.close")}
          className="alerts-studio alert-modal alert-preview-modal"
          dir={dir}
        >
          <header className="alert-modal-header">
            <DialogTitle>{t("alerts.preview")} </DialogTitle>
            <DialogDescription>
              {queue.length ? t("alerts.inQueue", { n: queue.length }) : t("alerts.previewEnded")} ·{" "}
              {connected ? t("alerts.obsConnected") : t("alerts.obsHint")}
            </DialogDescription>
          </header>
          <div className="alert-preview-stage">
            {current ? (
              <AlertStage
                key={current.id}
                ref={stageRef}
                mode="overlay"
                config={current.config}
                alertId={current.alertId}
                username={current.username}
                count={current.count}
                months={current.months}
                amount={current.amount}
                message={current.message}
                visualId={current.visualId}
                visualMime={current.visualMime}
                visualUrl={current.visualUrl}
                audioId={current.audioId}
              />
            ) : (
              <div className="alert-preview-empty">
                <Bell size={32} />
                <p>{t("alerts.ready")} </p>
              </div>
            )}
          </div>
          <footer className="alert-modal-footer">
            <button
              type="button"
              className="alert-button primary"
              disabled={busy}
              onClick={() => void test(kind)}
            >
              <Play size={16} />
              {t("alerts.test")} {alertName(definition.id)}
            </button>
            <a className="alert-button" href={link} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              {t("alerts.openObs")}{" "}
            </a>
          </footer>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
