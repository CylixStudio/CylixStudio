import { useEffect, useRef, useState } from "react";

/**
 * Plays clips captured from Kick. Clips stored by us are raw MPEG-TS segments,
 * which browsers cannot decode natively, so those are remuxed with mpegts.js.
 */
export function ClipPlayer({ src, poster }: { src: string; poster?: string | undefined }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const safeSrc = typeof src === "string" ? src.trim() : "";
  const isTs =
    safeSrc.length > 0 &&
    (/\.ts(\?|$)/i.test(safeSrc) || /[?&]media=1(?:&|$)/.test(safeSrc));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!isTs || !safeSrc) return;
    const video = videoRef.current;
    if (!video) return;
    let destroyed = false;
    let player: { destroy: () => void } | null = null;

    void (async () => {
      try {
        const mpegts = (await import("mpegts.js")).default;
        if (destroyed || !mpegts.isSupported()) {
          if (!destroyed) setFailed(true);
          return;
        }
        const instance = mpegts.createPlayer({ type: "mpegts", isLive: false, url: safeSrc });
        player = instance;
        instance.attachMediaElement(video);
        instance.load();
        void Promise.resolve(instance.play()).catch(() => undefined);
      } catch {
        if (!destroyed) setFailed(true);
      }
    })();

    return () => {
      destroyed = true;
      try {
        player?.destroy();
      } catch {
        /* ignore teardown errors */
      }
    };
  }, [safeSrc, isTs]);

  if (!safeSrc) {
    return (
      <div className="grid size-full place-items-center bg-black text-sm text-muted-foreground">
        Clip unavailable
      </div>
    );
  }

  if (failed) {
    return (
      <div className="grid size-full place-items-center gap-2 bg-black p-4 text-center">
        <p className="text-sm text-muted-foreground">Could not play this clip in-browser.</p>
        <a
          href={safeSrc}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-primary hover:underline"
        >
          Open original
        </a>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      {...(isTs ? {} : { src: safeSrc })}
      poster={poster}
      controls
      autoPlay
      playsInline
      className="size-full"
      onError={() => setFailed(true)}
    />
  );
}
