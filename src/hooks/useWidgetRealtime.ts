import { useEffect, useRef } from "react";

import { supabase } from "@/lib/supabase/client";
import { isMissingViewerSession } from "@/lib/supabase/sessionError";

export type WidgetBroadcast = {
  event: string;
  payload: Record<string, unknown>;
};

/**
 * Subscribes an overlay (or dashboard preview) to the widget's Supabase
 * Realtime broadcast topic. The server pushes on every ingested event,
 * timer change, goal change or simulated test so OBS updates instantly.
 */
export function useWidgetRealtime(
  widgetId: string | null | undefined,
  onMessage: (message: WidgetBroadcast) => void,
) {
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (!widgetId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`widget_${widgetId}`, { config: { broadcast: { self: true } } })
        .on("broadcast", { event: "*" }, (message) => {
          handler.current({
            event: String(message["event"] ?? "refresh"),
            payload: (message["payload"] ?? {}) as Record<string, unknown>,
          });
        })
        .subscribe();
    } catch (error) {
      // Public overlays authorize with the URL token. A missing browser session is not a failure.
      if (isMissingViewerSession(error)) return;
      throw error;
    }

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [widgetId]);
}
