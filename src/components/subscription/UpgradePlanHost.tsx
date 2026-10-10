import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { subscribeUpgrade } from "@/components/subscription/upgradePlan";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n";

/** Shared upgrade prompt for Free limits and locked Pro tools. */
export function UpgradePlanHost() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeUpgrade(() => setOpen(true));
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md border-white/10 bg-zinc-950 sm:rounded-2xl">
        <DialogHeader className="text-start">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <Lock className="size-4" aria-hidden />
          </span>
          <DialogTitle className="text-lg tracking-tight">{t("home.proGate.title")}</DialogTitle>
          <DialogDescription className="text-[0.82rem] text-muted-foreground">
            {t("home.proGate.body")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {t("home.proGate.home")}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void navigate({ to: "/subscription" });
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("home.unlockPro")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
