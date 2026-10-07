import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, Copy, Lock, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PLATFORM_META, sortHubPlatforms, type PlatformId } from "@/components/hub/platforms";
import { HubPlatformDot } from "@/components/hub/HubPlatformDot";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/lib/i18n";
import { widgetOverlayUrl } from "@/lib/widgetOverlayUrl";

export type ToolCardProps = {
  name: string;
  description: string;
  category: string;
  icon: LucideIcon;
  preview: ReactNode;
  status?: string | undefined;
  live?: boolean;
  actionLabel: string;
  disabled?: boolean;
  publicToken?: string | undefined;
  /** Overrides the default `/overlay/<token>` browser-source URL. */
  overlayUrl?: string | undefined;
  onOpen: () => void;
  onDelete?: (() => void) | undefined;
  deleteLabel?: string;
  removing?: boolean;
  locked?: boolean;
  lockLabel?: string;
  platforms?: PlatformId[];
  comingSoon?: boolean;
};

export function ToolCard({
  name,
  description,
  icon: Icon,
  preview,
  status,
  live = false,
  actionLabel,
  disabled = false,
  publicToken,
  overlayUrl,
  onOpen,
  onDelete,
  deleteLabel = "Delete widget",
  removing = false,
  locked = false,
  lockLabel = "Subscription required",
  platforms = [],
  comingSoon = false,
}: ToolCardProps) {
  const { t } = useLanguage();
  const resolvedDeleteLabel = deleteLabel === "Delete widget" ? t("home.delete") : deleteLabel;
  const [copied, setCopied] = useState(false);

  const previewLocked = locked || comingSoon;
  const overlayLabel = comingSoon ? t("home.comingSoon") : lockLabel;

  const copyLabel = t("home.copyObs");

  const copy = async () => {
    if (previewLocked || disabled || status === "Paused") return;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const url = overlayUrl ?? (publicToken ? widgetOverlayUrl(origin, publicToken) : null);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    setCopied(true);
    toast.success(t("common.copied"));
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className={`glass-3d glass-lift relative flex h-full min-h-[18.5rem] flex-col overflow-visible rounded-2xl p-5 text-start transition-[opacity,transform] duration-300 ease-out ${
        removing ? "pointer-events-none scale-95 opacity-0" : "scale-100 opacity-100"
      } ${comingSoon ? "pointer-events-none opacity-60" : ""}`}
    >
      {onDelete && !locked && !comingSoon ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`${resolvedDeleteLabel}: ${name}`}
          title={resolvedDeleteLabel}
          className="absolute top-3 start-3 z-20 rounded-xl border border-[oklch(1_0_0/0.1)] bg-black/70 p-1.5 text-muted-foreground shadow-sm transition-opacity hover:text-red-400"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      ) : null}

      <div className="relative h-[132px] overflow-hidden rounded-xl border border-[oklch(1_0_0/0.06)] bg-[oklch(1_0_0/0.02)]">
        <div className={`h-full overflow-hidden ${previewLocked ? "blur-[3px] saturate-50" : ""}`}>
          {preview}
        </div>
        {previewLocked ? (
          <button
            type="button"
            onClick={() => {
              if (comingSoon) return;
              onOpen();
            }}
            disabled={comingSoon}
            className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[1px] disabled:cursor-not-allowed"
            aria-label={overlayLabel}
          >
            <span
              className="flex items-center gap-1.5 rounded-full border border-[oklch(1_0_0/0.14)] px-3 py-1.5 text-[0.66rem] font-semibold text-foreground"
              style={{ background: "rgba(10, 10, 10, 0.85)" }}
            >
              <Lock className="size-3.5 text-primary" aria-hidden />
              {overlayLabel}
            </span>
          </button>
        ) : null}
      </div>

      <div className="relative mt-3.5 flex items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-[oklch(1_0_0/0.08)] bg-[oklch(1_0_0/0.04)]">
          <Icon className="size-4 text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 overflow-visible">
            <p className="truncate text-[0.9rem] font-medium tracking-tight">{name}</p>
            {platforms.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 overflow-visible" aria-hidden>
                {sortHubPlatforms(platforms).map((id) => (
                  <HubPlatformDot key={id} id={id} title={PLATFORM_META[id].label.ar} />
                ))}
              </span>
            ) : null}
            {comingSoon ? (
              <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[0.62rem] text-muted-foreground">
                {t("home.comingSoon")}
              </span>
            ) : locked ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[0.62rem] font-medium text-primary">
                <Lock className="size-2.5" aria-hidden />
                Pro
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-[0.74rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      <div className="relative mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="flex items-center gap-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {status ? (
            <span
              className={`size-1.5 rounded-full ${live ? "bg-primary" : "bg-muted-foreground/50"}`}
              aria-hidden
            />
          ) : null}
          {status ?? ""}
        </span>

        <div className="flex items-center gap-1.5">
          {(publicToken || overlayUrl) && !locked && !comingSoon && !disabled && status !== "Paused" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void copy()}
                  aria-label={copyLabel}
                  className="rounded-xl border border-[oklch(1_0_0/0.08)] p-1.5 text-muted-foreground transition-opacity hover:opacity-80"
                >
                  {copied ? (
                    <Check className="size-3.5 text-primary" aria-hidden />
                  ) : (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{copyLabel}</TooltipContent>
            </Tooltip>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (comingSoon) return;
              onOpen();
            }}
            disabled={disabled || comingSoon}
            className={`flex items-center gap-1 rounded-xl px-2 py-1 text-[0.74rem] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-55 ${
              locked ? "text-primary" : "text-muted-foreground hover:opacity-80"
            }`}
          >
            {locked || comingSoon ? <Lock className="size-3" aria-hidden /> : null}
            {comingSoon ? t("home.comingSoon") : locked ? lockLabel : actionLabel}
            {locked || comingSoon ? null : <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}
