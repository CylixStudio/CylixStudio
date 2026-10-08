import { commandTrigger } from "@/lib/customCommands";
import { supabaseAdmin } from "@/lib/supabase/client.server";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,31})$/;

export type PublicCommand = {
  trigger: string;
  response: string;
};

export type PublicTimer = {
  message: string;
  intervalMinutes: number;
};

export type PublicShopItem = {
  name: string;
  description: string;
  cost: number;
  imageUrl: string | null;
  stock: number | null;
};

export type PublicChannel = {
  userId: string;
  slug: string;
  displayName: string;
};

export function normalizePublicSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  return SLUG.test(slug) ? slug : null;
}

export async function publishedSlugForUser(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("link_in_bio_profiles")
    .select("slug")
    .eq("user_id", userId)
    .eq("published", true)
    .maybeSingle();
  const slug = data?.slug?.trim().toLowerCase() ?? "";
  return SLUG.test(slug) ? slug : null;
}

export async function loadPublishedChannel(slug: string): Promise<PublicChannel | null> {
  const normalized = normalizePublicSlug(slug);
  if (!normalized) return null;
  const { data } = await supabaseAdmin
    .from("link_in_bio_profiles")
    .select("user_id, slug, display_name")
    .eq("slug", normalized)
    .eq("published", true)
    .maybeSingle();
  if (!data?.user_id) return null;
  const displayName = data.display_name?.trim() || data.slug;
  return { userId: data.user_id, slug: data.slug, displayName };
}

export async function listPublicCommands(userId: string): Promise<PublicCommand[]> {
  const [{ data: settings }, { data: rows }] = await Promise.all([
    supabaseAdmin
      .from("custom_chat_command_settings")
      .select("default_prefix")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("custom_chat_commands")
      .select("name, prefix, response")
      .eq("user_id", userId)
      .eq("enabled", true)
      .order("name", { ascending: true }),
  ]);
  const defaultPrefix = settings?.default_prefix ?? "!";
  const commands: PublicCommand[] = [];
  for (const row of rows ?? []) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const response = typeof row.response === "string" ? row.response : "";
    if (!name || !response.trim()) continue;
    commands.push({
      trigger: commandTrigger(
        { name, prefix: row.prefix === null ? null : row.prefix },
        defaultPrefix,
      ),
      response,
    });
  }
  return commands;
}

export async function listPublicTimers(userId: string): Promise<PublicTimer[]> {
  const { data } = await supabaseAdmin
    .from("message_timers")
    .select("message, interval_minutes, enabled")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  const timers: PublicTimer[] = [];
  for (const row of data ?? []) {
    const message = typeof row.message === "string" ? row.message.trim() : "";
    if (!message) continue;
    timers.push({ message, intervalMinutes: row.interval_minutes });
  }
  return timers;
}

export async function listPublicShop(userId: string): Promise<PublicShopItem[]> {
  const { data } = await supabaseAdmin
    .from("loyalty_shop_items")
    .select("name, description, cost, image_url, stock, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  return (data ?? [])
    .filter((row) => row.is_active && row.name.trim())
    .map((row) => ({
      name: row.name,
      description: row.description ?? "",
      cost: row.cost,
      imageUrl: row.image_url?.trim() ? row.image_url : null,
      stock: row.stock,
    }));
}
