import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

/**
 * Same admin check as `saveStudioVersionAndBroadcast`: the `is_admin` RPC
 * for the signed-in user. Moderators are not admins unless that RPC says so.
 */
export const viewerIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    return { admin: !error && isAdmin === true };
  });
