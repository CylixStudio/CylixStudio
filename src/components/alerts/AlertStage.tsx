import { useLanguage } from "@/lib/i18n";
import { useAlertMediaUrl } from "./useAlertMediaUrl";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import {
  ALERT_ACCENT,
  type AlertConfig,
  type AlertKind,
  renderAlertText,
  normalizeAlertMediaUrl,
  alertUrlIsVideo,
} from "@/lib/alertStudio";
import { localizeAlertText } from "@/lib/i18n.alerts";

export type AlertStageHandle = {
  play: () => void;
};

type Phase = "rest" | "wait" | "in" | "out" | "gone";

const ENTER_MS = 460;
const EXIT_MS = 360;

function mediaUrl(id: string | null): string | null {
  return id ? `/api/alerts/media/${id}` : null;
}

function AlertMessage({
  template,
  username,
  count,
  months,
  amount,
  message,
  secondary,
}: {
  template: string;
  username: string;
  count: number;
  months: number;
  amount?: number | undefined;
  message?: string | undefined;
  secondary: string;
}) {
  return template
    .split(/(\{username\}|\{name\}|\{count\}|\{months\}|\{amount\}|\{message\})/g)
    .map((part, index) => {
      if (/^\{(username|name|count|months|amount|message)\}$/.test(part))
        return (
          <span key={index} style={{ color: secondary }}>
            {renderAlertText(part, { username, count, months, amount, message })}
          </span>
        );
      return <span key={index}>{part}</span>;
    });
}

export const AlertStage = forwardRef<
  AlertStageHandle,
  {
    config: AlertConfig;
    alertId?: AlertKind;
    text?: string;
    username?: string;
    count?: number;
    months?: number;
    amount?: number | undefined;
    message?: string | undefined;
    visualId?: string | null;
    visualMime?: string | null;
    visualUrl?: string | undefined;
    audioId?: string | null;
    mode: "preview" | "overlay";
    compact?: boolean;
  }
>(function AlertStage(
  {
    config,
    alertId,
    text,
    username = "CreovixFan",
    count = 1,
    months = 1,
    amount,
    message,
    visualId = null,
    visualMime = null,
    visualUrl = "",
    audioId = null,
    mode,
    compact = false,
  },
  ref,
) {
  const { t, lang } = useLanguage();
  const [phase, setPhase] = useState<Phase>(mode === "preview" ? "rest" : "gone");
  const [visualFailed, setVisualFailed] = useState(false);
  const [textVisible, setTextVisible] = useState(mode === "preview");
  const timers = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const userMessage = config.hideUserMessage ? "" : (message ?? "");
  // Untouched default texts follow the UI language; custom texts stay untouched.
  const template = alertId
    ? localizeAlertText(lang, config.message, `alerts.msg.${alertId}`)
    : config.message;
  const localizedUserMessage = localizeAlertText(lang, userMessage, "alerts.simMessage");
  const rendered = renderAlertText(template, {
    username,
    count,
    months,
    amount,
    message: localizedUserMessage,
  });
  const shown = alertId ? rendered : (text ?? rendered);
  const remoteVisual = normalizeAlertMediaUrl(config.visualUrl || visualUrl, "visual");
  const visual =
    visualFailed || config.visualSource === "none"
      ? null
      : config.visualSource === "url"
        ? remoteVisual
        : mediaUrl(visualId);
  useEffect(() => setVisualFailed(false), [visualId, remoteVisual, config.visualSource]);
  const audioSrc =
    config.audioSource === "none"
      ? null
      : config.audioSource === "url"
        ? normalizeAlertMediaUrl(config.audioUrl, "audio")
        : mediaUrl(audioId);
  const video =
    config.visualSource === "url"
      ? alertUrlIsVideo(remoteVisual)
      : Boolean(visualMime?.startsWith("video/"));

  const clearTimers = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  const stopMedia = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
  };

  const speak = () => {
    if (config.tts !== "browser" || typeof window === "undefined" || !window.speechSynthesis)
      return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(shown);
    utterance.lang = /[\u0600-\u06ff]/.test(shown) ? "ar" : lang;
    utterance.volume = config.volume / 100;
    window.speechSynthesis.speak(utterance);
  };

  const armMedia = () => {
    stopMedia();
    if (audioSrc) {
      const element = audioRef.current ?? new Audio(audioSrc);
      element.src = audioSrc;
      element.volume = config.volume / 100;
      audioRef.current = element;
      void element
        .play()
        .then(() => {
          if (config.delayMs > 0) {
            element.pause();
            element.currentTime = 0;
          }
        })
        .catch(() => undefined);
    }
    const clip = videoRef.current;
    if (clip) {
      clip.currentTime = 0;
      clip.muted = Boolean(audioSrc);
      clip.volume = config.volume / 100;
      void clip
        .play()
        .then(() => {
          if (config.delayMs > 0) {
            clip.pause();
            clip.currentTime = 0;
          }
        })
        .catch(() => undefined);
    }
  };

  const resumeMedia = () => {
    void audioRef.current?.play().catch(() => undefined);
    void videoRef.current?.play().catch(() => undefined);
  };

  useImperativeHandle(ref, () => ({
    play() {
      clearTimers();
      armMedia();
      setPhase("wait");
      setTextVisible(false);
      const start = window.setTimeout(() => {
        setPhase("in");
        timers.current.push(
          window.setTimeout(() => {
            setTextVisible(true);
            speak();
          }, config.textStartMs ?? 0),
        );
        timers.current.push(
          window.setTimeout(() => setTextVisible(false), config.textEndMs ?? config.durationMs),
        );
        if (config.delayMs > 0) resumeMedia();
        const hold = Math.max(ENTER_MS, config.durationMs - EXIT_MS);
        timers.current.push(window.setTimeout(() => setPhase("out"), hold));
        timers.current.push(
          window.setTimeout(() => {
            stopMedia();
            setPhase(mode === "preview" ? "rest" : "gone");
            setTextVisible(mode === "preview");
          }, config.durationMs),
        );
      }, config.delayMs);
      timers.current.push(start);
    },
  }));

  useEffect(
    () => () => {
      clearTimers();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    },
    [],
  );

  const hidden = phase === "gone" || phase === "wait";
  const animation =
    phase === "in"
      ? `cylix-alert-in-${config.enter} ${ENTER_MS}ms ease both`
      : phase === "out"
        ? `cylix-alert-out-${config.exit} ${EXIT_MS}ms ease both`
        : undefined;
  const direction =
    config.layout === "stack"
      ? "flex-col"
      : config.layout === "media-end"
        ? "flex-row-reverse"
        : "flex-row";

  return (
    <div
      className={`flex w-full max-w-full items-center justify-center gap-4 ${direction}`}
      dir="auto"
      style={{
        animation,
        opacity: hidden ? 0 : 1,
        zoom: compact ? 0.58 : config.style === "compact" ? 0.8 : 1,
        display: config.layout === "overlap" ? "grid" : undefined,
      }}
      aria-hidden={hidden}
    >
      <style>{`
        @keyframes cylix-alert-in-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cylix-alert-in-rise { from { opacity: 0; transform: translateY(28px) } to { opacity: 1; transform: none } }
        @keyframes cylix-alert-in-pop { from { opacity: 0; transform: scale(.84) } to { opacity: 1; transform: none } }
        @keyframes cylix-alert-in-slide { from { opacity: 0; transform: translateX(40px) } to { opacity: 1; transform: none } }
        @keyframes cylix-alert-out-fade { to { opacity: 0 } }
        @keyframes cylix-alert-out-drop { to { opacity: 0; transform: translateY(22px) } }
        @keyframes cylix-alert-out-pop { to { opacity: 0; transform: scale(.9) } }
        @keyframes cylix-text-wiggle { 0%,100% { transform: rotate(-2deg) } 50% { transform: rotate(2deg) } }
        @keyframes cylix-text-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.06) } }
      `}</style>
      {config.layout === "text" ? null : visual ? (
        video ? (
          <video
            ref={videoRef}
            src={visual}
            muted={Boolean(audioSrc)}
            playsInline
            style={{
              width: config.imageSize,
              height: config.imageSize,
              gridArea: config.layout === "overlap" ? "1 / 1" : undefined,
              justifySelf: "center",
            }}
            className="rounded-2xl object-contain"
            onError={() => setVisualFailed(true)}
          />
        ) : (
          <img
            src={visual}
            alt=""
            onError={() => setVisualFailed(true)}
            style={{
              width: config.imageSize,
              height: config.imageSize,
              gridArea: config.layout === "overlap" ? "1 / 1" : undefined,
              justifySelf: "center",
            }}
            className="rounded-2xl object-contain"
          />
        )
      ) : mode === "preview" ? (
        <div
          style={{
            width: Math.min(config.imageSize, 128),
            height: Math.min(config.imageSize, 128),
            borderColor: `${ALERT_ACCENT}66`,
          }}
          className="grid place-items-center rounded-2xl border border-dashed text-xs text-white/45"
        >
          {t("alerts.noImage")}
        </div>
      ) : null}
      <p
        className="max-w-full break-words text-center font-semibold leading-tight"
        style={{
          fontFamily: config.fontFamily,
          gridArea: config.layout === "overlap" ? "1 / 1" : undefined,
          zIndex: 1,
          visibility: textVisible ? "visible" : "hidden",
          fontSize: config.fontSize,
          color: config.textColor,
          textShadow:
            config.textShadow > 0
              ? `0 2px ${Math.max(4, config.textShadow / 4)}px rgba(0,0,0,.85)`
              : "none",
        }}
      >
        <span
          className="inline-block"
          style={{ transform: `translate(${config.offsetX ?? 0}px, ${config.offsetY ?? 0}px)` }}
        >
          <span
            className="inline-block"
            style={{
              animation:
                config.textMotion === "wiggle"
                  ? "cylix-text-wiggle 700ms ease-in-out infinite"
                  : config.textMotion === "pulse"
                    ? "cylix-text-pulse 900ms ease-in-out infinite"
                    : undefined,
            }}
          >
            <AlertMessage
              template={template}
              username={username}
              count={count}
              months={months}
              amount={amount}
              message={localizedUserMessage}
              secondary={config.secondaryColor || config.textColor}
            />
          </span>
        </span>
      </p>
    </div>
  );
});
