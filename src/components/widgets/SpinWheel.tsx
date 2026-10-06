import { useEffect, useId, useRef, useState } from "react";

import { useLanguage } from "@/lib/i18n";
import { parseSpinConfig, type SpinPrize, type SpinState } from "@/lib/widgets";

/** Blue, green, orange, pink, beige — then the list repeats. */
export const WHEEL_SLICE_COLORS = [
  { fill: "#4C8DFF", ink: "#FFFFFF" },
  { fill: "#5DDC8A", ink: "#123524" },
  { fill: "#FF8A3D", ink: "#FFFFFF" },
  { fill: "#FF8FBF", ink: "#4A1230" },
  { fill: "#F3E0C4", ink: "#3F3428" },
] as const;

const PLACEHOLDER_SLICES = 6;
const SPIN_MS = 5000;
const REDUCED_SPIN_MS = 280;
const CX = 160;
const CY = 160;
const SLICE_RADIUS = 139;
const LABEL_RADIUS = 92;

type DrawnSlice = {
  label: string;
  fill: string;
  ink: string;
  start: number;
  span: number;
  /** Degrees clockwise from 12 o'clock. The pointer sits on this ray. */
  visualCenter: number;
  placeholder: boolean;
};

function mod(value: number, cycle: number) {
  return ((value % cycle) + cycle) % cycle;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function wheelSpinLockMs() {
  return prefersReducedMotion() ? REDUCED_SPIN_MS : SPIN_MS + 200;
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function polar(radius: number, clockwiseFromTop: number) {
  const rad = ((clockwiseFromTop - 90) * Math.PI) / 180;
  return {
    x: CX + Math.cos(rad) * radius,
    y: CY + Math.sin(rad) * radius,
  };
}

function wedgePath(start: number, end: number) {
  const span = end - start;
  if (span >= 359.9) {
    return `M ${CX} ${CY - SLICE_RADIUS} A ${SLICE_RADIUS} ${SLICE_RADIUS} 0 1 1 ${CX - 0.01} ${CY - SLICE_RADIUS} Z`;
  }
  const from = polar(SLICE_RADIUS, start);
  const to = polar(SLICE_RADIUS, end);
  const large = span > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${from.x} ${from.y} A ${SLICE_RADIUS} ${SLICE_RADIUS} 0 ${large} 1 ${to.x} ${to.y} Z`;
}

function fitLabel(label: string, maxWidth: number, fontSize: number) {
  const chars = Array.from(label);
  if (chars.length === 0 || maxWidth <= 0) return "";
  const widthOf = (value: string) =>
    Array.from(value).reduce((sum, ch) => {
      if (ch === "…") return sum + fontSize * 0.7;
      if (/[\u0600-\u06FF]/.test(ch)) return sum + fontSize * 0.92;
      return sum + fontSize * 0.56;
    }, 0);
  if (widthOf(label) <= maxWidth) return label;
  let count = chars.length;
  while (count > 1) {
    count -= 1;
    const sample = `${chars.slice(0, count).join("")}…`;
    if (widthOf(sample) <= maxWidth) return sample;
  }
  return "…";
}

function drawSlices(prizes: SpinPrize[]): DrawnSlice[] {
  const saved = prizes.filter((prize) => prize.label.trim().length > 0);
  const placeholder = saved.length === 0;
  const count = placeholder ? PLACEHOLDER_SLICES : saved.length;
  const span = 360 / count;
  return Array.from({ length: count }, (_, index) => {
    const color = WHEEL_SLICE_COLORS[index % WHEEL_SLICE_COLORS.length]!;
    const start = index * span;
    const full = span >= 359.9;
    return {
      label: placeholder ? "" : saved[index]!.label,
      fill: color.fill,
      ink: color.ink,
      start,
      span,
      visualCenter: full ? 0 : start + span / 2,
      placeholder,
    };
  });
}

function landRotation(current: number, center: number, reduced: boolean) {
  const desired = mod(-center, 360);
  if (reduced) {
    const turns = Math.round(current / 360);
    return turns * 360 + desired;
  }
  const currentMod = mod(current, 360);
  let delta = desired - currentMod;
  if (delta < 0) delta += 360;
  return current + 5 * 360 + delta;
}

/**
 * Short whoosh + tick. Must be called from the spin click handler.
 * A blocked audio context does not stop the wheel.
 */
export function playWheelSpinSound() {
  if (typeof window === "undefined") return;
  const Ctx =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const run = () => {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.38);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.44);

      const tickAt = now + 0.02;
      const tick = ctx.createOscillator();
      const tickGain = ctx.createGain();
      tick.type = "square";
      tick.frequency.setValueAtTime(740, tickAt);
      tickGain.gain.setValueAtTime(0.02, tickAt);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, tickAt + 0.04);
      tick.connect(tickGain);
      tickGain.connect(ctx.destination);
      tick.start(tickAt);
      tick.stop(tickAt + 0.05);

      window.setTimeout(() => {
        void ctx.close();
      }, 700);
    };
    if (ctx.state === "suspended") {
      void ctx.resume().then(run).catch(() => {
        void ctx.close();
      });
    } else {
      run();
    }
  } catch {
    // Autoplay policies can reject audio. The spin still runs.
  }
}

export function SpinWheelView({
  config,
  spin,
  onSpin,
  spinning = false,
}: {
  config: unknown;
  spin: SpinState | null;
  onSpin?: (() => void) | undefined;
  spinning?: boolean;
}) {
  const { t } = useLanguage();
  const uid = useId().replace(/:/g, "");
  const style = parseSpinConfig(config);
  const slices = drawSlices(style.prizes);
  const placeholder = slices[0]?.placeholder ?? true;
  const winnerIndex =
    !placeholder && spin?.result
      ? slices.findIndex((slice) => slice.label === spin.result)
      : -1;
  const center =
    winnerIndex >= 0 ? slices[winnerIndex]!.visualCenter : (slices[0]?.visualCenter ?? 0);
  const rawTitle =
    config && typeof config === "object" && typeof (config as { title?: unknown }).title === "string"
      ? (config as { title: string }).title.trim()
      : style.title;

  const [rotation, setRotation] = useState(0);
  const [turning, setTurning] = useState(false);
  const rotationRef = useRef(0);
  const lastNonce = useRef<number | null>(null);
  const animatingUntil = useRef(0);

  const applyRotation = (value: number) => {
    rotationRef.current = value;
    setRotation(value);
  };

  useEffect(() => {
    const nonce = spin?.nonce ?? 0;
    const reduced = prefersReducedMotion();
    if (lastNonce.current === null) {
      lastNonce.current = nonce;
      applyRotation(mod(-center, 360));
      return;
    }
    if (nonce === lastNonce.current) {
      if (performance.now() < animatingUntil.current) return;
      const desired = mod(-center, 360);
      const turns = Math.floor(rotationRef.current / 360);
      applyRotation(turns * 360 + desired);
      return;
    }
    lastNonce.current = nonce;
    if (winnerIndex < 0) return;

    const from = rotationRef.current;
    const to = landRotation(from, center, reduced);
    if (reduced || to === from) {
      applyRotation(to);
      return;
    }

    const started = performance.now();
    animatingUntil.current = started + SPIN_MS;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / SPIN_MS);
      const value = from + (to - from) * easeOutCubic(t);
      applyRotation(value);
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [spin?.nonce, center, winnerIndex]);

  const canSpin = Boolean(onSpin) && !placeholder && !spinning && !turning;

  return (
    <div
      className="flex w-[min(100%,22.5rem)] flex-col items-center gap-4 rounded-3xl border border-zinc-800 bg-zinc-950 px-5 py-5 text-zinc-100 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.9)]"
      style={{ fontFamily: style.fontFamily }}
    >
      {rawTitle ? (
        <p className="max-w-full truncate text-center text-xs font-semibold tracking-[0.16em] text-zinc-300" dir="auto">
          {rawTitle}
        </p>
      ) : null}

      <div className="relative aspect-square w-full max-w-[320px]" data-wheel-slices={slices.length}>
        <div className="absolute inset-0 will-change-transform" style={{ transform: `rotate(${rotation}deg)` }}>
          <svg viewBox="0 0 320 320" className="size-full overflow-visible" aria-hidden>
            <defs>
              {slices.map((slice, index) => (
                <clipPath key={`clip-${index}`} id={`${uid}-slice-${index}`}>
                  <path d={wedgePath(slice.start, slice.start + slice.span)} />
                </clipPath>
              ))}
            </defs>
            {slices.map((slice, index) => {
              const mid = slice.visualCenter;
              const point = polar(LABEL_RADIUS, mid);
              const full = slice.span >= 359.9;
              const chord = full
                ? LABEL_RADIUS * 1.7
                : 2 * LABEL_RADIUS * Math.sin((slice.span * Math.PI) / 360);
              const radial = !full && slice.span < 36;
              const maxWidth = radial ? SLICE_RADIUS - 52 : Math.max(28, chord * 0.78);
              const fontSize = radial
                ? Math.min(15, Math.max(10, chord * 0.45))
                : Math.min(18, Math.max(12, chord * 0.2));
              const screenMid = mod(mid + rotation, 360);
              const flip = screenMid > 90 && screenMid < 270;
              const textRotation = (radial ? mid - 90 : mid) + (flip ? 180 : 0);
              const label = slice.placeholder ? "" : fitLabel(slice.label, maxWidth, fontSize);
              return (
                <g key={`slice-${index}`}>
                  <path
                    d={wedgePath(slice.start, slice.start + slice.span)}
                    fill={slice.fill}
                    stroke="#18181B"
                    strokeWidth="1.4"
                    data-label={slice.placeholder ? undefined : slice.label}
                  />
                  {label ? (
                    <text
                      x={point.x}
                      y={point.y}
                      fill={slice.ink}
                      fontSize={fontSize}
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      unicodeBidi="plaintext"
                      clipPath={`url(#${uid}-slice-${index})`}
                      transform={`rotate(${textRotation} ${point.x} ${point.y})`}
                      style={{ fontFamily: style.fontFamily }}
                    >
                      {label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>

        <svg viewBox="0 0 320 320" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          <circle cx={CX} cy={CY} r="148" fill="none" stroke="#3F3F46" strokeWidth="10" />
          <circle cx={CX} cy={CY} r="142" fill="none" stroke="#E4E4E7" strokeWidth="5" />
          <circle cx={CX} cy={CY} r="18" fill="#18181B" stroke="#A1A1AA" strokeWidth="4" />
        </svg>

        <svg
          viewBox="0 0 36 30"
          className="pointer-events-none absolute top-1.5 z-10 w-8"
          style={{ left: "50%", transform: "translateX(-50%)" }}
          aria-hidden
        >
          <path
            d="M18 28 L3.5 4.5 H32.5 Z"
            fill="#FAFAFA"
            stroke="#09090B"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {onSpin ? (
        <button
          type="button"
          onClick={() => {
            if (!canSpin) return;
            playWheelSpinSound();
            setTurning(true);
            window.setTimeout(() => setTurning(false), wheelSpinLockMs());
            onSpin();
          }}
          disabled={!canSpin}
          className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          {spinning || turning ? "…" : t("widget.wheel.spin")}
        </button>
      ) : null}
    </div>
  );
}
