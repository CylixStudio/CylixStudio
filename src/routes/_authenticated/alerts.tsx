import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useLanguage } from "@/lib/i18n";
export const Route = createFileRoute("/_authenticated/alerts")({ component: AlertsGate });
function AlertsGate() {
  const { user, workspaceOwnerId } = Route.useRouteContext();
  const { t } = useLanguage();
  const access = useQuery({
    queryKey: ["alerts-access", user.id, workspaceOwnerId],
    queryFn: async () => {
      const r = await fetch("/api/alerts/access", { cache: "no-store" });
      return r.ok;
    },
    retry: false,
  });
  if (access.data === true) return <Outlet />;
  return (
    <AppShell title={t("alerts.title")} user={user}>
      <section className="mx-auto max-w-xl rounded-2xl border border-primary/20 bg-[#0a0a0a] p-8 text-center">
        <LockKeyhole className="mx-auto mb-4 text-primary" size={30} />
        <h2>{t("nav.alerts.earlyAccess")}</h2>
        <p className="mt-3 text-muted-foreground">
          {access.isPending ? t("alerts.loading") : t("nav.alerts.locked")}
        </p>
      </section>
    </AppShell>
  );
}
