import { CalendarDays, ImagePlus, Timer } from "lucide-react";

import { PlatformHandleDock } from "@/components/link-in-bio/PlatformHandleDock";
import { ModuleCard } from "@/components/link-in-bio/wizard/wizardUi";
import { useWizard } from "@/components/link-in-bio/wizard/WizardProvider";
import { wizardUi } from "@/components/link-in-bio/wizard/wizardTokens";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/lib/i18n";
import { LINK_PLATFORMS, type LinkInBioTheme } from "@/lib/linkInBio";
import { cn } from "@/lib/utils";

function localDateValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PlatformsStep() {
  const { t } = useLanguage();
  const { draft, handles, applyHandles, onFile } = useWizard();
  const { theme, setTheme, state } = draft;
  const scheduleReady = Boolean(state?.scheduleShareToken);
  const onTheme = (partial: Partial<LinkInBioTheme>) => setTheme((prev) => ({ ...prev, ...partial }));

  return (
    <Tabs defaultValue="platforms" className="flex h-full min-h-0 flex-col">
      <TabsList className={wizardUi.tabListPair}>
        <TabsTrigger value="platforms" className={wizardUi.tabTrigger}>
          {t("linkInBio.wizard.tab.platforms")}
        </TabsTrigger>
        <TabsTrigger value="extras" className={wizardUi.tabTrigger}>
          {t("linkInBio.wizard.tab.extras")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="platforms" className={wizardUi.tabBody}>
        <PlatformHandleDock platforms={LINK_PLATFORMS} handles={handles} onChange={applyHandles} />
      </TabsContent>

      <TabsContent value="extras" className={wizardUi.tabBody}>
        <div className="grid gap-3">
          <ModuleCard>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className={wizardUi.iconWell}>
                  <CalendarDays className="size-4 text-white/70" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("linkInBio.widget.schedule")}</p>
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-white/40">
                    {t("linkInBio.widget.schedulePinHint")}
                  </p>
                </div>
              </div>
              <Switch
                checked={theme.scheduleEnabled}
                disabled={!scheduleReady}
                onCheckedChange={(scheduleEnabled) => onTheme({ scheduleEnabled })}
              />
            </div>
            {!scheduleReady ? (
              <p className={cn(wizardUi.hint, "mt-3")}>{t("linkInBio.widget.scheduleEnableHint")}</p>
            ) : null}
          </ModuleCard>

          <ModuleCard>
            <div className="flex items-start gap-3">
              <span className={wizardUi.iconWell}>
                <ImagePlus className="size-4 text-white/70" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t("linkInBio.field.imageBanner")}</p>
                <p className="mt-1 text-[0.68rem] leading-relaxed text-white/40">
                  {t("linkInBio.widget.imageBannerHint")}
                </p>
                <Input
                  className="mt-4 h-10 rounded-2xl border-[rgba(255,255,255,0.08)] bg-black/35 text-xs file:me-3 file:rounded-xl file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-xs file:text-white/80"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void onFile(event.target.files?.[0], "banner")}
                />
                {theme.widgetBannerUrl ? (
                  <div className="mt-2 flex items-center gap-3">
                    <p className={wizardUi.hint}>{t("linkInBio.widget.bannerAdded")}</p>
                    <button
                      type="button"
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-red-300"
                      onClick={() => onTheme({ widgetBannerUrl: "" })}
                    >
                      {t("linkInBio.remove")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </ModuleCard>

          <ModuleCard>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className={wizardUi.iconWell}>
                  <Timer className="size-4 text-white/70" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("linkInBio.widget.countdown")}</p>
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-white/40">
                    {t("linkInBio.widget.countdownHint")}
                  </p>
                </div>
              </div>
              <Switch checked={theme.countdownEnabled} onCheckedChange={(countdownEnabled) => onTheme({ countdownEnabled })} />
            </div>
            {theme.countdownEnabled ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={wizardUi.label} htmlFor="bio-countdown-label">
                    {t("linkInBio.field.countdownLabel")}
                  </label>
                  <Input
                    id="bio-countdown-label"
                    dir="auto"
                    className={wizardUi.field}
                    value={theme.countdownLabel}
                    onChange={(event) => onTheme({ countdownLabel: event.target.value })}
                  />
                </div>
                <div>
                  <label className={wizardUi.label} htmlFor="bio-countdown-ends">
                    {t("linkInBio.field.countdownEnds")}
                  </label>
                  <Input
                    id="bio-countdown-ends"
                    type="datetime-local"
                    className={wizardUi.field}
                    value={localDateValue(theme.countdownEndsAt)}
                    onChange={(event) =>
                      onTheme({ countdownEndsAt: event.target.value ? new Date(event.target.value).toISOString() : null })
                    }
                  />
                </div>
              </div>
            ) : null}
          </ModuleCard>
        </div>
      </TabsContent>
    </Tabs>
  );
}
