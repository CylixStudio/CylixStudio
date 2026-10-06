import { sendKickChatMessage } from "@/lib/clipCommand.server";
import {
  decideShopPurchase,
  matchLoyaltyMember,
  matchShopItem,
  parseBuyArgument,
  shopBuyChatReply,
  type ShopItemSnapshot,
  type ShopMemberSnapshot,
} from "@/lib/shopBuy";
import { supabaseAdmin } from "@/lib/supabase/client.server";
import type { ChatCommandPlatform } from "@/lib/customCommands";

type PurchaseResult = { ok?: boolean; reason?: string; item_name?: string };

export async function handleShopBuyCommand(input: {
  userId: string;
  broadcasterUserId: string;
  platform: ChatCommandPlatform;
  text: string;
  sender: { username: string };
  isTest?: boolean;
}): Promise<{ status: string; reason?: string; command?: string }> {
  const argument = parseBuyArgument(input.text);
  if (argument === null) return { status: "ignored", reason: "no_match" };
  if (input.isTest) return { status: "ignored", reason: "test", command: "!buy" };

  const [{ data: itemRows }, { data: memberRows }] = await Promise.all([
    supabaseAdmin
      .from("loyalty_shop_items")
      .select("id, name, cost, stock, is_active")
      .eq("user_id", input.userId)
      .eq("is_active", true),
    supabaseAdmin
      .from("loyalty_members")
      .select("id, display_name, points")
      .eq("user_id", input.userId),
  ]);

  const items: ShopItemSnapshot[] = (itemRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    cost: row.cost,
    stock: row.stock,
    isActive: row.is_active,
  }));
  const members: ShopMemberSnapshot[] = (memberRows ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    points: row.points,
  }));

  const decision = decideShopPurchase({
    isTest: false,
    item: matchShopItem(items, argument),
    member: matchLoyaltyMember(members, input.sender.username),
  });

  let reply = shopBuyChatReply(decision);
  if (decision.ok) {
    const { data, error } = await supabaseAdmin.rpc("purchase_loyalty_item", {
      p_user_id: input.userId,
      p_member_id: decision.memberId,
      p_item_id: decision.itemId,
    });
    const result = (data ?? null) as PurchaseResult | null;
    if (error || !result?.ok) {
      reply = shopBuyChatReply({ ok: false, reason: "insufficient_points" });
    } else if (typeof result.item_name === "string" && result.item_name.trim()) {
      reply = shopBuyChatReply({
        ok: true,
        itemId: decision.itemId,
        itemName: result.item_name,
        memberId: decision.memberId,
        cost: decision.cost,
        nextPoints: decision.nextPoints,
        nextStock: decision.nextStock,
      });
    }
  }

  if (!reply) return { status: "ignored", reason: decision.ok ? "empty_reply" : decision.reason, command: "!buy" };

  if (input.platform === "KICK") {
    const sent = await sendKickChatMessage(input.userId, input.broadcasterUserId, reply);
    if (!sent) return { status: "error", reason: "send_failed", command: "!buy" };
  }

  return { status: "replied", command: "!buy" };
}
