import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ProLockedScreen } from "@/components/subscription/ProLockedScreen";
import { useSubscription } from "@/hooks/useSubscription";
import { PRO_ONLY_WIDGET_TYPES } from "@/lib/plans";
import { supabase } from "@/lib/supabase/client";
import { isTestMode } from "@/lib/testMode";
import type { WidgetType } from "@/lib/widgets";

export const Route = createFileRoute("/_authenticated/widgets/$widgetId")({
  component: WidgetGate,
});

function WidgetGate() {
  const { user } = Route.useRouteContext();
  const userId = user?.id ?? "";
  const { widgetId } = useParams({ from: "/_authenticated/widgets/$widgetId" });
  const subscription = useSubscription(userId);

  const widget = useQuery({
    queryKey: ["widget-gate", widgetId],
    enabled: Boolean(widgetId) && !isTestMode(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("widgets")
        .select("id, type")
        .eq("id", widgetId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; type: WidgetType } | null;
    },
    staleTime: 60_000,
  });

  const needsPro =
    subscription.isSuccess &&
    !subscription.data.isActive &&
    widget.isSuccess &&
    widget.data != null &&
    (PRO_ONLY_WIDGET_TYPES as Set<string>).has(widget.data.type);

  if (needsPro) return <ProLockedScreen />;

  return <Outlet />;
}
