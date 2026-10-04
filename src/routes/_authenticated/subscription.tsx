import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { GatewayPlansPanel } from "@/components/onboarding/GatewayPage";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLanguage } from "@/lib/i18n";
import { markGatewayCompleted } from "@/lib/plans";
import { confirmStreamPayReturn } from "@/lib/streampay.functions";

type SubscriptionSearch = {
  streampay?: string | undefined;
  payment_id?: string | undefined;
  invoice_id?: string | undefined;
  payment_link_id?: string | undefined;
};

function searchText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : undefined;
}

export const Route = createFileRoute("/_authenticated/subscription")({
  validateSearch: (search: Record<string, unknown>): SubscriptionSearch => ({
    streampay: searchText(search["streampay"]),
    payment_id: searchText(search["payment_id"]),
    invoice_id: searchText(search["invoice_id"]),
    payment_link_id: searchText(search["payment_link_id"]),
  }),
  head: () => ({
    meta: [
      { title: "CylixStudio — الاشتراك" },
      {
        name: "description",
        content: "Choose Free or Pro.",
      },
    ],
  }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const { data } = useWorkspace(user.id);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirming = Boolean(search.payment_id || search.invoice_id || search.payment_link_id);
  const [phase, setPhase] = useState<"idle" | "confirming" | "gift" | "error">(
    confirming ? "confirming" : "idle",
  );
  const [detail, setDetail] = useState<string | null>(null);
  const [giftEmail, setGiftEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) return;
    let cancelled = false;
    const paymentId = search.payment_id ?? null;
    const invoiceId = search.invoice_id ?? null;
    const paymentLinkId = search.payment_link_id ?? null;

    const run = async () => {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        try {
          const result = await confirmStreamPayReturn({
            data: { paymentId, invoiceId, paymentLinkId },
          });
          if (cancelled) return;
          if (result.ok && result.activation === "direct") {
            const expiresAt = result.expiresAt;
            const expiryMs = expiresAt ? Date.parse(expiresAt) : 0;
            const daysLeft =
              expiryMs > Date.now() ? Math.max(0, Math.ceil((expiryMs - Date.now()) / 86_400_000)) : 0;
            queryClient.setQueryData(["subscription", user.id], {
              status: "active",
              expiresAt,
              activeCode: null,
              daysLeft,
              lifetime: daysLeft > 3650,
              isActive: expiryMs > Date.now(),
            });
            markGatewayCompleted();
            await queryClient.invalidateQueries({ queryKey: ["subscription", user.id] });
            await navigate({ to: "/dashboard", replace: true });
            return;
          }
          if (result.ok) {
            setGiftEmail(result.emailedTo);
            setPhase("gift");
            return;
          }
          if (result.error !== "unconfirmed" && result.error !== "activation_in_progress") {
            setDetail(
              result.error === "not_owner"
                ? t("gateway.return.notOwner")
                : result.error === "not_paid"
                  ? t("gateway.return.failed")
                  : t("gateway.return.unconfirmed"),
            );
            setPhase("error");
            return;
          }
        } catch (error) {
          console.error("[streampay] return confirm failed", error);
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!cancelled) {
        setDetail(t("gateway.return.unconfirmed"));
        setPhase("error");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    confirming,
    navigate,
    queryClient,
    search.invoice_id,
    search.payment_id,
    search.payment_link_id,
    t,
    user.id,
  ]);

  const failedReturn = search.streampay === "failed" && !confirming;

  return (
    <AppShell
      user={user}
      profile={data?.profile}
      title={t("subscription.title")}
      subtitle={t("subscription.subtitle")}
    >
      {phase === "confirming" ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-6 text-sm text-zinc-300">
          {t("gateway.return.confirming")}
        </p>
      ) : phase === "gift" ? (
        <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-6">
          <h2 className="text-lg font-semibold text-zinc-50">{t("gateway.return.giftTitle")}</h2>
          <p className="text-sm leading-relaxed text-zinc-200">
            {t("gateway.return.giftBody", { email: giftEmail ?? user.email ?? "" })}
          </p>
          <Button
            type="button"
            onClick={() => {
              markGatewayCompleted();
              void navigate({ to: "/dashboard" });
            }}
          >
            {t("gateway.return.dashboard")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {failedReturn || phase === "error" ? (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {detail ?? t("gateway.return.failed")}
            </p>
          ) : null}
          <GatewayPlansPanel />
        </div>
      )}
    </AppShell>
  );
}
