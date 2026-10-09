import { ModuleCard } from "@/components/link-in-bio/wizard/wizardUi";
import { useWizard } from "@/components/link-in-bio/wizard/WizardProvider";
import { wizardUi } from "@/components/link-in-bio/wizard/wizardTokens";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/lib/i18n";
import { sanitizeSlug } from "@/lib/linkInBio";
import { cn } from "@/lib/utils";

export function ProfileStep() {
  const { t } = useLanguage();
  const { draft, slugLocked, unlockOn, onFile } = useWizard();
  const { profile, setProfile, slugStatus } = draft;

  const slugHint = slugLocked
    ? t("linkInBio.slug.lockedUntil", { date: unlockOn ?? "" })
    : slugStatus === "checking"
      ? t("linkInBio.slug.checking")
      : slugStatus === "available"
        ? t("linkInBio.slug.available")
        : slugStatus === "taken"
          ? t("linkInBio.slug.taken")
          : slugStatus === "invalid"
            ? t("linkInBio.slug.formatHint")
            : t("linkInBio.slug.realtimeCheck");

  return (
    <div className="grid gap-4">
      <ModuleCard>
        <label className={wizardUi.label} htmlFor="bio-slug">
          {t("linkInBio.field.username")}
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/40">/u/</span>
          <Input
            id="bio-slug"
            className={wizardUi.field}
            value={profile.slug}
            disabled={slugLocked}
            onChange={(event) => setProfile((prev) => ({ ...prev, slug: sanitizeSlug(event.target.value) }))}
            placeholder={t("linkInBio.slug.placeholder")}
            autoFocus={!slugLocked}
          />
        </div>
        <p className={wizardUi.hint}>{slugHint}</p>
      </ModuleCard>

      <ModuleCard>
        <label className={wizardUi.label} htmlFor="bio-name">
          {t("linkInBio.field.displayName")}
        </label>
        <Input
          id="bio-name"
          dir="auto"
          className={wizardUi.field}
          value={profile.displayName}
          onChange={(event) => setProfile((prev) => ({ ...prev, displayName: event.target.value }))}
        />
        <label className={cn(wizardUi.label, "mt-4")} htmlFor="bio-text">
          {t("linkInBio.field.bio")}
        </label>
        <Textarea
          id="bio-text"
          dir="auto"
          className="min-h-24 whitespace-pre-wrap break-words rounded-2xl border-[rgba(255,255,255,0.08)] bg-black/30 [overflow-wrap:anywhere]"
          value={profile.bio}
          onChange={(event) => setProfile((prev) => ({ ...prev, bio: event.target.value }))}
        />
      </ModuleCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <ModuleCard>
          <label className={wizardUi.label}>{t("linkInBio.field.avatar")}</label>
          <div className="flex items-center gap-2">
            <Input
              className={wizardUi.field}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void onFile(event.target.files?.[0], "avatar")}
            />
            {profile.avatarUrl ? (
              <button
                type="button"
                className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs text-red-300"
                onClick={() => setProfile((prev) => ({ ...prev, avatarUrl: "" }))}
              >
                {t("linkInBio.remove")}
              </button>
            ) : null}
          </div>
        </ModuleCard>
        <ModuleCard>
          <label className={wizardUi.label}>{t("linkInBio.field.headerImage")}</label>
          <Input
            className={wizardUi.field}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void onFile(event.target.files?.[0], "header")}
          />
          {profile.headerUrl ? (
            <button
              type="button"
              className="mt-2 text-xs text-white/45 hover:text-white"
              onClick={() => setProfile((prev) => ({ ...prev, headerUrl: "" }))}
            >
              {t("linkInBio.removeBanner")}
            </button>
          ) : null}
        </ModuleCard>
      </div>
    </div>
  );
}
