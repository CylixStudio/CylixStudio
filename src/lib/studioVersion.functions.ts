import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

/**
 * Admin-only. Saves the studio version, then emails registered users.
 * The handler does not run on import.
 */
export const saveStudioVersionAndBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { version?: string }) => {
    const version = typeof input?.version === "string" ? input.version : "";
    return { version };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (error || isAdmin !== true) {
      return { ok: false as const, error: "forbidden" as const };
    }

    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { saveAndBroadcastStudioVersion } = await import("@/lib/studioVersion.server");
    return saveAndBroadcastStudioVersion(supabaseAdmin, data.version);
  });
