import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { GiveawayDisplay, type ClaimState, type DrawPhase } from "@/components/widgets/GiveawayDisplay";

type Payload = {
  keyword: string;
  draw: {
    phase: DrawPhase;
    winner: { username: string; platform: string } | null;
    claimState: ClaimState;
    claimUntil: string | null;
    overlayLayout?: "glass" | "direct" | "bold";
  } | null;
  lastWinner: { username: string; platform: string } | null;
  participants: Array<{ id: string; platform: string; username: string }>;
};

export const Route = createFileRoute("/overlay/giveaway")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : "",
  }),
  head: () => ({
    meta: [
      { title: "CylixStudio — Giveaway (OBS)" },
      { name: "description", content: "Transparent giveaway name cloud and winner reveal for OBS." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GiveawayOverlay,
});

function GiveawayOverlay() {
  const { token } = Route.useSearch();
  const [data, setData] = useState<Payload | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.body.classList.add("overlay-transparent");
    document.documentElement.style.background = "transparent";
    return () => document.body.classList.remove("overlay-transparent");
  }, []);

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    const load = async () => {
      const response = await fetch(`/api/public/giveaway/${encodeURIComponent(token)}/live`, {
        cache: "no-store",
      });
      if (!stopped && response.ok) setData(await response.json());
    };
    void load();
    const poll = setInterval(() => void load(), 2000);
    return () => {
      stopped = true;
      clearInterval(poll);
    };
  }, [token]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const draw = data?.draw ?? null;
  const claimUntil = draw?.claimUntil ? Date.parse(draw.claimUntil) : 0;
  const claimLeft = claimUntil ? Math.max(0, Math.round((claimUntil - now) / 1000)) : 0;
  const claimState: ClaimState =
    draw?.claimState === "confirmed"
      ? "confirmed"
      : claimUntil && claimLeft <= 0
        ? "expired"
        : (draw?.claimState ?? "pending");

  return (
    <main className="h-screen w-screen bg-transparent">
      <GiveawayDisplay
        participants={data?.participants ?? []}
        winner={draw?.winner ?? null}
        phase={draw?.phase ?? "idle"}
        claimState={claimState}
        claimLeft={claimLeft}
        keyword={data?.keyword ?? "+1"}
        lastWinner={data?.lastWinner ?? null}
        expanded
        transparent
        layout={data?.draw?.overlayLayout === "direct" || data?.draw?.overlayLayout === "bold" ? data.draw.overlayLayout : "glass"}
      />
    </main>
  );
}
