import { Lock } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSubscription } from "@/hooks/useSubscription";
import { useLanguage } from "@/lib/i18n";

/** Full-page lock shown when a Free account opens a Pro-only feature. */
export function ProLockedScreen() {
  const { t, dir, lang } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="ambient-field min-h-screen bg-background px-4 py-24 text-foreground" dir={dir} lang={lang}>
      <div className="glass-3d mx-auto max-w-md rounded-2xl p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/15 text-primary">
          <Lock className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">{t("home.proGate.title")}</h1>
        <p className="mt-2 text-[0.82rem] text-muted-foreground">{t("home.proGate.body")}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => void navigate({ to: "/dashboard" })}
            className="rounded-lg border border-[oklch(1_0_0/0.1)] px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {t("home.proGate.home")}
          </button>
          <button
            type="button"
            onClick={() => void navigate({ to: "/subscription" })}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("home.unlockPro")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Blocks children until the user has an active Pro subscription.
 * While subscription status is loading, children still render.
 */
export function ProFeatureGate({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const subscription = useSubscription(userId);
  const locked = subscription.isSuccess && !subscription.data.isActive;
  if (locked) return <ProLockedScreen />;
  return children;
}
