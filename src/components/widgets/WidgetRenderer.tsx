import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

import { OverlayView } from "@/components/overlay/OverlayView";
import { ReplyAlertFrame } from "@/components/overlay/ReplyAlertFrame";
import { PlatformIcon, normalizePlatform } from "@/components/widgets/PlatformIcon";
import { RoleBadgeIcon, resolveBadgeRoles } from "@/components/widgets/RoleBadgeIcon";
import { StreamEventsScheduleView } from "@/components/widgets/StreamEventsScheduleCard";

import { useKickBadges, kickGlobalBadgeUrl, type KickBadge } from "@/hooks/useKickBadges";
import { TWITCH_BADGE_SET, useTwitchBadges } from "@/hooks/useTwitchBadges";
import { useLiveChat, type ChatMessage, type ChatSources } from "@/hooks/useLiveChat";
import { useReplyAlertExpiry } from "@/hooks/useReplyAlertExpiry";
import { useLanguage } from "@/lib/i18n";
import { parseOverlayTheme, withAlpha } from "@/lib/overlayTheme";
import { parseWidgetThemeId, widgetThemeSkin } from "@/lib/widgetThemes";
import type { StreamEventsRuntime } from "@/lib/streamEventsSchedule";
import { formatDuration, type TimerFrame } from "@/lib/timer";
import {
  describeEvent,
  parseAlertConfig,
  parseChatConfig,
  parseGoalConfig,
  parseEmoteRainConfig,
  parseSpinConfig,
  parseSpotlightConfig,
  parseTappersConfig,
  parseTapGoalConfig,
  type ChatLayout,
  type GoalSnapshot,
  type OverlayEvent,
  type SpinState,
  type SpotlightMessage,
  type TapperEntry,
  type WidgetType,
} from "@/lib/widgets";

/* ------------------------------- Goal bar ------------------------------- */

export function GoalBarView({
  config,
  goal,
}: {
  config: unknown;
  goal: GoalSnapshot | null;
}) {
  const style = parseGoalConfig(config);
  const skin = widgetThemeSkin(parseWidgetThemeId(config));
  const current = goal?.current ?? 0;
  const target = goal?.target && goal.target > 0 ? goal.target : 100;
  const percent = Math.min(100, Math.max(0, (current / target) * 100));
  const unit = goal?.unit ?? "";

  return (
    <div
      className="flex min-w-[420px] flex-col gap-3 rounded-2xl px-8 py-6"
      style={{
        boxSizing: "border-box",
        background: withAlpha(
          style.backgroundColor,
          skin.backgroundOpacity ?? style.backgroundOpacity,
        ),
        fontFamily: skin.fontFamily ?? style.fontFamily,
        color: style.textColor,
        ...skin.surface,
        ...skin.text,
      }}
    >
      <div className="flex items-baseline justify-between gap-6">
        <span
          style={{
            fontSize: `${Math.max(11, Math.round(style.fontSize * 0.35))}px`,
            letterSpacing: "0.3em",
            fontWeight: 700,
            color: style.accentColor,
          }}
        >
          {goal?.title ?? style.label}
        </span>
        {style.showPercent ? (
          <span
            style={{
              fontSize: `${Math.max(11, Math.round(style.fontSize * 0.35))}px`,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {percent.toFixed(0)}%
          </span>
        ) : null}
      </div>

      <span
        style={{
          fontSize: `${style.fontSize}px`,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.05,
        }}
      >
        <span dir="ltr">
          {current.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </span>
        <span style={{ opacity: 0.55 }}>
          {" / "}
          <span dir="ltr">
            {target.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </span>
          {" "}
          {unit}
        </span>
      </span>

      <div
        className="h-4 w-full overflow-hidden rounded-full"
        style={{ background: withAlpha(style.textColor, 15) }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${percent}%`,
            background: `linear-gradient(90deg, ${style.accentColor}, ${withAlpha(style.accentColor, 55)})`,
            boxShadow: `0 0 18px ${withAlpha(style.accentColor, 60)}`,
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------ Alert box ------------------------------- */

export function AlertBoxView({
  config,
  events,
  demo = false,
}: {
  config: unknown;
  events: OverlayEvent[];
  /** Dashboard preview: keep the card visible instead of auto-hiding. */
  demo?: boolean;
}) {
  const { t } = useLanguage();
  const style = parseAlertConfig(config);
  const skin = widgetThemeSkin(parseWidgetThemeId(config));
  const expiry = useReplyAlertExpiry(events, {
    enabled: !demo,
    getId: (event) => event.id,
    isReply: (event) => event.isReply === true,
    appearanceMs: (event) => {
      const parsed = Date.parse(event.appearedAt ?? event.createdAt);
      return Number.isFinite(parsed) ? parsed : null;
    },
  });
  const head = events[0] ?? null;
  const headHidden = Boolean(head?.isReply && !expiry.items.some((event) => event.id === head.id));
  const latest = headHidden ? null : head;
  const replyFading = Boolean(latest?.isReply && expiry.fadingIds.has(latest.id));
  const [visible, setVisible] = useState(demo);
  const seen = useRef<string | null>(null);
  const latestRef = useRef(latest);
  latestRef.current = latest;

  useEffect(() => {
    if (!latestRef.current) setVisible(false);
  }, [latest?.id]);

  useEffect(() => {
    if (demo) return;
    const current = latestRef.current;
    if (!current) return;
    if (seen.current === null) {
      // First frame after connecting: don't replay history into the scene.
      seen.current = current.id;
      return;
    }
    if (seen.current === current.id) return;
    seen.current = current.id;
    setVisible(true);
    if (style.soundUrl) {
      const audio = new Audio(style.soundUrl);
      audio.volume = 1;
      void audio.play().catch(() => {
        /* autoplay can be blocked until the browser source has been clicked */
      });
    }
    if (current.isReply) return;
    const timeout = setTimeout(() => setVisible(false), style.holdMs);
    return () => clearTimeout(timeout);
  }, [latest?.id, latest?.isReply, style.holdMs, style.soundUrl, demo]);

  if (!latest || !visible) return <div className="h-0 w-0" aria-hidden />;

  return (
    <ReplyAlertFrame active={latest.isReply === true} fading={replyFading} quote={latest.replyQuote}>
    <div
      className="overlay-anim-bounce flex min-w-[380px] flex-col items-center gap-2 rounded-2xl px-10 py-7 text-center"
      style={{
        boxSizing: "border-box",
        background: withAlpha(
          style.backgroundColor,
          skin.backgroundOpacity ?? style.backgroundOpacity,
        ),
        border: `2px solid ${skin.accentColor ?? style.accentColor}`,
        boxShadow: `0 0 40px ${withAlpha(skin.accentColor ?? style.accentColor, 45)}`,
        fontFamily: skin.fontFamily ?? style.fontFamily,
        color: style.textColor,
        ...skin.surface,
        ...skin.text,
      }}
    >
      <span
        style={{
          fontSize: `${Math.max(11, Math.round(style.fontSize * 0.35))}px`,
          letterSpacing: "0.3em",
          fontWeight: 700,
          color: style.accentColor,
        }}
      >
        {latest.isTest ? `${t("activity.testEvent")} · ` : ""}
        {latest.platform}
      </span>
      <span style={{ fontSize: `${style.fontSize}px`, fontWeight: 700, lineHeight: 1.15 }}>
        {describeEvent(latest)}
      </span>
      {style.showAmount && latest.secondsAdded > 0 ? (
        <span
          style={{
            fontSize: `${Math.max(14, Math.round(style.fontSize * 0.5))}px`,
            fontWeight: 700,
            color: style.accentColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          +{formatDuration(latest.secondsAdded)}
        </span>
      ) : null}
    </div>
    </ReplyAlertFrame>
  );
}

/* ------------------------------- Chat box ------------------------------- */

/** Badge artwork that removes itself instead of showing a broken-image icon. */
function BadgeImg({
  src,
  label,
  pixelated,
  size = 18,
  marginRight = 0,
  fallback = null,
}: {
  src: string;
  label: string;
  pixelated?: boolean;
  size?: number;
  marginRight?: number;
  /** Rendered when the CDN asset fails, so the role is never silently dropped. */
  fallback?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={label}
      title={label}
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        ...(pixelated ? { imageRendering: "pixelated" as const } : null),
        flexShrink: 0,
        display: "inline-block",
        verticalAlign: "middle",
        marginInlineEnd: marginRight,
      }}
    />
  );
}


/** Kick emote artwork; falls back to the emote name when the CDN 404s. */
function EmoteImg({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{name}</>;
  return (
    <img
      src={`https://files.kick.com/emotes/${id}/fullsize`}
      alt={name}
      title={name}
      onError={() => setFailed(true)}
      style={{
        height: 28,
        width: "auto",
        display: "inline-block",
        verticalAlign: "middle",
        margin: "0 4px",
      }}
    />
  );
}

const KICK_EMOTE_RE = /\[emote:(\d+):([\w-]+)\]/g;

/** Turns Kick's `[emote:ID:NAME]` syntax into inline emote images. */
function renderChatText(text: string): React.ReactNode {
  if (!text.includes("[emote:")) return text;
  const parts: React.ReactNode[] = [];
  let last = 0;
  KICK_EMOTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = KICK_EMOTE_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<EmoteImg key={`${match[1]}-${match.index}`} id={match[1]!} name={match[2]!} />);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * Platform-logo style marks (Kick/Twitch/TikTok/YouTube icons) must disappear
 * completely when the creator turns "Show platform badge" off.
 */
const PLATFORM_MARKS = ["kick", "twitch", "tiktok", "youtube", "platform"];
function isPlatformMark(type: string | null | undefined): boolean {
  const key = String(type ?? "").trim().toLowerCase();
  return PLATFORM_MARKS.some((mark) => key === mark || key === `${mark}_logo`);
}


/**
 * Chat Box renders viewer text messages ONLY. Stream activity (follows, subs,
 * cheers, raids, gifts) is deliberately never rendered here — those payloads
 * belong to the timer/goal logic, not to the chat feed.
 */
export function ChatBoxView({
  config,
  chat = null,
  testMessages = [],
}: {
  config: unknown;
  /** Public chat coordinates (Twitch login / Kick chatroom id). */
  chat?: ChatSources | null;
  /** Chat lines pushed by the dashboard test-event control. */
  testMessages?: ChatMessage[];
}) {
  const style = parseChatConfig(config);
  const skin = widgetThemeSkin(parseWidgetThemeId(config));
  const accent = skin.accentColor ?? style.accentColor;
  const { messages } = useLiveChat(chat ?? null, style.maxMessages);
  // Official Twitch badge artwork (public endpoint); vector marks stay as fallback.
  const twitchBadgeUrls = useTwitchBadges(style.showBadges);
  // Channel-aware Kick badge resolver (custom subscriber tiers + payload art).
  const resolveKickBadge = useKickBadges(chat?.kickSlug ?? null, style.showBadges);
  const layout = style.chatLayout;

  // Live viewer messages only. Anything without visible text (system/event
  // payloads) is filtered out before rendering.
  const chatFeed = [
    ...(Array.isArray(testMessages) ? testMessages : []),
    ...(Array.isArray(messages) ? messages : []),
  ]
    .filter((message) => message.text.trim().length > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, style.maxMessages);
  const chatExpiry = useReplyAlertExpiry(chatFeed, {
    getId: (message) => message.id,
    isReply: (message) => message.isReply === true,
    appearanceMs: (message) => message.at,
  });
  const visibleChat = chatExpiry.items;

  const containerClass =
    layout === "glass"
      ? "flex w-full min-w-[380px] max-w-[520px] flex-col overflow-hidden rounded-xl bg-slate-900/70 p-5 backdrop-blur-lg border border-white/10 shadow-2xl"
      : "flex w-full min-w-[380px] max-w-[520px] flex-col items-start overflow-visible rounded-2xl bg-transparent p-0";

  const rowClassForLayout = (messageLayout: ChatLayout) => {
    const base = "overlay-anim-fade items-baseline";
    switch (messageLayout) {
      case "bubble":
        return `${base} flex w-full flex-wrap gap-1.5 rounded-2xl rounded-ss-sm bg-slate-800/90 p-3 border border-slate-700/50 mb-2`;
      case "transparent":
        return `${base} flex w-full flex-wrap gap-1.5 bg-transparent border-0 p-0`;
      case "glass":
      default:
        return `${base} flex w-full flex-wrap gap-1.5 bg-transparent border-0 p-0`;
    }
  };

  const textStyle: React.CSSProperties = {
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    whiteSpace: "normal",
    minWidth: 0,
    ...skin.text,
  };

  const transparentTextStyle: React.CSSProperties =
    layout === "transparent"
      ? {
          textShadow: "0 2px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)",
        }
      : {};

  const islandCapsuleStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    alignSelf: "flex-start",
    width: "fit-content",
    maxWidth: "90%",
    padding: "8px 18px",
    borderRadius: 24,
    background: "rgba(15, 15, 26, 0.85)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(168, 85, 247, 0.3)",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
    marginBottom: 8,
  };

  const islandNameStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginInlineEnd: 6,
    flexShrink: 0,
  };

  const islandTextStyle: React.CSSProperties = {
    display: "inline",
    color: "#ffffff",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    whiteSpace: "normal",
    minWidth: 0,
  };

  const renderMessage = (message: ChatMessage) => {
    const nameBlock = (
      <span dir="auto" style={{ color: message.color ?? accent, fontWeight: 700, whiteSpace: "nowrap", ...skin.text }}>
        {message.author}
      </span>
    );

    const platformBlock = style.showPlatform ? (
      normalizePlatform(message.platform) ? (
        <PlatformIcon platform={message.platform} size={18} />
      ) : (
        <span
          style={{
            color: accent,
            fontWeight: 700,
            fontSize: `${Math.max(10, Math.round(style.fontSize * 0.6))}px`,
            letterSpacing: "0.12em",
            ...skin.text,
          }}
        >
          {message.platform}
        </span>
      )
    ) : null;

    const isKick = normalizePlatform(message.platform) === "KICK";
    const kickBadges = (
      isKick
        ? (message.badgeList ?? []).length > 0
          ? (message.badgeList ?? [])
          : message.badges.map((type) => ({ type }) as KickBadge)
        : []
    ).filter((badge) => style.showPlatform || !isPlatformMark(badge.type));


    // Kick: always the original CDN artwork — payload URL first, never a drawn shape.
    const badgeNodes: React.ReactNode[] = !style.showBadges
      ? []
      : isKick
        ? kickBadges.map((badge, index) => {
            const url =
              badge.imageUrl ?? resolveKickBadge(badge) ?? kickGlobalBadgeUrl(badge.type);
            if (!url) return null;
            const label = badge.text || badge.type;
            return (
              <BadgeImg
                key={`${badge.type}-${index}`}
                src={url}
                label={label}
                pixelated
                size={22}
                marginRight={5}
              />
            );
          })
        : resolveBadgeRoles(
            message.badges.filter((role) => style.showPlatform || !isPlatformMark(role)),
            3,
          ).map((role) => (

            <RoleBadgeIcon
              key={role}
              role={role}
              platform={message.platform}
              size={22}
              style={{ marginInlineEnd: 5 }}
              imageUrl={
                normalizePlatform(message.platform) === "TWITCH"
                  ? (twitchBadgeUrls[TWITCH_BADGE_SET[role] ?? role] ?? null)
                  : null
              }
            />
          ));

    const badgesBlock =
      badgeNodes.filter(Boolean).length > 0 ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0,
            flexShrink: 0,
            verticalAlign: "middle",
          }}
        >
          {badgeNodes}
        </span>
      ) : null;



    const replyWrap = (node: React.ReactNode) => (
      <ReplyAlertFrame
        key={message.id}
        active={message.isReply === true}
        fading={chatExpiry.fadingIds.has(message.id)}
        quote={message.replyQuote}
      >
        {node}
      </ReplyAlertFrame>
    );

    if (layout === "island") {
      return replyWrap(
        <div className="overlay-anim-fade" style={islandCapsuleStyle}>
          <span style={{ display: "inline", minWidth: 0 }}>
            <span style={islandNameStyle}>
              {platformBlock}
              {badgesBlock}
              {nameBlock}
              <span style={{ color: style.textColor, opacity: 0.7, ...skin.text }}>:</span>
            </span>
            <span dir="auto" style={islandTextStyle}>{renderChatText(message.text)}</span>
          </span>
        </div>,
      );
    }

    return replyWrap(
      <div className={rowClassForLayout(layout)}>
        <span
          className={`message-line block w-full ${layout === "transparent" ? "px-2 py-1" : ""}`}
        >
          <span className="inline-flex max-w-full items-center gap-1" style={{ flexShrink: 0 }}>
            {platformBlock}
            {badgesBlock}
            {nameBlock}
            <span style={{ color: style.textColor, opacity: 0.7, ...skin.text }}>:</span>
          </span>
          <span className="ms-1.5" dir="auto" style={{ ...textStyle, ...transparentTextStyle }}>
            {renderChatText(message.text)}
          </span>
        </span>
      </div>,
    );
  };

  return (
    <div
      className={containerClass}
      style={{
        boxSizing: "border-box",
        gap: layout === "island" ? "0px" : layout === "glass" ? "12px" : `${style.messageGap}px`,
        fontFamily: skin.fontFamily ?? style.fontFamily,
        color: style.textColor,
        fontSize: `${style.fontSize}px`,
      }}
    >
      {visibleChat.length > 0 ? visibleChat.map((message) => renderMessage(message)) : null}

      {visibleChat.length === 0 ? <span style={{ opacity: 0.6 }}>Waiting for chat…</span> : null}
    </div>
  );
}

/* ------------------------------ Spin wheel ------------------------------ */

export function SpinWheelView({ config, spin }: { config: unknown; spin: SpinState | null }) {
  const style = parseSpinConfig(config);
  const entries = style.entries;
  const slice = 360 / entries.length;

  const targetIndex = useMemo(() => {
    if (!spin?.result) return 0;
    const index = entries.indexOf(spin.result);
    return index >= 0 ? index : 0;
  }, [spin?.result, entries]);

  const [rotation, setRotation] = useState(0);
  const lastNonce = useRef<number | null>(null);

  useEffect(() => {
    const nonce = spin?.nonce ?? 0;
    if (lastNonce.current === null) {
      lastNonce.current = nonce;
      setRotation(-(targetIndex * slice + slice / 2));
      return;
    }
    if (nonce === lastNonce.current) return;
    lastNonce.current = nonce;
    // Five full turns, then land on the winning slice.
    setRotation((current) => current - (360 * 5 + ((current % 360) + targetIndex * slice + slice / 2)));
  }, [spin?.nonce, targetIndex, slice]);

  const gradient = `conic-gradient(${entries
    .map((_, index) => {
      const color =
        index % 2 === 0 ? style.accentColor : withAlpha(style.backgroundColor, 100);
      return `${color} ${index * slice}deg ${(index + 1) * slice}deg`;
    })
    .join(", ")})`;

  return (
    <div
      className="flex flex-col items-center gap-4"
      style={{ fontFamily: style.fontFamily, color: style.textColor }}
    >
      <span
        style={{
          fontSize: `${Math.max(12, Math.round(style.fontSize * 0.5))}px`,
          letterSpacing: "0.3em",
          fontWeight: 700,
          color: style.accentColor,
        }}
      >
        {style.title}
      </span>

      <div className="relative grid place-items-center">
        <div
          aria-hidden
          className="absolute -top-2 z-10 size-0"
          style={{
            borderLeft: "10px solid transparent",
            borderRight: "10px solid transparent",
            borderTop: `18px solid ${style.textColor}`,
          }}
        />
        <div
          className="size-[300px] rounded-full transition-transform duration-[4000ms] ease-out"
          style={{
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            boxShadow: `0 0 40px ${withAlpha(style.accentColor, 45)}`,
          }}
        />
        <div
          className="absolute grid size-[150px] place-items-center rounded-full px-3 text-center"
          style={{
            background: withAlpha(style.backgroundColor, Math.max(style.backgroundOpacity, 85)),
            border: `2px solid ${style.accentColor}`,
            fontSize: `${Math.max(14, Math.round(style.fontSize * 0.55))}px`,
            fontWeight: 700,
          }}
        >
          {spin?.result ?? "—"}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Emote rain ------------------------------ */

type Drop = { key: string; emote: string; left: number; delay: number; duration: number; spin: number };

export function EmoteRainView({
  config,
  events,
  demo = false,
}: {
  config: unknown;
  events: OverlayEvent[];
  demo?: boolean;
}) {
  const style = parseEmoteRainConfig(config);
  const [drops, setDrops] = useState<Drop[]>([]);
  const seen = useRef<string | null>(null);
  const counter = useRef(0);

  const spawn = useMemo(
    () => (emotes: string[], burst: number, fallMs: number) => {
      const batch: Drop[] = Array.from({ length: burst }, () => {
        counter.current += 1;
        return {
          key: `${Date.now()}-${counter.current}`,
          emote: emotes[Math.floor(Math.random() * emotes.length)] ?? "🎉",
          left: Math.random() * 92,
          delay: Math.random() * 900,
          duration: fallMs * (0.75 + Math.random() * 0.5),
          spin: Math.round((Math.random() - 0.5) * 720),
        };
      });
      setDrops((prev) => [...prev.slice(-120), ...batch]);
      const maxLife = fallMs * 1.3 + 1000;
      setTimeout(() => {
        const keys = new Set(batch.map((drop) => drop.key));
        setDrops((prev) => prev.filter((drop) => !keys.has(drop.key)));
      }, maxLife);
    },
    [],
  );

  // Dashboard preview: keep a gentle loop so the creator sees the effect.
  useEffect(() => {
    if (!demo) return;
    spawn(style.emotes, Math.min(style.burst, 10), style.fallMs);
    const interval = setInterval(
      () => spawn(style.emotes, Math.min(style.burst, 10), style.fallMs),
      style.fallMs,
    );
    return () => clearInterval(interval);
  }, [demo, spawn, style.fallMs, style.burst, style.emotes.join("|")]);

  useEffect(() => {
    if (demo) return;
    const latest = events[0];
    if (!latest) return;
    if (seen.current === null) {
      // Don't replay history when OBS reconnects.
      seen.current = latest.id;
      return;
    }
    if (seen.current === latest.id) return;
    seen.current = latest.id;
    spawn(style.emotes, style.burst, style.fallMs);
  }, [events, demo, spawn, style.burst, style.fallMs, style.emotes]);

  return (
    <div className="pointer-events-none relative h-full min-h-[320px] w-full overflow-hidden">
      {drops.map((drop) => (
        <span
          key={drop.key}
          className="overlay-emote absolute top-0 select-none"
          style={
            {
              left: `${drop.left}%`,
              fontSize: `${style.emoteSize}px`,
              lineHeight: 1,
              animationDelay: `${drop.delay}ms`,
              "--emote-duration": `${drop.duration}ms`,
              "--emote-spin": `${drop.spin}deg`,
            } as React.CSSProperties
          }
        >
          {drop.emote}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------- Chat spotlight ---------------------------- */

/**
 * Featured chat message card. The pinned message lives on the widget row, so
 * an OBS browser-source refresh keeps rendering it until the creator clears
 * it (or the optional auto-hide timer elapses).
 */
const SPOTLIGHT_FADE_MS = 500;

function spotlightKey(message: SpotlightMessage | null) {
  return message ? `${message.id}:${message.nonce}` : "";
}

export function ChatSpotlightView({
  config,
  spotlight,
  chat = null,
  demo = false,
}: {
  config: unknown;
  spotlight: SpotlightMessage | null;
  chat?: ChatSources | null;
  demo?: boolean;
}) {
  // Native pins made straight in Kick/Twitch chat light up the overlay too.
  const { pinnedLive } = useLiveChat(chat, 1);
  const style = parseSpotlightConfig(config);
  const skin = widgetThemeSkin(parseWidgetThemeId(config));
  const accent = skin.accentColor ?? style.accentColor;
  const [dismissedKey, setDismissedKey] = useState("");
  const [display, setDisplay] = useState<SpotlightMessage | null>(null);
  const [motion, setMotion] = useState<"shown" | "exit" | "enter">("enter");
  const shownKeyRef = useRef("");

  const livePin: SpotlightMessage | null = pinnedLive
    ? {
        id: pinnedLive.id,
        platform: pinnedLive.platform,
        author: pinnedLive.author,
        color: pinnedLive.color ?? null,
        text: pinnedLive.text,
        badges: pinnedLive.badges,
        badgeImages: (pinnedLive.badgeList ?? []).map((badge) => ({
          label: badge.text || badge.type,
          imageUrl: badge.imageUrl ?? null,
        })),
        pinnedAt: new Date(pinnedLive.at).toISOString(),
        nonce: pinnedLive.at,
        isReply: pinnedLive.isReply === true,
        replyQuote: pinnedLive.replyQuote ?? null,
        appearedAt: new Date(pinnedLive.at).toISOString(),
      }
    : null;

  const incoming: SpotlightMessage | null =
    (livePin && (!spotlight || Date.parse(spotlight.pinnedAt) < pinnedLive!.at)
      ? livePin
      : spotlight) ??
    (demo
      ? {
          id: "demo",
          platform: "TWITCH",
          author: "CylixFan",
          color: "#A78BFA",
          text: "This message is featured on stream ✨",
          badges: ["broadcaster", "subscriber"],
          badgeImages: [],
          pinnedAt: new Date().toISOString(),
          nonce: 0,
        }
      : null);

  const incomingKey = spotlightKey(incoming);
  const pinned = incoming && incomingKey !== dismissedKey ? incoming : null;
  const replyLife = useReplyAlertExpiry(pinned ? [pinned] : [], {
    enabled: !demo,
    getId: (message) => message.id,
    isReply: (message) => message.isReply === true,
    appearanceMs: (message) => {
      const parsed = Date.parse(message.appearedAt ?? message.pinnedAt);
      return Number.isFinite(parsed) ? parsed : null;
    },
  });
  const visiblePin = replyLife.items[0] ?? null;
  const pinKey = spotlightKey(visiblePin);
  const replyFading = Boolean(visiblePin?.isReply && replyLife.fadingIds.has(visiblePin.id));

  useEffect(() => {
    if (pinKey === shownKeyRef.current) return;
    const hadCard = Boolean(shownKeyRef.current);
    if (hadCard) setMotion("exit");
    const wait = window.setTimeout(
      () => {
        shownKeyRef.current = pinKey;
        setDisplay(visiblePin);
        if (!visiblePin) {
          setMotion("exit");
          return;
        }
        setMotion("enter");
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => setMotion("shown"));
        });
      },
      hadCard ? SPOTLIGHT_FADE_MS : 16,
    );
    return () => window.clearTimeout(wait);
  }, [pinKey, visiblePin]);

  useEffect(() => {
    if (!display || style.autoHideMs <= 0) return;
    const fade = window.setTimeout(
      () => setMotion("exit"),
      Math.max(SPOTLIGHT_FADE_MS, style.autoHideMs - SPOTLIGHT_FADE_MS),
    );
    const hide = window.setTimeout(() => {
      setDismissedKey(spotlightKey(display));
      shownKeyRef.current = "";
      setDisplay(null);
    }, style.autoHideMs);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(hide);
    };
  }, [display, style.autoHideMs]);

  if (!display) return <div className="h-0 w-0" aria-hidden />;

  const roles = style.showBadges ? resolveBadgeRoles(display.badges, 6) : [];

  return (
    <ReplyAlertFrame
      active={display.isReply === true}
      fading={replyFading || Boolean(display.isReply && visiblePin?.id !== display.id)}
      quote={display.replyQuote}
    >
    <div
      className="overlay-spotlight-swap flex w-full min-w-[360px] max-w-[560px] flex-col gap-2 rounded-2xl px-6 py-5"
      data-motion={motion}
      style={{
        boxSizing: "border-box",
        background: withAlpha(style.backgroundColor, Math.max(style.backgroundOpacity, 70)),
        border: `1px solid ${withAlpha(accent, 45)}`,
        backdropFilter: "blur(20px)",
        boxShadow: `0 26px 60px rgba(0,0,0,0.55), 0 0 34px ${withAlpha(accent, 28)}`,
        fontFamily: skin.fontFamily ?? style.fontFamily,
        color: style.textColor,
        ...skin.surface,
        ...skin.text,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {style.showPlatform ? <PlatformIcon platform={display.platform} size={18} /> : null}
        {display.badgeImages.map((badge, index) =>
          badge.imageUrl ? (
            <BadgeImg
              key={`${badge.label}-${index}`}
              src={badge.imageUrl}
              label={badge.label}
              size={18}
              pixelated
            />
          ) : null,
        )}
        {roles.map((role) => (
          <RoleBadgeIcon key={role} role={role} platform={display.platform} size={18} />
        ))}
        <span
          style={{
            fontSize: `${Math.max(13, Math.round(style.fontSize * 0.72))}px`,
            fontWeight: 800,
            color: display.color ?? accent,
          }}
        >
          <span dir="auto">{display.author}</span>
        </span>
        <span
          className="ms-auto"
          style={{
            fontSize: `${Math.max(9, Math.round(style.fontSize * 0.38))}px`,
            letterSpacing: "0.3em",
            fontWeight: 700,
            color: accent,
          }}
        >
          SPOTLIGHT
        </span>
      </div>

      <p
        dir="auto"
        style={{
          fontSize: `${style.fontSize}px`,
          fontWeight: 600,
          lineHeight: 1.35,
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          margin: 0,
        }}
      >
        {renderChatText(display.text)}
      </p>
    </div>
    </ReplyAlertFrame>
  );
}


/* --------------------------- TikTok top tappers -------------------------- */

const TAPPERS_DEMO: TapperEntry[] = [
  { key: "demo-1", name: "hala_live", avatarUrl: null, taps: 12840 },
  { key: "demo-2", name: "mvp_gamer", avatarUrl: null, taps: 9310 },
  { key: "demo-3", name: "noorx", avatarUrl: null, taps: 4120 },
  { key: "demo-4", name: "zayn.tv", avatarUrl: null, taps: 2205 },
  { key: "demo-5", name: "rakan", avatarUrl: null, taps: 860 },
];

const RANK_COLORS = ["#FFD34D", "#CBD5E1", "#E29A5A"];

/** Counts a number up smoothly and pops the value on every increase. */
function useCountUp(value: number) {
  const [display, setDisplay] = useState(value);
  const [pop, setPop] = useState(0);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    if (value > from) setPop((n) => n + 1);
    const start = performance.now();
    const duration = 550;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return { display, pop };
}

function TapperCard({
  entry,
  rank,
  accent,
  textColor,
  fontSize,
  horizontal,
  showAvatar,
}: {
  entry: TapperEntry;
  rank: number;
  accent: string;
  textColor: string;
  fontSize: number;
  horizontal: boolean;
  showAvatar: boolean;
}) {
  const { display, pop } = useCountUp(entry.taps);
  const rankColor = RANK_COLORS[rank - 1] ?? accent;
  const initial = entry.name.replace(/^@/, "").slice(0, 1).toUpperCase();

  return (
    <div
      data-tapper-key={entry.key}
      className={`tapper-card${horizontal ? " tapper-card--row" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: horizontal ? "10px 12px" : "8px 12px",
        borderRadius: 14,
        border: `1px solid ${withAlpha(accent, 0.35)}`,
        background: "linear-gradient(135deg, rgba(16,17,22,0.72), rgba(16,17,22,0.42))",
        backdropFilter: "blur(10px)",
        boxShadow: `0 12px 28px -18px ${accent}`,
        color: textColor,
        fontSize,
        minWidth: horizontal ? 150 : 220,
        flexDirection: horizontal ? "column" : "row",
        textAlign: horizontal ? "center" : "start",
      }}
    >
      <span
        style={{
          fontWeight: 800,
          fontSize: fontSize * 0.9,
          color: rankColor,
          textShadow: `0 0 12px ${withAlpha(rankColor, 0.6)}`,
          minWidth: horizontal ? undefined : 34,
        }}
      >
        #{rank}
      </span>
      {showAvatar ? (
        entry.avatarUrl ? (
          <img
            src={entry.avatarUrl}
            alt=""
            width={fontSize * 1.7}
            height={fontSize * 1.7}
            style={{
              width: fontSize * 1.7,
              height: fontSize * 1.7,
              borderRadius: "50%",
              objectFit: "cover",
              border: `2px solid ${withAlpha(accent, 0.6)}`,
            }}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              display: "grid",
              placeItems: "center",
              width: fontSize * 1.7,
              height: fontSize * 1.7,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${withAlpha("#00F2FE", 0.35)}, ${withAlpha(accent, 0.45)})`,
              fontSize: fontSize * 0.8,
              fontWeight: 700,
            }}
          >
            {initial || "?"}
          </span>
        )
      ) : null}
      <span
        style={{
          flex: horizontal ? undefined : 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: 600,
        }}
        dir="auto"
      >
        {entry.name}
      </span>
      <span
        key={pop}
        className="tapper-count"
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 800,
          color: accent,
          textShadow: `0 0 14px ${withAlpha(accent, 0.55)}`,
        }}
      >
        {display.toLocaleString()}
      </span>
    </div>
  );
}

export function TikTokTappersView({
  config,
  tappers,
  demo = false,
}: {
  config: unknown;
  tappers: TapperEntry[];
  demo?: boolean;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const positions = useRef<Map<string, DOMRect>>(new Map());
  const parsed = parseTappersConfig(config);
  const source = tappers.length > 0 ? tappers : demo ? TAPPERS_DEMO : [];
  const rows = source.slice(0, parsed.topLimit);
  const horizontal = parsed.layout === "horizontal";

  // FLIP: animate rank changes so overtakes slide instead of snapping.
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const next = new Map<string, DOMRect>();
    for (const node of Array.from(container.children) as HTMLElement[]) {
      const key = node.dataset["tapperKey"];
      if (!key) continue;
      const rect = node.getBoundingClientRect();
      next.set(key, rect);
      const previous = positions.current.get(key);
      if (!previous) continue;
      const dx = previous.left - rect.left;
      const dy = previous.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.style.transition = "none";
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        node.style.transition = "transform 380ms cubic-bezier(.2,.9,.25,1)";
        node.style.transform = "translate(0px, 0px)";
      });
    }
    positions.current = next;
  }, [rows]);

  const sharedStyles = (
    <style>{`
      @keyframes tapper-pop { 0% { transform: scale(1);} 40% { transform: scale(1.28);} 100% { transform: scale(1);} }
      @keyframes tapper-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      @keyframes tapper-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      .tapper-count { display: inline-block; animation: tapper-pop 420ms ease-out; }
      .tapper-card { transition: transform 380ms cubic-bezier(.2,.9,.25,1), opacity 320ms ease; }
      .tapper-marquee-track { display: flex; gap: 12px; width: max-content; animation: tapper-marquee 18s linear infinite; }
    `}</style>
  );

  const heading = parsed.title ? (
    <p
      style={{
        margin: "0 0 10px",
        fontSize: parsed.fontSize * 0.7,
        letterSpacing: "0.25em",
        textTransform: "uppercase",
        fontWeight: 700,
        color: parsed.accentColor,
        textAlign: parsed.layout === "vertical" ? "start" : "center",
      }}
    >
      {parsed.title}
    </p>
  ) : null;

  /* ------------------------- Podium showcase (Top 3) ----------------------- */
  if (parsed.layout === "podium") {
    const [first, second, third] = rows;
    const podium: { entry: TapperEntry | undefined; rank: number; height: number }[] = [
      { entry: second, rank: 2, height: 74 },
      { entry: first, rank: 1, height: 112 },
      { entry: third, rank: 3, height: 54 },
    ];
    return (
      <div style={{ fontFamily: parsed.fontFamily }}>
        {sharedStyles}
        {heading}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, justifyContent: "center" }}>
          {podium.map(({ entry, rank, height }) =>
            entry ? (
              <div
                key={entry.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  color: parsed.textColor,
                }}
              >
                <TapperAvatar
                  entry={entry}
                  accent={parsed.accentColor}
                  size={rank === 1 ? parsed.fontSize * 3 : parsed.fontSize * 2.1}
                  show={parsed.showAvatars}
                />
                <span
                  style={{
                    fontSize: parsed.fontSize * (rank === 1 ? 0.85 : 0.7),
                    fontWeight: 700,
                    maxWidth: rank === 1 ? 140 : 110,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  dir="auto"
                >
                  {entry.name}
                </span>
                <span
                  className="tapper-count"
                  style={{
                    fontSize: parsed.fontSize * (rank === 1 ? 0.95 : 0.78),
                    fontWeight: 900,
                    color: parsed.accentColor,
                    fontVariantNumeric: "tabular-nums",
                    textShadow: `0 0 14px ${withAlpha(parsed.accentColor, 0.55)}`,
                  }}
                >
                  {entry.taps.toLocaleString()}
                </span>
                <div
                  style={{
                    width: rank === 1 ? 118 : 96,
                    height,
                    borderRadius: "14px 14px 6px 6px",
                    border: `1px solid ${withAlpha(RANK_COLORS[rank - 1] ?? parsed.accentColor, 0.6)}`,
                    background: `linear-gradient(180deg, ${withAlpha(RANK_COLORS[rank - 1] ?? parsed.accentColor, 0.35)}, rgba(16,17,22,0.5))`,
                    display: "grid",
                    placeItems: "center",
                    fontSize: parsed.fontSize * (rank === 1 ? 1.3 : 1),
                    fontWeight: 900,
                    color: RANK_COLORS[rank - 1] ?? parsed.accentColor,
                    boxShadow: `0 14px 32px -18px ${parsed.accentColor}`,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  #{rank}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------ Minimal grid ---------------------------- */
  if (parsed.layout === "grid") {
    const columns = rows.length > 4 ? 3 : 2;
    return (
      <div style={{ fontFamily: parsed.fontFamily }}>
        {sharedStyles}
        {heading}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: 12,
            justifyItems: "center",
          }}
        >
          {rows.map((entry, index) => (
            <div
              key={entry.key}
              title={`${entry.name} — ${entry.taps.toLocaleString()} taps`}
              style={{
                position: "relative",
                display: "grid",
                placeItems: "center",
                color: parsed.textColor,
                animation: index === 0 ? "tapper-pulse 2.2s ease-in-out infinite" : undefined,
              }}
            >
              <TapperAvatar
                entry={entry}
                accent={RANK_COLORS[index] ?? parsed.accentColor}
                size={parsed.fontSize * 2.4}
                show
              />
              <span
                className="tapper-count"
                style={{
                  position: "absolute",
                  bottom: -6,
                  padding: "1px 8px",
                  borderRadius: 999,
                  fontSize: parsed.fontSize * 0.55,
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  color: "#0B0D12",
                  background: parsed.accentColor,
                  boxShadow: `0 0 14px ${withAlpha(parsed.accentColor, 0.6)}`,
                }}
              >
                {entry.taps.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* --------------------------- Ticker / marquee --------------------------- */
  if (parsed.layout === "ticker") {
    const loop = [...rows, ...rows];
    return (
      <div style={{ fontFamily: parsed.fontFamily }}>
        {sharedStyles}
        {heading}
        <div
          style={{
            overflow: "hidden",
            borderRadius: 999,
            padding: "8px 0",
            border: `1px solid ${withAlpha(parsed.accentColor, 0.35)}`,
            background: "linear-gradient(135deg, rgba(16,17,22,0.72), rgba(16,17,22,0.42))",
            backdropFilter: "blur(10px)",
            maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
          }}
        >
          <div className="tapper-marquee-track">
            {loop.map((entry, index) => (
              <span
                key={`${entry.key}-${index}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0 14px",
                  color: parsed.textColor,
                  fontSize: parsed.fontSize * 0.8,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    fontWeight: 900,
                    color: RANK_COLORS[index % rows.length] ?? parsed.accentColor,
                  }}
                >
                  #{(index % rows.length) + 1}
                </span>
                <TapperAvatar
                  entry={entry}
                  accent={parsed.accentColor}
                  size={parsed.fontSize * 1.4}
                  show={parsed.showAvatars}
                />
                <span style={{ fontWeight: 600 }} dir="auto">{entry.name}</span>
                <span
                  style={{
                    fontWeight: 900,
                    color: parsed.accentColor,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {entry.taps.toLocaleString()}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------- Vertical list / horizontal shelf ---------------- */
  return (
    <div style={{ fontFamily: parsed.fontFamily }}>
      {sharedStyles}
      {heading}
      <div
        ref={listRef}
        style={{
          display: "flex",
          flexDirection: horizontal ? "row" : "column",
          gap: 8,
          flexWrap: horizontal ? "wrap" : "nowrap",
          justifyContent: horizontal ? "center" : undefined,
        }}
      >
        {rows.map((entry, index) => (
          <TapperCard
            key={entry.key}
            entry={entry}
            rank={index + 1}
            accent={parsed.accentColor}
            textColor={parsed.textColor}
            fontSize={parsed.fontSize}
            horizontal={horizontal}
            showAvatar={parsed.showAvatars}
          />
        ))}
      </div>
    </div>
  );
}

/** Circular avatar (or initial fallback) shared by the tappers layouts. */
function TapperAvatar({
  entry,
  accent,
  size,
  show,
}: {
  entry: TapperEntry;
  accent: string;
  size: number;
  show: boolean;
}) {
  if (!show) return null;
  const initial = entry.name.replace(/^@/, "").slice(0, 1).toUpperCase();
  if (entry.avatarUrl) {
    return (
      <img
        src={entry.avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: `2px solid ${withAlpha(accent, 0.7)}`,
          boxShadow: `0 0 16px ${withAlpha(accent, 0.45)}`,
        }}
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${withAlpha("#00F2FE", 0.35)}, ${withAlpha(accent, 0.45)})`,
        fontSize: size * 0.45,
        fontWeight: 700,
        border: `2px solid ${withAlpha(accent, 0.6)}`,
      }}
    >
      {initial || "?"}
    </span>
  );
}


/* ------------------------------- Renderer ------------------------------- */


/** Most recent event that actually added time — shown under the timer. */
function latestSupporter(events: OverlayEvent[]) {
  const event = events.find((entry) => !entry.isTest && entry.secondsAdded > 0);
  if (!event) return null;
  return {
    name: event.actorName ?? "Anonymous",
    seconds: event.secondsAdded,
    platform: event.platform,
  };
}

function subscriptionMilestone(events: OverlayEvent[]): number {
  return events.reduce((total, event) => {
    if (event.isTest) return total;
    if (event.eventType === "GIFT_SUB") return total + Math.max(1, event.quantity);
    if (event.eventType === "SUBSCRIPTION" || event.eventType === "MEMBERSHIP") return total + 1;
    return total;
  }, 0);
}

export function WidgetRenderer({
  type,
  config,
  frame,
  remaining,
  goal,
  events,
  spin,
  spotlight = null,
  streamEvents = null,
  tappers = [],
  tapGoal = 0,
  chat = null,
  testMessages = [],
  demo = false,
}: {
  type: WidgetType;
  config: unknown;
  frame: TimerFrame | null;
  remaining: number;
  goal: GoalSnapshot | null;
  events: OverlayEvent[];
  spin: SpinState | null;
  spotlight?: SpotlightMessage | null;
  streamEvents?: StreamEventsRuntime | null;
  tappers?: TapperEntry[];
  tapGoal?: number;
  chat?: ChatSources | null;
  testMessages?: ChatMessage[];
  demo?: boolean;
}) {
  switch (type) {
    case "GOAL_BAR":
      return <GoalBarView config={config} goal={goal} />;
    case "CHAT_BOX":
      return (
        <ChatBoxView config={config} chat={chat} testMessages={testMessages} />
      );
    case "SPIN_WHEEL":
      return <SpinWheelView config={config} spin={spin} />;
    case "EMOTE_RAIN":
      return <EmoteRainView config={config} events={events} demo={demo} />;
    case "TIKTOK_TAPPERS":
      return <TikTokTappersView config={config} tappers={tappers} demo={demo} />;
    case "TIKTOK_TAP_GOAL":
      return <TikTokTapGoalView config={config} taps={tapGoal} demo={demo} />;
    case "CHAT_SPOTLIGHT":
      return <ChatSpotlightView config={config} spotlight={spotlight} chat={chat} demo={demo} />;
    case "STREAM_EVENTS_SCHEDULE":
      return (
        <StreamEventsScheduleView config={config} runtime={streamEvents} demo={demo} />
      );
    case "SUBATHON_TIMER":
    default: {
      const skin = widgetThemeSkin(parseWidgetThemeId(config));
      const base = parseOverlayTheme(config);
      const themed = {
        ...base,
        fontFamily: skin.fontFamily ?? base.fontFamily,
        accentColor: skin.accentColor ?? base.accentColor,
        backgroundOpacity: skin.backgroundOpacity ?? base.backgroundOpacity,
      };
      return (
        <div style={{ ...skin.text, padding: 4 }}>
          <OverlayView
            theme={themed}
            remaining={remaining}
            frame={frame}
            lastSupporter={latestSupporter(events)}
            milestoneCurrent={subscriptionMilestone(events)}
          />
        </div>
      );
    }
  }
}

/* --------------------------- TikTok tap goal ---------------------------- */

type Confetto = { id: number; left: number; delay: number; color: string; rotate: number };

/**
 * Transparent progress overlay driven by the live TikTok LIKE (tap) total.
 * Numbers count up smoothly and confetti fires once the target is reached.
 */
export function TikTokTapGoalView({
  config,
  taps,
  demo = false,
}: {
  config: unknown;
  taps: number;
  demo?: boolean;
}) {
  const parsed = parseTapGoalConfig(config);
  const value = taps > 0 ? taps : demo ? Math.round(parsed.target * 0.75) : 0;
  const { display, pop } = useCountUp(value);
  const percent = Math.min(100, (display / parsed.target) * 100);
  const complete = display >= parsed.target;

  const [confetti, setConfetti] = useState<Confetto[]>([]);
  const celebrated = useRef(false);

  useEffect(() => {
    if (!complete) {
      celebrated.current = false;
      return;
    }
    if (celebrated.current) return;
    celebrated.current = true;
    const palette = [parsed.gradientFrom, parsed.gradientTo, "#FFFFFF", "#FFD34D"];
    const pieces: Confetto[] = Array.from({ length: 70 }, (_, index) => ({
      id: Date.now() + index,
      left: Math.random() * 100,
      delay: Math.random() * 600,
      color: palette[index % palette.length] as string,
      rotate: Math.random() * 360,
    }));
    setConfetti(pieces);
    const timeout = setTimeout(() => setConfetti([]), 5200);
    return () => clearTimeout(timeout);
  }, [complete, parsed.gradientFrom, parsed.gradientTo]);

  const keyframes = (
    <style>{`
      @keyframes tapgoal-pop { 0% { transform: scale(1); } 40% { transform: scale(1.14); } 100% { transform: scale(1); } }
      @keyframes tapgoal-confetti { 0% { transform: translateY(-20%) rotate(0deg); opacity: 1; } 100% { transform: translateY(420%) rotate(720deg); opacity: 0; } }
      @keyframes tapgoal-shine { 0% { transform: translateX(-100%); } 100% { transform: translateX(220%); } }
      @keyframes tapgoal-glow { 0%,100% { box-shadow: 0 0 18px -4px var(--tg-to), 0 0 40px -12px var(--tg-from); } 50% { box-shadow: 0 0 30px -2px var(--tg-to), 0 0 64px -10px var(--tg-from); } }
      @keyframes tapgoal-badge { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
    `}</style>
  );

  const confettiLayer =
    confetti.length > 0 ? (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map((piece) => (
          <span
            key={piece.id}
            className="absolute top-0 block h-2.5 w-1.5 rounded-[2px]"
            style={{
              left: `${piece.left}%`,
              background: piece.color,
              transform: `rotate(${piece.rotate}deg)`,
              animation: `tapgoal-confetti ${2200 + piece.delay}ms ease-in forwards`,
              animationDelay: `${piece.delay}ms`,
            }}
          />
        ))}
      </div>
    ) : null;

  const gradient = `linear-gradient(90deg, ${parsed.gradientFrom}, ${parsed.gradientTo})`;
  const surface = `color-mix(in oklab, ${parsed.backgroundColor} ${parsed.backgroundOpacity}%, transparent)`;
  const cssVars = {
    ["--tg-from" as string]: parsed.gradientFrom,
    ["--tg-to" as string]: parsed.gradientTo,
  } as React.CSSProperties;

  const shine = (
    <span
      className="absolute inset-y-0 w-12"
      style={{
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
        animation: "tapgoal-shine 2.4s linear infinite",
      }}
    />
  );

  /* ------------------------- Compact floating pill ------------------------ */
  if (parsed.design === "pill") {
    return (
      <div
        className="relative inline-flex max-w-full items-center gap-3 overflow-hidden rounded-full px-4 py-2"
        style={{
          ...cssVars,
          fontFamily: parsed.fontFamily,
          color: parsed.textColor,
          background: surface,
          border: `1px solid color-mix(in oklab, ${parsed.gradientTo} 50%, transparent)`,
          backdropFilter: "blur(12px)",
          animation: complete ? "tapgoal-glow 1.6s ease-in-out infinite" : undefined,
        }}
      >
        {keyframes}
        <span
          className="truncate font-bold uppercase tracking-wide"
          style={{ fontSize: parsed.fontSize * 0.6, maxWidth: 200 }}
        >
          {parsed.title}
        </span>
        <span
          className="relative h-2.5 w-40 overflow-hidden rounded-full"
          style={{ background: "rgba(255,255,255,0.14)" }}
        >
          <span
            className="absolute inset-y-0 start-0 rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${Math.max(percent, 2)}%`,
              background: gradient,
              boxShadow: `0 0 14px color-mix(in oklab, ${parsed.gradientTo} 60%, transparent)`,
            }}
          />
        </span>
        <span
          key={pop}
          className="font-black tabular-nums"
          style={{
            fontSize: parsed.fontSize * 0.6,
            color: parsed.gradientTo,
            animation: "tapgoal-pop 420ms ease-out",
          }}
        >
          {parsed.showPercent
            ? `${Math.round(percent)}%`
            : `${display.toLocaleString()}`}
        </span>
        {confettiLayer}
      </div>
    );
  }

  /* ---------------------------- Vertical pillar --------------------------- */
  if (parsed.design === "pillar") {
    return (
      <div
        className="relative inline-flex flex-col items-center gap-3 overflow-hidden rounded-3xl px-4 py-5"
        style={{
          ...cssVars,
          fontFamily: parsed.fontFamily,
          color: parsed.textColor,
          background: surface,
          border: `1px solid color-mix(in oklab, ${parsed.gradientTo} 40%, transparent)`,
          backdropFilter: "blur(12px)",
        }}
      >
        {keyframes}
        <span
          className="text-center font-extrabold uppercase tracking-wide"
          style={{ fontSize: parsed.fontSize * 0.55, maxWidth: 120 }}
        >
          {parsed.title}
        </span>
        <div
          className="relative w-8 overflow-hidden rounded-full"
          style={{ height: 240, background: "rgba(255,255,255,0.12)" }}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-500 ease-out"
            style={{
              height: `${Math.max(percent, 2)}%`,
              background: `linear-gradient(0deg, ${parsed.gradientFrom}, ${parsed.gradientTo})`,
              boxShadow: `0 0 20px color-mix(in oklab, ${parsed.gradientTo} 65%, transparent)`,
            }}
          />
        </div>
        {parsed.showPercent ? (
          <span
            className="font-black tabular-nums"
            style={{ fontSize: parsed.fontSize * 0.8, color: parsed.gradientTo }}
          >
            {Math.round(percent)}%
          </span>
        ) : null}
        <span
          key={pop}
          className="text-center text-xs font-semibold tabular-nums"
          style={{ animation: "tapgoal-pop 420ms ease-out", opacity: 0.85 }}
        >
          {display.toLocaleString()}
          <br />/ {parsed.target.toLocaleString()}
        </span>
        {confettiLayer}
      </div>
    );
  }

  /* --------------------------- Glassmorphic card -------------------------- */
  if (parsed.design === "glass") {
    return (
      <div
        className="relative w-full overflow-hidden rounded-3xl px-8 py-7 text-center"
        style={{
          ...cssVars,
          fontFamily: parsed.fontFamily,
          color: parsed.textColor,
          background: `linear-gradient(150deg, ${surface}, color-mix(in oklab, ${parsed.backgroundColor} ${Math.max(parsed.backgroundOpacity - 25, 0)}%, transparent))`,
          border: `1.5px solid color-mix(in oklab, ${parsed.gradientTo} 70%, transparent)`,
          backdropFilter: "blur(18px)",
          animation: "tapgoal-glow 3.2s ease-in-out infinite",
        }}
      >
        {keyframes}
        <p
          className="truncate font-extrabold uppercase"
          style={{ fontSize: parsed.fontSize * 0.85, letterSpacing: "0.18em" }}
        >
          {parsed.title}
        </p>
        {parsed.showPercent ? (
          <span
            className="mt-3 inline-block rounded-full px-4 py-1 font-black tabular-nums"
            style={{
              fontSize: parsed.fontSize,
              background: gradient,
              color: "#0B0D12",
              animation: "tapgoal-badge 1.8s ease-in-out infinite",
            }}
          >
            {Math.round(percent)}%
          </span>
        ) : null}
        <div
          className="relative mx-auto mt-4 h-4 w-full overflow-hidden rounded-full"
          style={{ background: "rgba(255,255,255,0.12)" }}
        >
          <div
            className="relative h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${Math.max(percent, 1.5)}%`,
              background: gradient,
              boxShadow: `0 0 22px color-mix(in oklab, ${parsed.gradientTo} 70%, transparent)`,
            }}
          >
            {shine}
          </div>
        </div>
        <div
          key={pop}
          className="mt-3 text-sm font-semibold tabular-nums"
          style={{ animation: "tapgoal-pop 420ms ease-out" }}
        >
          {complete
            ? "GOAL REACHED 🎉"
            : `${display.toLocaleString()} / ${parsed.target.toLocaleString()} taps`}
        </div>
        {confettiLayer}
      </div>
    );
  }

  /* ----------------------------- Standard bar ----------------------------- */
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl px-6 py-5"
      style={{
        ...cssVars,
        fontFamily: parsed.fontFamily,
        color: parsed.textColor,
        background: surface,
        border: `1px solid color-mix(in oklab, ${parsed.gradientTo} 45%, transparent)`,
        backdropFilter: "blur(12px)",
      }}
    >
      {keyframes}

      <div className="flex items-baseline justify-between gap-4">
        <span
          className="truncate font-extrabold uppercase tracking-wide"
          style={{ fontSize: parsed.fontSize }}
        >
          {parsed.title}
        </span>
        {parsed.showPercent ? (
          <span
            className="font-black tabular-nums"
            style={{ fontSize: parsed.fontSize, color: parsed.gradientTo }}
          >
            {Math.round(percent)}%
          </span>
        ) : null}
      </div>

      <div
        className="relative mt-4 h-5 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.12)" }}
      >
        <div
          className="relative h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${Math.max(percent, 1.5)}%`,
            background: gradient,
            boxShadow: `0 0 18px color-mix(in oklab, ${parsed.gradientTo} 60%, transparent)`,
          }}
        >
          {shine}
        </div>
      </div>

      <div
        key={pop}
        className="mt-3 flex items-center justify-between text-sm font-semibold tabular-nums"
        style={{ animation: "tapgoal-pop 420ms ease-out" }}
      >
        <span>
          {display.toLocaleString()} / {parsed.target.toLocaleString()} taps
        </span>
        {complete ? (
          <span style={{ color: parsed.gradientFrom }}>GOAL REACHED 🎉</span>
        ) : (
          <span style={{ opacity: 0.7 }}>
            {(parsed.target - display).toLocaleString()} to go
          </span>
        )}
      </div>

      {confettiLayer}
    </div>
  );
}

