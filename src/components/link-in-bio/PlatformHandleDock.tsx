import { useMemo, useState } from "react";
import { toast } from "sonner";

import { LinkInBioPlatformLogo } from "@/components/link-in-bio/LinkInBioPlatformLogo";
import { PlatformLivePreview } from "@/components/link-in-bio/PlatformLivePreview";
import { Input } from "@/components/ui/input";
import {
  normalizeCustomDrafts,
  type CustomLinkDraft,
  type HandleMap,
  type SocialPlatform,
} from "@/hooks/useLinkInBioDraft";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import {
  bumpPlatformUsage,
  customLinkFaviconUrl,
  hostnameFromLink,
  LINK_PLATFORMS,
  looksLikeHttpUrl,
  platformAccent,
  readPlatformUsageCounts,
  sanitizeHandle,
  sanitizeWhatsappCommunityUrl,
  sortPlatformsByUsage,
  urlFromHandle,
  usesFullUrl,
  type LinkPlatform,
} from "@/lib/linkInBio";
import { cn } from "@/lib/utils";

type PlatformMeta = (typeof LINK_PLATFORMS)[number];
type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

type DockItem =
  | { key: SocialPlatform; platform: SocialPlatform; label: string; hint: string }
  | { key: string; platform: "custom"; slot: CustomLinkDraft; label: string; hint: string };

type OpenKey = string;

function platformLabel(id: LinkPlatform, metaLabel: string, t: Translate) {
  if (id === "whatsapp") return t("linkInBio.dock.whatsappCommunity");
  if (id === "custom") return t("linkInBio.dock.customLink");
  return metaLabel;
}

const PLATFORM_IDLE_HINT: Partial<Record<LinkPlatform, TranslationKey>> = {
  kick: "linkInBio.dock.hint.kick",
  twitch: "linkInBio.dock.hint.twitch",
  youtube: "linkInBio.dock.hint.youtube",
  tiktok: "linkInBio.dock.hint.tiktok",
  instagram: "linkInBio.dock.hint.instagram",
  x: "linkInBio.dock.hint.x",
  discord: "linkInBio.dock.hint.discord",
  snapchat: "linkInBio.dock.hint.snapchat",
  custom: "linkInBio.dock.hint.custom",
};

function platformHint(id: LinkPlatform, value: string, filled: boolean, fallbackHint: string, t: Translate) {
  if (id === "whatsapp") {
    if (!value) return t("linkInBio.dock.hint.whatsappEmpty");
    return sanitizeWhatsappCommunityUrl(value) ? value : t("linkInBio.dock.hint.whatsappInvalid");
  }
  if (id === "custom") {
    const host = hostnameFromLink(value);
    if (host) return host;
    return filled ? value : t("linkInBio.dock.hint.custom");
  }
  if (filled && !usesFullUrl(id) && !looksLikeHttpUrl(value)) return urlFromHandle(id, value);
  const idleKey = PLATFORM_IDLE_HINT[id];
  return idleKey ? t(idleKey) : fallbackHint;
}

function fieldPlaceholder(id: LinkPlatform, hint: string, fullUrl: boolean, t: Translate) {
  if (id === "whatsapp") return t("linkInBio.dock.placeholder.whatsapp");
  if (id === "instagram") return t("linkInBio.dock.placeholder.instagram");
  if (id === "snapchat") return t("linkInBio.dock.placeholder.snapchat");
  if (id === "tiktok") return t("linkInBio.dock.placeholder.tiktok");
  if (id === "x") return t("linkInBio.dock.placeholder.x");
  if (id === "discord") return t("linkInBio.dock.placeholder.discord");
  if (fullUrl) {
    const idleKey = PLATFORM_IDLE_HINT[id];
    return idleKey ? t(idleKey) : hint;
  }
  return t("linkInBio.dock.handlePlaceholder");
}

function validatePlatformValue(platform: LinkPlatform, value: string, t: Translate): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (platform === "whatsapp") {
    return sanitizeWhatsappCommunityUrl(trimmed) ? null : t("linkInBio.dock.err.whatsapp");
  }
  if (!urlFromHandle(platform, trimmed)) {
    if (platform === "custom") return t("linkInBio.dock.err.customUrl");
    return t("linkInBio.dock.err.handleOrUrl");
  }
  return null;
}

function filledMap(handles: HandleMap): Partial<Record<LinkPlatform, boolean>> {
  const out: Partial<Record<LinkPlatform, boolean>> = {};
  for (const platform of LINK_PLATFORMS) {
    if (platform.id === "custom") {
      out.custom = handles.custom.some((slot) => Boolean(urlFromHandle("custom", slot.url)));
      continue;
    }
    out[platform.id] = Boolean(handles[platform.id]?.trim());
  }
  return out;
}

function dockItems(platforms: ReadonlyArray<PlatformMeta>, handles: HandleMap, t: Translate): DockItem[] {
  const usage = readPlatformUsageCounts();
  const filled = filledMap(handles);
  const ordered = sortPlatformsByUsage(platforms, { filled, usage });

  return ordered.flatMap((platform) => {
    if (platform.id !== "custom") {
      return [
        {
          key: platform.id,
          platform: platform.id,
          label: platformLabel(platform.id, platform.label, t),
          hint: platform.hint,
        } satisfies DockItem,
      ];
    }
    return (handles.custom.length > 0 ? handles.custom : [{ id: "custom-empty", url: "" }]).map(
      (slot, index) => ({
        key: `custom:${slot.id}`,
        platform: "custom" as const,
        slot,
        label: index === 0 ? t("linkInBio.dock.customLink") : t("linkInBio.dock.customLinkN", { n: index + 1 }),
        hint: platform.hint,
      }),
    );
  });
}

function maybeBumpUsage(platform: LinkPlatform, previous: string, next: string) {
  const wasValid = Boolean(urlFromHandle(platform, previous));
  const isValid = Boolean(urlFromHandle(platform, next));
  if (!wasValid && isValid) bumpPlatformUsage(platform);
}

export function PlatformHandleDock({
  platforms,
  handles,
  onChange,
  tone = "wizard",
  youtubeLatestEnabled,
}: {
  platforms: ReadonlyArray<PlatformMeta>;
  handles: HandleMap;
  onChange: (next: HandleMap) => void;
  tone?: "wizard" | "inspector";
  youtubeLatestEnabled?: boolean;
}) {
  const { t } = useLanguage();
  const items = useMemo(() => dockItems(platforms, handles, t), [platforms, handles, t]);
  const firstFilled = items.find((item) =>
    item.platform === "custom" ? Boolean(item.slot.url) : Boolean(handles[item.platform]),
  )?.key;
  const [openKey, setOpenKey] = useState<OpenKey | null>(firstFilled ?? null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const open = items.find((item) => item.key === openKey) ?? null;
  const value =
    open?.platform === "custom" ? open.slot.url : open ? handles[open.platform] : "";
  const filled = Boolean(value);
  const fullUrl = open ? usesFullUrl(open.platform) : false;
  const whatsappInvalid =
    open?.platform === "whatsapp" && Boolean(value) && !sanitizeWhatsappCommunityUrl(value);
  const accent = open ? platformAccent(open.platform) : null;
  const inspector = tone === "inspector";
  const hasAnyFilled = items.some((item) =>
    item.platform === "custom"
      ? Boolean(urlFromHandle("custom", item.slot.url))
      : Boolean(handles[item.platform]),
  );

  const toggle = (key: OpenKey) => {
    setFieldError(null);
    setOpenKey((current) => (current === key ? null : key));
  };

  const patchSocial = (id: SocialPlatform, nextValue: string) => {
    maybeBumpUsage(id, handles[id], nextValue);
    setFieldError(null);
    onChange({ ...handles, [id]: nextValue });
  };

  const patchCustom = (slotId: string, nextValue: string) => {
    const previous = handles.custom.find((slot) => slot.id === slotId)?.url ?? "";
    maybeBumpUsage("custom", previous, nextValue);
    setFieldError(null);
    const custom = normalizeCustomDrafts(
      (handles.custom.length > 0 ? handles.custom : [{ id: slotId, url: "" }]).map((slot) =>
        slot.id === slotId ? { ...slot, url: nextValue } : slot,
      ),
    );
    onChange({ ...handles, custom });
  };

  const onBlurValidate = () => {
    if (!open) return;
    const error = validatePlatformValue(open.platform, value, t);
    setFieldError(error);
    if (error) {
      toast.error(error);
      return;
    }
    if (value.trim() && open.platform === "custom") toast.success(t("linkInBio.dock.toast.linkOk"));
  };

  return (
    <div className="grid gap-3">
      <div
        className="flex gap-5 overflow-x-auto pb-1 scroll-smooth sm:gap-8 [scrollbar-width:thin]"
        role="tablist"
        aria-label={t("linkInBio.dock.platformsAria")}
      >
        {items.map((item) => {
          const active = openKey === item.key;
          const hasValue =
            item.platform === "custom" ? Boolean(item.slot.url) : Boolean(handles[item.platform]);
          const favicon =
            item.platform === "custom" ? customLinkFaviconUrl(item.slot.url) : null;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={item.label}
              title={item.label}
              onClick={() => toggle(item.key)}
              className={cn(
                "flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-0 bg-transparent p-1.5 shadow-none touch-manipulation",
                "transition-[transform,opacity] duration-200 ease-out",
                "hover:bg-transparent focus-visible:bg-white/5 focus-visible:outline-none",
                active ? "scale-110 opacity-100" : "opacity-75 hover:scale-105 hover:opacity-100",
                inspector && "min-h-10 min-w-10",
              )}
            >
              <LinkInBioPlatformLogo
                platform={item.platform}
                size={inspector ? 20 : 24}
                faviconUrl={favicon}
              />
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors duration-200",
                  active ? "bg-white" : hasValue ? "bg-white/70" : "bg-transparent",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {!hasAnyFilled && !open ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-[0.78rem] leading-relaxed text-white/40">
          {t("linkInBio.dock.empty")}
        </p>
      ) : null}

      {open && accent ? (
        <div
          className={cn(
            "rounded-[1.35rem] border p-4 backdrop-blur-xl transition-[border-color,box-shadow] duration-300 sm:p-5",
            inspector && "rounded-xl p-4",
            filled && !whatsappInvalid && !fieldError
              ? "border-white/12 bg-white/[0.06]"
              : "border-[rgba(255,255,255,0.08)] bg-white/[0.035]",
            (whatsappInvalid || fieldError) && "border-rose-400/35",
          )}
          style={
            filled && !whatsappInvalid && !fieldError
              ? {
                  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent.css} 38%, transparent), 0 18px 36px -28px ${accent.css}`,
                }
              : undefined
          }
        >
          <div className="mb-4 flex items-center gap-3">
            <LinkInBioPlatformLogo
              platform={open.platform}
              size={24}
              faviconUrl={
                open.platform === "custom" ? customLinkFaviconUrl(value) : null
              }
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">{open.label}</p>
              <p className="truncate text-[0.68rem] text-white/40" dir="auto">
                {platformHint(open.platform, value, filled, open.hint, t)}
              </p>
            </div>
          </div>
          <Input
            key={open.key}
            autoFocus
            className={
              inspector
                ? "h-11 transition-[border-color,box-shadow] duration-200"
                : "h-11 rounded-2xl border-[rgba(255,255,255,0.08)] bg-black/35 text-sm placeholder:text-white/25 focus-visible:border-white/40 focus-visible:ring-2 transition-[border-color,box-shadow] duration-200"
            }
            style={
              inspector
                ? undefined
                : { ["--tw-ring-color" as string]: `color-mix(in oklab, ${accent.css} 55%, white)` }
            }
            dir="auto"
            placeholder={fieldPlaceholder(open.platform, open.hint, fullUrl, t)}
            value={value}
            aria-invalid={Boolean(fieldError || whatsappInvalid)}
            onBlur={onBlurValidate}
            onChange={(event) => {
              const next = event.target.value;
              if (open.platform === "custom") {
                patchCustom(open.slot.id, next);
                return;
              }
              const keepRaw = fullUrl || looksLikeHttpUrl(next);
              patchSocial(open.platform, keepRaw ? next : sanitizeHandle(next));
            }}
          />
          {fieldError || whatsappInvalid ? (
            <p className="mt-2 text-[0.72rem] text-rose-300" role="alert">
              {fieldError ?? t("linkInBio.dock.err.whatsapp")}
            </p>
          ) : null}
          <PlatformLivePreview
            platform={open.platform}
            value={value}
            compact={inspector}
            youtubeLatestEnabled={youtubeLatestEnabled}
          />
        </div>
      ) : null}
    </div>
  );
}
