import { useEffect, useState } from "react";

/**
 * Nitro's dev asset middleware skips dynamic API routes for image/audio/video
 * destinations. Fetch uploaded private media as a blob; remote URLs stay direct.
 * Blob URLs are revoked on replacement and unmount, including aborted fetches.
 */
export function useAlertMediaUrl(url: string | null) {
  const local = Boolean(url?.startsWith("/api/alerts/media/"));
  const [loaded, setLoaded] = useState<{ input: string; url: string; failed: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (!url || !local) return;
    const controller = new AbortController();
    let objectUrl = "";
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("media_unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ input: url, url: objectUrl, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ input: url, url: "", failed: true });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, local]);
  return {
    url: local ? (loaded?.input === url ? loaded.url : "") : (url ?? ""),
    failed: local && loaded?.input === url && loaded.failed,
  };
}
