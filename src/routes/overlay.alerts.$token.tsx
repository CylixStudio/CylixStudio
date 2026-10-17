import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertStage, type AlertStageHandle } from "@/components/alerts/AlertStage";
import { ALERT_FONT_HREF, type AlertEvent } from "@/lib/alertStudio";
import { useLanguage } from "@/lib/i18n";
import "@/components/alerts/alerts.css";
export const Route = createFileRoute("/overlay/alerts/$token")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Alerts Overlay" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
    links: [{ rel: "stylesheet", href: ALERT_FONT_HREF }],
  }),
  component: AlertsOverlay,
});
function AlertsOverlay() {
  const { token } = Route.useParams();
  const { t } = useLanguage();
  const [current, setCurrent] = useState<AlertEvent | null>(null),
    [missing, setMissing] = useState(false);
  const stage = useRef<AlertStageHandle>(null);
  useEffect(() => {
    document.body.classList.add("overlay-transparent");
    const previous = document.documentElement.style.background;
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.classList.remove("overlay-transparent");
      document.documentElement.style.background = previous;
    };
  }, []);
  useEffect(() => {
    let cancelled = false,
      working = false,
      active: string | null = null,
      timer: ReturnType<typeof setTimeout> | null = null;
    const overlayId = crypto.randomUUID(),
      url = "/api/public/alerts/" + encodeURIComponent(token) + "/";
    const post = (action: string, body: object) =>
      fetch(url + action, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const end = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      active = null;
      setCurrent(null);
    };
    const tick = async () => {
      if (cancelled || working) return;
      working = true;
      try {
        const status = await fetch(url + "status", { cache: "no-store" });
        if (status.status === 404) {
          setMissing(true);
          return;
        }
        if (!status.ok) return;
        const state = await status.json();
        if (cancelled) return;
        if (active && state.currentId !== active) end();
        if (active || state.paused) return;
        const r = await post("claim", { overlayId });
        if (!r.ok) return;
        const claim = await r.json();
        if (cancelled) return;
        if (claim.status !== "granted" || !claim.event) return;
        active = claim.event.id;
        setCurrent(claim.event);
        timer = setTimeout(
          () => {
            void post("ack", { overlayId, id: claim.event.id, claimId: claim.claimId }).finally(
              () => {
                if (!cancelled) {
                  end();
                  void tick();
                }
              },
            );
          },
          claim.event.config.delayMs + claim.event.config.durationMs + 400,
        );
      } catch {
        /* next poll retries; no local queue or optimistic claim */
      } finally {
        working = false;
      }
    };
    void post("presence", { overlayId });
    void tick();
    const poll = setInterval(() => void tick(), 1500),
      presence = setInterval(() => void post("presence", { overlayId }), 8000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(presence);
      if (timer) clearTimeout(timer);
    };
  }, [token]);
  useEffect(() => {
    if (!current) return;
    const id = requestAnimationFrame(() => stage.current?.play());
    return () => cancelAnimationFrame(id);
  }, [current]);
  return (
    <main className="grid min-h-screen place-items-center bg-transparent p-8">
      {missing ? <p>{t("alerts.badOverlay")}</p> : null}
      {current ? (
        <AlertStage
          key={current.id}
          ref={stage}
          mode="overlay"
          config={current.config}
          alertId={current.alertId}
          username={current.username}
          count={current.count}
          months={current.months}
          amount={current.amount}
          message={current.message}
          visualId={current.visualId}
          visualMime={current.visualMime}
          audioId={current.audioId}
        />
      ) : null}
    </main>
  );
}
