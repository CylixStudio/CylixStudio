/** E.164 mobile from a profile or typed value. Returns null when the number is missing or incomplete. */
export function normalizeCustomerPhone(raw: string): string | null {
  let value = raw.replace(/[\s()-]/g, "");
  if (!value) return null;
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (/^05\d{8}$/.test(value)) value = `+966${value.slice(1)}`;
  if (/^9665\d{8}$/.test(value)) value = `+${value}`;
  if (/^5\d{8}$/.test(value)) value = `+966${value}`;
  if (!value.startsWith("+") && /^\d{8,15}$/.test(value)) value = `+${value}`;
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

export function isFirstLogin(user: { created_at?: string; last_sign_in_at?: string | null }): boolean {
  const created = Date.parse(user.created_at ?? "");
  const last = Date.parse(user.last_sign_in_at ?? "");
  if (!Number.isFinite(created)) return false;
  if (!Number.isFinite(last)) return true;
  return last - created < 15 * 60 * 1000;
}
