import { useLiveChat, type ChatSources } from "@/hooks/useLiveChat";
import {
  emptyPredictionRuntime,
  parsePredictionRuntime,
  predictionCardVisible,
  preferNewer,
  type PredictionRuntime,
} from "@/lib/interactiveWidgets";
import { useLanguage } from "@/lib/i18n";

export function PredictionControlPanel({
  state,
  live = null,
  chat = null,
  kickConnected = false,
}: {
  state: unknown;
  live?: PredictionRuntime | null;
  chat?: ChatSources | null;
  kickConnected?: boolean;
}) {
  const { t, lang } = useLanguage();
  const { kickPrediction } = useLiveChat(chat, 1);
  const runtime =
    preferNewer(preferNewer(parsePredictionRuntime(state), live ?? null), kickPrediction) ??
    emptyPredictionRuntime();
  const visible = predictionCardVisible(runtime);
  const when = runtime.updatedAt
    ? new Date(runtime.updatedAt).toLocaleString(lang === "ar" ? "ar" : "en")
    : null;
  const status = !visible
    ? t("widget.prediction.idle")
    : runtime.status === "open"
      ? t("widget.prediction.open")
      : runtime.status === "locked"
        ? t("widget.prediction.locked")
        : t("widget.prediction.resolved");

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {t("widget.prediction.heading")}
      </p>
      <p className="text-xs text-muted-foreground">{t("widget.prediction.hint")}</p>
      <p className="text-sm font-medium">
        {kickConnected ? t("widget.prediction.connected") : t("widget.prediction.disconnected")}
      </p>
      <p className="text-sm text-muted-foreground">{status}</p>
      {runtime.title ? (
        <p className="text-sm" dir="auto">
          {runtime.title}
        </p>
      ) : null}
      {runtime.outcomes.length ? (
        <ul className="space-y-1 text-sm">
          {runtime.outcomes.map((outcome) => (
            <li key={outcome.id} className="flex items-center justify-between gap-3" dir="auto">
              <span>
                {outcome.label}
                {runtime.winnerId === outcome.id ? " ★" : ""}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {outcome.points} {t("widget.prediction.points")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {runtime.eventName ? (
        <p className="text-xs text-muted-foreground">
          {t("widget.prediction.lastEvent")}: {runtime.eventName}
          {when ? ` · ${when}` : ""}
        </p>
      ) : null}
    </div>
  );
}
