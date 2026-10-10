type Listener = () => void;

const listeners = new Set<Listener>();

/** Opens the upgrade dialog mounted in the app shell. */
export function requestUpgrade() {
  for (const listener of listeners) listener();
}

export function subscribeUpgrade(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isPlanLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message === "pro_required" || message.startsWith("free_limit");
}

/** Shows the upgrade dialog for plan errors and reports whether it handled them. */
export function notePlanError(error: unknown): boolean {
  if (!isPlanLimitError(error)) return false;
  requestUpgrade();
  return true;
}
