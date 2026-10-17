import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pause,
  Play,
  SkipForward,
  Trash2,
  ChevronDown,
  ChevronUp,
  RadioTower,
  Check,
} from "lucide-react";

import { useLanguage, type TranslationKey } from "@/lib/i18n";
import {
  ALERT_CATALOG,
  supportFor,
  type AlertEvent,
  type AlertKind,
  type AlertPlatform,
} from "@/lib/alertStudio";
import { PLATFORM_EVENT_TYPES, type AlertEventPlatform } from "@/lib/alertEvents.shared";

type ControlState = {
  paused: boolean;
  current: AlertEvent | null;
  pending: AlertEvent[];
  pendingCount: number;
};

type Props = {
  token: string;
};

const POLL_INTERVAL_MS = 1500;

export function AlertControl({ token }: Props) {
  const { dir, t } = useLanguage();
  const [state, setState] = useState<ControlState>({
    paused: false,
    current: null,
    pending: [],
    pendingCount: 0,
  });
  const [showQueue, setShowQueue] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<TranslationKey | "">("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const response = await fetch("/api/alerts/control", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as ControlState;
      if (!mounted.current) return;
      setState(payload);
    } catch {
      /* transient */
    }
  }, [token]);

  useEffect(() => {
    void fetchState();
    const id = window.setInterval(() => void fetchState(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [fetchState]);

  const callAction = useCallback(
    async (action: "pause" | "resume" | "skip" | "clear") => {
      try {
        if (action === "clear") {
          setConfirmClear(false);
        }
        const response = await fetch("/api/alerts/control", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!response.ok) return;
        const payload = (await response.json()) as ControlState;
        if (!mounted.current) return;
        setState(payload);
        if (action === "skip") {
          window.setTimeout(() => void fetchState(), 200);
        }
      } catch {
        /* transient */
      }
    },
    [fetchState, token],
  );

  const sendSimulated = useCallback(
    async (platform: AlertEventPlatform, type: string) => {
      setSendingId(`${platform}:${type}`);
      setNotice("");
      try {
        const response = await fetch("/api/alerts/simulate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform, type }),
        });
        if (!response.ok) return;
        setNotice("alerts.control.sent");
        window.setTimeout(() => void fetchState(), 400);
      } catch {
        /* transient */
      } finally {
        if (mounted.current) setSendingId(null);
      }
    },
    [fetchState],
  );

  const statusLabel = state.paused ? t("alerts.control.paused") : t("alerts.control.running");
  const statusClass = state.paused ? "alert-control-status paused" : "alert-control-status running";

  const currentText = useMemo(() => {
    if (!state.current) return t("alerts.control.nowEmpty");
    const definition = ALERT_CATALOG.find((item) => item.id === state.current!.alertId);
    const name = definition?.title ?? state.current.alertId;
    return `${t("alerts.control.now")}: ${name} — ${state.current.username}`;
  }, [state.current, t]);

  const pendingLabel = state.pendingCount
    ? t("alerts.control.pending", { n: state.pendingCount })
    : t("alerts.control.pendingNone");

  const capabilityLabel = (platform: AlertPlatform, alertId: AlertKind): string => {
    const definition = ALERT_CATALOG.find((item) => item.id === alertId);
    if (!definition) return t("alerts.control.unavailableType");
    const support = supportFor(definition, platform);
    switch (support.level) {
      case "webhook":
        return t("alerts.control.testOnly");
      case "partial":
      case "derived":
        return t("alerts.control.testOnly");
      default:
        return t("alerts.control.unavailableType");
    }
  };

  const canSkip = Boolean(state.current);
  const canClear = state.pendingCount > 0;

  return (
    <section className="alert-control" dir={dir} aria-label={t("alerts.control.heading")}>
      <div className="alert-control-header">
        <div className="alert-control-title-row">
          <strong>{t("alerts.control.heading")}</strong>
          <span className={statusClass} aria-live="polite">
            <RadioTower size={13} />
            {statusLabel}
          </span>
        </div>
        <p className="alert-control-note">{t("alerts.control.note")}</p>
        <p className="alert-control-note">{t("alerts.control.multiObs")}</p>
      </div>
      <div className="alert-control-row">
        <div className="alert-control-buttons" dir={dir}>
          <button
            type="button"
            className="alert-button"
            disabled={state.paused}
            onClick={() => callAction("pause")}
          >
            <Pause size={16} /> {t("alerts.control.pause")}
          </button>
          <button
            type="button"
            className="alert-button"
            disabled={!state.paused}
            onClick={() => callAction("resume")}
          >
            <Play size={16} /> {t("alerts.control.resume")}
          </button>
          <button
            type="button"
            className="alert-button"
            disabled={!canSkip}
            onClick={() => callAction("skip")}
            title={canSkip ? undefined : t("alerts.control.skipIdle")}
          >
            <SkipForward size={16} /> {t("alerts.control.skip")}
          </button>
          {!confirmClear ? (
            <button
              type="button"
              className="alert-button danger"
              disabled={!canClear}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 size={16} /> {t("alerts.control.clear")}
            </button>
          ) : (
            <div className="alert-control-confirm" dir={dir}>
              <span>{t("alerts.control.clearHint", { n: state.pendingCount })}</span>
              <button
                type="button"
                className="alert-button primary"
                onClick={() => callAction("clear")}
              >
                <Check size={16} /> {t("alerts.control.clearConfirm")}
              </button>
              <button type="button" className="alert-button" onClick={() => setConfirmClear(false)}>
                {t("alerts.cancel")}
              </button>
            </div>
          )}
        </div>
        <div className="alert-control-indicator" dir={dir}>
          <span className="alert-control-current">{currentText}</span>
          <span className="alert-control-pending">{pendingLabel}</span>
          <button
            type="button"
            className="alert-control-toggle"
            onClick={() => setShowQueue(!showQueue)}
            aria-expanded={showQueue}
          >
            {showQueue ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showQueue ? t("alerts.control.hideQueue") : t("alerts.control.showQueue")}
          </button>
        </div>
      </div>
      {showQueue ? (
        <div className="alert-control-panel" dir={dir}>
          <h4>{t("alerts.types")}</h4>
          {state.pending.length ? (
            <ul>
              {state.pending.map((event) => {
                const definition = ALERT_CATALOG.find((item) => item.id === event.alertId);
                const name = definition?.title ?? event.alertId;
                return (
                  <li key={event.id}>
                    <span className="alert-control-pending-item">
                      <strong>{name}</strong> · {event.username} · {event.platform}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="alert-control-empty">{t("alerts.control.emptyQueue")}</p>
          )}
        </div>
      ) : null}
      <div className="alert-control-row">
        <button
          type="button"
          className="alert-control-toggle"
          onClick={() => setShowEvents(!showEvents)}
          aria-expanded={showEvents}
        >
          {showEvents ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {t("alerts.control.eventsHeading")}
        </button>
      </div>
      {showEvents ? (
        <div className="alert-control-panel" dir={dir}>
          <p className="alert-control-note">{t("alerts.control.eventsNote")}</p>
          <p className="alert-control-note">{t("alerts.control.receiver")}</p>
          <p className="alert-control-note">{t("alerts.control.dedupe")}</p>
          <p className="alert-control-note">{t("alerts.control.kickRaid")}</p>
          {notice ? <p className="alert-control-notice">{t(notice)}</p> : null}
          {(["KICK", "TWITCH"] as const).map((platform) => (
            <div key={platform} className="alert-control-events">
              <strong>{platform === "KICK" ? "Kick" : "Twitch"}</strong>
              <ul>
                {PLATFORM_EVENT_TYPES[platform].map((entry) => {
                  const alertId = entry.alertId as AlertKind;
                  const cap = capabilityLabel(platform, alertId);
                  const busy = sendingId === `${platform}:${entry.type}`;
                  return (
                    <li key={entry.type}>
                      <span className="alert-control-event-row">
                        <span>
                          {entry.label} · <small>{cap}</small>
                        </span>
                        <button
                          type="button"
                          className="alert-button primary"
                          disabled={busy}
                          onClick={() => sendSimulated(platform, entry.type)}
                        >
                          {t("alerts.control.send")}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
