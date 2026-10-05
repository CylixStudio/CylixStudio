/** Sentinel stored in widget error state when the viewer has no Supabase session. */
export const SIGNED_OUT_ERROR = "signed_out";

/**
 * True only for a missing viewer session.
 * Other auth and database failures stay visible.
 */
export function isMissingViewerSession(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === "string") {
    return error === SIGNED_OUT_ERROR || /auth session missing/i.test(error);
  }
  if (typeof error !== "object") return false;

  const record = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof record.name === "string" ? record.name : "";
  const code = typeof record.code === "string" ? record.code : "";
  if (name === "AuthSessionMissingError" || name === "SignedOutError" || code === "signed_out") {
    return true;
  }
  return typeof record.message === "string" && /auth session missing/i.test(record.message);
}
