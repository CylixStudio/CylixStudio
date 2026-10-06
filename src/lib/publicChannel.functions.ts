import { createServerFn } from "@tanstack/react-start";

import {
  listPublicCommands,
  listPublicShop,
  loadPublishedChannel,
  type PublicCommand,
  type PublicShopItem,
} from "@/lib/publicChannel.server";

function readSlug(input: unknown): { slug: string } {
  if (!input || typeof input !== "object") return { slug: "" };
  const slug = (input as { slug?: unknown }).slug;
  return { slug: typeof slug === "string" ? slug : "" };
}

export type PublicCommandsPage =
  | { found: false }
  | { found: true; slug: string; displayName: string; commands: PublicCommand[] };

export type PublicStorePage =
  | { found: false }
  | { found: true; slug: string; displayName: string; items: PublicShopItem[] };

export const loadPublicCommandsPage = createServerFn({ method: "POST" })
  .inputValidator(readSlug)
  .handler(async ({ data }): Promise<PublicCommandsPage> => {
    const channel = await loadPublishedChannel(data.slug);
    if (!channel) return { found: false };
    const commands = await listPublicCommands(channel.userId);
    return { found: true, slug: channel.slug, displayName: channel.displayName, commands };
  });

export const loadPublicStorePage = createServerFn({ method: "POST" })
  .inputValidator(readSlug)
  .handler(async ({ data }): Promise<PublicStorePage> => {
    const channel = await loadPublishedChannel(data.slug);
    if (!channel) return { found: false };
    const items = await listPublicShop(channel.userId);
    return { found: true, slug: channel.slug, displayName: channel.displayName, items };
  });
