const WINDOW_MS = 20 * 60 * 1000;

/** User id → lowercase display name → last Kick chat timestamp. Process-local. */
const seen = new Map<string, Map<string, number>>();

/** Records a viewer who actually sent Kick chat to this server. */
export function noteRecentChatter(userId: string, username: string) {
  const name = username.trim().replace(/^@+/, "");
  if (!userId || !name) return;
  let bucket = seen.get(userId);
  if (!bucket) {
    bucket = new Map();
    seen.set(userId, bucket);
  }
  bucket.set(name.toLowerCase(), Date.now());
}

/** Kick chatters heard in the last 20 minutes. Empty when this process has not seen chat. */
export function recentChatterNames(userId: string): string[] {
  const bucket = seen.get(userId);
  if (!bucket) return [];
  const now = Date.now();
  const names: string[] = [];
  for (const [name, at] of bucket) {
    if (now - at > WINDOW_MS) bucket.delete(name);
    else names.push(name);
  }
  return names;
}
