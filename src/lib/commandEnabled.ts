/** Returns the same array when the row is already in the requested state. */
export function withCommandEnabled<T extends { id: string; enabled: boolean }>(
  commands: readonly T[],
  id: string,
  enabled: boolean,
): T[] {
  let changed = false;
  const next = commands.map((command) => {
    if (command.id !== id || command.enabled === enabled) return command;
    changed = true;
    return { ...command, enabled };
  });
  return changed ? next : (commands as T[]);
}
