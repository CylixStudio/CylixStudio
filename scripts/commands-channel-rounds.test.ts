import assert from "node:assert/strict";
import test from "node:test";

import { channelFromUsernameMatches } from "../src/lib/publicChannelMatch.ts";

test("a username row with an avatar does not need a second channel read", () => {
  const channel = channelFromUsernameMatches("creovixstudio", [
    {
      user_id: "user-1",
      platform: "TWITCH",
      username: "CreovixStudio",
      metadata: {},
    },
    {
      user_id: "user-1",
      platform: "KICK",
      username: "creovixstudio",
      metadata: { profile_picture: "https://example.com/kick.png" },
    },
  ]);
  assert.equal(channel?.userId, "user-1");
  assert.equal(channel?.slug, "creovixstudio");
  assert.equal(channel?.displayName, "creovixstudio");
  assert.equal(channel?.avatarUrl, "https://example.com/kick.png");
});

test("missing avatar keeps the full channel read", () => {
  assert.equal(
    channelFromUsernameMatches("creovixstudio", [
      { user_id: "user-1", platform: "KICK", username: "creovixstudio", metadata: {} },
    ]),
    null,
  );
});

test("another platform with an avatar does not skip the Kick identity", () => {
  assert.equal(
    channelFromUsernameMatches("sidechannel", [
      {
        user_id: "user-2",
        platform: "TWITCH",
        username: "sidechannel",
        metadata: { profile_picture: "https://example.com/twitch.png" },
      },
    ]),
    null,
  );
});

test("a bio avatar cannot replace a missing Kick avatar", () => {
  assert.equal(
    channelFromUsernameMatches("creovixstudio", [
      { user_id: "user-1", platform: "KICK", username: "creovixstudio", metadata: { avatar_url: "" } },
    ]),
    null,
  );
});
