import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n";
import type { ProBillingInterval } from "@/lib/plans";
import { supabase } from "@/lib/supabase/client";

type CreatedBill = {
  link: string;
  qrCode: string;
  billId: number;
};

type Phase = "opening" | "ready" | "missing" | "auth_failed" | "error";

export function TuwaiqCheckoutDialog({
  open,
  onOpenChange,
  interval,
  purchaseType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interval: ProBillingInterval;
  purchaseType: "direct" | "gift";
}) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>("opening");
  const [bill, setBill] = useState<CreatedBill | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBill(null);
    setPhase("opening");

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          if (!cancelled) setPhase("error");
          return;
        }

        const statusResponse = await fetch("/api/tuwaiqpay/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const statusPayload = (await statusResponse.json().catch(() => null)) as
          | { ready?: boolean; reason?: string }
          | null;
        if (cancelled) return;
        if (!statusResponse.ok || !statusPayload?.ready) {
          setPhase(statusPayload?.reason === "auth_failed" ? "auth_failed" : "missing");
          return;
        }

        const response = await fetch("/api/tuwaiqpay/bills", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ interval, purchaseType }),
        });
        const payload = (await response.json().catch(() => null)) as
          | (CreatedBill & { error?: string })
          | null;
        if (cancelled) return;
        if (!response.ok || !payload?.link || !payload.billId) {
          if (payload?.error === "tuwaiqpay_not_configured") setPhase("missing");
          else if (payload?.error === "tuwaiqpay_auth_failed") setPhase("auth_failed");
          else setPhase("error");
          toast.error(
            payload?.error === "tuwaiqpay_not_configured"
              ? t("gateway.tuwaiq.notConfigured")
              : payload?.error === "tuwaiqpay_auth_failed"
                ? t("gateway.tuwaiq.authFailed")
                : payload?.error === "missing_phone"
                  ? t("gateway.tuwaiq.missingPhone")
                  : t("gateway.tuwaiq.error"),
          );
          return;
        }

        setBill({ link: payload.link, qrCode: payload.qrCode, billId: payload.billId });
        setPhase("ready");
        window.open(payload.link, "_blank", "noopener,noreferrer");
      } catch {
        if (!cancelled) {
          setPhase("error");
          toast.error(t("gateway.tuwaiq.error"));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, interval, purchaseType]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setBill(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("gateway.tuwaiq.title")}</DialogTitle>
        </DialogHeader>
        {phase === "opening" ? (
          <p className="text-sm text-muted-foreground">{t("gateway.tuwaiq.submitting")}</p>
        ) : null}
        {phase === "missing" || phase === "auth_failed" ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {phase === "auth_failed" ? t("gateway.tuwaiq.authFailed") : t("gateway.tuwaiq.notConfigured")}
          </p>
        ) : null}
        {phase === "error" && !bill ? (
          <p className="text-sm text-muted-foreground">{t("gateway.tuwaiq.error")}</p>
        ) : null}
        {bill ? (
          <div className="space-y-4">
            {bill.qrCode ? (
              <img
                src={bill.qrCode}
                alt={t("gateway.tuwaiq.qr")}
                className="mx-auto size-40 rounded-lg bg-white p-2"
              />
            ) : null}
            <p className="text-center text-sm text-muted-foreground">
              {t("gateway.tuwaiq.billId")}{" "}
              <span dir="ltr" className="font-mono text-foreground">
                {bill.billId}
              </span>
            </p>
            <p className="break-all text-center text-xs" dir="ltr">
              <span className="text-muted-foreground">{t("gateway.tuwaiq.link")}: </span>
              {bill.link}
            </p>
            <p className="text-center text-sm text-muted-foreground">
              {purchaseType === "gift" ? t("gateway.tuwaiq.codeByEmail") : t("gateway.tuwaiq.directActivates")}
            </p>
            <Button asChild className="w-full">
              <a href={bill.link} target="_blank" rel="noreferrer">
                {t("gateway.tuwaiq.open")}
              </a>
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
