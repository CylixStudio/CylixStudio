import { createServerFn } from "@tanstack/react-start";

import type { BotRixLookupResult } from "@/lib/botrix";
import { lookupBotRixPublicData } from "@/lib/botrix.server";

function readInput(input: unknown): { streamerName: string; platform: string } {
  if (!input || typeof input !== "object") return { streamerName: "", platform: "" };
  const record = input as Record<string, unknown>;
  return {
    streamerName: typeof record["streamerName"] === "string" ? record["streamerName"] : "",
    platform: typeof record["platform"] === "string" ? record["platform"] : "",
  };
}

/** Public BotRix commands, shop, and leaderboard. Failures stay inside the result. */
export const lookupBotRixPublic = createServerFn({ method: "POST" })
  .inputValidator(readInput)
  .handler(async ({ data }): Promise<BotRixLookupResult> => {
    try {
      return await lookupBotRixPublicData(data);
    } catch {
      return { ok: false, error: "unavailable" };
    }
  });
