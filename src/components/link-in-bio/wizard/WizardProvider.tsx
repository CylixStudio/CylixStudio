import { createContext, startTransition, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  createEmptyHandles,
  handlesFromLinks,
  linksFromHandles,
  type HandleMap,
  type useLinkInBioDraft,
} from "@/hooks/useLinkInBioDraft";
import {
  clampWizardStep,
  compressAvatarFile,
  compressBannerFile,
  LINK_IN_BIO_WIZARD_STEP_KEY,
  sanitizeSlug,
  usernameCooldownActive,
  usernameUnlockLabel,
  WIZARD_STEPS,
} from "@/lib/linkInBio";

export type WizardDraft = ReturnType<typeof useLinkInBioDraft>;

type WizardContextValue = {
  step: number;
  total: number;
  goNext: () => void;
  goBack: () => void;
  jump: (next: number) => void;
  canProceed: boolean;
  canExit: boolean;
  onExit: () => void;
  finish: (publish: boolean) => Promise<void>;
  saving: boolean;
  draft: WizardDraft;
  handles: HandleMap;
  applyHandles: (next: HandleMap) => void;
  onFile: (file: File | undefined, kind: "avatar" | "header" | "banner") => Promise<void>;
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  slugLocked: boolean;
  unlockOn: string | null;
};

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard() {
  const value = useContext(WizardContext);
  if (!value) throw new Error("useWizard must be used inside WizardProvider");
  return value;
}

export function WizardProvider({
  draft,
  step: stepProp,
  canExit,
  onExit,
  children,
}: {
  draft: WizardDraft;
  step?: number | undefined;
  canExit: boolean;
  onExit: () => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { profile, setProfile, theme, links, setLinks, persist, save, slugStatus } = draft;
  const [handles, setHandles] = useState<HandleMap>(createEmptyHandles);
  const [hydrated, setHydrated] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const slugLocked = usernameCooldownActive(profile.usernameChangedAt);
  const unlockOn = usernameUnlockLabel(profile.usernameChangedAt);
  const step = clampWizardStep(stepProp ?? 1);

  useEffect(() => {
    if (hydrated) return;
    setHandles(handlesFromLinks(links));
    setHydrated(true);
  }, [links, hydrated]);

  const jump = (next: number) => {
    const value = clampWizardStep(next);
    try {
      window.localStorage.setItem(LINK_IN_BIO_WIZARD_STEP_KEY, String(value));
    } catch {
      /* ignore */
    }
    startTransition(() => {
      void navigate({ to: "/link-in-bio", search: { setup: true, step: value }, replace: true });
    });
  };

  const applyHandles = (next: HandleMap) => {
    setHandles(next);
    setLinks(linksFromHandles(next, links));
  };

  const onFile = async (file: File | undefined, kind: "avatar" | "header" | "banner") => {
    if (!file) return;
    const url = kind === "avatar" ? await compressAvatarFile(file) : await compressBannerFile(file);
    if (!url) {
      toast.error("Could not read that image.");
      return;
    }
    if (kind === "avatar") setProfile((prev) => ({ ...prev, avatarUrl: url }));
    if (kind === "header") setProfile((prev) => ({ ...prev, headerUrl: url }));
    if (kind === "banner") draft.setTheme((prev) => ({ ...prev, widgetBannerUrl: url }));
  };

  const canProceed =
    step !== 1 || (Boolean(sanitizeSlug(profile.slug)) && (slugLocked || slugStatus === "available"));

  const goNext = () => {
    if (!canProceed) return;
    const nextLinks = step === 3 ? linksFromHandles(handles, links) : links;
    if (step === 3) setLinks(nextLinks);
    if (step < WIZARD_STEPS) jump(step + 1);
    void persist(profile, theme, nextLinks).catch((error: Error) => {
      toast.error(error.message || "Could not save this step.");
    });
  };

  const goBack = () => {
    if (step > 1) jump(step - 1);
  };

  const finish = async (publish: boolean) => {
    const nextLinks = linksFromHandles(handles, links);
    setLinks(nextLinks);
    const next = { ...profile, setupCompleted: true, published: publish || profile.published };
    setProfile(next);
    await persist(next, theme, nextLinks);
    toast.success(publish ? "Published — opening studio." : "Setup saved.");
    onExit();
  };

  return (
    <WizardContext.Provider
      value={{
        step,
        total: WIZARD_STEPS,
        goNext,
        goBack,
        jump,
        canProceed,
        canExit,
        onExit,
        finish,
        saving: save.isPending,
        draft,
        handles,
        applyHandles,
        onFile,
        focusId,
        setFocusId,
        slugLocked,
        unlockOn,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
}
