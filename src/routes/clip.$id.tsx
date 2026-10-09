import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ClipPlayer } from "@/components/clips/ClipPlayer";

type ClipData = {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  duration: number;
  clippedBy: string;
  createdAt: string;
};

export const Route = createFileRoute("/clip/$id")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Watch Clip" },
      {
        name: "description",
        content: "Watch a Kick stream clip captured automatically by the CylixStudio !clip command.",
      },
      { property: "og:title", content: "CylixStudio — Watch Clip" },
      {
        property: "og:description",
        content: "A Kick stream moment captured by the CylixStudio clip bot.",
      },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClipPage,
});

function ClipPage() {
  const { id } = Route.useParams();
  const [clip, setClip] = useState<ClipData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/public/clip/${id}`)
      .then((res) => (res.ok ? (res.json() as Promise<ClipData>) : Promise.reject(new Error("missing"))))
      .then((data) => {
        if (cancelled) return;
        if (/^https:\/\/(www\.)?kick\.com\//i.test(data.url)) {
          window.location.replace(data.url);
          return;
        }
        setClip(data);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0a0a0a] p-6 text-foreground">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-2xl">
        <div className="aspect-video w-full bg-black">
          {clip ? (
            <ClipPlayer src={clip.url} poster={clip.thumbnail ?? undefined} />
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
              {missing ? "This clip is no longer available." : "Loading clip…"}
            </div>
          )}
        </div>
        {clip ? (
          <div className="space-y-1 p-5">
            <h1 className="text-lg font-semibold">{clip.title}</h1>
            <p className="text-sm text-muted-foreground">
              Clipped by {clip.clippedBy} · {Math.round(clip.duration)}s ·{" "}
              {new Date(clip.createdAt).toLocaleString()}
            </p>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Captured with CylixStudio</p>
    </main>
  );
}
