import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { GatewayPlansPanel } from "@/components/onboarding/GatewayPage";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/subscription")({
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
  const { data } = useWorkspace(user.id);
  const { t } = useLanguage();

  return (
    <AppShell
      user={user}
      profile={data?.profile}
      title={t("subscription.title")}
      subtitle={t("subscription.subtitle")}
    >
      <GatewayPlansPanel />
    </AppShell>
  );
}
