import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isMissingViewerSession } from "@/lib/supabase/sessionError";
import { getTestUser, isTestMode } from "@/lib/testMode";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (isTestMode()) return { user: getTestUser() };
    if (!isSupabaseConfigured()) throw redirect({ to: "/login" });
    try {
      const { data, error } = await supabase.auth.getUser();
      const user = data?.user ?? null;
      if (error || !user) throw redirect({ to: "/login" });
      return { user };
    } catch (error) {
      if (isMissingViewerSession(error)) throw redirect({ to: "/login" });
      throw error;
    }
  },
  component: () => <Outlet />,
});
