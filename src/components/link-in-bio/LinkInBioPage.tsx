import { Check, Copy, Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LinkInBioAmbient } from "@/components/link-in-bio/LinkInBioAmbient";
import { LinkInBioBento } from "@/components/link-in-bio/LinkInBioBento";
import { LinkInBioStreamCard } from "@/components/link-in-bio/LinkInBioStreamCard";
import { LinkInBioText } from "@/components/link-in-bio/LinkInBioText";
import { useLanguage } from "@/lib/i18n";
import { publicBioPath, resolveBioFont, type PublicLinkInBio } from "@/lib/linkInBio";
import { cn } from "@/lib/utils";

export function LinkInBioPage({
  data,
  preview = false,
  highlightId = null,
  arrangeMode = false,
  onSelectTile,
  onMoveTile,
  onResizeTile,
}: {
  data: PublicLinkInBio;
  preview?: boolean;
  highlightId?: string | null;
  arrangeMode?: boolean;
  onSelectTile?: ((id: string) => void) | undefined;
  onMoveTile?: ((id: string, gridX: number, gridY: number) => void) | undefined;
  onResizeTile?: ((id: string, colSpan: number, rowSpan: number, gridX?: number, gridY?: number) => void) | undefined;
}) {
  const { profile, theme, links, livePlatforms, tilePreviews, stream, schedule } = data;
  const font = resolveBioFont(theme);
  const glass = theme.surfaceStyle === "glass";
  const alpha = Math.round((theme.glassIntensity / 100) * 42);
  const cardBg = glass
    ? `rgba(255,255,255,${(alpha / 255).toFixed(3)})`
    : "color-mix(in oklab, var(--bio-fg) 6%, var(--bio-bg))";
  const border = theme.hairlineBorders
    ? "1px solid color-mix(in oklab, var(--bio-fg) 16%, transparent)"
    : "1px solid transparent";
  return (
    <div
      className={cn("relative overflow-x-hidden", preview ? "w-full" : "min-h-screen")}
      style={{
        fontFamily: font.stack,
        backgroundColor: theme.paletteBg,
        backgroundImage: "none",
        color: theme.paletteFg,
        ["--bio-bg" as string]: theme.paletteBg,
        ["--bio-fg" as string]: theme.paletteFg,
        ["--bio-accent" as string]: theme.paletteAccent,
        ["--bio-muted" as string]: theme.paletteMuted,
      }}
    >
      <BioFontLoader font={font} />
      <LinkInBioAmbient theme={theme} />
      <div
        className={cn(
          "@container relative mx-auto flex w-full flex-col",
          preview
            ? "w-full max-w-full px-3 py-6 sm:px-4"
            : "max-w-[min(94vw,76rem)] px-3 py-10 sm:px-4 sm:py-12 md:px-5 md:py-16 lg:px-6",
        )}
      >
        <Header
          profile={profile}
          compact={theme.layout === "grid"}
          border={border}
        />
        <LinkInBioStreamCard stream={stream} glass={glass} border={border} />
        {theme.widgetBannerUrl ? (
          <img src={theme.widgetBannerUrl} alt="" className="mt-6 w-full rounded-2xl object-cover" style={{ border, maxHeight: 180 }} />
        ) : null}
        {theme.countdownEnabled ? <CountdownCard theme={theme} border={border} glass={glass} /> : null}
        {schedule ? (
          <a
            href={schedule.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 min-h-11 rounded-2xl px-4 py-3 text-sm font-semibold"
            style={{
              background: cardBg,
              border,
              color: "var(--bio-accent)",
            }}
          >
            <LinkInBioText as="span">{schedule.title}</LinkInBioText>
          </a>
        ) : null}

        {links.length === 0 ? (
          <EmptyLinksPlaceholder muted={theme.paletteMuted} border={border} glass={glass} />
        ) : (
          <div className="mt-8 sm:mt-10">
            <LinkInBioBento
              links={links}
              theme={theme}
              livePlatforms={livePlatforms}
              tilePreviews={tilePreviews}
              selectedId={highlightId}
              arrangeMode={arrangeMode}
              onSelect={onSelectTile}
              onMove={onMoveTile}
              onResize={onResizeTile}
            />
          </div>
        )}
        {!preview ? (
          <footer className="mt-12 flex justify-center sm:mt-16">
            <PublicCopyLink slug={profile.slug} accent={theme.paletteAccent} />
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function PublicCopyLink({ slug, accent }: { slug: string; accent: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [href, setHref] = useState("");

  useEffect(() => {
    setHref(`${window.location.origin}${publicBioPath(slug)}`);
  }, [slug]);

  const copy = async () => {
    const target = href || `${window.location.origin}${publicBioPath(slug)}`;
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      toast.success(t("common.copied"));
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("linkInBio.err.couldNotCopy"));
    }
  };

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium",
          "backdrop-blur-md transition-[transform,background-color,border-color] duration-200",
          "active:scale-[0.98] touch-manipulation",
        )}
        style={{
          borderColor: copied ? accent : "color-mix(in oklab, var(--bio-fg) 16%, transparent)",
          background: copied
            ? `color-mix(in oklab, ${accent} 18%, var(--bio-bg))`
            : "color-mix(in oklab, var(--bio-fg) 6%, var(--bio-bg))",
          color: "var(--bio-fg)",
        }}
        aria-label={copied ? t("linkInBio.copied") : t("linkInBio.copyLink")}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? t("linkInBio.copied") : t("linkInBio.copyLink")}
      </button>
    </div>
  );
}

function EmptyLinksPlaceholder({
  muted,
  border,
  glass,
}: {
  muted: string;
  border: string;
  glass: boolean;
}) {
  return (
    <div
      className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed px-5 py-14 text-center sm:mt-10 sm:px-8"
      style={{
        borderColor: "color-mix(in oklab, var(--bio-fg) 18%, transparent)",
        background: glass
          ? "rgba(255,255,255,0.04)"
          : "color-mix(in oklab, var(--bio-fg) 4%, var(--bio-bg))",
      }}
    >
      <span
        className="mb-3 grid size-12 place-items-center rounded-2xl"
        style={{
          border,
          background: "color-mix(in oklab, var(--bio-fg) 8%, transparent)",
        }}
      >
        <Link2 className="size-5 opacity-70" aria-hidden />
      </span>
      <p className="text-sm font-semibold tracking-tight">No links yet</p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed" style={{ color: muted }}>
        Platforms and custom links will appear here once they are added to this page.
      </p>
    </div>
  );
}

function Header({
  profile,
  compact,
  border,
}: {
  profile: PublicLinkInBio["profile"];
  compact?: boolean;
  border: string;
}) {
  const headerUrl = profile.headerUrl.trim();
  const avatarUrl = profile.avatarUrl.trim();
  const showBanner = Boolean(headerUrl);
  const showAvatar = Boolean(avatarUrl);
  const overlap = showBanner && showAvatar;

  return (
    <header className={cn("flex flex-col items-center overflow-visible text-center", compact && "mb-2")}>
      <div className={cn("relative flex w-full flex-col items-center overflow-visible", overlap && "mb-14")}>
        {showBanner ? (
          <img
            key={headerUrl}
            src={headerUrl}
            alt=""
            className="aspect-[21/9] w-full rounded-2xl object-cover sm:rounded-3xl"
            style={{ border }}
          />
        ) : null}
        {showAvatar ? (
          <span
            className={cn(
              "relative block size-20 overflow-hidden rounded-full shadow-[0_10px_28px_-10px_rgba(0,0,0,0.45)] sm:size-24",
              overlap
                ? "absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/2"
                : "mx-auto",
            )}
          >
            <img src={avatarUrl} alt="" className="absolute inset-0 size-full object-cover object-center" />
          </span>
        ) : null}
      </div>
      <LinkInBioText as="h1" className="mx-auto mt-4 w-full min-w-0 max-w-2xl text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
        {profile.displayName || profile.slug || "Your page"}
      </LinkInBioText>
      {profile.bio ? (
        <LinkInBioText className="mx-auto mt-2 w-full min-w-0 max-w-2xl text-sm leading-relaxed md:text-base" style={{ color: "var(--bio-muted)" }}>
          {profile.bio}
        </LinkInBioText>
      ) : null}
    </header>
  );
}

function CountdownCard({
  theme,
  border,
  glass,
}: {
  theme: PublicLinkInBio["theme"];
  border: string;
  glass: boolean;
}) {
  const ends = theme.countdownEndsAt ? new Date(theme.countdownEndsAt).getTime() : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(ends)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ends]);
  const remain = Number.isFinite(ends) ? Math.max(0, ends - now) : 0;
  const ended = Number.isFinite(ends) && remain <= 0;
  const total = Math.floor(remain / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return (
    <div
      className="mt-3 rounded-2xl px-4 py-3 text-center"
      style={{
        border,
        background: glass ? "rgba(255,255,255,0.06)" : "color-mix(in oklab, var(--bio-fg) 7%, var(--bio-bg))",
      }}
    >
      <LinkInBioText className="text-[0.7rem] uppercase tracking-wide" style={{ color: "var(--bio-muted)" }}>
        {theme.countdownLabel}
      </LinkInBioText>
      {!Number.isFinite(ends) ? (
        <p className="mt-1 text-sm">No end time set.</p>
      ) : ended ? (
        <p className="mt-1 text-sm font-semibold">The countdown has ended.</p>
      ) : (
        <div className="mt-2 flex items-start justify-center gap-1.5">
          <CountdownUnit value={days} label="D" />
          <CountdownColon />
          <CountdownUnit value={hours} label="H" padded />
          <CountdownColon />
          <CountdownUnit value={minutes} label="M" padded />
          <CountdownColon />
          <CountdownUnit value={seconds} label="S" padded />
        </div>
      )}
    </div>
  );
}

function CountdownUnit({
  value,
  label,
  padded = false,
}: {
  value: number;
  label: string;
  padded?: boolean;
}) {
  return (
    <div className="flex min-w-[2rem] flex-col items-center">
      <span className="text-lg font-semibold leading-none tabular-nums">
        {padded ? String(value).padStart(2, "0") : value}
      </span>
      <span className="mt-1 text-[0.6rem] font-medium uppercase tracking-wide" style={{ color: "var(--bio-muted)" }}>
        {label}
      </span>
    </div>
  );
}

function CountdownColon() {
  return (
    <span className="pt-0.5 text-lg font-semibold leading-none" style={{ color: "var(--bio-muted)" }} aria-hidden>
      :
    </span>
  );
}

function BioFontLoader({ font }: { font: ReturnType<typeof resolveBioFont> }) {
  if (!font.href) return null;
  if (/\.(woff2?|ttf|otf)(\?|#|$)/i.test(font.href)) {
    const name = font.faceName.replace(/["\\]/g, "");
    const href = font.href.replace(/["\\]/g, "");
    const format = href.includes(".woff2")
      ? "woff2"
      : href.includes(".woff")
        ? "woff"
        : href.includes(".otf")
          ? "opentype"
          : "truetype";
    return (
      <style>{`@font-face{font-family:"${name}";src:url("${href}") format("${format}");font-display:swap;}`}</style>
    );
  }
  return <link rel="stylesheet" href={font.href} />;
}
