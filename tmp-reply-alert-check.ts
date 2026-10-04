import assert from "node:assert/strict";

import {
  REPLY_ALERT_MS,
  annotateReplyPayload,
  isReplyExpired,
  isReplyPayload,
  readReplyMeta,
  replyExpiresAt,
} from "./src/lib/replyAlert.ts";

const now = 1_700_000_000_000;

assert.equal(isReplyPayload({ reply_to_message_id: "abc" }), true);
assert.equal(isReplyPayload({ is_reply: true }), true);
assert.equal(isReplyPayload({ reply: true }), true);
assert.equal(isReplyPayload({ in_reply_to: "99" }), true);
assert.equal(isReplyPayload({ parent_message: { text: "earlier" } }), true);
assert.equal(isReplyPayload({ quoted_message: { text: "quoted" } }), true);
assert.equal(isReplyPayload({ thread: { id: "t1" } }), true);
assert.equal(isReplyPayload({ type: "reply", content: "yo" }), true);
assert.equal(isReplyPayload({ "reply-parent-msg-id": "mid", "reply-parent-msg-body": "parent text" }), true);
assert.equal(
  isReplyPayload({ metadata: { original_message: { id: "1", content: "parent" } } }),
  true,
);

assert.equal(isReplyPayload({ eventType: "FOLLOW", actor: "viewer" }), false);
assert.equal(isReplyPayload({ eventType: "SUBSCRIPTION", quantity: 1 }), false);
assert.equal(isReplyPayload({ eventType: "DONATION", amount: 5, message: "Keep it up!" }), false);
assert.equal(isReplyPayload({ type: "donation", message: "thanks" }), false);
assert.equal(isReplyPayload({ is_reply: false }), false);
assert.equal(isReplyPayload({ reply: false }), false);
assert.equal(isReplyPayload({ thread: "general" }), false);
assert.equal(isReplyPayload({ simulated: true }), false);

const appearance = now - 9 * 60 * 1000;
assert.equal(REPLY_ALERT_MS, 600_000);
assert.equal(replyExpiresAt(appearance), appearance + 600_000);
assert.equal(isReplyExpired(now - 11 * 60 * 1000, now), true);
assert.equal(isReplyExpired(now - 9 * 60 * 1000, now), false);
assert.equal(isReplyExpired(appearance, appearance + 599_999), false);
assert.equal(isReplyExpired(appearance, appearance + 600_000), true);

const stamped = annotateReplyPayload({ reply_to: "m1", message: "ok" }) as { isReply?: boolean; message?: string };
assert.equal(stamped.isReply, true);
assert.equal(stamped.message, "ok");
assert.equal(isReplyPayload({ eventType: "FOLLOW" }), false);

const quote = readReplyMeta({ parent_message: { text: "the original" } });
assert.equal(quote.isReply, true);
assert.equal(quote.quote, "the original");

const donation = annotateReplyPayload({ eventType: "DONATION", amount: 10, message: "Keep it up!" }) as {
  isReply?: boolean;
};
assert.equal(donation.isReply, undefined);

console.log("reply-alert checks passed");
