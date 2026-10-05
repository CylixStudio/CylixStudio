import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SubathonElementControlPanel } from "@/components/widgets/SubathonElementControlPanel";
import { supabase } from "@/lib/supabase/client";
import { saveWidgetSettings } from "@/lib/widgets.functions";
import { useWidgetStream } from "@/hooks/useWidgetStream";

export const Route = createFileRoute("/_authenticated/widgets/$widgetId/control")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Timer Control Panel" },
      { name: "description", content: "Standalone live Subathon timer controls for streamers." },
      { property: "og:title", content: "CylixStudio — Timer Control Panel" },
      { property: "og:description", content: "Standalone live Subathon timer controls for streamers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TimerControlPopout,
});

function TimerControlPopout() {
  const { widgetId } = Route.useParams();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["widget-control", widgetId],
    queryFn: async () => {
      const { data, error } = await supabase.from("widgets").select("id, name, type, config, public_token, subathon_id").eq("id", widgetId).single();
      if (error) throw error;
      return data;
    },
  });
  const widget = query.data;
  const [config, setConfig] = useState<Record<string, unknown>>({});
  useEffect(() => { if (widget?.config) setConfig(widget.config as Record<string, unknown>); }, [widget?.config]);
  const stream = useWidgetStream(widget?.public_token ?? null);
  const saveWidget = useServerFn(saveWidgetSettings);
  const save = useMutation({
    mutationFn: async () => {
      await saveWidget({ data: { widgetId, config } });
    },
    onSuccess: () => {
      toast.success("Saved");
      void queryClient.invalidateQueries({ queryKey: ["widget-control", widgetId] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not save"),
  });

  if (!widget) return <main className="min-h-screen bg-background p-4 text-sm text-muted-foreground">Loading control panel…</main>;
  if (widget.type !== "SUBATHON_TIMER") return <main className="min-h-screen bg-background p-4 text-sm text-destructive">This control panel is only available for Subathon Timer widgets.</main>;

  return (
    <main className="min-h-screen bg-background p-3 text-foreground">
      <SubathonElementControlPanel
        widgetId={widget.id}
        subathonId={widget.subathon_id}
        frame={stream.frame}
        remaining={stream.remaining}
        config={config}
        onConfigChange={(key, value) => setConfig((current) => ({ ...current, [key]: value }))}
        onSaveConfig={() => save.mutateAsync()}
        compact
        lang="en"
      />
    </main>
  );
}