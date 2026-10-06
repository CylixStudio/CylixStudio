/** Event types already stored on the activity log. */
export const STORED_EVENT_TYPES = [
  "FOLLOW",
  "SUBSCRIPTION",
  "GIFT_SUB",
  "BITS",
  "DONATION",
  "RAID",
  "LIKE",
] as const;

export type StoredEventType = (typeof STORED_EVENT_TYPES)[number];

export type StoredEventLine = {
  eventType: StoredEventType;
  username: string;
};

type StoredEventInput = {
  eventType: string;
  actorName: string | null;
  isTest?: boolean;
  createdAt?: string;
};

function isStoredType(value: string): value is StoredEventType {
  return (STORED_EVENT_TYPES as readonly string[]).includes(value);
}

/** Latest real event of each stored type. Test rows and missing usernames are omitted. */
export function latestStoredEventLines(events: StoredEventInput[]): StoredEventLine[] {
  const ordered = [...events].sort(
    (a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0),
  );
  const picked = new Map<StoredEventType, string>();
  for (const event of ordered) {
    if (event.isTest || event.eventType.toLowerCase() === "test") continue;
    if (!isStoredType(event.eventType) || picked.has(event.eventType)) continue;
    const username = event.actorName?.trim() ?? "";
    if (!username) continue;
    picked.set(event.eventType, username);
  }
  return STORED_EVENT_TYPES.filter((eventType) => picked.has(eventType)).map((eventType) => ({
    eventType,
    username: picked.get(eventType) ?? "",
  }));
}
