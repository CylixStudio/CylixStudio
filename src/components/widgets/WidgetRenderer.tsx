import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

import { OverlayView } from "@/components/overlay/OverlayView";
import { ReplyAlertFrame } from "@/components/overlay/ReplyAlertFrame";
import { PlatformIcon, normalizePlatform } from "@/components/widgets/PlatformIcon";
import { RoleBadgeIcon, normalizeBadgeRole, resolveBadgeRoles } from "@/components/widgets/RoleBadgeIcon";
import { StreamEventsScheduleView } from "@/components/widgets/StreamEventsScheduleCard";

import { useKickBadges, kickGlobalBadgeUrl, type KickBadge } from "@/hooks/useKickBadges";
import { TWITCH_BADGE_SET, useTwitchBadges } from "@/hooks/useTwitchBadges";
import { useLiveChat, type ChatMessage, type ChatSources } from "@/hooks/useLiveChat";
import { useReplyAlertExpiry } from "@/hooks/useReplyAlertExpiry";
import { EVENT_LABEL_I18N, resolveEventLabelLines } from "@/lib/eventLabels";
import { t as translate, useLanguage } from "@/lib/i18n";
import { lookupChannel } from "@/lib/liveCounter.functions";
import { readOverlayViewers } from "@/lib/toolWidgets.functions";
import { parseOverlayTheme, withAlpha } from "@/lib/overlayTheme";
import { SpinWheelView } from "@/components/widgets/SpinWheel";
import { parseWidgetThemeId, widgetThemeSkin } from "@/lib/widgetThemes";
import type { StreamEventsRuntime } from "@/lib/streamEventsSchedule";
import { formatDuration, type TimerFrame } from "@/lib/timer";
import {
  describeEvent,
  dynamicGoalSnapshot,
  parseAlertConfig,
  parseChatConfig,
  parseGoalConfig,
  parseEmoteRainConfig,
  parseEventLabelsConfig,
  parseSplitGoalConfig,
  parseSpotlightConfig,
  parseTappersConfig,
  parseTapGoalConfig,
  parseViewerCounterConfig,
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
          className="h-full rounded-full transition-[width] duration-600 ease-out motion-reduce:transition-none"
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

const CHAT_LEAVE_MS = 260;

function chatInitial(author: string) {
  const first = [...author.trim()][0];
  return first || "?";
}

function shortRoleLabel(type: string | null | undefined): "Mod" | "VIP" | null {
  const role = normalizeBadgeRole(String(type ?? ""));
  if (role === "moderator") return "Mod";
  if (role === "vip") return "VIP";
  return null;
}

function ChatBadgePill({ label }: { label: "Mod" | "VIP" }) {
  const vip = label === "VIP";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 14,
        paddingInline: 4,
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.04em",
        lineHeight: 1,
        textTransform: "uppercase",
        color: vip ? "#F5C518" : "#7DD3FC",
        background: vip ? "rgba(245,197,24,0.16)" : "rgba(125,211,252,0.16)",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

/** Static rows so an empty customize preview still reads as chat. */
const SAMPLE_CHAT: ChatMessage[] = [
  {
    id: "sample-mod",
    platform: "KICK",
    author: "مشرف",
    color: "#86EFAC",
    badges: ["moderator"],
    text: "يا جماعة التفاعل حلو اليوم",
    at: 3,
  },
  {
    id: "sample-vip",
    platform: "TWITCH",
    author: "Nova",
    color: "#F0ABFC",
    badges: ["vip"],
    text: "that clutch was clean",
    at: 2,
  },
  {
    id: "sample-viewer",
    platform: "YOUTUBE" as ChatMessage["platform"],
    author: "ليان",
    color: "#FCA5A5",
    badges: [],
    text: "مرحبا من البث",
    at: 1,
  },
];

function readableChatMessage(message: ChatMessage | null | undefined, index: number): ChatMessage | null {
  if (!message || typeof message !== "object") return null;
  const text = typeof message.text === "string" ? message.text : "";
  if (!text.trim()) return null;
  const author =
    typeof message.author === "string" && message.author.trim().length > 0 ? message.author.trim() : "viewer";
  const platform =
    typeof message.platform === "string" && message.platform.trim().length > 0 ? message.platform : "TEST";
  const badges = Array.isArray(message.badges)
    ? message.badges.filter((badge): badge is string => typeof badge === "string" && badge.trim().length > 0)
    : [];
  const id = typeof message.id === "string" && message.id.trim().length > 0 ? message.id : `chat-${index}-${author}`;
  const readable: ChatMessage = {
    id,
    platform: platform as ChatMessage["platform"],
    author,
    color: typeof message.color === "string" ? message.color : null,
    badges,
    text,
    at: typeof message.at === "number" && Number.isFinite(message.at) ? message.at : 0,
    isReply: message.isReply === true,
    replyQuote: typeof message.replyQuote === "string" ? message.replyQuote : null,
  };
  if (Array.isArray(message.badgeList)) readable.badgeList = message.badgeList;
  return readable;
}

/** Keeps trimmed rows mounted long enough to play the leave animation. */
function useChatDepartures(messages: ChatMessage[]) {
  const [leaving, setLeaving] = useState<ChatMessage[]>([]);
  const previous = useRef<ChatMessage[]>([]);
  const timers = useRef(new Map<string, number>());
  const live = useRef(messages);
  live.current = messages;
  const signature = messages.map((message) => message?.id ?? "").join("\0");

  useEffect(() => {
    const current = live.current;
    const nextIds = new Set(current.map((message) => message?.id).filter((id): id is string => Boolean(id)));
    for (const id of nextIds) {
      const handle = timers.current.get(id);
      if (!handle) continue;
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
    const departed = previous.current.filter((message) => message?.id && !nextIds.has(message.id));
    previous.current = current;
    if (departed.length === 0) {
      setLeaving((rows) => {
        const next = rows.filter((message) => !nextIds.has(message.id));
        return next.length === rows.length ? rows : next;
      });
      return;
    }
    setLeaving((rows) => {
      const kept = rows.filter((message) => !nextIds.has(message.id));
      const seen = new Set(kept.map((message) => message.id));
      return [...kept, ...departed.filter((message) => message.id && !seen.has(message.id))];
    });
    for (const message of departed) {
      if (!message.id) continue;
      const handle = window.setTimeout(() => {
        timers.current.delete(message.id);
        setLeaving((rows) => rows.filter((row) => row.id !== message.id));
      }, CHAT_LEAVE_MS);
      timers.current.set(message.id, handle);
    }
  }, [signature]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const handle of pending.values()) window.clearTimeout(handle);
      pending.clear();
    };
  }, []);

  return leaving;
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
  demo = false,
}: {
  config: unknown;
  /** Public chat coordinates (Twitch login / Kick chatroom id). */
  chat?: ChatSources | null;
  /** Chat lines pushed by the dashboard test-event control. */
  testMessages?: ChatMessage[];
  /** Empty customize preview shows sample rows instead of a blank line. */
  demo?: boolean;
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
    .map((message, index) => readableChatMessage(message, index))
    .filter((message): message is ChatMessage => message != null)
    .sort((a, b) => b.at - a.at)
    .slice(0, style.maxMessages);
  const chatExpiry = useReplyAlertExpiry(chatFeed, {
    getId: (message) => message?.id ?? "",
    isReply: (message) => message?.isReply === true,
    appearanceMs: (message) => message?.at ?? null,
  });
  const visibleChat = chatExpiry.items;
  const leavingChat = useChatDepartures(visibleChat);
  const previewSamples = demo && visibleChat.length === 0;
  const shownChat = previewSamples ? SAMPLE_CHAT : visibleChat;

  const containerClass =
    layout === "glass"
      ? "flex w-full min-w-[380px] max-w-[520px] flex-col overflow-hidden rounded-xl bg-slate-900/70 p-5 backdrop-blur-lg border border-white/10 shadow-2xl"
      : "flex w-full min-w-[380px] max-w-[520px] flex-col items-start overflow-visible rounded-2xl bg-transparent p-0";

  const rowClassForLayout = (messageLayout: ChatLayout, motion: string) => {
    const base = `${motion} items-baseline`;
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

  const renderMessage = (message: ChatMessage, leaving = false) => {
    const author =
      typeof message?.author === "string" && message.author.trim().length > 0 ? message.author.trim() : "viewer";
    const text = typeof message?.text === "string" ? message.text : "";
    const platform = typeof message?.platform === "string" ? message.platform : "";
    const platformKey = platform ? normalizePlatform(platform) : null;
    const badges = Array.isArray(message?.badges)
      ? message.badges.filter((role): role is string => typeof role === "string")
      : [];
    const motion = leaving ? "overlay-anim-fade-out" : "overlay-anim-fade";

    const nameBlock = (
      <span dir="auto" style={{ color: message?.color ?? accent, fontWeight: 700, whiteSpace: "nowrap", ...skin.text }}>
        {author}
      </span>
    );

    const initialNode = (
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          display: "inline-grid",
          placeItems: "center",
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
          background: "rgba(255,255,255,0.1)",
          color: message?.color ?? accent,
          flexShrink: 0,
        }}
      >
        {chatInitial(author)}
      </span>
    );

    const platformBlock =
      style.showPlatform && platform
        ? platformKey
          ? <PlatformIcon platform={platform} size={16} />
          : (
            <span
              style={{
                color: accent,
                fontWeight: 700,
                fontSize: `${Math.max(10, Math.round(style.fontSize * 0.6))}px`,
                letterSpacing: "0.12em",
                ...skin.text,
              }}
            >
              {platform}
            </span>
          )
        : null;

    const isKick = platformKey === "KICK";
    const kickBadges = (
      isKick
        ? (message?.badgeList ?? []).length > 0
          ? (message?.badgeList ?? [])
          : badges.map((type) => ({ type }) as KickBadge)
        : []
    ).filter((badge) => badge && (style.showPlatform || !isPlatformMark(badge?.type)));

    const roleKeys = badges.filter((role) => style.showPlatform || !isPlatformMark(role));
    const pillLabels: Array<"Mod" | "VIP"> = [];
    for (const role of roleKeys) {
      const label = shortRoleLabel(role);
      if (label && !pillLabels.includes(label)) pillLabels.push(label);
    }
    const pillNodes = style.showBadges
      ? pillLabels.map((label) => <ChatBadgePill key={label} label={label} />)
      : [];

    // Kick: payload artwork first. Mod / VIP stay as short labels beside the name.
    const artNodes: React.ReactNode[] = !style.showBadges
      ? []
      : isKick
        ? kickBadges.map((badge, index) => {
            if (shortRoleLabel(badge?.type)) return null;
            const type = typeof badge?.type === "string" ? badge.type : "";
            const url =
              badge?.imageUrl ??
              (type ? resolveKickBadge({ ...badge, type }) : null) ??
              (type ? kickGlobalBadgeUrl(type) : null);
            const label = badge?.text || type || "badge";
            const role = type ? normalizeBadgeRole(type) : null;
            if (!url) {
              if (!role) return null;
              return (
                <RoleBadgeIcon
                  key={`${type || "badge"}-${index}`}
                  role={role}
                  platform={platform || "KICK"}
                  size={18}
                  style={{ marginInlineEnd: 4 }}
                />
              );
            }
            return (
              <BadgeImg
                key={`${type || "badge"}-${index}`}
                src={url}
                label={label}
                pixelated
                size={18}
                marginRight={4}
                fallback={
                  role ? (
                    <RoleBadgeIcon
                      role={role}
                      platform={platform || "KICK"}
                      size={18}
                      style={{ marginInlineEnd: 4 }}
                    />
                  ) : null
                }
              />
            );
          })
        : resolveBadgeRoles(
            roleKeys.filter((role) => !shortRoleLabel(role)),
            3,
          ).map((role) => (
            <RoleBadgeIcon
              key={role}
              role={role}
              platform={platform || "TWITCH"}
              size={18}
              style={{ marginInlineEnd: 4 }}
              imageUrl={
                platformKey === "TWITCH" ? (twitchBadgeUrls?.[TWITCH_BADGE_SET[role] ?? role] ?? null) : null
              }
            />
          ));

    const badgeNodes = [...pillNodes, ...artNodes];
    const badgesBlock =
      badgeNodes.filter(Boolean).length > 0 ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
            verticalAlign: "middle",
          }}
        >
          {badgeNodes}
        </span>
      ) : null;

    const identity = (
      <span style={islandNameStyle}>
        {initialNode}
        {nameBlock}
        {badgesBlock}
        {platformBlock}
        <span style={{ color: style.textColor, opacity: 0.7, ...skin.text }}>:</span>
      </span>
    );

    const replyWrap = (node: React.ReactNode) => (
      <ReplyAlertFrame
        key={message?.id ?? author}
        active={message?.isReply === true}
        fading={chatExpiry.fadingIds.has(message?.id ?? "")}
        quote={typeof message?.replyQuote === "string" ? message.replyQuote : null}
      >
        {node}
      </ReplyAlertFrame>
    );

    if (layout === "island") {
      return replyWrap(
        <div dir="auto" className={motion} style={islandCapsuleStyle}>
          <span style={{ display: "inline", minWidth: 0 }}>
            {identity}
            <span dir="auto" style={islandTextStyle}>{renderChatText(text)}</span>
          </span>
        </div>,
      );
    }

    return replyWrap(
      <div dir="auto" className={rowClassForLayout(layout, motion)}>
        <span
          className={`message-line block w-full ${layout === "transparent" ? "px-2 py-1" : ""}`}
        >
          {identity}
          <span className="ms-1.5" dir="auto" style={{ ...textStyle, ...transparentTextStyle }}>
            {renderChatText(text)}
          </span>
        </span>
      </div>,
    );
  };

  const quiet = shownChat.length === 0 && (previewSamples || leavingChat.length === 0);

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
      {shownChat.map((message) => renderMessage(message, false))}
      {previewSamples ? null : leavingChat.map((message) => renderMessage(message, true))}
      {quiet ? <span style={{ opacity: 0.6 }}>Waiting for chat…</span> : null}
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


const VIEWER_POLL_MS = 25_000;

function viewerDisplayCount(
  metric: "viewers" | "followers",
  isLive: boolean,
  raw: number | null,
): number {
  if (metric === "viewers" && !isLive) return raw ?? 0;
  return raw ?? 0;
}

function ViewerCounterView({
  config,
  publicToken,
}: {
  config: unknown;
  publicToken?: string | null;
}) {
  const { t } = useLanguage();
  const parsed = parseViewerCounterConfig(config);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (parsed.platform === "TIKTOK") {
      setCount(null);
      setError("TikTok live counters are Coming Soon until TikTok OAuth is ready.");
      return;
    }
    if (!parsed.channel && !publicToken) {
      setCount(null);
      setError(null);
      return;
    }

    const onOverlay =
      typeof window !== "undefined" && window.location.pathname.startsWith("/overlay/");
    let cancelled = false;

    const applySnapshot = (raw: number | null, isLive: boolean, note: string | null) => {
      setCount(viewerDisplayCount(parsed.metric, isLive, raw));
      setError(note);
    };

    const load = async () => {
      if (!onOverlay && parsed.channel) {
        try {
          const snapshot = await lookupChannel({
            data: { platform: parsed.platform, username: parsed.channel },
          });
          if (cancelled) return;
          const raw = parsed.metric === "followers" ? snapshot.followers : snapshot.viewers;
          applySnapshot(raw, snapshot.isLive, snapshot.note);
          return;
        } catch (err) {
          if (cancelled) return;
          if (!publicToken) {
            setCount(null);
            setError(err instanceof Error ? err.message : "lookup_failed");
            return;
          }
        }
      }
      if (!publicToken) return;
      try {
        const result = await readOverlayViewers({ data: { publicToken } });
        if (cancelled) return;
        if (result.ok) {
          applySnapshot(result.count, result.isLive, result.note);
        } else {
          setCount(null);
          setError(result.message === "channel_missing" ? null : result.message);
        }
      } catch (err) {
        if (cancelled) return;
        setCount(null);
        setError(err instanceof Error ? err.message : "lookup_failed");
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), VIEWER_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [publicToken, parsed.channel, parsed.platform, parsed.metric]);

  const comingSoon = /coming soon/i.test(error ?? "");
  const style = parsed;
  return (
    <div
      className="flex min-w-[280px] flex-col items-center gap-2 rounded-2xl px-8 py-6 text-center"
      style={{
        background: withAlpha(style.backgroundColor, style.backgroundOpacity),
        color: style.textColor,
        fontFamily: style.fontFamily,
      }}
    >
      <span style={{ letterSpacing: "0.22em", fontSize: 12, fontWeight: 700, color: style.accentColor }}>
        {parsed.channel || t("widget.viewer.channel")}
      </span>
      <span style={{ fontSize: style.fontSize, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} dir="ltr">
        {count === null ? "—" : count.toLocaleString("en-US")}
      </span>
      <span style={{ fontSize: 13, opacity: 0.7 }}>
        {comingSoon
          ? t("widget.viewer.comingSoon")
          : error && error !== "overlay_not_found"
            ? error
            : parsed.metric === "followers"
              ? t("widget.viewer.followers")
              : t("widget.viewer.viewers")}
      </span>
    </div>
  );
}

function EventLabelsView({ config, events }: { config: unknown; events: OverlayEvent[] }) {
  const { lang: appLang } = useLanguage();
  const parsed = parseEventLabelsConfig(config);
  const lang = parsed.language ?? appLang;
  const lines = resolveEventLabelLines(events, parsed.labels);
  const lineKey = lines.map((line) => `${line.option}:${line.username}:${line.amount ?? ""}`).join("|");
  const [slot, setSlot] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    setSlot(0);
    setShown(true);
  }, [lineKey]);

  useEffect(() => {
    if (lines.length <= 1) return;
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeMs = reduced ? 0 : 400;
    let fadeTimer = 0;
    const holdTimer = window.setTimeout(() => {
      setShown(false);
      fadeTimer = window.setTimeout(() => {
        setSlot((current) => (current + 1) % lines.length);
        setShown(true);
      }, fadeMs);
    }, 3500);
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(fadeTimer);
    };
  }, [slot, lines.length, lineKey]);

  const line = lines.length > 0 ? lines[slot % lines.length] : null;
  return (
    <div
      className="flex min-w-[240px] flex-col gap-2 rounded-2xl px-6 py-5"
      dir={lang === "ar" ? "rtl" : "ltr"}
      style={{
        background: withAlpha(parsed.backgroundColor, parsed.backgroundOpacity),
        color: parsed.textColor,
        fontFamily: parsed.fontFamily,
      }}
    >
      <span style={{ letterSpacing: "0.18em", fontSize: 12, fontWeight: 700, color: parsed.accentColor }}>
        {parsed.title}
      </span>
      {line ? (
        <span
          className="rounded-xl border px-3 py-1.5 transition-opacity duration-[400ms] ease-out motion-reduce:transition-none"
          style={{
            borderColor: withAlpha(parsed.accentColor, 45),
            fontSize: parsed.fontSize * 0.55,
            opacity: shown ? 1 : 0,
          }}
        >
          {translate(EVENT_LABEL_I18N[line.option], undefined, lang)}
          <span dir="ltr">
            {" · "}
            {line.username}
            {line.amount ? ` · ${line.amount}` : ""}
          </span>
        </span>
      ) : null}
    </div>
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
  publicToken = null,
  onSpin,
  spinning = false,
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
  publicToken?: string | null;
  onSpin?: (() => void) | undefined;
  spinning?: boolean;
}) {
  switch (type) {
    case "GOAL_BAR":
      return <GoalBarView config={config} goal={goal} />;
    case "KICKS_GOAL":
    case "DONATION_GOAL":
    case "FOLLOWER_GOAL":
    case "SUBSCRIBER_GOAL": {
      const local = dynamicGoalSnapshot(type, config, events);
      const shown = goal ?? local;
      return shown ? <GoalBarView config={config} goal={shown} /> : null;
    }
    case "CUSTOM_GOAL": {
      const parsed = parseSplitGoalConfig(type, config);
      return (
        <GoalBarView
          config={config}
          goal={{ title: parsed.title, unit: parsed.unit, target: parsed.target, current: parsed.current }}
        />
      );
    }
    case "VIEWER_COUNTER":
      return <ViewerCounterView config={config} publicToken={publicToken} />;
    case "EVENT_LABELS":
      return <EventLabelsView config={config} events={events} />;
    case "CHAT_BOX":
      return (
        <ChatBoxView config={config} chat={chat} testMessages={testMessages} demo={demo} />
      );
    case "SPIN_WHEEL":
      return <SpinWheelView config={config} spin={spin} onSpin={onSpin} spinning={spinning} />;
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

