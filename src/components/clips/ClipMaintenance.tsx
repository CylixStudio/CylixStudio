import { AppShell } from "@/components/layout/AppShell";
import { useLanguage } from "@/lib/i18n";

type ClipMaintenanceProps = {
  user: { email?: string | undefined; id?: string | undefined } | null | undefined;
  profile?: { name: string | null; image: string | null } | null | undefined;
};

/** Locked clip dashboard. Both languages stay visible so the lock is obvious in either locale. */
export function ClipMaintenance({ user, profile }: ClipMaintenanceProps) {
  const { t } = useLanguage();

  return (
    <AppShell
      user={user}
      profile={profile}
      title={t("clip.maintenance.titleAr")}
      subtitle={t("clip.maintenance.titleEn")}
    >
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-16 text-center">
        <p className="text-2xl font-semibold tracking-tight text-zinc-100">{t("clip.maintenance.titleAr")}</p>
        <p className="mt-2 text-lg text-zinc-300" dir="ltr">
          {t("clip.maintenance.titleEn")}
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-400">{t("clip.maintenance.locked")}</p>
      </section>
    </AppShell>
  );
}
