import assert from "node:assert/strict";
import test from "node:test";

import {
  applySavedLinkOrder,
  beginLinkOrder,
  bentoCellsOverlap,
  cachedYoutubeLatest,
  cancelLinkOrder,
  clearYoutubeLatestCacheForTests,
  linkIdsInSavedOrder,
  moveLinkInList,
  moveLinkOrderDraft,
  normalizeLink,
  publicLinkInBioPayload,
  stripYoutubeLatestWhenDisabled,
  type LinkInBioLink,
  type LinkInBioState,
  type StreamStatus,
} from "../src/lib/linkInBio.ts";

function link(partial: Partial<LinkInBioLink> & { id: string; platform: LinkInBioLink["platform"]; url: string }): LinkInBioLink {
  return normalizeLink(
    {
      title: partial.title ?? partial.platform,
      enabled: true,
      featured: false,
      cardSize: "inherit",
      colSpan: 1,
      rowSpan: 1,
      gridX: 0,
      gridY: 0,
      ...partial,
    },
    partial.sortOrder ?? 0,
  );
}

const urls = {
  kick: "https://kick.com/keeper",
  twitch: "https://www.twitch.tv/twitcher",
  youtube: "https://www.youtube.com/@channel",
  x: "https://x.com/poster",
  discord: "https://discord.gg/invite",
  whatsapp: "https://chat.whatsapp.com/community",
};

function sampleLinks(): LinkInBioLink[] {
  return [
    link({ id: "kick", platform: "kick", url: urls.kick, title: "Kick", sortOrder: 0, colSpan: 1, rowSpan: 1 }),
    link({ id: "wide", platform: "twitch", url: urls.twitch, title: "Twitch", sortOrder: 1, colSpan: 2, rowSpan: 1 }),
    link({ id: "tall", platform: "x", url: urls.x, title: "X", sortOrder: 2, colSpan: 1, rowSpan: 2 }),
    link({ id: "yt", platform: "youtube", url: urls.youtube, title: "YouTube", sortOrder: 3, colSpan: 2, rowSpan: 2 }),
    link({ id: "discord", platform: "discord", url: urls.discord, title: "Discord", sortOrder: 4, colSpan: 1, rowSpan: 1 }),
    link({ id: "wa", platform: "whatsapp", url: urls.whatsapp, title: "WhatsApp", sortOrder: 5, colSpan: 1, rowSpan: 1 }),
  ];
}

test("move first link to last and last to first without dropping or duplicating", () => {
  const ids = ["a", "b", "c", "d"];
  const firstToLast = moveLinkInList(ids, 0, ids.length - 1);
  assert.deepEqual(firstToLast, ["b", "c", "d", "a"]);
  assert.equal(new Set(firstToLast).size, ids.length);

  const lastToFirst = moveLinkInList(ids, ids.length - 1, 0);
  assert.deepEqual(lastToFirst, ["d", "a", "b", "c"]);
  assert.equal(new Set(lastToFirst).size, ids.length);
  assert.deepEqual(moveLinkInList(ids, 0, 9), ids);
});

test("mixed card sizes keep their spans and do not overlap", () => {
  const links = sampleLinks();
  const spans = links.map((item) => [item.id, item.colSpan, item.rowSpan]);
  const ordered = applySavedLinkOrder(links, ["yt", "kick", "wide", "tall", "discord", "wa"]);
  assert.deepEqual(
    ordered.map((item) => [item.id, item.colSpan, item.rowSpan]),
    [
      ["yt", 2, 2],
      ["kick", 1, 1],
      ["wide", 2, 1],
      ["tall", 1, 2],
      ["discord", 1, 1],
      ["wa", 1, 1],
    ],
  );
  assert.deepEqual(
    spans,
    links.map((item) => [item.id, item.colSpan, item.rowSpan]),
  );
  assert.equal(bentoCellsOverlap(ordered), false);
  assert.deepEqual(ordered.map((item) => item.id), linkIdsInSavedOrder(ordered));
});

test("save order is what a reload would read, and cancel restores", () => {
  const links = sampleLinks();
  const session = beginLinkOrder(links);
  const moved = moveLinkOrderDraft(moveLinkOrderDraft(session, 0, links.length - 1), 0, 0);
  const lastToFirst = moveLinkOrderDraft(beginLinkOrder(links), links.length - 1, 0);
  assert.deepEqual(cancelLinkOrder(moved).draftIds, session.committedIds);
  assert.deepEqual(moved.committedIds, session.committedIds);

  const saved = applySavedLinkOrder(links, lastToFirst.draftIds);
  assert.deepEqual(linkIdsInSavedOrder(saved), lastToFirst.draftIds);
  assert.deepEqual(saved.map((item) => item.url), [
    urls.whatsapp,
    urls.kick,
    urls.twitch,
    urls.x,
    urls.youtube,
    urls.discord,
  ]);
});

test("reorder leaves Kick, Twitch, X, Discord, and WhatsApp urls untouched", () => {
  const links = sampleLinks();
  const saved = applySavedLinkOrder(links, ["wa", "discord", "yt", "x", "wide", "kick"]);
  const byId = new Map(saved.map((item) => [item.id, item]));
  assert.equal(byId.get("kick")?.url, urls.kick);
  assert.equal(byId.get("wide")?.url, urls.twitch);
  assert.equal(byId.get("tall")?.url, urls.x);
  assert.equal(byId.get("discord")?.url, urls.discord);
  assert.equal(byId.get("wa")?.url, urls.whatsapp);
  assert.equal(byId.get("yt")?.url, urls.youtube);
  assert.equal(saved.filter((item) => item.platform === "youtube").length, 1);
});

test("youtube latest gate skips the fetch, keeps the channel, and does not duplicate on re-enable", async () => {
  clearYoutubeLatestCacheForTests();
  let calls = 0;
  const fetchYoutubeLatestVideos = async () => {
    calls += 1;
    return { title: "New video", url: "https://www.youtube.com/watch?v=abc", thumbnailUrl: null };
  };

  const skipped = await cachedYoutubeLatest("channel", false, fetchYoutubeLatestVideos, 1_000);
  assert.equal(skipped, null);
  assert.equal(calls, 0);

  const first = await cachedYoutubeLatest("channel", true, fetchYoutubeLatestVideos, 1_000);
  assert.equal(calls, 1);
  const cached = await cachedYoutubeLatest("channel", true, fetchYoutubeLatestVideos, 2_000);
  assert.equal(calls, 1);
  assert.equal(cached, first);

  const hidden = await cachedYoutubeLatest("channel", false, fetchYoutubeLatestVideos, 3_000);
  assert.equal(hidden, null);
  assert.equal(calls, 1);

  const again = await cachedYoutubeLatest("channel", true, fetchYoutubeLatestVideos, 4_000);
  assert.equal(calls, 1);
  assert.deepEqual(again, first);

  const links = sampleLinks();
  const youtubeCount = links.filter((item) => item.platform === "youtube").length;
  assert.equal(links.filter((item) => item.platform === "youtube").length, youtubeCount);
  assert.equal(links.find((item) => item.platform === "youtube")?.url, urls.youtube);

  const stream: StreamStatus = {
    kind: "offline",
    platform: "youtube",
    latest: { title: "New video", url: "https://www.youtube.com/watch?v=abc", thumbnailUrl: null },
    channelUrl: urls.youtube,
  };
  const off = stripYoutubeLatestWhenDisabled(stream, false);
  assert.equal(off && off.kind === "offline" ? off.latest : "live", null);
  assert.equal(off && off.kind === "offline" ? off.channelUrl : null, urls.youtube);

  const state = {
    profile: {
      slug: "name",
      displayName: "Name",
      bio: "",
      avatarUrl: "",
      headerUrl: "",
      published: true,
      publishedAt: null,
      setupCompleted: true,
      usernameChangedAt: null,
    },
    theme: { youtubeLatestEnabled: false },
    links,
    kickUsername: null,
    twitchUsername: null,
    scheduleShareToken: null,
    scheduleTitle: null,
  } as LinkInBioState;
  const payload = publicLinkInBioPayload(state, { stream });
  assert.equal(payload.stream && payload.stream.kind === "offline" ? payload.stream.latest : "shown", null);
  assert.equal(payload.links.filter((item) => item.platform === "youtube").length, 1);
  assert.equal(payload.links.find((item) => item.platform === "youtube")?.url, urls.youtube);

  const failed = await cachedYoutubeLatest("other", true, async () => {
    throw new Error("youtube down");
  }, 1_000);
  assert.equal(failed, null);
});
