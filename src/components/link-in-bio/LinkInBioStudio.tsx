import { useNavigate } from "@tanstack/react-router";

import { LinkInBioDashboard } from "@/components/link-in-bio/LinkInBioDashboard";
import { LinkInBioWizard } from "@/components/link-in-bio/wizard";
import { AppShell } from "@/components/layout/AppShell";
import { useLinkInBioDraft } from "@/hooks/useLinkInBioDraft";
import { useLanguage } from "@/lib/i18n";

export function LinkInBioStudio({
  userId,
  user,
  workspaceProfile,
  forceSetup,
  step,
}: {
  userId: string;
  user: { email?: string | undefined; id: string };
  workspaceProfile?: { name: string | null; image: string | null } | null;
  forceSetup: boolean;
  step?: number;
}) {
  const { t } = useLanguage();
  const draft = useLinkInBioDraft(userId);
  const navigate = useNavigate();
  const goDashboard = () => {
    void navigate({ to: "/dashboard" });
  };
  const goSetup = (nextStep = 1) => {
    void navigate({ to: "/link-in-bio", search: { setup: true, step: nextStep }, replace: true });
  };

  if (draft.loading) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <span className="size-2 animate-pulse rounded-full bg-muted-foreground/60" aria-hidden />
          {t("linkInBio.loading")}
        </div>
      </div>
    );
  }

  const showWizard = forceSetup || !draft.profile.setupCompleted;
  if (showWizard) {
    return (
      <LinkInBioWizard
        draft={draft}
        step={step}
        canExit={draft.profile.setupCompleted}
        onExit={goDashboard}
      />
    );
  }

  return (
    <AppShell
      user={user}
      profile={workspaceProfile}
      title={t("linkInBio.title")}
      subtitle={t("linkInBio.subtitle")}
    >
      <LinkInBioDashboard draft={draft} onReplay={() => goSetup(1)} />
    </AppShell>
  );
}
