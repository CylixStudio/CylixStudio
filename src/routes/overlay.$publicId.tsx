import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { useWidgetStream } from "@/hooks/useWidgetStream";
import { OVERLAY_FONT_STYLESHEET } from "@/lib/overlayTheme";
import { spinPublicWheel } from "@/lib/toolWidgets.functions";
import type { SpinState } from "@/lib/widgets";

export const Route = createFileRoute("/overlay/$publicId")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Stream Widget (OBS)" },
      {
        name: "description",
        content:
          "Transparent OBS browser source rendering live subathon timers, goals, alerts and activity over Server-Sent Events.",
      },
      { property: "og:title", content: "CylixStudio — Stream Widget (OBS)" },
      {
        property: "og:description",
        content: "Transparent live widget for OBS and Streamlabs Desktop.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "stylesheet", href: OVERLAY_FONT_STYLESHEET }],
  }),
  component: OverlayPage,
});

function OverlayPage() {
  const { publicId } = Route.useParams();
  const { widget, frame, remaining, goal, events, spin, spotlight, streamEvents, tappers, chat, testMessages, status } =
    useWidgetStream(publicId);
  const [localSpin, setLocalSpin] = useState<SpinState | null>(null);
  const [spinning, setSpinning] = useState(false);
  const shownSpin = localSpin && localSpin.nonce >= (spin?.nonce ?? 0) ? localSpin : spin;

  const spinWheel = async () => {
    if (!widget || widget.type !== "SPIN_WHEEL" || spinning) return;
    setSpinning(true);
    try {
      const result = await spinPublicWheel({ data: { publicToken: publicId } });
      if (result.ok) {
        setLocalSpin({ result: result.result, spunAt: result.spunAt, nonce: result.nonce });
      }
    } finally {
      setSpinning(false);
    }
  };

  // OBS composites the page over the scene, so nothing may paint a background.
  useEffect(() => {
    document.body.classList.add("overlay-transparent");
    const previousHtml = document.documentElement.style.background;
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.classList.remove("overlay-transparent");
      document.documentElement.style.background = previousHtml;
    };
  }, []);

  return (
    <main className="grid min-h-screen w-full place-items-center bg-transparent p-6">
      {widget ? (
        <WidgetRenderer
          type={widget.type}
          config={widget.config}
          frame={frame}
          remaining={remaining}
          goal={goal}
          events={events}
          spotlight={spotlight}
          streamEvents={streamEvents}
          tappers={tappers}
          chat={chat}
          testMessages={testMessages}
          publicToken={publicId}
          spinning={spinning}
          onSpin={widget.type === "SPIN_WHEEL" ? () => void spinWheel() : undefined}
          spin={shownSpin}
        />
      ) : null}
      {status === "error" ? (
        <span className="sr-only" role="status">
          Reconnecting to the widget stream
        </span>
      ) : null}
    </main>
  );
}
