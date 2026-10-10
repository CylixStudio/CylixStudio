import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { wheelSpinLockMs } from "@/components/widgets/SpinWheel";
import { useWidgetStream } from "@/hooks/useWidgetStream";
import { OVERLAY_FONT_STYLESHEET } from "@/lib/overlayTheme";

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
  const { widget, frame, remaining, goal, events, spin, spotlight, streamEvents, poll, prediction, tappers, chat, testMessages, status } =
    useWidgetStream(publicId);
  const [wheelVisible, setWheelVisible] = useState(false);
  const shownSpin = spin;
  const seenChatNonce = useRef<number | null>(null);

  useEffect(() => {
    if (widget?.type !== "SPIN_WHEEL") return;
    const nonce = shownSpin?.origin === "chat" ? shownSpin.nonce : 0;
    if (seenChatNonce.current === null) {
      seenChatNonce.current = nonce;
      return;
    }
    if (!nonce || nonce === seenChatNonce.current) return;
    seenChatNonce.current = nonce;
    setWheelVisible(true);
    const timer = window.setTimeout(() => setWheelVisible(false), wheelSpinLockMs() + 10_000);
    return () => window.clearTimeout(timer);
  }, [shownSpin?.nonce, shownSpin?.origin, widget?.type]);

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

  const hideWheel = widget?.type === "SPIN_WHEEL" && !wheelVisible;

  return (
    <main className="grid min-h-screen w-full place-items-center bg-transparent p-6">
      {widget && !hideWheel ? (
        <WidgetRenderer
          type={widget.type}
          config={widget.config}
          frame={frame}
          remaining={remaining}
          goal={goal}
          events={events}
          spotlight={spotlight}
          streamEvents={streamEvents}
          poll={poll}
          prediction={prediction}
          tappers={tappers}
          chat={chat}
          testMessages={testMessages}
          publicToken={publicId}
          spinIdle={false}
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
