import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Rules & Logic lives only inside the Subathon widget sidebar. */
export const Route = createFileRoute("/_authenticated/widgets/$widgetId/rules")({
  component: WidgetRulesRedirect,
});

function WidgetRulesRedirect() {
  const { widgetId } = Route.useParams();
  return <Navigate to="/widgets/$widgetId" params={{ widgetId }} replace />;
}
