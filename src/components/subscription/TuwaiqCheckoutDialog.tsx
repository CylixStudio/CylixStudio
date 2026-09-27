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

type GatewayState = "checking" | "ready" | "missing" | "auth_failed";

export function TuwaiqCheckoutDialog({
  open,
  onOpenChange,
  interval,
  purchaseType,
  defaultName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interval: ProBillingInterval;
  purchaseType: "direct" | "gift";
  defaultName?: string | null;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(defaultName?.trim() ?? "");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [bill, setBill] = useState<CreatedBill | null>(null);
  const [gateway, setGateway] = useState<GatewayState>("checking");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setGateway("checking");

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          if (!cancelled) setGateway("missing");
          return;
        }
        const response = await fetch("/api/tuwaiqpay/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = (await response.json().catch(() => null)) as
          | { ready?: boolean; reason?: string }
          | null;
        if (cancelled) return;
        if (response.ok && payload?.ready) {
          setGateway("ready");
          return;
        }
        setGateway(payload?.reason === "auth_failed" ? "auth_failed" : "missing");
      } catch {
        if (!cancelled) setGateway("missing");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const submit = async () => {
    if (gateway !== "ready") return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error(t("gateway.tuwaiq.error"));
        return;
      }
      const response = await fetch("/api/tuwaiqpay/bills", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          interval,
          purchaseType,
          customerName: name.trim(),
          customerMobilePhone: phone.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (CreatedBill & { error?: string })
        | null;
      if (!response.ok || !payload?.link || !payload.billId) {
        if (payload?.error === "tuwaiqpay_not_configured") {
          setGateway("missing");
        } else if (payload?.error === "tuwaiqpay_auth_failed") {
          setGateway("auth_failed");
        }
        toast.error(
          payload?.error === "tuwaiqpay_not_configured"
            ? t("gateway.tuwaiq.notConfigured")
            : payload?.error === "tuwaiqpay_auth_failed"
              ? t("gateway.tuwaiq.authFailed")
              : t("gateway.tuwaiq.error"),
        );
        return;
      }
      setBill({ link: payload.link, qrCode: payload.qrCode, billId: payload.billId });
    } catch {
      toast.error(t("gateway.tuwaiq.error"));
    } finally {
      setBusy(false);
    }
  };

  const gatewayReady = gateway === "ready";

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
              {t("gateway.tuwaiq.codeByEmail")}
            </p>
            <Button asChild className="w-full">
              <a href={bill.link} target="_blank" rel="noreferrer">
                {t("gateway.tuwaiq.open")}
              </a>
            </Button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {gateway === "checking" ? (
              <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground">
                {t("gateway.tuwaiq.checking")}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">{t("gateway.tuwaiq.codeByEmail")}</p>
            {gateway === "missing" || gateway === "auth_failed" ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {gateway === "auth_failed" ? t("gateway.tuwaiq.authFailed") : t("gateway.tuwaiq.notConfigured")}
              </p>
            ) : null}
            <label className="block text-sm">
              <span className="text-muted-foreground">{t("gateway.tuwaiq.name")}</span>
              <input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                dir="auto"
                disabled={!gatewayReady || busy}
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">{t("gateway.tuwaiq.phone")}</span>
              <input
                required
                inputMode="tel"
                maxLength={100}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+9665xxxxxxxx"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                dir="ltr"
                disabled={!gatewayReady || busy}
              />
              <span className="mt-1 block text-[0.7rem] text-muted-foreground">
                {t("gateway.tuwaiq.phoneHint")}
              </span>
            </label>
            <Button type="submit" disabled={!gatewayReady || busy} className="w-full">
              {busy ? t("gateway.tuwaiq.submitting") : t("gateway.tuwaiq.submit")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
