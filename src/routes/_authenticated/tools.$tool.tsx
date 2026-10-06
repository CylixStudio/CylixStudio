import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { GoalKindScreen } from "@/components/widgets/GoalKindScreen";
import { EventLabelsGuestCustomize } from "@/components/widgets/EventLabelsGuestCustomize";
import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { WheelGuestCustomize } from "@/components/widgets/WheelGuestCustomize";
import { useWorkspace } from "@/hooks/useWorkspace";
import { createWidget, widgetErrorText } from "@/lib/createWidget";
import { useLanguage } from "@/lib/i18n";
import { SIGNED_OUT_ERROR } from "@/lib/supabase/sessionError";
import { standaloneToolBySlug } from "@/lib/standaloneTools";
import { isTestMode } from "@/lib/testMode";

export const Route = createFileRoute("/_authenticated/tools/$tool")({
  head: () => ({
    meta: [{ title: "CylixStudio — Tools" }],
  }),
  component: ToolOpenPage,
});

function ToolOpenPage() {
  const { tool: slug } = Route.useParams();
  const { user } = Route.useRouteContext();
  const spec = standaloneToolBySlug(slug);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const workspace = useWorkspace(user?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!spec || spec.goalEditor || isTestMode() || started.current) return;
    started.current = true;
    void createWidget({
      userId: user.id,
      subathonId: workspace.data?.subathons[0]?.id ?? null,
      type: spec.type,
      name: spec.name,
    })
      .then((widget) => navigate({ to: "/widgets/$widgetId", params: { widgetId: widget.id } }))
      .catch((err: unknown) => {
        started.current = false;
        setError(widgetErrorText(err, t("tools.openFailed")));
      });
  }, [navigate, spec, t, user.id, workspace.data?.subathons]);

  if (spec?.slug === "wheel" && isTestMode()) {
    return (
      <AppShell user={user} profile={workspace.data?.profile} title={t(spec.nameKey)} subtitle={t(spec.descriptionKey)}>
        <WheelGuestCustomize />
      </AppShell>
    );
  }

  if (spec?.slug === "event-labels" && isTestMode()) {
    return (
      <AppShell user={user} profile={workspace.data?.profile} title={t(spec.nameKey)} subtitle={t(spec.descriptionKey)}>
        <EventLabelsGuestCustomize />
      </AppShell>
    );
  }

  if (spec?.goalEditor) {
    return (
      <AppShell user={user} profile={workspace.data?.profile} title={t(spec.nameKey)} subtitle={t(spec.descriptionKey)}>
        <GoalKindScreen spec={spec} userId={user.id} />
      </AppShell>
    );
  }

  return (
    <AppShell user={user} profile={workspace.data?.profile} title={spec ? t(spec.nameKey) : t("nav.tools")}>
      {isTestMode() || !spec ? (
        <SessionAwareError error={SIGNED_OUT_ERROR} signedOutLabel={t("tools.signedOut")} />
      ) : (
        <SessionAwareError error={error} signedOutLabel={t("tools.signedOut")} />
      )}
      {!isTestMode() && spec && !error ? (
        <p className="text-sm text-muted-foreground">{t("tools.opening")}</p>
      ) : null}
    </AppShell>
  );
}
