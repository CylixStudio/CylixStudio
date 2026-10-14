import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { LinkInBioPlatformLogo } from "@/components/link-in-bio/LinkInBioPlatformLogo";
import type { LinkPlatform } from "@/lib/linkInBio";
import { previewPlatformLive } from "@/lib/linkInBioLive.functions";
import type { PlatformLivePreviewData } from "@/lib/linkInBioLive";
import { cn } from "@/lib/utils";

function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return String(count);
}

export function PlatformLivePreview({
  platform,
  value,
  compact = false,
  youtubeLatestEnabled,
}: {
  platform: LinkPlatform;
  value: string;
  compact?: boolean;
  youtubeLatestEnabled?: boolean;
}) {
  const load = useServerFn(previewPlatformLive);
  const [debounced, setDebounced] = useState(value.trim());

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 480);
    return () => window.clearTimeout(timer);
  }, [value]);

  const query = useQuery({
    queryKey: ["link-in-bio-platform-live", platform, debounced, youtubeLatestEnabled],
    enabled: Boolean(debounced) && platform !== "whatsapp" && platform !== "snapchat",
    queryFn: () =>
      load({
        data: {
          platform,
          value: debounced,
          ...(youtubeLatestEnabled === undefined ? {} : { youtubeLatest: youtubeLatestEnabled }),
        },
      }),
    staleTime: 30_000,
    retry: false,
  });

  if (platform === "whatsapp" || !debounced) return null;
  if (platform === "snapchat") return null;

  if (query.isPending) {
    return <p className={cn("mt-3 text-[0.68rem]", compact ? "text-muted-foreground" : "text-white/35")}>Checking…</p>;
  }

  if (query.isError) {
    return (
      <p className={cn("mt-3 text-[0.68rem]", compact ? "text-muted-foreground" : "text-white/35")}>Can't load preview</p>
    );
  }

  const data = query.data;
  if (!data || data.kind === "empty") return null;
  return <PreviewBody data={data} compact={compact} platform={platform} />;
}

function PreviewBody({
  data,
  compact,
  platform,
}: {
  data: PlatformLivePreviewData;
  compact: boolean;
  platform: LinkPlatform;
}) {
  const muted = compact ? "text-muted-foreground" : "text-white/40";
  const frame = compact
    ? "mt-3 overflow-hidden rounded-xl border border-border/60"
    : "mt-3 overflow-hidden rounded-2xl border border-white/10";

  if (data.kind === "quiet" || data.kind === "need_key") {
    return <p className={cn("mt-3 text-[0.68rem]", muted)}>{data.message}</p>;
  }

  if (data.kind === "profile") {
    return (
      <p className={cn("mt-3 text-[0.68rem] leading-relaxed", muted)}>
        {data.message}{" "}
        <a href={data.href} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          {data.label}
        </a>
      </p>
    );
  }

  if (data.kind === "favicon") {
    return (
      <div className={cn("mt-3 flex items-center gap-2.5", muted)}>
        <LinkInBioPlatformLogo platform={platform} size={18} faviconUrl={data.faviconUrl} />
        <span className="truncate text-[0.68rem]">{data.host}</span>
      </div>
    );
  }

  if (data.kind === "discord") {
    const online = typeof data.online === "number" ? `${formatCount(data.online)} online` : null;
    const members = typeof data.members === "number" ? `${formatCount(data.members)} members` : null;
    return (
      <div className={cn("mt-3 text-[0.68rem] leading-relaxed", muted)}>
        <p className={compact ? "text-foreground" : "text-white/80"}>{data.name ?? "Discord server"}</p>
        <p>{[online, members].filter(Boolean).join(" · ") || "Invite looks valid"}</p>
      </div>
    );
  }

  if (data.kind === "live") {
    return (
      <div className={frame}>
        {data.thumbnailUrl ? (
          <img src={data.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
        ) : null}
        <div className="px-3 py-2">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-red-400">
            Live
            {typeof data.viewers === "number" ? ` · ${formatCount(data.viewers)} watching` : ""}
          </p>
          {data.title ? (
            <p className={cn("mt-0.5 truncate text-[0.72rem]", compact ? "text-foreground" : "text-white/85")}>
              {data.title}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (data.kind === "offline") {
    if (!data.thumbnailUrl && !data.title) {
      return <p className={cn("mt-3 text-[0.68rem]", muted)}>{data.message}</p>;
    }
    return (
      <div className={frame}>
        {data.thumbnailUrl ? <img src={data.thumbnailUrl} alt="" className="aspect-video w-full object-cover" /> : null}
        <div className="px-3 py-2">
          <p className={cn("text-[0.62rem] uppercase tracking-wide", muted)}>{data.message}</p>
          {data.title ? (
            <p className={cn("mt-0.5 truncate text-[0.72rem]", compact ? "text-foreground" : "text-white/85")}>
              {data.title}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (data.kind === "media") {
    return (
      <div className={frame}>
        {data.thumbnailUrl ? <img src={data.thumbnailUrl} alt="" className="aspect-video w-full object-cover" /> : null}
        <div className="flex items-center gap-2 px-3 py-2">
          {!data.thumbnailUrl ? <LinkInBioPlatformLogo platform={platform} size={18} /> : null}
          <div className="min-w-0">
            {data.author ? <p className={cn("truncate text-[0.62rem]", muted)}>{data.author}</p> : null}
            <p className={cn("truncate text-[0.72rem]", compact ? "text-foreground" : "text-white/85")}>
              {data.title ?? "Preview"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
