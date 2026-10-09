import { sendKickChatMessage } from "@/lib/kickChat.server";
import { publishedSlugForUser } from "@/lib/publicChannel.server";
import { supabaseAdmin } from "@/lib/supabase/client.server";

export function parseShopDirectoryCommand(text: string): boolean {
  return /^!?(?:shop|store|متجر)$/i.test(text.trim());
}

export function shopDirectoryMessage(slug: string, names: string[]): string {
  const url = `https://cylixstudio.com/store/${encodeURIComponent(slug)}`;
  let body = `Store ${url}`;
  for (const name of names) {
    const piece = ` | !buy ${name}`;
    if (body.length + piece.length > 450) break;
    body += piece;
  }
  return body;
}

export async function handleShopDirectoryCommand(input: {
  userId: string;
  broadcasterUserId: string;
  text: string;
}): Promise<{ status: string; reason?: string; command?: string }> {
  if (!parseShopDirectoryCommand(input.text)) return { status: "ignored", reason: "no_match" };
  const slug = await publishedSlugForUser(input.userId);
  if (!slug) {
    const sent = await sendKickChatMessage(
      input.userId,
      input.broadcasterUserId,
      "Store is not published yet.",
    );
    return sent
      ? { status: "replied", command: "!shop" }
      : { status: "error", reason: "send_failed", command: "!shop" };
  }
  const { data } = await supabaseAdmin
    .from("loyalty_shop_items")
    .select("name")
    .eq("user_id", input.userId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  const names = (data ?? [])
    .map((row) => (typeof row.name === "string" ? row.name.trim() : ""))
    .filter((name) => name.length > 0);
  const sent = await sendKickChatMessage(
    input.userId,
    input.broadcasterUserId,
    shopDirectoryMessage(slug, names),
  );
  if (!sent) return { status: "error", reason: "send_failed", command: "!shop" };
  return { status: "replied", command: "!shop" };
}
