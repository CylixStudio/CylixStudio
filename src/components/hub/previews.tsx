import { useEffect, useState } from "react";

import { useLanguage } from "@/lib/i18n";

const HUB_LOOP_MS = 10_000;
const HUB_STAGGER_MS = 500;
const HUB_SHIFT_MS = 550;
const HUB_BEAT_MS = 5_000;
const HUB_TICK_MS = 2_500;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function formatPlus(total: number) {
  const days = Math.floor(total / 86400);
  const rest = total % 86400;
  const [hours, minutes, seconds] = formatHms(rest);
  if (days > 0) return `+${days}:${hours}:${minutes}:${seconds}`;
  return `+${hours}:${minutes}:${seconds}`;
}

function randomBonusSeconds() {
  const roll = Math.random();
  if (roll < 0.34) return 18 + Math.floor(Math.random() * 240);
  if (roll < 0.68) return 3600 + Math.floor(Math.random() * 4 * 3600);
  if (roll < 0.88) return 86400 + Math.floor(Math.random() * 2 * 86400 + Math.random() * 8 * 3600);
  return 10 * 3600 + Math.floor(Math.random() * 17 * 3600 + Math.random() * 3600);
}

function useSubathonPreview(startSeconds: number) {
  const reduced = useReducedMotion();
  const [seconds, setSeconds] = useState(startSeconds);
  const [chip, setChip] = useState<{ id: number; label: string } | null>(null);

  useEffect(() => {
    if (reduced) {
      setSeconds(startSeconds);
      setChip(null);
      return;
    }
    let chipId = 0;
    let hideChip = 0;
    const tick = window.setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);
    const bonus = window.setInterval(() => {
      const added = randomBonusSeconds();
      chipId += 1;
      const id = chipId;
      setSeconds((value) => value + added);
      setChip({ id, label: formatPlus(added) });
      window.clearTimeout(hideChip);
      hideChip = window.setTimeout(() => {
        setChip((current) => (current?.id === id ? null : current));
      }, 1600);
    }, 4200);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(bonus);
      window.clearTimeout(hideChip);
    };
  }, [reduced, startSeconds]);

  return { seconds, chip };
}

function useLoopProgress(from: number, to: number, durationMs: number) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState((from + to) / 2);
  useEffect(() => {
    if (reduced) {
      setValue((from + to) / 2);
      return;
    }
    let raf = 0;
    const started = performance.now();
    const frame = (now: number) => {
      const t = ((now - started) % durationMs) / durationMs;
      const raw = t < 0.62 ? t / 0.62 : t < 0.78 ? 1 : 1 - (t - 0.78) / 0.22;
      const smooth = t < 0.62 ? easeOutCubic(raw) : t < 0.78 ? 1 : easeInOutCubic(raw);
      setValue(from + (to - from) * smooth);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [from, to, durationMs, reduced]);
  return value;
}

function useTick(ms: number, enabled: boolean) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
  return tick;
}

function HubTimeUnit({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex min-w-[1.55rem] flex-col items-center">
      <span className="text-lg font-semibold leading-none tabular-nums tracking-tight">{value}</span>
      <span className="mt-1 text-center text-[0.45rem] font-medium uppercase leading-none tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function HubTimeColon() {
  return (
    <span className="pt-0.5 text-lg font-semibold leading-none text-muted-foreground" aria-hidden>
      :
    </span>
  );
}

function formatHms(total: number) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ] as const;
}

function Bar({
  percent,
  label,
  value,
  accent,
}: {
  percent: number;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-2 overflow-hidden px-3.5">
      <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground">{percent}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[oklch(1_0_0/0.06)]">
        <div
          className={`hub-bar-fill h-full rounded-full ${accent ? "" : "bg-primary"}`}
          style={accent ? { width: `${percent}%`, background: accent } : { width: `${percent}%` }}
        />
      </div>
      <p className="text-[0.66rem] text-muted-foreground">{value}</p>
    </div>
  );
}

export function TimerPreview() {
  const { seconds: total, chip } = useSubathonPreview(1 * 3600 + 25 * 60 + 36);
  const days = Math.floor(total / 86400);
  const [hours, minutes, seconds] = formatHms(total % 86400);
  return (
    <div className="relative grid h-full place-items-center overflow-hidden">
      {chip ? (
        <span
          key={chip.id}
          className="hub-timer-chip absolute top-1.5 rounded-full border border-[oklch(1_0_0/0.1)] bg-[oklch(1_0_0/0.06)] px-2 py-0.5 text-[0.58rem] font-semibold tabular-nums text-primary"
        >
          {chip.label}
        </span>
      ) : null}
      <div className="relative rounded-xl border border-[oklch(1_0_0/0.08)] bg-[oklch(1_0_0/0.04)] px-3 py-1.5">
        <div className="flex items-start justify-center gap-1">
          <HubTimeUnit value={days} label="D" />
          <HubTimeColon />
          <HubTimeUnit value={hours} label="H" />
          <HubTimeColon />
          <HubTimeUnit value={minutes} label="M" />
          <HubTimeColon />
          <HubTimeUnit value={seconds} label="S" />
        </div>
      </div>
    </div>
  );
}

export const GOAL_CARD_ACCENT = {
  "donation-goal": "#34D399",
  "follower-goal": "#38BDF8",
  "subscriber-goal": "#A78BFA",
  "custom-goal": "#F59E0B",
} as const;

export function DonationGoalPreview() {
  return <Bar percent={72} label="هدف التبرعات" value="360 / 500 USD" accent={GOAL_CARD_ACCENT["donation-goal"]} />;
}

export function FollowerGoalPreview() {
  return <Bar percent={64} label="هدف المتابعين" value="640 / 1,000" accent={GOAL_CARD_ACCENT["follower-goal"]} />;
}

export function SubscriberGoalPreview() {
  return <Bar percent={36} label="هدف المشتركين" value="18 / 50" accent={GOAL_CARD_ACCENT["subscriber-goal"]} />;
}

export function CustomGoalPreview() {
  return <Bar percent={40} label="هدف مخصص" value="40 / 100 نقطة" accent={GOAL_CARD_ACCENT["custom-goal"]} />;
}

export function GoalTypePreview({
  label,
  current,
  target,
  unit,
  accent,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
  accent?: string;
}) {
  const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const live = useLoopProgress(
    Math.max(8, percent - 14),
    Math.min(100, percent + 8),
    HUB_LOOP_MS,
  );
  const shown = Math.round(live);
  const amount = Math.round((shown / 100) * target);
  return (
    <div
      className="h-full overflow-hidden"
      style={accent ? ({ "--primary": accent } as Record<string, string>) : undefined}
    >
      <Bar
        percent={shown}
        label={label}
        value={`${amount.toLocaleString()} / ${target.toLocaleString()} ${unit}`}
      />
    </div>
  );
}

export function GoalPreview() {
  return <Bar percent={72} label="Sub goal" value="720 / 1000 subs" />;
}

export function AlertPreview() {
  return (
    <div className="grid h-full place-items-center overflow-hidden">
      <div className="relative w-full max-w-[195px]">
        <div className="relative rounded-xl border border-[oklch(1_0_0/0.1)] bg-[oklch(1_0_0/0.05)] px-3 py-2.5">
          <p className="text-[0.6rem] uppercase tracking-[0.24em] text-primary">New sub · Tier 1</p>
          <p className="mt-1 text-[0.8rem] font-medium">nova_stream just subscribed</p>
        </div>
      </div>
    </div>
  );
}

const CHAT_LINES = [
  { who: "kira", msg: "let's goooo" },
  { who: "mox", msg: "that clutch though" },
  { who: "ari", msg: "gg" },
  { who: "nova", msg: "timer just popped" },
  { who: "lex", msg: "one more gift" },
] as const;

export function ChatPreview() {
  return (
    <div className="flex h-full flex-col justify-end gap-1 overflow-hidden px-3 py-2">
      {CHAT_LINES.map((line, index) => (
        <div
          key={line.who}
          className="hub-chat-line rounded-xl border border-[oklch(1_0_0/0.07)] bg-[oklch(1_0_0/0.035)] px-2.5 py-1.5 text-[0.68rem]"
          style={{ animationDelay: `${index * (HUB_STAGGER_MS / 1000)}s` }}
        >
          <span className="font-semibold text-primary">{line.who}</span>{" "}
          <span className="text-muted-foreground">{line.msg}</span>
        </div>
      ))}
    </div>
  );
}

const SPOTLIGHTS = [
  { who: "kira", msg: "Pinned message on stream" },
  { who: "mox", msg: "That play was insane" },
] as const;

export function SpotlightPreview() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [motion, setMotion] = useState<"shown" | "exit" | "enter">("shown");

  useEffect(() => {
    if (reduced) return;
    let swap = 0;
    let enter = 0;
    const cycle = window.setInterval(() => {
      setMotion("exit");
      swap = window.setTimeout(() => {
        setIndex((current) => (current + 1) % SPOTLIGHTS.length);
        setMotion("enter");
        enter = window.requestAnimationFrame(() => {
          enter = window.requestAnimationFrame(() => setMotion("shown"));
        });
      }, HUB_SHIFT_MS);
    }, HUB_BEAT_MS);
    return () => {
      window.clearInterval(cycle);
      window.clearTimeout(swap);
      window.cancelAnimationFrame(enter);
    };
  }, [reduced]);

  const pin = SPOTLIGHTS[index]!;
  return (
    <div className="grid h-full place-items-center overflow-hidden px-3">
      <div
        className="hub-spotlight-card w-full rounded-xl border border-[oklch(1_0_0/0.1)] bg-[oklch(1_0_0/0.05)] px-3 py-2.5"
        data-motion={motion}
      >
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" />
          <span className="text-[0.68rem] font-bold text-primary">{pin.who}</span>
          <span className="ms-auto text-[0.5rem] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            Spotlight
          </span>
        </div>
        <p className="mt-1 text-[0.72rem] font-medium text-muted-foreground">{pin.msg}</p>
      </div>
    </div>
  );
}

const HUB_SCHEDULE_EVENTS = [
  { title: "Just Chatting", remaining: 12 * 60 + 40 },
  { title: "Main Game", remaining: 3 * 60 + 18 },
  { title: "Viewer Games", remaining: 45 },
] as const;

export function StreamEventsSchedulePreview() {
  const { t } = useLanguage();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(HUB_SCHEDULE_EVENTS[0]!.remaining);
  const [motion, setMotion] = useState<"shown" | "exit" | "enter">("shown");

  useEffect(() => {
    if (reduced) return;
    const tick = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          setMotion("exit");
          window.setTimeout(() => {
            setIndex((i) => {
              const next = (i + 1) % HUB_SCHEDULE_EVENTS.length;
              setSeconds(HUB_SCHEDULE_EVENTS[next]!.remaining);
              setMotion("enter");
              window.requestAnimationFrame(() =>
                window.requestAnimationFrame(() => setMotion("shown")),
              );
              return next;
            });
          }, HUB_SHIFT_MS);
          return current;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [reduced]);

  const event = HUB_SCHEDULE_EVENTS[index]!;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const urgent = seconds <= 60;
  const warn = seconds <= 120;

  return (
    <div className="grid h-full place-items-center overflow-hidden px-3">
      <div
        className="hub-spotlight-card w-full rounded-xl border border-[oklch(1_0_0/0.1)] bg-[oklch(1_0_0/0.05)] px-3 py-2.5 backdrop-blur-sm"
        data-motion={motion}
      >
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" />
          <span className="truncate text-[0.68rem] font-bold text-primary">{event.title}</span>
          <span className="ms-auto text-[0.5rem] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            {index === 0 ? t("scheduleCard.onStream") : t("scheduleCard.upNext")}
          </span>
        </div>
        <p
          dir="ltr"
          className={`mt-1.5 font-mono text-[0.95rem] font-bold tabular-nums ${
            urgent ? "animate-pulse text-rose-400" : warn ? "text-amber-300" : "text-zinc-100"
          }`}
        >
          {m}:{String(s).padStart(2, "0")}
        </p>
      </div>
    </div>
  );
}

const WHEEL_PREVIEW_FILLS = ["#4C8DFF", "#5DDC8A", "#FF8A3D", "#FF8FBF", "#F3E0C4", "#4C8DFF"] as const;

function wheelPreviewWedge(index: number) {
  const start = index * 60;
  const end = start + 60;
  const polar = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: 43 + Math.cos(rad) * 34, y: 43 + Math.sin(rad) * 34 };
  };
  const from = polar(start);
  const to = polar(end);
  return `M 43 43 L ${from.x} ${from.y} A 34 34 0 0 1 ${to.x} ${to.y} Z`;
}

export function WheelPreview() {
  return (
    <div className="grid h-full place-items-center overflow-hidden">
      <svg viewBox="0 0 86 86" className="size-[86px]" aria-hidden>
        {WHEEL_PREVIEW_FILLS.map((fill, index) => (
          <path key={fill + index} d={wheelPreviewWedge(index)} fill={fill} stroke="#18181B" strokeWidth="0.6" />
        ))}
        <circle cx="43" cy="43" r="38" fill="none" stroke="#E4E4E7" strokeWidth="2.5" />
        <circle cx="43" cy="43" r="5" fill="#18181B" stroke="#A1A1AA" strokeWidth="1.2" />
        <path d="M43 15 L37.5 3.5 H48.5 Z" fill="#FAFAFA" stroke="#09090B" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const HUB_EMOTES = [
  { src: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0", alt: "Kappa" },
  { src: "https://static-cdn.jtvnw.net/emoticons/v2/425618/default/dark/1.0", alt: "LUL" },
  { src: "https://static-cdn.jtvnw.net/emoticons/v2/305954156/default/dark/1.0", alt: "PogChamp" },
  { src: "https://static-cdn.jtvnw.net/emoticons/v2/354/default/dark/1.0", alt: "4Head" },
  { src: "https://static-cdn.jtvnw.net/emoticons/v2/58127/default/dark/1.0", alt: "CoolCat" },
  { src: "https://static-cdn.jtvnw.net/emoticons/v2/81997/default/dark/1.0", alt: "KappaPride" },
  { src: "https://static-cdn.jtvnw.net/emoticons/v2/114836/default/dark/1.0", alt: "Jebaited" },
  { src: "https://static-cdn.jtvnw.net/emoticons/v2/41/default/dark/1.0", alt: "Kreygasm" },
  { src: "https://static-cdn.jtvnw.net/emoticons/v2/58765/default/dark/1.0", alt: "NotLikeThis" },
  { src: "https://static-cdn.jtvnw.net/emoticons/v2/555555584/default/dark/1.0", alt: "<3" },
] as const;

const HUB_EMOTE_FALLS = [
  { left: "4%", delay: "0s", duration: "10s", size: 18, spin: "150deg" },
  { left: "15%", delay: "-0.5s", duration: "11s", size: 16, spin: "-190deg" },
  { left: "26%", delay: "-1s", duration: "9s", size: 20, spin: "210deg" },
  { left: "38%", delay: "-1.5s", duration: "12s", size: 17, spin: "-140deg" },
  { left: "49%", delay: "-2s", duration: "8s", size: 15, spin: "175deg" },
  { left: "60%", delay: "-2.5s", duration: "10s", size: 19, spin: "-205deg" },
  { left: "71%", delay: "-3s", duration: "11s", size: 16, spin: "185deg" },
  { left: "82%", delay: "-3.5s", duration: "9s", size: 18, spin: "-165deg" },
  { left: "90%", delay: "-4s", duration: "12s", size: 15, spin: "200deg" },
  { left: "10%", delay: "-4.5s", duration: "8s", size: 14, spin: "-120deg" },
] as const;

export function EmotePreview() {
  return (
    <div className="hub-emote-rain relative isolate h-full w-full overflow-hidden" aria-hidden>
      {HUB_EMOTE_FALLS.map((fall, index) => {
        const emote = HUB_EMOTES[index % HUB_EMOTES.length]!;
        return (
          <img
            key={`${emote.alt}-${index}`}
            src={emote.src}
            alt=""
            width={fall.size}
            height={fall.size}
            className="hub-emote-drop pointer-events-none absolute start-0 top-0 select-none"
            style={{
              insetInlineStart: fall.left,
              width: fall.size,
              height: fall.size,
              animationDelay: fall.delay,
              animationDuration: fall.duration,
              ["--emote-spin" as string]: fall.spin,
            }}
            draggable={false}
          />
        );
      })}
    </div>
  );
}

export function ActivityPreview() {
  const rows = [
    ["Follow", "kira"],
    ["Tip", "$5.00"],
    ["Sub", "Tier 1"],
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 overflow-hidden px-3 text-[0.68rem]">
      {rows.map(([kind, value]) => (
        <div
          key={kind}
          className="flex items-center justify-between rounded-xl border border-[oklch(1_0_0/0.06)] bg-[oklch(1_0_0/0.025)] px-2.5 py-1.5"
        >
          <span className="text-muted-foreground">{kind}</span>
          <span className="font-medium">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function CountdownPreview() {
  return (
    <div className="flex h-full items-center justify-center gap-2 overflow-hidden">
      {["02", "14", "09"].map((unit) => (
        <div
          key={unit}
          className="rounded-xl border border-[oklch(1_0_0/0.09)] bg-[oklch(1_0_0/0.04)] px-3 py-2.5 text-lg font-semibold tabular-nums"
        >
          {unit}
        </div>
      ))}
    </div>
  );
}

export function SocialPreview() {
  return (
    <div className="flex h-full items-center justify-center gap-2 overflow-hidden">
      {["tw", "yt", "ig", "x"].map((tag) => (
        <span
          key={tag}
          className="grid size-9 place-items-center rounded-xl border border-[oklch(1_0_0/0.09)] bg-[oklch(1_0_0/0.04)] text-[0.6rem] uppercase text-muted-foreground"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function TtsPreview() {
  return (
    <div className="flex h-full items-end justify-center gap-1 overflow-hidden pb-8">
      {[12, 26, 38, 20, 32, 14, 28].map((height, index) => (
        <span
          key={index}
          className="hub-eq-bar w-1.5 rounded-full bg-primary/70"
          style={{ height, animationDelay: `${index * (HUB_STAGGER_MS / 5)}ms` }}
        />
      ))}
    </div>
  );
}

export function TextPreview() {
  return (
    <div className="grid h-full place-items-center overflow-hidden">
      <p className="text-sm font-semibold tracking-tight">
        Now playing <span className="text-primary">· lo-fi</span>
      </p>
    </div>
  );
}

export function MediaPreview() {
  return (
    <div className="grid h-full place-items-center overflow-hidden">
      <div className="flex w-full max-w-[170px] gap-1.5">
        <div className="h-16 flex-1 rounded-xl bg-[oklch(1_0_0/0.06)]" />
        <div className="h-16 w-10 rounded-xl bg-primary/25" />
        <div className="h-16 w-6 rounded-xl bg-accent/25" />
      </div>
    </div>
  );
}

export function PollPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 overflow-hidden px-3.5">
      {[64, 26, 10].map((value) => (
        <div key={value} className="h-2 w-full overflow-hidden rounded-full bg-[oklch(1_0_0/0.06)]">
          <div className="h-full rounded-full bg-primary/70" style={{ width: `${value}%` }} />
        </div>
      ))}
    </div>
  );
}

export function QueuePreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 overflow-hidden px-3 text-[0.68rem]">
      {["1. kira", "2. mox", "3. ari"].map((row) => (
        <p
          key={row}
          className="rounded-xl border border-[oklch(1_0_0/0.05)] bg-[oklch(1_0_0/0.03)] px-2.5 py-1.5"
        >
          {row}
        </p>
      ))}
    </div>
  );
}

const TAPPERS = [
  { name: "hala_live", base: 12840, step: 360, tone: "#C9A227" },
  { name: "mvp_gamer", base: 12410, step: 520, tone: "#94A3B8" },
  { name: "noorx", base: 11980, step: 690, tone: "#B87A45" },
] as const;

export function TappersPreview() {
  const reduced = useReducedMotion();
  const phase = useTick(HUB_TICK_MS, !reduced);
  const ranked = TAPPERS.map((row, index) => ({
    ...row,
    taps: row.base + ((phase + index) % 4) * row.step - ((phase * 2 + index) % 3) * 210,
  })).sort((a, b) => b.taps - a.taps);

  return (
    <div className="relative h-full overflow-hidden px-3.5 pt-3">
      {TAPPERS.map((row) => {
        const rank = ranked.findIndex((entry) => entry.name === row.name);
        const live = ranked[rank];
        return (
          <div
            key={row.name}
            className="hub-tappers-row absolute inset-x-3.5 flex items-center gap-2 rounded-xl border border-[oklch(1_0_0/0.08)] bg-[oklch(1_0_0/0.04)] px-2 py-1"
            style={{ top: 10 + rank * 34, transitionDuration: `${HUB_SHIFT_MS}ms` }}
          >
            <span className="w-5 text-[0.68rem] font-bold tabular-nums" style={{ color: row.tone }}>
              #{rank + 1}
            </span>
            <span className="size-4 rounded-full bg-[oklch(1_0_0/0.12)]" />
            <span className="min-w-0 flex-1 truncate text-[0.66rem]">{row.name}</span>
            <span className="text-[0.66rem] font-semibold tabular-nums text-muted-foreground">
              {(live?.taps ?? row.base).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const CONFETTI = [
  { left: "18%", delay: "0s", color: "#FE2C55" },
  { left: "34%", delay: "0.5s", color: "#E4E4E7" },
  { left: "52%", delay: "1s", color: "#FE2C55" },
  { left: "68%", delay: "1.5s", color: "#A1A1AA" },
  { left: "80%", delay: "2s", color: "#FE2C55" },
] as const;

export function TapGoalPreview() {
  const live = useLoopProgress(18, 92, HUB_LOOP_MS);
  const percent = Math.round(live);
  const current = Math.round((percent / 100) * 50_000);
  return (
    <div className="relative flex h-full flex-col justify-center gap-2 overflow-hidden px-3.5">
      {CONFETTI.map((dot) => (
        <span
          key={dot.left}
          className="hub-confetti pointer-events-none absolute bottom-8 size-1 rounded-full"
          style={{
            insetInlineStart: dot.left,
            background: dot.color,
            animationDelay: dot.delay,
          }}
        />
      ))}
      <div className="flex items-baseline justify-between">
        <span className="text-[0.66rem] font-bold uppercase tracking-wide">Goal: 50K taps</span>
        <span className="text-[0.66rem] font-semibold tabular-nums text-[#FE2C55]">{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[oklch(1_0_0/0.12)]">
        <div
          className="h-full rounded-full bg-[#FE2C55]"
          style={{
            width: `${live}%`,
            boxShadow: "0 0 10px -6px color-mix(in oklab, #FE2C55 36%, transparent)",
          }}
        />
      </div>
      <span className="text-[0.6rem] tabular-nums text-muted-foreground">
        {current.toLocaleString()} / 50,000 taps
      </span>
    </div>
  );
}

const MEDIA_TRACKS = ["Midnight Drive", "Lo-fi Keys", "Arena Drop"] as const;

export function MediaRequestPreview() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (reduced) return;
    let swap = 0;
    const cycle = window.setInterval(() => {
      setVisible(false);
      swap = window.setTimeout(() => {
        setIndex((current) => (current + 1) % MEDIA_TRACKS.length);
        setVisible(true);
      }, HUB_SHIFT_MS);
    }, HUB_BEAT_MS);
    return () => {
      window.clearInterval(cycle);
      window.clearTimeout(swap);
    };
  }, [reduced]);

  const track = MEDIA_TRACKS[index]!;
  const queued = [
    MEDIA_TRACKS[(index + 1) % MEDIA_TRACKS.length]!,
    MEDIA_TRACKS[(index + 2) % MEDIA_TRACKS.length]!,
  ];
  return (
    <div className="flex h-full flex-col justify-center overflow-hidden px-3">
      <div className="rounded-[8px] border border-[oklch(1_0_0/0.1)] bg-[oklch(1_0_0/0.05)] px-2 py-1 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="hub-media-art relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-[6px] bg-[oklch(1_0_0/0.07)]">
            <span className="absolute inset-0 bg-primary/12" />
            <span className="relative text-[0.5rem] text-foreground/85">▶</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.42rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Now playing
            </p>
            <p
              className="hub-fade truncate text-[0.64rem] font-medium leading-tight tracking-tight"
              style={{ opacity: visible ? 1 : 0 }}
            >
              {track}
            </p>
          </div>
        </div>
        <div className="relative mt-1 h-0.5 overflow-hidden rounded-full bg-[oklch(1_0_0/0.08)]">
          <div className="hub-media-progress absolute inset-y-0 start-0 h-full rounded-full bg-primary/70" />
        </div>
      </div>
      <div className="mt-2.5 flex flex-col gap-1">
        {queued.map((name, order) => (
          <div
            key={`${name}-${order}`}
            className="rounded-[8px] border border-[oklch(1_0_0/0.06)] bg-[oklch(1_0_0/0.02)] px-2 py-0.5"
          >
            <div className="flex items-center gap-2">
              <span className="w-3 text-[0.48rem] tabular-nums text-muted-foreground/70">{order + 2}</span>
              <span className="truncate text-[0.58rem] text-muted-foreground/80">{name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KicksGoalPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-4">
      <div className="flex items-center justify-between text-[0.58rem] text-[#53FC18]">
        <span>Kicks Goal</span>
        <span>42%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-[42%] rounded-full bg-[#53FC18]" />
      </div>
      <p className="text-[0.62rem] tabular-nums text-foreground/80" dir="ltr">
        420 / 1000
      </p>
    </div>
  );
}

export function ViewerCounterPreview() {
  return (
    <div className="grid h-full place-items-center">
      <div className="text-center">
        <p className="text-[0.55rem] uppercase tracking-[0.18em] text-[#bee1fc]">viewers</p>
        <p className="text-2xl font-semibold tabular-nums" dir="ltr">
          1,284
        </p>
      </div>
    </div>
  );
}

export function EventLabelsPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 px-4">
      {["آخر متابع", "آخر متبرع", "أفضل Bits"].map((label) => (
        <span key={label} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[0.62rem]">
          {label}
        </span>
      ))}
    </div>
  );
}
