import { useLiveChat, type ChatSources } from "@/hooks/useLiveChat";
import {
  emptyPollRuntime,
  parsePollRuntime,
  pollCardVisible,
  preferNewer,
  type PollRuntime,
} from "@/lib/interactiveWidgets";
import { useLanguage } from "@/lib/i18n";

export function PollControlPanel({
  state,
  live = null,
  chat = null,
  kickConnected = false,
}: {
  state: unknown;
  live?: PollRuntime | null;
  chat?: ChatSources | null;
  kickConnected?: boolean;
}) {
  const { t, lang } = useLanguage();
  const { kickPoll } = useLiveChat(chat, 1);
  const runtime = preferNewer(preferNewer(parsePollRuntime(state), live ?? null), kickPoll) ?? emptyPollRuntime();
  const visible = pollCardVisible(runtime);
  const when = runtime.updatedAt
    ? new Date(runtime.updatedAt).toLocaleString(lang === "ar" ? "ar" : "en")
    : null;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {t("widget.poll.heading")}
      </p>
      <p className="text-xs text-muted-foreground">{t("widget.poll.hint")}</p>
      <p className="text-sm font-medium">
        {kickConnected ? t("widget.poll.connected") : t("widget.poll.disconnected")}
      </p>
      <p className="text-sm text-muted-foreground">{visible ? (runtime.status === "open" ? t("widget.poll.live") : t("widget.poll.ended")) : t("widget.poll.idle")}</p>
      {runtime.title ? (
        <p className="text-sm" dir="auto">
          <span className="text-muted-foreground">{t("widget.poll.title")}: </span>
          {runtime.title}
        </p>
      ) : null}
      {runtime.options.length ? (
        <ul className="space-y-1 text-sm">
          {runtime.options.map((option, index) => (
            <li key={option.id} className="flex items-center justify-between gap-3" dir="auto">
              <span>
                {index + 1}. {option.label}
              </span>
              <span className="tabular-nums text-muted-foreground">{option.votes}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {runtime.eventName ? (
        <p className="text-xs text-muted-foreground">
          {t("widget.poll.lastEvent")}: {runtime.eventName}
          {when ? ` · ${when}` : ""}
        </p>
      ) : null}
    </div>
  );
}
