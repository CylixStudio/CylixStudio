/**
 * Connection and disconnection mail for Kick, Twitch, and YouTube.
 * Sends only when a caller decides the link was newly created or actually removed.
 * Importing this module does not send mail.
 */
import { supabaseAdmin } from "@/lib/supabase/client.server";

export type HeroPlatform = "KICK" | "TWITCH" | "YOUTUBE";

const SITE = "https://cylixstudio.com";

export function isHeroPlatform(platform: string): platform is HeroPlatform {
  return platform === "KICK" || platform === "TWITCH" || platform === "YOUTUBE";
}

async function recipientEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    console.error("[connection-email] user lookup failed", { userId, message: error.message });
    return null;
  }
  const email = data.user?.email?.trim() ?? "";
  if (!email.includes("@")) return null;
  return email;
}

export async function notifyPlatformConnected(args: {
  userId: string;
  platform: string;
  username?: string | null;
}): Promise<void> {
  if (!isHeroPlatform(args.platform)) return;
  const to = await recipientEmail(args.userId);
  if (!to) return;
  try {
    const { sendTemplateEmail } = await import("@/lib/email.server");
    const result = await sendTemplateEmail(to, {
      template: "platform_connected",
      data: {
        siteUrl: SITE,
        platform: args.platform,
        username: args.username ?? null,
        locale: "ar",
      },
    });
    if (!result.ok) {
      console.error("[connection-email] connected send failed", {
        userId: args.userId,
        platform: args.platform,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("[connection-email] connected send threw", {
      userId: args.userId,
      platform: args.platform,
      message: error instanceof Error ? error.message : "failed",
    });
  }
}

export async function notifyPlatformDisconnected(args: {
  userId: string;
  platform: string;
  username?: string | null;
}): Promise<void> {
  if (!isHeroPlatform(args.platform)) return;
  const to = await recipientEmail(args.userId);
  if (!to) return;
  try {
    const { sendTemplateEmail } = await import("@/lib/email.server");
    const result = await sendTemplateEmail(to, {
      template: "platform_disconnected",
      data: {
        siteUrl: SITE,
        platform: args.platform,
        username: args.username ?? null,
        locale: "ar",
      },
    });
    if (!result.ok) {
      console.error("[connection-email] disconnected send failed", {
        userId: args.userId,
        platform: args.platform,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("[connection-email] disconnected send threw", {
      userId: args.userId,
      platform: args.platform,
      message: error instanceof Error ? error.message : "failed",
    });
  }
}
