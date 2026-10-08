import { type CSSProperties } from "react";
import { CheckCircle2, Expand, Minimize2, RotateCcw, Trophy } from "lucide-react";

import { PlatformIcon } from "@/components/widgets/PlatformIcon";
import { useLanguage } from "@/lib/i18n";

export type DrawPhase = "idle" | "shuffling" | "revealing" | "settled";
export type ClaimState = "pending" | "confirmed" | "expired";

export const platformLabel = (platform: string) =>
  ({ KICK: "Kick", TWITCH: "Twitch", YOUTUBE: "YouTube", TIKTOK: "TikTok" })[
    platform.toUpperCase()
  ] ?? platform;

function entrySpot(seed: string, index: number) {
  let hash = 2166136261;
  for (const char of `${seed}-${index}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const value = Math.abs(hash);
  return {
    left: 12 + (value % 76),
    top: 14 + (Math.floor(value / 97) % 70),
    driftX: 10 + (value % 18),
    driftY: 8 + (Math.floor(value / 53) % 14),
    duration: 7.5 + (value % 5),
    delay: (value % 9) * 0.12,
  };
}

export function GiveawayDisplay({
  participants,
  winner,
  phase,
  claimState,
  claimLeft,
  keyword,
  lastWinner,
  expanded,
  layout = "glass",
  transparent = false,
  onToggleExpand,
  onReroll,
}: {
  participants: Array<{ id: string; username: string; platform: string }>;
  winner: { username: string; platform: string } | null;
  phase: DrawPhase;
  claimState: ClaimState;
  claimLeft: number;
  keyword: string;
  lastWinner?: { username: string; platform: string } | null | undefined;
  expanded: boolean;
  layout?: "glass" | "direct" | "bold";
  /** OBS browser source: drop the frame/controls and render on transparency. */
  transparent?: boolean;
  onToggleExpand?: (() => void) | undefined;
  onReroll?: (() => void) | undefined;
}) {
  const { t } = useLanguage();
  const keywordLabel = keyword || "+1";

  const phaseLabel =
    phase === "shuffling"
      ? t("giveaway.shuffling")
      : phase === "revealing"
        ? t("giveaway.revealing")
        : winner
          ? t("giveaway.winnerSelected")
          : t("giveaway.liveEntries");

  return (
    <section
      className={
        transparent
          ? `h-full w-full bg-transparent ${layout === "bold" ? "border-2 border-white/20" : ""}`
          : `flex h-full min-h-[280px] w-full flex-col ${layout === "direct" ? "bg-zinc-950" : expanded ? "bg-background" : ""} ${layout === "bold" ? "rounded-2xl border-2 border-white/20" : ""}`
      }
    >
      {!transparent ? (
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`size-1.5 rounded-full ${
              phase === "shuffling" || phase === "revealing" ? "bg-kick animate-pulse" : "bg-primary"
            }`}
          />
          <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{phaseLabel}</p>
          {onToggleExpand ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="ms-auto text-muted-foreground hover:text-foreground"
              aria-label={expanded ? t("giveaway.collapse") : t("giveaway.expand")}
              title={expanded ? t("giveaway.collapse") : t("giveaway.expand")}
            >
              {expanded ? <Minimize2 className="size-4" aria-hidden /> : <Expand className="size-4" aria-hidden />}
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className={`giveaway-cloud relative isolate overflow-hidden ${
          transparent ? "h-full w-full" : "min-h-[280px] flex-1"
        }`}
      >
        {participants.length === 0 ? (
          transparent ? null : (
            <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-muted-foreground">
              {t("giveaway.joinHint", { keyword: keywordLabel })}
            </div>
          )
        ) : (
          <div
            className={`giveaway-entries absolute inset-0 ${phase === "shuffling" ? "is-shuffling" : ""} ${phase === "revealing" || phase === "settled" ? "is-revealing" : ""}`}
            aria-label={t("giveaway.liveEntries")}
          >
            {participants.map((participant, index) => {
              const spot = entrySpot(participant.id, index);
              const isWinner =
                Boolean(winner) &&
                participant.username.toLowerCase() === winner?.username.toLowerCase() &&
                participant.platform.toUpperCase() === winner?.platform.toUpperCase();
              const style = {
                left: `${spot.left}%`,
                top: `${spot.top}%`,
                "--drift-x": `${index % 2 === 0 ? spot.driftX : -spot.driftX}px`,
                "--drift-y": `${index % 3 === 0 ? -spot.driftY : spot.driftY}px`,
                "--float-duration": `${spot.duration}s`,
                "--entry-i": Math.min(index, 12),
                "--float-delay": `${spot.delay}s`,
              } as CSSProperties;
              return (
                <div
                  key={participant.id}
                  className={`giveaway-entry-slot ${isWinner ? "is-winner" : "is-other"}`}
                  style={style}
                >
                  <div className="giveaway-entry">
                    <PlatformIcon platform={participant.platform} size={14} />
                    <span dir="auto">{participant.username}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {winner && (phase === "revealing" || phase === "settled") ? (
          <div className="giveaway-winner-reveal absolute inset-0 z-20 grid place-items-center px-6 text-center">
            <div className="flex max-w-full flex-col items-center">
              <PlatformIcon platform={winner.platform} size={28} />
              <p className="mt-3 max-w-full truncate text-4xl font-bold text-kick [text-shadow:0_0_24px_color-mix(in_oklab,var(--kick)_55%,transparent)] sm:text-5xl" dir="auto">
                {winner.username}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("giveaway.from")}: {platformLabel(winner.platform)}
              </p>

              {phase === "settled" && claimState === "pending" ? (
                <div className="mt-5">
                  <p className="text-sm font-medium text-foreground">{t("giveaway.pendingConfirm")}</p>
                  <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-foreground">
                    {Math.floor(claimLeft / 60)}:{String(claimLeft % 60).padStart(2, "0")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("giveaway.claimHint", { keyword: keywordLabel })}
                  </p>
                </div>
              ) : phase === "settled" && claimState === "confirmed" ? (
                <p className="mt-5 flex items-center gap-2 text-sm text-kick">
                  <CheckCircle2 className="size-4" aria-hidden />
                  {t("giveaway.confirmed")}
                </p>
              ) : phase === "settled" && claimState === "expired" && onReroll && !transparent ? (
                <button
                  type="button"
                  onClick={onReroll}
                  className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[0.82rem] text-kick hover:bg-white/5"
                >
                  <RotateCcw className="size-4" aria-hidden />
                  {t("giveaway.reroll")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {lastWinner && !winner && !transparent ? (
          <p className="absolute bottom-3 start-3 z-30 flex items-center gap-2 text-xs text-muted-foreground">
            <Trophy className="size-3.5" aria-hidden />
            {t("giveaway.lastWinner")}: <span dir="auto">{lastWinner.username}</span> ({lastWinner.platform})
          </p>
        ) : null}
      </div>
    </section>
  );
}
