/**
 * Consecutive activity-feed grouping.
 *
 * A run is two or more events that sit next to each other in the current list
 * (newest first) and share the same actor and the same event type. A different
 * actor or a different event type ends the run. Repeats that are not adjacent
 * stay separate rows. Every event remains in the group.
 */
export type GroupableFeedEvent = {
  id: string;
  platform: string;
  event_type: string;
  actor_name: string | null;
};

export type FeedEventGroup<T extends GroupableFeedEvent> = {
  /** Oldest event id in the run, so a newer repeat does not remount the row. */
  id: string;
  events: T[];
};

function actorKey(name: string | null): string | null {
  const trimmed = (name ?? "").trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function sameRun(a: GroupableFeedEvent, b: GroupableFeedEvent): boolean {
  const actor = actorKey(a.actor_name);
  if (!actor || actor !== actorKey(b.actor_name)) return false;
  return a.event_type === b.event_type;
}

export function groupConsecutiveEvents<T extends GroupableFeedEvent>(
  events: readonly T[],
): FeedEventGroup<T>[] {
  const groups: FeedEventGroup<T>[] = [];
  for (const event of events) {
    const current = groups[groups.length - 1];
    const latest = current?.events[0];
    if (current && latest && sameRun(latest, event)) {
      current.events.push(event);
      current.id = event.id;
      continue;
    }
    groups.push({ id: event.id, events: [event] });
  }
  return groups;
}
