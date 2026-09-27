import { useState } from "react";
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

  const submit = async () => {
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
        toast.error(
          payload?.error === "tuwaiqpay_not_configured"
            ? t("gateway.tuwaiq.notConfigured")
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
            <label className="block text-sm">
              <span className="text-muted-foreground">{t("gateway.tuwaiq.name")}</span>
              <input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                dir="auto"
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
              />
              <span className="mt-1 block text-[0.7rem] text-muted-foreground">
                {t("gateway.tuwaiq.phoneHint")}
              </span>
            </label>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? t("gateway.tuwaiq.submitting") : t("gateway.tuwaiq.submit")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
