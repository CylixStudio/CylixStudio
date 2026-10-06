import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { SessionAwareError } from "@/components/widgets/SessionAwareError";
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
    if (!spec || isTestMode() || started.current) return;
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
