export type ShopItemSnapshot = {
  id: string;
  name: string;
  cost: number;
  stock: number | null;
  isActive: boolean;
};

export type ShopMemberSnapshot = {
  id: string;
  displayName: string;
  points: number;
};

export type ShopBuyRefusal = "test" | "no_item" | "no_member" | "insufficient_points" | "out_of_stock";

export type ShopBuyDecision =
  | { ok: false; reason: ShopBuyRefusal }
  | {
      ok: true;
      itemId: string;
      itemName: string;
      memberId: string;
      cost: number;
      nextPoints: number;
      nextStock: number | null;
    };

/** Pure purchase rules. Does not create points or write rows. */
export function decideShopPurchase(input: {
  isTest: boolean;
  item: ShopItemSnapshot | null;
  member: ShopMemberSnapshot | null;
}): ShopBuyDecision {
  if (input.isTest) return { ok: false, reason: "test" };
  const item = input.item;
  if (!item || !item.isActive || !item.name.trim()) return { ok: false, reason: "no_item" };
  const cost = Math.max(0, Math.round(item.cost));
  if (item.stock !== null && item.stock < 1) return { ok: false, reason: "out_of_stock" };
  const member = input.member;
  if (!member) return { ok: false, reason: "no_member" };
  if (member.points < cost) return { ok: false, reason: "insufficient_points" };
  return {
    ok: true,
    itemId: item.id,
    itemName: item.name.trim(),
    memberId: member.id,
    cost,
    nextPoints: member.points - cost,
    nextStock: item.stock === null ? null : item.stock - 1,
  };
}

export function parseBuyArgument(text: string): string | null {
  const match = text.trim().match(/^!buy(?:\s+([\s\S]+))?$/i);
  if (!match) return null;
  return (match[1] ?? "").trim();
}

export function matchShopItem<T extends { name: string; isActive: boolean }>(items: T[], query: string): T | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  return items.find((item) => item.isActive && item.name.trim().toLowerCase() === needle) ?? null;
}

export function matchLoyaltyMember<T extends { displayName: string }>(members: T[], username: string): T | null {
  const needle = username.trim().toLowerCase();
  if (!needle) return null;
  return members.find((member) => member.displayName.trim().toLowerCase() === needle) ?? null;
}

export function shopBuyChatReply(decision: ShopBuyDecision): string | null {
  if (!decision.ok) {
    if (decision.reason === "test") return null;
    return "ما تقدر تشتري هذا العنصر.";
  }
  return `تم الشراء: ${decision.itemName}`;
}
