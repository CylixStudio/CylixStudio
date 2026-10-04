import { createHash } from "node:crypto";

import { resolveRelaySource } from "@/lib/platformEvents";
import {
  parseStreamElementsPayload,
  parseStreamlabsPayload,
  readSocketIoFrame,
  type ParsedRelayEvent,
} from "@/lib/relayEvents";

const STREAMLABS_URL = "wss://sockets.streamlabs.com/socket.io/?transport=websocket&token=";
const STREAMELEMENTS_URL = "wss://realtime.streamelements.com/socket.io/?transport=websocket&EIO=3";
const REFRESH_MS = 45_000;
const GLOBAL_KEY = "__cylixRelaySockets";

type RelayPlatform = "STREAMLABS" | "STREAMELEMENTS";

type Desired = {
  key: string;
  userId: string;
  platform: RelayPlatform;
  token: string;
};

type Live = {
  userId: string;
  platform: RelayPlatform;
  close: () => void;
};

type Handle = { stop: () => void };

function tokenKey(platform: RelayPlatform, token: string): string {
  return createHash("sha256").update(`${platform}:${token}`).digest("hex").slice(0, 24);
}

function streamlabsToken(accessToken: string | null, metadata: unknown): string | null {
  const meta =
    metadata && typeof metadata === "object"
      ? (metadata as { source?: string; socket_token?: string })
      : null;
  const fromMeta = meta?.socket_token?.trim();
  if (fromMeta && fromMeta.length >= 40) return fromMeta;
  if (meta?.source === "socket_token") {
    const token = accessToken?.trim() ?? "";
    if (token.length >= 40) return token;
  }
  return null;
}

function streamElementsToken(accessToken: string | null): string | null {
  const token = accessToken?.trim() ?? "";
  return token.split(".").length === 3 ? token : null;
}

async function loadDesired(): Promise<Map<string, Desired>> {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("platform_connections")
    .select("user_id, platform, access_token, metadata")
    .in("platform", ["STREAMLABS", "STREAMELEMENTS"])
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const desired = new Map<string, Desired>();
  for (const row of data ?? []) {
    if (row.platform !== "STREAMLABS" && row.platform !== "STREAMELEMENTS") continue;
    const token =
      row.platform === "STREAMLABS"
        ? streamlabsToken(row.access_token, row.metadata)
        : streamElementsToken(row.access_token);
    if (!token) continue;
    const key = tokenKey(row.platform, token);
    if (desired.has(key)) continue;
    desired.set(key, { key, userId: row.user_id, platform: row.platform, token });
  }
  return desired;
}

async function ingest(userId: string, platform: RelayPlatform, event: ParsedRelayEvent) {
  const resolved = resolveRelaySource({
    relay: platform,
    origin: event.origin,
    eventType: event.eventType,
  });
  if (!resolved) return;
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { receivePlatformEvent } = await import("@/lib/webhooks/ingest.server");
  await receivePlatformEvent(supabaseAdmin, userId, {
    platform: resolved.platform,
    eventType: resolved.eventType,
    providerEventId: event.providerEventId,
    actorName: event.actorName,
    actorPlatformId: null,
    amount: event.amount,
    currency: event.currency,
    quantity: event.quantity,
    rawPayload: event.raw,
  });
}

function openSocket(desired: Desired): Live {
  let socket: WebSocket | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let closed = false;
  const seen = new Set<string>();

  const forward = (event: ParsedRelayEvent) => {
    if (seen.has(event.providerEventId)) return;
    seen.add(event.providerEventId);
    if (seen.size > 500) {
      seen.clear();
      seen.add(event.providerEventId);
    }
    void ingest(desired.userId, desired.platform, event).catch((error: unknown) => {
      console.error("[relay-sockets] ingest failed", {
        platform: desired.platform,
        message: error instanceof Error ? error.message : "error",
      });
    });
  };

  const connect = () => {
    if (closed) return;
    const url =
      desired.platform === "STREAMLABS"
        ? `${STREAMLABS_URL}${encodeURIComponent(desired.token)}`
        : STREAMELEMENTS_URL;
    socket = new WebSocket(url);

    socket.onopen = () => {
      attempts = 0;
      if (desired.platform === "STREAMELEMENTS") {
        socket?.send(
          `42${JSON.stringify(["authenticate", { method: "jwt", token: desired.token }])}`,
        );
      }
      ping = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send("2");
      }, 20_000);
    };

    socket.onmessage = (message) => {
      const frame = typeof message.data === "string" ? message.data : "";
      const parsed = readSocketIoFrame(frame);
      if (parsed === "ping") {
        socket?.send("3");
        return;
      }
      if (!parsed) return;
      if (desired.platform === "STREAMLABS") {
        if (parsed.name !== "event") return;
        for (const item of parseStreamlabsPayload(parsed.payload)) forward(item);
        return;
      }
      if (parsed.name !== "event" && parsed.name !== "event:test") return;
      const item = parseStreamElementsPayload(parsed.payload);
      if (item) forward(item);
    };

    socket.onerror = () => {
      socket?.close();
    };

    socket.onclose = () => {
      if (ping) clearInterval(ping);
      ping = null;
      if (closed) return;
      attempts += 1;
      retry = setTimeout(connect, Math.min(1000 * 2 ** attempts, 30_000));
    };
  };

  connect();

  return {
    userId: desired.userId,
    platform: desired.platform,
    close: () => {
      closed = true;
      if (ping) clearInterval(ping);
      if (retry) clearTimeout(retry);
      socket?.close();
    },
  };
}

/** Keeps Streamlabs and StreamElements sockets open on the server so tips land while the dashboard is closed. */
export function startRelaySockets() {
  if (typeof WebSocket === "undefined") {
    console.error("[relay-sockets] WebSocket is not available in this Node runtime");
    return;
  }

  const scope = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Handle };
  scope[GLOBAL_KEY]?.stop();

  const live = new Map<string, Live>();
  let stopped = false;
  let refreshing = false;

  const refresh = async () => {
    if (stopped || refreshing) return;
    refreshing = true;
    try {
      const desired = await loadDesired();
      for (const [key, current] of live) {
        const next = desired.get(key);
        if (!next || next.userId !== current.userId || next.platform !== current.platform) {
          current.close();
          live.delete(key);
        }
      }
      for (const next of desired.values()) {
        if (live.has(next.key)) continue;
        live.set(next.key, openSocket(next));
      }
    } catch (error: unknown) {
      console.error(
        "[relay-sockets] refresh failed",
        error instanceof Error ? error.message : "error",
      );
    } finally {
      refreshing = false;
    }
  };

  void refresh();
  const timer = setInterval(() => void refresh(), REFRESH_MS);
  timer.unref?.();

  const handle: Handle = {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      for (const current of live.values()) current.close();
      live.clear();
      if (scope[GLOBAL_KEY] === handle) delete scope[GLOBAL_KEY];
    },
  };
  scope[GLOBAL_KEY] = handle;
}
