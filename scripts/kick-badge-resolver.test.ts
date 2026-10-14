import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogFromPayload,
  createKickBadgeCatalogCache,
  KICK_BADGE_TYPES_WITHOUT_FILE,
  ownerSubscriberTier,
  readKickDefaultSubscriberBadge,
  readOwnerSubscriberTiers,
  resolveKickBadgeImage,
  subscriberBadgeFileError,
  type KickBadgeAssets,
} from "../src/lib/kickBadgeResolver.ts";
import { appendChatLine, chatStatusLabel, parseOverlayChat, viewerLineFromKick } from "../src/lib/overlayChat.ts";

const channelPayload = {
  subscriber_badges: [
    { id: 1, months: 1, badge_image: { src: "https://files.kick.com/badges/month-1.png", srcset: "" } },
    {
      id: 2,
      months: 6,
      badge_image: {
        src: "https://files.kick.com/badges/month-6.png",
        srcset: "https://files.kick.com/badges/month-6-2x.png 2x",
      },
    },
    { id: 3, months: 12, badge_image: { srcset: "https://files.kick.com/badges/month-12.png 2x" } },
  ],
  role_badges: [
    { type: "moderator", badge_image: { src: "https://files.kick.com/badges/moderator.png" } },
    { type: "founder", badge_image: { src: "https://files.kick.com/badges/founder.png" } },
    { type: "subscriber", badge_image: { src: "https://files.kick.com/badges/global-sub-must-not-win.png" } },
  ],
};

test("subscriber months use the channel src and do not collide with global badges", () => {
  const catalog = catalogFromPayload(channelPayload);
  assert.equal(
    resolveKickBadgeImage({ type: "subscriber", count: 7 }, catalog),
    "https://files.kick.com/badges/month-6.png",
  );
  assert.equal(
    resolveKickBadgeImage({ type: "subscriber", count: 12 }, catalog),
    "https://files.kick.com/badges/month-12.png",
  );
  assert.equal(
    resolveKickBadgeImage({ type: "founder", count: 1 }, catalog),
    "https://files.kick.com/badges/founder.png",
  );
  assert.equal(
    resolveKickBadgeImage({ type: "moderator" }, catalog),
    "https://files.kick.com/badges/moderator.png",
  );
  assert.equal(catalog.global["subscriber"], undefined);
  assert.equal(catalog.global["1"], undefined);
});

test("a subscriber tier outranks a url on the same message", () => {
  const catalog = catalogFromPayload(channelPayload);
  assert.equal(
    resolveKickBadgeImage(
      { type: "subscriber", count: 1, imageUrl: "https://files.kick.com/badges/on-message.png" },
      catalog,
    ),
    "https://files.kick.com/badges/month-1.png",
  );
  assert.equal(
    resolveKickBadgeImage(
      { type: "moderator", imageUrl: "https://files.kick.com/badges/on-message.png" },
      { subscriberTiers: [], global: {} },
    ),
    "https://files.kick.com/badges/on-message.png",
  );
});

test("a successful catalog fetch is reused for the next line", async () => {
  let calls = 0;
  const cache = createKickBadgeCatalogCache(async () => {
    calls += 1;
    return channelPayload;
  });
  const first = await cache.load("Keeper");
  const second = await cache.load("keeper");
  assert.equal(calls, 1);
  assert.equal(
    resolveKickBadgeImage({ type: "subscriber", count: 2 }, second),
    resolveKickBadgeImage({ type: "subscriber", count: 2 }, first),
  );
});

test("a failed badge catalog fetch still stores the chat line and is not fetched again", async () => {
  let calls = 0;
  const cache = createKickBadgeCatalogCache(async () => {
    calls += 1;
    throw new Error("badge catalog blocked");
  });
  const first = await cache.load("Channel");
  const second = await cache.load("channel");
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(resolveKickBadgeImage({ type: "subscriber", count: 9 }, first), null);
  assert.equal(resolveKickBadgeImage({ type: "vip" }, first), null);

  const line = viewerLineFromKick(
    {
      message_id: "22222222-2222-4222-8222-222222222222",
      content: "still here",
      sender: {
        username: "viewer",
        identity: { badges: [{ type: "subscriber", text: "Subscriber", count: 9 }, { type: "vip" }] },
      },
    },
    "fallback",
  );
  assert.ok(line);
  assert.equal(line.text, "still here");
  assert.equal(line.badgeList?.[0]?.count, 9);
  assert.equal(resolveKickBadgeImage(line.badgeList?.[0] ?? { type: "subscriber" }, first), null);
  assert.equal(chatStatusLabel({ status: "live", count: 1, surface: "overlay" }), null);

  const stored = appendChatLine({}, line);
  const [readBack] = parseOverlayChat(stored.state);
  assert.equal(readBack?.text, "still here");
  assert.deepEqual(readBack?.badges, ["subscriber", "vip"]);
});

const ownerTiers = [
  ownerSubscriberTier(1, "https://example.supabase.co/storage/v1/object/public/link-in-bio/user/kick-subscriber-badges/m1.png"),
  ownerSubscriberTier(6, "https://example.supabase.co/storage/v1/object/public/link-in-bio/user/kick-subscriber-badges/m6.png"),
].filter((tier): tier is NonNullable<typeof tier> => tier != null);

test("official chat keeps subscriber count and does not use founder or gifter counts", () => {
  const line = viewerLineFromKick(
    {
      message_id: "44444444-4444-4444-8444-444444444444",
      content: "months stay",
      sender: {
        username: "viewer",
        identity: {
          badges: [
            { type: "subscriber", text: "Subscriber", count: 7 },
            { type: "founder", text: "Founder", count: 1 },
            { type: "sub_gifter", text: "Sub Gifter", count: 50 },
          ],
        },
      },
    },
    "fallback",
  );
  const [stored] = parseOverlayChat(appendChatLine({}, line).state);
  assert.equal(stored?.text, "months stay");
  assert.equal(stored?.badgeList?.[0]?.count, 7);
  assert.equal(stored?.badgeList?.[1]?.count, 1);
  assert.equal(stored?.badgeList?.[2]?.count, 50);
  const catalog = { subscriberTiers: ownerTiers, global: {} };
  assert.equal(resolveKickBadgeImage(stored?.badgeList?.[0] ?? { type: "subscriber" }, catalog)?.endsWith("/m6.png"), true);
  assert.equal(resolveKickBadgeImage(stored?.badgeList?.[1] ?? { type: "founder" }, catalog), null);
  assert.equal(resolveKickBadgeImage(stored?.badgeList?.[2] ?? { type: "sub_gifter" }, catalog), null);
  assert.equal(resolveKickBadgeImage({ type: "subscriber" }, catalog), null);
  assert.equal(chatStatusLabel({ status: "live", count: 1, surface: "overlay" }), null);
});

test("owner tiers stay on this channel and reject other files", () => {
  const config = {
    kickSubscriberBadges: [
      { months: 6, imageUrl: ownerTiers[1]?.url },
      { months: 3, imageUrl: "https://files.kick.com/channel_subscriber_badges/1/original" },
      { months: 2, imageUrl: "https://example.supabase.co/storage/v1/object/public/link-in-bio/other/avatar.png" },
    ],
  };
  assert.deepEqual(readOwnerSubscriberTiers(config).map((tier) => tier.months), [6]);
  assert.equal(
    readOwnerSubscriberTiers({
      kickSubscriberBadges: ownerTiers.map((tier) => ({ months: tier.months, imageUrl: tier.url })),
    }).length,
    2,
  );
  assert.equal(subscriberBadgeFileError({ type: "image/svg+xml", size: 1000 }), "Use a PNG, JPEG, or WebP file.");
  assert.equal(ownerSubscriberTier(1, "https://files.kick.com/badges/moderator.svg"), null);
});

test("a blocked catalog is not fetched again before its TTL", async () => {
  let calls = 0;
  let clock = 1_000;
  const cache = createKickBadgeCatalogCache(async () => {
    calls += 1;
    throw new Error("blocked");
  }, () => clock);
  await cache.load("channel");
  await cache.load("channel");
  assert.equal(calls, 1);
  clock += 16 * 60 * 1000;
  await cache.load("channel");
  assert.equal(calls, 2);
});

test("local svg files follow the webhook type, gifter level, and subscriber setting", () => {
  const assets: KickBadgeAssets = {
    broadcaster: "/badges/broadcaster.svg",
    founder: "/badges/founder.svg",
    moderator: "/badges/moderator.svg",
    og: "/badges/og.svg",
    staff: "/badges/staff.svg",
    subGifter: "/badges/subGifter.svg",
    subGifter25: "/badges/subGifter25.svg",
    subGifter50: "/badges/subGifter50.svg",
    subGifter100: "/badges/subGifter100.svg",
    subGifter200: "/badges/subGifter200.svg",
    subscriber: "/badges/subscriber.svg",
    verified: "/badges/verified.svg",
    vip: "/badges/vip.svg",
  };
  const empty = { subscriberTiers: [], global: {} };
  const options = { assets, useDefaultSubscriberBadge: false as boolean };
  assert.equal(resolveKickBadgeImage({ type: "moderator" }, empty, options), assets.moderator);
  assert.equal(resolveKickBadgeImage({ type: "VIP" }, empty, options), assets.vip);
  assert.deepEqual(
    [
      resolveKickBadgeImage({ type: "moderator" }, empty, options),
      resolveKickBadgeImage({ type: "vip" }, empty, options),
      resolveKickBadgeImage({ type: "og" }, empty, options),
    ],
    [assets.moderator, assets.vip, assets.og],
  );
  assert.equal(
    resolveKickBadgeImage({ type: "subscriber", count: 3 }, empty, { assets, useDefaultSubscriberBadge: true }),
    assets.subscriber,
  );
  assert.equal(resolveKickBadgeImage({ type: "subscriber", count: 3 }, empty, options), null);
  assert.equal(readKickDefaultSubscriberBadge({}), false);
  assert.equal(readKickDefaultSubscriberBadge({ kickDefaultSubscriberBadge: true }), true);

  const custom = { subscriberTiers: ownerTiers, global: {} };
  assert.equal(
    resolveKickBadgeImage({ type: "subscriber", count: 7 }, custom, { assets, useDefaultSubscriberBadge: true })?.endsWith("/m6.png"),
    true,
  );
  assert.notEqual(
    resolveKickBadgeImage({ type: "subscriber", count: 7 }, custom, { assets, useDefaultSubscriberBadge: true }),
    assets.subscriber,
  );
  assert.equal(
    resolveKickBadgeImage({ type: "subscriber", count: 2 }, { subscriberTiers: [ownerTiers[1]!], global: {} }, options),
    null,
  );

  assert.equal(resolveKickBadgeImage({ type: "sub_gifter", count: 25 }, empty, options), assets.subGifter25);
  assert.equal(resolveKickBadgeImage({ type: "subGifter", count: 50 }, empty, options), assets.subGifter50);
  assert.equal(resolveKickBadgeImage({ type: "sub_gifter", count: 100 }, empty, options), assets.subGifter100);
  assert.equal(resolveKickBadgeImage({ type: "sub-gifter", count: 200 }, empty, options), assets.subGifter200);
  assert.equal(resolveKickBadgeImage({ type: "sub_gifter", count: 4 }, empty, options), assets.subGifter);
  assert.equal(resolveKickBadgeImage({ type: "sub_gifter", count: 200 }, custom, options), assets.subGifter200);

  const quiet = viewerLineFromKick(
    {
      message_id: "55555555-5555-4555-8555-555555555555",
      content: "no badges",
      sender: { username: "viewer", identity: { badges: [] } },
    },
    "fallback",
  );
  assert.equal(quiet?.text, "no badges");
  assert.equal(quiet?.badgeList, undefined);
  assert.equal(resolveKickBadgeImage({ type: "sidekick" }, empty, options), null);
  assert.ok(KICK_BADGE_TYPES_WITHOUT_FILE.includes("sidekick"));

  const broken = viewerLineFromKick(
    {
      message_id: "66666666-6666-4666-8666-666666666666",
      content: "line stays",
      sender: {
        username: "viewer",
        identity: {
          badges: [
            { type: "subscriber", count: 4, imageUrl: "not-a-url" },
            { type: "moderator" },
          ],
        },
      },
    },
    "fallback",
  );
  assert.equal(broken?.text, "line stays");
  assert.equal(
    resolveKickBadgeImage({ type: "subscriber", imageUrl: "notaurl" }, custom, {
      assets,
      useDefaultSubscriberBadge: true,
    }),
    null,
  );
  assert.equal(
    resolveKickBadgeImage({ type: "subscriber", count: 4, imageUrl: "notaurl" }, empty, {
      assets,
      useDefaultSubscriberBadge: true,
    }),
    assets.subscriber,
  );
  assert.equal(readOwnerSubscriberTiers({ kickSubscriberBadges: [{ months: 1, imageUrl: "notaurl" }] }).length, 0);
  assert.equal(
    readOwnerSubscriberTiers({
      kickSubscriberBadges: [
        { months: 1, imageUrl: "https://files.kick.com/channel_subscriber_badges/other-channel/original" },
        {
          months: 6,
          imageUrl: "https://example.supabase.co/storage/v1/object/public/other-bucket/user/kick-subscriber-badges/m6.png",
        },
      ],
    }).length,
    0,
  );
  assert.equal(chatStatusLabel({ status: "live", count: 1, surface: "overlay" }), null);
});

test("months on the chat payload map to that payload's subscriber src", () => {
  const body = {
    message_id: "33333333-3333-4333-8333-333333333333",
    content: "custom sub",
    sender: {
      username: "viewer",
      identity: {
        badges: [
          { type: "subscriber", count: 7 },
          { type: "founder", count: 1 },
        ],
      },
    },
    ...channelPayload,
  };
  const line = viewerLineFromKick(body, "fallback");
  assert.equal(line?.badgeList?.[0]?.imageUrl, "https://files.kick.com/badges/month-6.png");
  assert.equal(line?.badgeList?.[1]?.imageUrl, "https://files.kick.com/badges/founder.png");
  assert.equal(chatStatusLabel({ status: "live", count: 1, surface: "overlay" }), null);
});
