import broadcaster from "@/assets/Kick Badges/broadcaster.svg?url";
import founder from "@/assets/Kick Badges/founder.svg?url";
import moderator from "@/assets/Kick Badges/moderator.svg?url";
import og from "@/assets/Kick Badges/og.svg?url";
import staff from "@/assets/Kick Badges/staff.svg?url";
import subGifter from "@/assets/Kick Badges/subGifter.svg?url";
import subGifter25 from "@/assets/Kick Badges/subGifter25.svg?url";
import subGifter50 from "@/assets/Kick Badges/subGifter50.svg?url";
import subGifter100 from "@/assets/Kick Badges/subGifter100.svg?url";
import subGifter200 from "@/assets/Kick Badges/subGifter200.svg?url";
import subscriber from "@/assets/Kick Badges/subscriber.svg?url";
import verified from "@/assets/Kick Badges/verified.svg?url";
import vip from "@/assets/Kick Badges/vip.svg?url";
import type { KickBadgeAssets } from "@/lib/kickBadgeResolver";

/** Vite emits these as client URLs. The chat webhook does not import this module. */
export const kickBadgeAssets: KickBadgeAssets = {
  broadcaster,
  founder,
  moderator,
  og,
  staff,
  subGifter,
  subGifter25,
  subGifter50,
  subGifter100,
  subGifter200,
  subscriber,
  verified,
  vip,
};
