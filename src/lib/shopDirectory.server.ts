import { COMMAND_PERMISSION_DENIED, isCommandMinRole, senderMayRun } from "@/lib/commandAccess";
import { catalogDefaultCommand } from "@/lib/defaultCommands";
import { sendKickChatMessage } from "@/lib/kickChat.server";
import { publishedSlugForUser } from "@/lib/publicChannel.server";
import { parseShopDirectoryCommand } from "@/lib/shopBuy";
import { supabaseAdmin } from "@/lib/supabase/client.server";

export { parseShopDirectoryCommand };

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
  senderPlatformId?: string | null;
  identityBadges?: readonly string[];
}): Promise<{ status: string; reason?: string; command?: string }> {
  if (!parseShopDirectoryCommand(input.text)) return { status: "ignored", reason: "no_match" };
  const fallback = catalogDefaultCommand("shop")?.minRole ?? "everyone";
  const { data: gate, error } = await supabaseAdmin
    .from("default_chat_commands")
    .select("enabled, min_role")
    .eq("user_id", input.userId)
    .eq("command_id", "shop")
    .maybeSingle();
  const enabled = error || !gate ? true : gate.enabled;
  const minRole = !error && gate && isCommandMinRole(gate.min_role) ? gate.min_role : fallback;
  if (!enabled) return { status: "ignored", reason: "disabled", command: "!shop" };
  if (
    !senderMayRun({
      minRole,
      identityBadges: input.identityBadges ?? [],
      senderPlatformId: input.senderPlatformId,
      broadcasterUserId: input.broadcasterUserId,
    })
  ) {
    const sent = await sendKickChatMessage(input.userId, input.broadcasterUserId, COMMAND_PERMISSION_DENIED);
    return sent
      ? { status: "replied", reason: "not_permitted", command: "!shop" }
      : { status: "error", reason: "not_permitted", command: "!shop" };
  }
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
