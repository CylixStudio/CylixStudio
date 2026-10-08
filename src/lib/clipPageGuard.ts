import { isRedirect, redirect } from "@tanstack/react-router";

import { viewerIsAdmin } from "@/lib/adminAccess.functions";
import { isMissingViewerSession } from "@/lib/supabase/sessionError";
import { isTestMode } from "@/lib/testMode";

function isUnauthorizedResponse(error: unknown): boolean {
  return error instanceof Response && (error.status === 401 || error.status === 403);
}

/**
 * Admin gate for the clip dashboard. Runs in `beforeLoad` so the management
 * view is not rendered for anyone else.
 *
 * Guests (test mode) skip the server call — there is no real session — and
 * stay on the maintenance screen. A missing session goes to sign-in.
 * Any other signed-in non-admin is sent to the dashboard.
 */
export async function guardClipDashboardPage(): Promise<{ clipAdmin: boolean }> {
  if (isTestMode()) return { clipAdmin: false };

  try {
    const result = await viewerIsAdmin();
    if (result.admin === true) return { clipAdmin: true };
    throw redirect({ to: "/dashboard" });
  } catch (error) {
    if (isRedirect(error)) throw error;
    if (isMissingViewerSession(error) || isUnauthorizedResponse(error)) {
      throw redirect({ to: "/login" });
    }
    throw redirect({ to: "/dashboard" });
  }
}
