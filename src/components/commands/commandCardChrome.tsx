import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Visual tokens taken from the custom-command face card. */
export const commandCardClass =
  "flex h-full min-w-0 flex-col rounded-[20px] border border-white/[0.06] bg-[#101114] p-3.5 text-start transition-colors duration-200 hover:border-white/[0.12] hover:bg-[#141519]";

export const commandCardOffClass = "bg-[#0c0d10]";

export const commandTitleClass = "min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100";

export const commandBodyClass =
  "line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-zinc-400 [overflow-wrap:anywhere]";

export const commandIconButtonClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100";

export const ALERT_CARD_GRID = "grid grid-cols-1 items-start gap-3.5 sm:grid-cols-2 xl:grid-cols-3";

export function StatusDot({ enabled }: { enabled: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", enabled ? "bg-emerald-600" : "bg-zinc-600")}
    />
  );
}

export function EnableSwitch({
  enabled,
  onLabel,
  offLabel,
  onToggle,
}: {
  enabled: boolean;
  onLabel: string;
  offLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? onLabel : offLabel}
      onClick={onToggle}
      className={cn(
        "relative h-3.5 w-6 shrink-0 rounded-full transition-colors duration-200",
        enabled ? "bg-emerald-400/25" : "bg-zinc-700/80",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[2px] size-2.5 rounded-full transition-[inset-inline-start,background-color] duration-200 ease-out",
          enabled ? "start-[0.7rem] bg-white" : "start-[2px] bg-zinc-400",
        )}
      />
    </button>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return <header className="flex items-center gap-2">{children}</header>;
}

export function CardContent({ children }: { children: ReactNode }) {
  return <div className="mt-2 min-w-0 flex-1">{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <footer className={cn("mt-3 flex items-center justify-between gap-2", className)}>{children}</footer>;
}

export function timerIntervalPhrase(minutes: number, lang: "ar" | "en"): string {
  const count = Math.min(1440, Math.max(1, Math.round(minutes) || 1));
  if (lang !== "ar") return count === 1 ? "every 1 minute" : `every ${count} minutes`;
  if (count === 1) return "كل دقيقة";
  if (count === 2) return "كل دقيقتين";
  if (count <= 10) return `كل ${count} دقائق`;
  return `كل ${count} دقيقة`;
}
