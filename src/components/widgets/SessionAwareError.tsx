import { isMissingViewerSession } from "@/lib/supabase/sessionError";

/**
 * Real failures stay in the red banner.
 * A missing viewer session uses the calm signed-out copy instead.
 */
export function SessionAwareError({
  error,
  signedOutLabel,
  className = "mb-4 text-sm",
  boxed = true,
}: {
  error: string | null;
  signedOutLabel: string;
  className?: string;
  boxed?: boolean;
}) {
  if (!error) return null;
  if (isMissingViewerSession(error)) {
    return <p className={`${className} text-muted-foreground`}>{signedOutLabel}</p>;
  }
  const box = boxed
    ? "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive"
    : "text-destructive";
  return <p className={`${className} ${box}`}>{error}</p>;
}
