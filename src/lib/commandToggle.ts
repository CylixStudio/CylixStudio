import { withCommandEnabled } from "./commandEnabled.ts";

export type CommandToggleResult = {
  ok?: boolean | undefined;
  error?: string | undefined;
} | null | undefined;

export function acceptCommandToggle(locked: boolean): boolean {
  return !locked;
}

/** Keeps the previous rows when the server did not confirm the write. */
export function confirmCommandToggle<T extends { id: string; enabled: boolean }>(
  baseline: readonly T[],
  id: string,
  enabled: boolean,
  result: CommandToggleResult,
): { commands: T[]; success: boolean } {
  if (!result || result.ok === false) {
    return { commands: baseline.map((command) => ({ ...command })), success: false };
  }
  return { commands: withCommandEnabled(baseline, id, enabled), success: true };
}
