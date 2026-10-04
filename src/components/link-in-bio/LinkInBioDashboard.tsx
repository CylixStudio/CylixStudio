import { useRef, useState } from "react";
import { Check, Copy, ExternalLink, ImagePlus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { LinkInBioBento } from "@/components/link-in-bio/LinkInBioBento";
import { LinkInBioPage } from "@/components/link-in-bio/LinkInBioPage";
import { PlatformHandleDock } from "@/components/link-in-bio/PlatformHandleDock";
import { Button } from "@/components/ui/button";
import { DarkSelect } from "@/components/ui/dark-select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  handlesFromLinks,
  linksFromHandles,
  type HandleMap,
  type useLinkInBioDraft,
} from "@/hooks/useLinkInBioDraft";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import {
  AMBIENT_CHOICES,
  BENTO_SIZES,
  compressAvatarFile,
  compressBannerFile,
  compressGalleryFile,
  FONT_CHOICES,
  GALLERY_MAX_IMAGES,
  GRADIENT_CHOICES,
  LAYOUT_CHOICES,
  LINK_PLATFORMS,
  applyBentoPlacement,
  bentoSizeOf,
  isLightBioTheme,
  normalizeLink,
  publicBioPath,
  sanitizeSlug,
  spanFromBentoSize,
  usernameCooldownActive,
  usernameUnlockLabel,
  type AmbientPreset,
  type BentoSize,
  type BioLayout,
  type GradientStyle,
  type LinkInBioLink,
  type SurfaceStyle,
} from "@/lib/linkInBio";
import { cn } from "@/lib/utils";

type Draft = ReturnType<typeof useLinkInBioDraft>;
type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const label = "mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground";

export function LinkInBioDashboard({ draft, onReplay }: { draft: Draft; onReplay: () => void }) {
  const { t } = useLanguage();
  const { profile, setProfile, theme, setTheme, links, setLinks, preview, persist, save, state, slugStatus } = draft;
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [handles, setHandles] = useState<HandleMap>(() => handlesFromLinks(links));
  const slugLocked = usernameCooldownActive(profile.usernameChangedAt);
  const unlockOn = usernameUnlockLabel(profile.usernameChangedAt);
  const saveTimer = useRef(0);
  const selected = links.find((link) => link.id === selectedId) ?? null;
  const lightPage = isLightBioTheme(theme.paletteBg);
  const publicUrl = profile.slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}${publicBioPath(profile.slug)}`
    : "";

  const queueSave = (nextProfile = profile, nextTheme = theme, nextLinks = links) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(nextProfile, nextTheme, nextLinks).catch((error: Error) =>
        toast.error(error.message === "slug_cooldown" ? t("linkInBio.err.slugCooldown") : t("linkInBio.err.couldNotSave")),
      );
    }, 360);
  };

  const patchProfile = (partial: Partial<typeof profile>) => {
    const next = { ...profile, ...partial };
    setProfile(next);
    queueSave(next, theme, links);
  };
  const patchTheme = (partial: Partial<typeof theme>) => {
    const next = { ...theme, ...partial };
    setTheme(next);
    queueSave(profile, next, links);
  };
  const patchLinks = (next: LinkInBioLink[]) => {
    setLinks(next);
    queueSave(profile, theme, next);
  };

  const onFile = async (file: File | undefined, kind: "avatar" | "header" | "banner") => {
    if (!file) return;
    const url = kind === "avatar" ? await compressAvatarFile(file) : await compressBannerFile(file);
    if (!url) {
      toast.error(t("linkInBio.err.couldNotReadImage"));
      return;
    }
    if (kind === "avatar") patchProfile({ avatarUrl: url });
    if (kind === "header") patchProfile({ headerUrl: url });
    if (kind === "banner") patchTheme({ widgetBannerUrl: url });
  };

  const applyPlatforms = (nextHandles: HandleMap) => {
    setHandles(nextHandles);
    patchLinks(linksFromHandles(nextHandles, links));
  };

  const addGallery = () => {
    const created = normalizeLink(
      {
        id: crypto.randomUUID(),
        title: t("linkInBio.galleryDefaultTitle"),
        url: "",
        platform: "custom",
        kind: "gallery",
        colSpan: 2,
        rowSpan: 2,
        galleryImages: [],
        enabled: true,
      },
      links.length,
    );
    const next = [...links, created];
    patchLinks(next);
    setSelectedId(created.id);
  };

  const publish = async (published: boolean) => {
    const next = { ...profile, published, setupCompleted: true, slug: sanitizeSlug(profile.slug) };
    setProfile(next);
    await persist(next, theme, links);
    toast.success(published ? t("linkInBio.toast.published") : t("linkInBio.toast.unpublished"));
  };

  const copyPublicUrl = async () => {
    if (!publicUrl) {
      toast.error(t("linkInBio.err.setUsernameFirst"));
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success(t("common.copied"));
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("linkInBio.err.couldNotCopy"));
    }
  };

  const liveFlags = preview.livePlatforms;

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {editing ? (
        <>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing(false)}>
            {t("linkInBio.done")}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            onClick={() => void publish(!profile.published)}
            disabled={!profile.slug || save.isPending}
          >
            {profile.published ? t("linkInBio.unpublish") : t("linkInBio.publish")}
          </Button>
        </>
      ) : (
        <Button type="button" className="min-h-11" onClick={() => setEditing(true)}>
          {t("linkInBio.editPage")}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={!publicUrl}
        onClick={() => void copyPublicUrl()}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? t("linkInBio.copied") : t("linkInBio.copyLink")}
      </Button>
      {publicUrl ? (
        <Button type="button" variant="outline" className="min-h-11" asChild>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5" />
            {t("linkInBio.openPage")}
          </a>
        </Button>
      ) : null}
      <Button type="button" variant="ghost" className="min-h-11" onClick={onReplay}>
        <RotateCcw className="size-3.5" />
        {t("linkInBio.replaySetup")}
      </Button>
    </div>
  );

  const copyFooter = (
    <footer className="flex justify-center border-t border-white/10 pt-8">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={!publicUrl}
        onClick={() => void copyPublicUrl()}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? t("linkInBio.copied") : t("linkInBio.copyLink")}
      </Button>
    </footer>
  );

  if (!editing) {
    return (
      <div className="space-y-6">
        {actions}
        <button
          type="button"
          className="block w-full overflow-hidden rounded-2xl border border-white/10 text-start outline-none transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-white/30"
          onClick={onReplay}
        >
          <p className="border-b border-white/10 px-4 py-2 text-[0.72rem] uppercase tracking-wide text-muted-foreground">
            {t("linkInBio.previewClickHint")}
          </p>
          <div className="pointer-events-none max-h-[52rem] overflow-auto">
            <LinkInBioPage data={preview} preview />
          </div>
        </button>
        {copyFooter}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actions}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="space-y-4 rounded-2xl border border-white/10 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("linkInBio.bentoGrid")}</h2>
              <p className="text-sm text-muted-foreground">{t("linkInBio.bentoHint")}</p>
            </div>
            <Button type="button" variant="outline" onClick={addGallery}>
              <ImagePlus className="size-3.5" />
              {t("linkInBio.addGallery")}
            </Button>
          </div>
          <div
            className="overflow-hidden rounded-2xl p-4"
            style={{ background: theme.paletteBg, color: theme.paletteFg }}
          >
            {links.filter((link) => link.enabled).length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                <p className="text-sm font-medium text-foreground/90">{t("linkInBio.gridEmpty")}</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  {t("linkInBio.gridEmptyHint")}
                </p>
              </div>
            ) : (
              <LinkInBioBento
                links={preview.links}
                theme={theme}
                livePlatforms={liveFlags}
                tilePreviews={preview.tilePreviews}
                arrangeMode
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMove={(id, gridX, gridY) =>
                  patchLinks(applyBentoPlacement(links, id, { gridX, gridY }))
                }
                onResize={(id, colSpan, rowSpan, gridX, gridY) =>
                  patchLinks(applyBentoPlacement(links, id, { colSpan, rowSpan, gridX, gridY }))
                }
              />
            )}
          </div>
          {selected ? (
            <CardInspector
              link={selected}
              onChange={(next) => patchLinks(links.map((link) => (link.id === next.id ? next : link)))}
              onRemove={() => {
                patchLinks(links.filter((link) => link.id !== selected.id));
                setSelectedId(null);
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("linkInBio.selectTileHint")}</p>
          )}
        </section>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <Tabs defaultValue="profile">
              <div className="border-b border-white/10 p-2">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-white/[0.04] p-1">
                  <TabsTrigger value="profile" className="rounded-lg px-2 py-1.5 text-xs">
                    {t("linkInBio.tab.profile")}
                  </TabsTrigger>
                  <TabsTrigger value="theme" className="rounded-lg px-2 py-1.5 text-xs">
                    {t("linkInBio.tab.theme")}
                  </TabsTrigger>
                  <TabsTrigger value="platforms" className="rounded-lg px-2 py-1.5 text-xs">
                    {t("linkInBio.tab.platforms")}
                  </TabsTrigger>
                  <TabsTrigger value="widgets" className="rounded-lg px-2 py-1.5 text-xs">
                    {t("linkInBio.tab.widgets")}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="profile" className="mt-0 max-h-[min(72vh,42rem)] space-y-5 overflow-y-auto p-5">
                <Field
                  htmlFor="dash-slug"
                  title={t("linkInBio.field.username")}
                  hint={slugLocked ? t("linkInBio.slug.lockedUntil", { date: unlockOn ?? "" }) : slugHint(slugStatus, t)}
                >
                  <Input
                    id="dash-slug"
                    value={profile.slug}
                    disabled={slugLocked}
                    onChange={(event) => patchProfile({ slug: sanitizeSlug(event.target.value) })}
                  />
                </Field>
                <Field htmlFor="dash-name" title={t("linkInBio.field.displayName")}>
                  <Input
                    id="dash-name"
                    dir="auto"
                    value={profile.displayName}
                    onChange={(event) => patchProfile({ displayName: event.target.value })}
                  />
                </Field>
                <Field htmlFor="dash-bio" title={t("linkInBio.field.bio")}>
                  <Textarea
                    id="dash-bio"
                    dir="auto"
                    className="min-h-28 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                    value={profile.bio}
                    onChange={(event) => patchProfile({ bio: event.target.value })}
                  />
                </Field>
                <Separator className="bg-white/10" />
                <Field title={t("linkInBio.field.avatar")}>
                  <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onFile(event.target.files?.[0], "avatar")} />
                </Field>
                <Field title={t("linkInBio.field.headerImage")}>
                  <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onFile(event.target.files?.[0], "header")} />
                  {profile.headerUrl ? (
                    <button
                      type="button"
                      className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => patchProfile({ headerUrl: "" })}
                    >
                      {t("linkInBio.removeBanner")}
                    </button>
                  ) : null}
                </Field>
              </TabsContent>

              <TabsContent value="theme" className="mt-0 max-h-[min(72vh,42rem)] space-y-5 overflow-y-auto p-5">
                <Field title={t("linkInBio.field.layout")}>
                  <DarkSelect
                    value={theme.layout}
                    onValueChange={(value) => patchTheme({ layout: value as BioLayout })}
                    options={LAYOUT_CHOICES.map((item) => ({ value: item.id, label: item.label }))}
                  />
                </Field>
                <Field title={t("linkInBio.field.font")}>
                  <DarkSelect
                    value={theme.fontFamily}
                    onValueChange={(value) => patchTheme({ fontFamily: value })}
                    options={[
                      ...FONT_CHOICES.map((item) => ({ value: item.id, label: item.label })),
                      { value: "custom", label: t("linkInBio.font.custom") },
                    ]}
                  />
                </Field>
                {theme.fontFamily === "custom" ? (
                  <>
                    <Field title={t("linkInBio.field.customFontName")}>
                      <Input
                        value={theme.fontCustomName}
                        placeholder="Satoshi"
                        onChange={(event) => patchTheme({ fontCustomName: event.target.value })}
                      />
                    </Field>
                    <Field title={t("linkInBio.field.customFontUrl")}>
                      <Input
                        value={theme.fontCustomHref}
                        placeholder="https://…/font.css or .woff2"
                        onChange={(event) => patchTheme({ fontCustomHref: event.target.value })}
                      />
                    </Field>
                  </>
                ) : null}
                <Separator className="bg-white/10" />
                <Field title={t("linkInBio.field.surface")}>
                  <DarkSelect
                    value={theme.surfaceStyle}
                    onValueChange={(value) => patchTheme({ surfaceStyle: value as SurfaceStyle })}
                    options={[
                      { value: "glass", label: t("linkInBio.surface.glass") },
                      { value: "flat", label: t("linkInBio.surface.flat") },
                    ]}
                  />
                </Field>
                <Field title={t("linkInBio.field.glassIntensity", { n: theme.glassIntensity })}>
                  <Slider value={[theme.glassIntensity]} max={100} onValueChange={([value]) => patchTheme({ glassIntensity: value ?? 0 })} />
                </Field>
                <Separator className="bg-white/10" />
                {lightPage ? (
                  <>
                    <Field title={t("linkInBio.field.ambient")}>
                      <DarkSelect
                        value={theme.ambientPreset}
                        onValueChange={(value) => patchTheme({ ambientPreset: value as AmbientPreset })}
                        options={AMBIENT_CHOICES.map((item) => ({ value: item.id, label: item.label }))}
                      />
                    </Field>
                    <Field title={t("linkInBio.field.glow")}>
                      <DarkSelect
                        value={theme.gradientStyle}
                        onValueChange={(value) => patchTheme({ gradientStyle: value as GradientStyle })}
                        options={GRADIENT_CHOICES.map((item) => ({ value: item.id, label: item.label }))}
                      />
                    </Field>
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>{t("linkInBio.interactiveAmbient")}</span>
                      <Switch checked={theme.ambientEnabled} onCheckedChange={(ambientEnabled) => patchTheme({ ambientEnabled })} />
                    </label>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("linkInBio.darkThemeQuiet")}</p>
                )}
              </TabsContent>

              <TabsContent value="platforms" className="mt-0 max-h-[min(72vh,42rem)] overflow-y-auto p-5">
                <p className="mb-4 text-xs text-muted-foreground">{t("linkInBio.platformsHint")}</p>
                <PlatformHandleDock
                  tone="inspector"
                  platforms={LINK_PLATFORMS}
                  handles={{ ...handlesFromLinks(links), ...handles }}
                  onChange={applyPlatforms}
                />
              </TabsContent>

              <TabsContent value="widgets" className="mt-0 max-h-[min(72vh,42rem)] space-y-5 overflow-y-auto p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{t("linkInBio.widget.schedule")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {state?.scheduleShareToken ? t("linkInBio.widget.scheduleLinked") : t("linkInBio.widget.scheduleCreateFirst")}
                    </p>
                  </div>
                  <Switch
                    checked={theme.scheduleEnabled}
                    disabled={!state?.scheduleShareToken}
                    onCheckedChange={(scheduleEnabled) => patchTheme({ scheduleEnabled })}
                  />
                </div>
                <Separator className="bg-white/10" />
                <Field title={t("linkInBio.field.imageBanner")}>
                  <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onFile(event.target.files?.[0], "banner")} />
                </Field>
                <Separator className="bg-white/10" />
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{t("linkInBio.widget.countdown")}</p>
                    <Switch checked={theme.countdownEnabled} onCheckedChange={(countdownEnabled) => patchTheme({ countdownEnabled })} />
                  </div>
                  {theme.countdownEnabled ? (
                    <div className="space-y-3">
                      <Input dir="auto" value={theme.countdownLabel} onChange={(event) => patchTheme({ countdownLabel: event.target.value })} />
                      <Input
                        type="datetime-local"
                        value={localDateValue(theme.countdownEndsAt)}
                        onChange={(event) =>
                          patchTheme({ countdownEndsAt: event.target.value ? new Date(event.target.value).toISOString() : null })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </aside>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <p className="border-b border-white/10 px-4 py-2 text-[0.72rem] uppercase tracking-wide text-muted-foreground">
          {t("linkInBio.livePreview")}
        </p>
        <div className="max-h-[52rem] overflow-auto">
          <LinkInBioPage data={preview} preview />
        </div>
      </div>

      {copyFooter}
    </div>
  );
}

function Field({
  title,
  htmlFor,
  hint,
  children,
}: {
  title: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className={label} htmlFor={htmlFor}>
        {title}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function slugHint(status: Draft["slugStatus"], t: Translate) {
  if (status === "available") return t("linkInBio.slug.available");
  if (status === "taken") return t("linkInBio.slug.taken");
  if (status === "invalid") return t("linkInBio.slug.invalid");
  return t("linkInBio.slug.publicPath");
}

function CardInspector({
  link,
  onChange,
  onRemove,
}: {
  link: LinkInBioLink;
  onChange: (link: LinkInBioLink) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const size = bentoSizeOf(link.colSpan, link.rowSpan);
  const addPhoto = async (file?: File) => {
    if (!file) return;
    if (link.galleryImages.length >= GALLERY_MAX_IMAGES) {
      toast.error(t("linkInBio.err.galleryMax", { n: GALLERY_MAX_IMAGES }));
      return;
    }
    const url = await compressGalleryFile(file);
    if (!url) {
      toast.error(t("linkInBio.err.couldNotReadImage"));
      return;
    }
    onChange({
      ...link,
      galleryImages: [...link.galleryImages, { id: crypto.randomUUID(), url }],
    });
  };

  return (
    <div className="rounded-xl border border-white/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold" dir="auto">
          {link.title || (link.kind === "gallery" ? t("linkInBio.galleryDefaultTitle") : t("linkInBio.tileFallback"))}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          {t("linkInBio.remove")}
        </Button>
      </div>
      <label className={cn(label, "mt-3")}>{t("linkInBio.field.title")}</label>
      <Input dir="auto" value={link.title} onChange={(event) => onChange({ ...link, title: event.target.value })} />
      <p className={cn(label, "mt-3")}>{t("linkInBio.field.size")}</p>
      <div className="flex flex-wrap gap-1">
        {BENTO_SIZES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs",
              size === item.id ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground",
            )}
            onClick={() => onChange({ ...link, ...spanFromBentoSize(item.id as BentoSize) })}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className={label}>{t("linkInBio.field.columns")}</label>
          <Input
            type="number"
            min={1}
            max={4}
            value={link.colSpan}
            onChange={(event) => onChange({ ...link, colSpan: Number(event.target.value) as LinkInBioLink["colSpan"] })}
          />
        </div>
        <div>
          <label className={label}>{t("linkInBio.field.rows")}</label>
          <Input
            type="number"
            min={1}
            max={3}
            value={link.rowSpan}
            onChange={(event) => onChange({ ...link, rowSpan: Number(event.target.value) as LinkInBioLink["rowSpan"] })}
          />
        </div>
        <div>
          <label className={label}>{t("linkInBio.field.column")}</label>
          <Input
            type="number"
            min={0}
            max={3}
            value={link.gridX}
            onChange={(event) => onChange({ ...link, gridX: Number(event.target.value) })}
          />
        </div>
        <div>
          <label className={label}>{t("linkInBio.field.row")}</label>
          <Input
            type="number"
            min={0}
            max={40}
            value={link.gridY}
            onChange={(event) => onChange({ ...link, gridY: Number(event.target.value) })}
          />
        </div>
      </div>
      {link.kind === "gallery" ? (
        <div className="mt-3">
          <label className={label}>{t("linkInBio.field.photos")}</label>
          <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void addPhoto(event.target.files?.[0])} />
          <ul className="mt-2 grid grid-cols-4 gap-2">
            {link.galleryImages.map((image) => (
              <li key={image.id} className="relative overflow-hidden rounded-lg">
                <img src={image.url} alt="" className="aspect-square w-full object-cover" />
                <button
                  type="button"
                  className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-[0.65rem] text-white"
                  onClick={() => onChange({ ...link, galleryImages: link.galleryImages.filter((item) => item.id !== image.id) })}
                >
                  {t("linkInBio.remove")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function localDateValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
