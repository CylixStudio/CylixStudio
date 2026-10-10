import { createServerFn } from "@tanstack/react-start";

import {
  listPublicCommands,
  listPublicShop,
  listPublicTimers,
  loadCommandsChannel,
  loadPublishedChannel,
  type PublicCommand,
  type PublicShopItem,
  type PublicTimer,
} from "@/lib/publicChannel.server";

function readSlug(input: unknown): { slug: string } {
  if (!input || typeof input !== "object") return { slug: "" };
  const slug = (input as { slug?: unknown }).slug;
  return { slug: typeof slug === "string" ? slug : "" };
}

export type PublicCommandsPage =
  | { found: false }
  | {
      found: true;
      slug: string;
      displayName: string;
      avatarUrl: string;
      commands: PublicCommand[];
      timers: PublicTimer[];
    };

export type PublicStorePage =
  | { found: false }
  | { found: true; slug: string; displayName: string; items: PublicShopItem[] };

export const loadPublicCommandsPage = createServerFn({ method: "POST" })
  .inputValidator(readSlug)
  .handler(async ({ data }): Promise<PublicCommandsPage> => {
    const channel = await loadCommandsChannel(data.slug);
    if (!channel) return { found: false };
    const [commands, timers] = await Promise.all([
      listPublicCommands(channel.userId),
      listPublicTimers(channel.userId),
    ]);
    return {
      found: true,
      slug: channel.slug,
      displayName: channel.displayName,
      avatarUrl: channel.avatarUrl,
      commands,
      timers,
    };
  });

export const loadPublicStorePage = createServerFn({ method: "POST" })
  .inputValidator(readSlug)
  .handler(async ({ data }): Promise<PublicStorePage> => {
    const channel = await loadPublishedChannel(data.slug);
    if (!channel) return { found: false };
    const items = await listPublicShop(channel.userId);
    return { found: true, slug: channel.slug, displayName: channel.displayName, items };
  });
