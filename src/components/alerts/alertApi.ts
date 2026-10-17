import type {
  AlertConfig,
  AlertKind,
  AlertPlatform,
  AlertSimulation,
  AlertStudioState,
} from "@/lib/alertStudio";

import { useRouteContext } from "@tanstack/react-router";
export function useAlertStudioKey() {
  const { user, workspaceOwnerId } = useRouteContext({ from: "/_authenticated" });
  return ["alert-studio", user.id, workspaceOwnerId] as const;
}

export async function loadAlertStudio(): Promise<AlertStudioState> {
  const response = await fetch("/api/alerts", { cache: "no-store" });
  if (!response.ok) throw new Error("alerts.loadFail");
  return response.json() as Promise<AlertStudioState>;
}

export async function saveAlertStudio(body: {
  alerts?: Partial<Record<AlertPlatform, Partial<Record<AlertKind, AlertConfig>>>>;
  simulation?: AlertSimulation;
}): Promise<AlertStudioState> {
  const response = await fetch("/api/alerts", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as AlertStudioState & { message?: string };
  if (!response.ok) throw new Error("alerts.saveFail");
  return payload;
}

export function overlayUrl(origin: string, token: string): string {
  return `${origin}/overlay/alerts/${token}`;
}
