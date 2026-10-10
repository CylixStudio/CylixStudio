import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const listManagedChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listManagedChannels: list } = await import("@/lib/managedChannels.server");
    return list(context.userId);
  });

export const resolveWorkspaceOwner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveWorkspaceOwner: resolve } = await import("@/lib/managedChannels.server");
    const ownerUserId = await resolve(context.userId);
    return { ownerUserId };
  });

export const switchManagedChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ownerUserId: string | null }) => {
    if (data?.ownerUserId == null) return { ownerUserId: null };
    if (typeof data.ownerUserId !== "string" || !UUID.test(data.ownerUserId)) {
      throw new Error("Invalid channel");
    }
    return { ownerUserId: data.ownerUserId };
  })
  .handler(async ({ data, context }) => {
    const { switchWorkspaceOwner } = await import("@/lib/managedChannels.server");
    await switchWorkspaceOwner(context.userId, data.ownerUserId);
    return { ok: true as const };
  });

export const loadManagedWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ownerUserId: string }) => {
    if (typeof data?.ownerUserId !== "string" || !UUID.test(data.ownerUserId)) {
      throw new Error("Invalid channel");
    }
    return { ownerUserId: data.ownerUserId };
  })
  .handler(async ({ data, context }) => {
    if (data.ownerUserId === context.userId) {
      throw new Error("Use the signed-in workspace");
    }
    const { loadGrantedWorkspace } = await import("@/lib/managedChannels.server");
    return loadGrantedWorkspace(context.userId, data.ownerUserId);
  });
