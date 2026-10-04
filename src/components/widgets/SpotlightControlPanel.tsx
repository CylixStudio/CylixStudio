import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eraser, Pin } from "lucide-react";

import { PlatformIcon } from "@/components/widgets/PlatformIcon";
import { badgeAssetUrl } from "@/hooks/useKickBadges";
import { useLiveChat, type ChatMessage, type ChatSources } from "@/hooks/useLiveChat";
import { useReplyAlertExpiry } from "@/hooks/useReplyAlertExpiry";
import { ReplyAlertFrame } from "@/components/overlay/ReplyAlertFrame";
import { clearSpotlightMessage, pinSpotlightMessage } from "@/lib/spotlight.functions";
import { SPOTLIGHT_AUTO_HIDE, type SpotlightMessage } from "@/lib/widgets";
import { DarkSelect } from "@/components/ui/dark-select";

/**
 * Mod control panel for the Chat Spotlight overlay: a live chat feed where
 * every message can be pinned to (or cleared from) the OBS browser source.
 */
export function SpotlightControlPanel({
  widgetId,
  chat,
  testMessages,
  pinned,
  autoHideMs,
  onAutoHideChange,
  lang,
}: {
  widgetId: string;
  chat: ChatSources | null;
  testMessages: ChatMessage[];
  pinned: SpotlightMessage | null;
  autoHideMs: number;
  onAutoHideChange: (next: number) => void;
  lang: "ar" | "en";
}) {
  const pin = useServerFn(pinSpotlightMessage);
  const clear = useServerFn(clearSpotlightMessage);
  const { messages } = useLiveChat(chat, 25);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const feed = [...testMessages, ...messages]
    .filter((message) => message.text.trim().length > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);
  const liveFeed = useReplyAlertExpiry(feed, {
    getId: (message) => message.id,
    isReply: (message) => message.isReply === true,
    appearanceMs: (message) => message.at,
  });

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const pinMessage = (message: ChatMessage) =>
    void run(message.id, () =>
      pin({
        data: {
          widgetId,
          platform: message.platform,
          author: message.author,
          color: message.color,
          text: message.text,
          badges: message.badges,
          badgeImages: (message.badgeList ?? []).map((badge) => ({
            label: badge.text ?? badge.type,
            imageUrl: badge.imageUrl ?? badgeAssetUrl(badge as unknown as Record<string, unknown>),
          })),
          isReply: message.isReply === true,
          replyQuote: message.replyQuote ?? null,
          appearedAt: new Date(message.at).toISOString(),
        },
      }),
    );

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Pin className="size-4 text-primary" aria-hidden />
        {"Pin / highlight control"}
      </p>

      <label className="block">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {"Auto-hide timer"}
        </span>
        <DarkSelect
          className="mt-2"
          value={String(autoHideMs)}
          onValueChange={(next) => onAutoHideChange(Number(next))}
          options={SPOTLIGHT_AUTO_HIDE.map((entry) => ({
            value: String(entry.value),
            label: entry.label,
          }))}
        />
      </label>

      {pinned ? (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
          <p className="font-semibold text-primary">
            {"Currently pinned"}: <span dir="auto">{pinned.author}</span>
          </p>
          <p className="mt-1 line-clamp-2 text-muted-foreground" dir="auto">{pinned.text}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {"No message is pinned right now."}
        </p>
      )}

      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void run("clear", () => clear({ data: { widgetId } }))}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
      >
        <Eraser className="size-4" aria-hidden />
        {"Clear / unpin"}
      </button>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder={"Pin a message manually…"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            dir="auto"
          />
          <button
            type="button"
            disabled={busy !== null || manual.trim().length === 0}
            onClick={() => {
              const text = manual.trim();
              setManual("");
              void run("manual", () =>
                pin({ data: { widgetId, text, author: "Streamer", platform: "TWITCH" } }),
              );
            }}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {"Pin"}
          </button>
        </div>

        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {"Live chat feed"}
        </p>

        {liveFeed.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {"Waiting for Twitch / Kick chat messages…"}
          </p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto pe-1">
            {liveFeed.items.map((message) => (
              <li
                key={message.id}
                className="rounded-lg border border-border/70 px-2.5 py-2 text-xs"
              >
                <ReplyAlertFrame
                  active={message.isReply === true}
                  fading={liveFeed.fadingIds.has(message.id)}
                  quote={message.replyQuote}
                >
                  <div className="flex items-start gap-2">
                    <PlatformIcon platform={message.platform} size={14} />
                    <span className="min-w-0 flex-1">
                      <span
                        className="font-semibold"
                        style={{ color: message.color ?? undefined }}
                        dir="auto"
                      >
                        {message.author}
                      </span>
                      <span className="ms-1 break-words text-muted-foreground" dir="auto">
                        {message.text}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => pinMessage(message)}
                      aria-label={"Pin message"}
                      className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                    >
                      <Pin className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </ReplyAlertFrame>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
