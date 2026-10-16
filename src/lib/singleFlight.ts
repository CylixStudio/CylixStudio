/** One in-flight promise per key. Concurrent callers share it. */
export function singleFlight<T>(
  key: string,
  inflight: Map<string, Promise<T>>,
  run: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = run().finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}
