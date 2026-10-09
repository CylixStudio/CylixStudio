import { ArrangeStep } from "@/components/link-in-bio/wizard/steps/ArrangeStep";
import { AtmosphereStep } from "@/components/link-in-bio/wizard/steps/AtmosphereStep";
import { PlatformsStep } from "@/components/link-in-bio/wizard/steps/PlatformsStep";
import { ProfileStep } from "@/components/link-in-bio/wizard/steps/ProfileStep";
import { useWizard, WizardProvider, type WizardDraft } from "@/components/link-in-bio/wizard/WizardProvider";
import { WizardShell } from "@/components/link-in-bio/wizard/WizardShell";

export function LinkInBioWizard({
  draft,
  step,
  canExit,
  onExit,
}: {
  draft: WizardDraft;
  step?: number | undefined;
  canExit: boolean;
  onExit: () => void;
}) {
  return (
    <WizardProvider draft={draft} step={step} canExit={canExit} onExit={onExit}>
      <WizardShell>
        <ActiveStep />
      </WizardShell>
    </WizardProvider>
  );
}

function ActiveStep() {
  const { step } = useWizard();
  if (step === 1) return <ProfileStep />;
  if (step === 2) return <PlatformsStep />;
  if (step === 3) return <AtmosphereStep />;
  return <ArrangeStep />;
}
