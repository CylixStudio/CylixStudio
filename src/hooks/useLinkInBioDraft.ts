import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { toast } from "sonner";

import { notePlanError } from "@/components/subscription/upgradePlan";

import {
  checkTestSlugAvailable,
  DEFAULT_PROFILE,
  DEFAULT_THEME,
  handleFromUrl,
  hostnameFromLink,
  linkToInput,
  loadTestLinkInBio,
  MAX_CUSTOM_LINKS,
  publicLinkInBioPayload,
  replaceTestLinks,
  saveTestLinkInBio,
  applyUsernameClaim,
  sanitizeHandle,
  sanitizeSlug,
  sanitizeTheme,
  slugError,
  urlFromHandle,
  type LinkInBioLink,
  type LinkInBioProfile,
  type LinkInBioState,
  type LinkInBioTheme,
  type LinkPlatform,
} from "@/lib/linkInBio";
import {
  checkLinkInBioSlug,
  getLinkInBioState,
  previewLinkInBioStream,
  replaceLinkInBioLinks,
  saveLinkInBioProfile,
  saveLinkInBioTheme,
} from "@/lib/linkInBio.functions";
import { loadTestSchedule } from "@/lib/schedule";
import { isTestMode } from "@/lib/testMode";

export type SocialPlatform = Exclude<LinkPlatform, "custom">;
export type CustomLinkDraft = { id: string; url: string };
export type HandleMap = Record<SocialPlatform, string> & { custom: CustomLinkDraft[] };

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  "kick",
  "twitch",
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "discord",
  "snapchat",
  "whatsapp",
];

export function newCustomDraft(url = ""): CustomLinkDraft {
  return { id: crypto.randomUUID(), url };
}

export function normalizeCustomDrafts(slots: CustomLinkDraft[]): CustomLinkDraft[] {
  const next = slots.slice(0, MAX_CUSTOM_LINKS);
  while (next.length > 1 && !next[next.length - 1]?.url.trim() && !next[next.length - 2]?.url.trim()) {
    next.pop();
  }
  if (next.length === 0) return [newCustomDraft()];
  const last = next[next.length - 1];
  const lastValid = Boolean(last && urlFromHandle("custom", last.url));
  if (lastValid && next.length < MAX_CUSTOM_LINKS) return [...next, newCustomDraft()];
  return next;
}

export function createEmptyHandles(): HandleMap {
  return {
    kick: "",
    twitch: "",
    youtube: "",
    tiktok: "",
    instagram: "",
    snapchat: "",
    x: "",
    discord: "",
    whatsapp: "",
    custom: [newCustomDraft()],
  };
}

export const EMPTY_HANDLES: HandleMap = createEmptyHandles();

export function handlesFromLinks(links: LinkInBioLink[]): HandleMap {
  const next = createEmptyHandles();
  next.custom = [];
  for (const link of links) {
    if (link.kind === "gallery") continue;
    if (link.platform === "custom") {
      next.custom.push({ id: link.id, url: link.url });
      continue;
    }
    next[link.platform] = handleFromUrl(link.platform, link.url);
  }
  next.custom = normalizeCustomDrafts(next.custom);
  return next;
}

export function linksFromHandles(handles: HandleMap, previous: LinkInBioLink[]): LinkInBioLink[] {
  const now = new Date().toISOString();
  const socialLinks = SOCIAL_PLATFORMS.flatMap((platform) => {
    const value = handles[platform].trim();
    if (!value) return [];
    const url = urlFromHandle(platform, value);
    if (!url) return [];
    const existing = previous.find((link) => link.kind === "link" && link.platform === platform);
    return [toPlatformLink(platform, url, existing, now, platformLabel(platform))];
  });
  const previousCustom = previous.filter((link) => link.kind === "link" && link.platform === "custom");
  const used = new Set<string>();
  const customLinks = normalizeCustomDrafts(handles.custom).flatMap((slot) => {
    const url = urlFromHandle("custom", slot.url);
    if (!url) return [];
    const existing =
      previous.find((link) => link.id === slot.id && link.platform === "custom") ??
      previousCustom.find((link) => !used.has(link.id) && link.url === url) ??
      previousCustom.find((link) => !used.has(link.id));
    if (existing) used.add(existing.id);
    const host = hostnameFromLink(url);
    const title =
      existing?.title && existing.title !== "Link" ? existing.title : (host ?? "Link");
    return [toPlatformLink("custom", url, existing, now, title, slot.id)];
  });
  const galleries = previous.filter((link) => link.kind === "gallery");
  return [...socialLinks, ...customLinks, ...galleries].map((link, index) => ({ ...link, sortOrder: index }));
}

function toPlatformLink(
  platform: LinkPlatform,
  url: string,
  existing: LinkInBioLink | undefined,
  now: string,
  title: string,
  fallbackId?: string,
): LinkInBioLink {
  return {
    id: existing?.id ?? fallbackId ?? crypto.randomUUID(),
    title,
    url,
    platform,
    cardSize: existing?.cardSize ?? "inherit",
    sortOrder: existing?.sortOrder ?? 0,
    featured: existing?.featured ?? false,
    enabled: true,
    kind: "link",
    gridX: existing?.gridX ?? 0,
    gridY: existing?.gridY ?? 0,
    colSpan: existing?.colSpan ?? 1,
    rowSpan: existing?.rowSpan ?? 1,
    galleryImages: [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function platformLabel(platform: LinkPlatform) {
  if (platform === "kick") return "Kick";
  if (platform === "twitch") return "Twitch";
  if (platform === "youtube") return "YouTube";
  if (platform === "tiktok") return "TikTok";
  if (platform === "instagram") return "Instagram";
  if (platform === "snapchat") return "Snapchat";
  if (platform === "x") return "X";
  if (platform === "discord") return "Discord";
  if (platform === "whatsapp") return "WhatsApp Community";
  return "Link";
}

export function useLinkInBioDraft(userId: string) {
  const test = isTestMode();
  const queryClient = useQueryClient();
  const loadLive = useServerFn(getLinkInBioState);
  const persistProfile = useServerFn(saveLinkInBioProfile);
  const persistTheme = useServerFn(saveLinkInBioTheme);
  const persistLinks = useServerFn(replaceLinkInBioLinks);
  const checkSlug = useServerFn(checkLinkInBioSlug);
  const loadStream = useServerFn(previewLinkInBioStream);

  const stateQuery = useQuery({
    queryKey: ["link-in-bio", userId, test],
    queryFn: async (): Promise<LinkInBioState> => {
      if (!test) return loadLive();
      const stored = loadTestLinkInBio();
      const schedule = loadTestSchedule();
      return {
        ...stored,
        scheduleShareToken: schedule.settings.shareToken || stored.scheduleShareToken,
        scheduleTitle: schedule.settings.title || stored.scheduleTitle,
      };
    },
  });

  const streamQuery = useQuery({
    queryKey: ["link-in-bio-stream", userId, test],
    enabled: !test && Boolean(stateQuery.data),
    queryFn: () => loadStream(),
    staleTime: 60_000,
  });

  const [profile, setProfile] = useState<LinkInBioProfile>(DEFAULT_PROFILE);
  const [theme, setTheme] = useState<LinkInBioTheme>(DEFAULT_THEME);
  const [links, setLinks] = useState<LinkInBioLink[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const slugTimer = useRef(0);

  useEffect(() => {
    if (hydrated) return;
    if (stateQuery.data) {
      setProfile(stateQuery.data.profile);
      setTheme(sanitizeTheme(stateQuery.data.theme));
      setLinks(stateQuery.data.links);
      setHydrated(true);
      return;
    }
    if (stateQuery.isFetched) setHydrated(true);
  }, [stateQuery.data, stateQuery.isFetched, hydrated]);

  const preview = useMemo(
    () =>
      publicLinkInBioPayload(
        {
          profile,
          theme,
          links,
          kickUsername: stateQuery.data?.kickUsername ?? null,
          twitchUsername: stateQuery.data?.twitchUsername ?? null,
          scheduleShareToken: stateQuery.data?.scheduleShareToken ?? null,
          scheduleTitle: stateQuery.data?.scheduleTitle ?? null,
        },
        test ? undefined : streamQuery.data,
      ),
    [profile, theme, links, stateQuery.data, streamQuery.data, test],
  );

  const persist = async (
    nextProfile = profile,
    nextTheme = theme,
    nextLinks = links,
  ) => {
    if (test) {
      const stored = loadTestLinkInBio();
      const claim = applyUsernameClaim(stored.profile, nextProfile.slug);
      if ("error" in claim) throw new Error(claim.error);
      const claimed = { ...nextProfile, usernameChangedAt: claim.usernameChangedAt };
      setProfile(claimed);
      saveTestLinkInBio({
        profile: claimed,
        theme: sanitizeTheme(nextTheme),
        links: nextLinks,
        kickUsername: stateQuery.data?.kickUsername ?? null,
        twitchUsername: stateQuery.data?.twitchUsername ?? null,
        scheduleShareToken: stateQuery.data?.scheduleShareToken ?? null,
        scheduleTitle: stateQuery.data?.scheduleTitle ?? null,
      });
      replaceTestLinks(nextLinks.map(linkToInput));
      return;
    }
    const profileResult = await persistProfile({
      data: { ...nextProfile, slug: sanitizeSlug(nextProfile.slug) },
    });
    if (!profileResult.ok) throw new Error(profileResult.error);
    const themeResult = await persistTheme({ data: nextTheme });
    if (!themeResult.ok) throw new Error(themeResult.error);
    const linksResult = await persistLinks({ data: { links: nextLinks.map(linkToInput) } });
    if (!linksResult.ok) throw new Error(linksResult.error);
  };

  const save = useMutation({
    mutationFn: async (payload?: { profile?: LinkInBioProfile; theme?: LinkInBioTheme; links?: LinkInBioLink[] }) => {
      const nextProfile = payload?.profile ?? profile;
      const nextTheme = payload?.theme ?? theme;
      const nextLinks = payload?.links ?? links;
      await persist(nextProfile, nextTheme, nextLinks);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["link-in-bio", userId, test] }),
    onError: (error: Error) => {
      if (notePlanError(error)) return;
      toast.error(
        error.message === "slug_taken"
          ? "That username is taken."
          : error.message === "slug_cooldown"
            ? "Usernames can only be changed once every 30 days."
            : error.message === "slug_reserved" || error.message === "slug_invalid" || error.message === "slug_required"
              ? "Choose a valid public username."
              : "Could not save.",
      );
    },
  });

  useEffect(() => {
    const slug = sanitizeSlug(profile.slug);
    if (!slug) {
      setSlugStatus("idle");
      return;
    }
    const invalid = slugError(slug);
    if (invalid) {
      setSlugStatus("invalid");
      return;
    }
    window.clearTimeout(slugTimer.current);
    slugTimer.current = window.setTimeout(() => {
      setSlugStatus("checking");
      if (test) {
        const result = checkTestSlugAvailable(slug, stateQuery.data?.profile.slug ?? "");
        setSlugStatus(result.available ? "available" : result.error === "slug_taken" ? "taken" : "invalid");
        return;
      }
      void checkSlug({ data: { slug } }).then((result) => {
        setSlugStatus(result.available ? "available" : result.error === "slug_taken" ? "taken" : "invalid");
      });
    }, 320);
    return () => window.clearTimeout(slugTimer.current);
  }, [profile.slug, test, checkSlug, stateQuery.data?.profile.slug]);

  const applyHandles = (handles: HandleMap) => {
    setLinks(linksFromHandles(handles, links));
  };

  const patchTheme = (next: SetStateAction<LinkInBioTheme>) => {
    setTheme((prev) => sanitizeTheme(typeof next === "function" ? next(prev) : next));
  };

  return {
    test,
    loading: !hydrated,
    state: stateQuery.data,
    profile,
    setProfile,
    theme,
    setTheme: patchTheme,
    links,
    setLinks,
    preview,
    slugStatus,
    save,
    persist,
    applyHandles,
    sanitizeHandle,
  };
}
