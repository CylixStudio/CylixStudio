/** Production Alerts: Supabase persistence only; no filesystem, mock auth, or demo store. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/client.server";
import { userHasActivePro } from "@/lib/subscription.server";
import { AlertHttpError, type AlertIdentity } from "@/lib/alertAccess.server";
import {
  ALERT_CATALOG,
  alertDefinition,
  emptyPlatformAlerts,
  inspectUpload,
  isVariationId,
  mediaLimit,
  normalizeConfig,
  normalizePlatformAlerts,
  normalizeSimulation,
  renderAlertText,
  selectAlertVariation,
  selectableAlert,
  type AlertConfig,
  type AlertEvent,
  type AlertPlatform,
  type AlertStudioState,
  type MediaAsset,
  type MediaSlot,
} from "@/lib/alertStudio";
import { PLATFORM_EVENT_TYPES } from "@/lib/alertEvents.shared";

const db = supabaseAdmin as unknown as SupabaseClient;
const BUCKET = "alert-media";
type StudioRow = {
  owner_id: string;
  overlay_token: string;
  overlay_token_hash: string;
  settings: unknown;
  simulation: unknown;
  overlay_seen_at: string | null;
};
type AssetRow = {
  id: string;
  owner_id: string;
  platform: AlertPlatform;
  alert_id: string;
  slot: MediaSlot;
  variation_key: string;
  path: string;
  name: string;
  bytes: number;
  mime: string;
  ext: string;
};
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new AlertHttpError(503, "alerts_schema_or_storage_unavailable");
  return result.data;
}
async function studio(owner: string): Promise<StudioRow> {
  const row = checked(
    await db.from("alerts_studios").select("*").eq("owner_id", owner).maybeSingle(),
  );
  if (row) return row;
  const token = "alerts-" + randomBytes(32).toString("hex");
  checked(
    await db.from("alerts_studios").upsert(
      {
        owner_id: owner,
        overlay_token: token,
        overlay_token_hash: hash(token),
        settings: emptyPlatformAlerts(),
        simulation: normalizeSimulation(null),
      },
      { onConflict: "owner_id", ignoreDuplicates: true },
    ),
  );
  const created = checked(
    await db.from("alerts_studios").select("*").eq("owner_id", owner).single(),
  );
  if (!created) throw new AlertHttpError(503, "alerts_unavailable");
  return created;
}
const mediaView = (x: AssetRow): MediaAsset => ({
  id: x.id,
  platform: x.platform,
  alertId: x.alert_id as MediaAsset["alertId"],
  slot: x.slot,
  name: x.name,
  bytes: x.bytes,
  mime: x.mime,
  ext: x.ext,
  ...(x.variation_key !== "base" ? { variationId: x.variation_key } : {}),
});
export async function readAlertStudio(identity: AlertIdentity): Promise<AlertStudioState> {
  const row = await studio(identity.ownerId);
  const media = checked(
    await db.from("alerts_media").select("*").eq("owner_id", identity.ownerId),
  ) as AssetRow[];
  const plan = (await userHasActivePro(supabaseAdmin, identity.ownerId)) ? "pro" : "free";
  return {
    plan,
    token: row.overlay_token,
    limitBytes: mediaLimit(plan),
    overlaySeenAt: row.overlay_seen_at ? Date.parse(row.overlay_seen_at) : 0,
    simulation: normalizeSimulation(row.simulation),
    alerts: normalizePlatformAlerts(row.settings),
    media: media.map(mediaView),
  };
}
export async function saveAlertStudio(identity: AlertIdentity, body: Record<string, unknown>) {
  const row = await studio(identity.ownerId);
  const next = normalizePlatformAlerts(row.settings);
  if (body["alerts"] && typeof body["alerts"] === "object") {
    const patch = body["alerts"] as Record<string, Record<string, unknown>>;
    for (const platform of ["KICK", "TWITCH"] as const)
      for (const definition of ALERT_CATALOG) {
        if (patch[platform]?.[definition.id] !== undefined && selectableAlert(definition, platform))
          next[platform][definition.id] = normalizeConfig(
            patch[platform][definition.id],
            definition,
          );
      }
  }
  // Plan comes from the real subscription. Client-provided plan/owner/token are ignored.
  checked(
    await db
      .from("alerts_studios")
      .update({
        settings: next,
        simulation:
          body["simulation"] !== undefined
            ? normalizeSimulation(body["simulation"])
            : row.simulation,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", identity.ownerId),
  );
  return readAlertStudio(identity);
}
async function asset(identity: AlertIdentity, id: string): Promise<AssetRow> {
  if (!isVariationId(id)) throw new AlertHttpError(404, "not_found");
  const row = checked(
    await db
      .from("alerts_media")
      .select("*")
      .eq("id", id)
      .eq("owner_id", identity.ownerId)
      .maybeSingle(),
  );
  if (!row) throw new AlertHttpError(404, "not_found");
  return row;
}
export async function uploadAlertMedia(identity: AlertIdentity, form: FormData) {
  const state = await readAlertStudio(identity);
  const file = form.get("file"),
    platform = form.get("platform"),
    kind = form.get("alertId"),
    slot = form.get("slot"),
    variation = form.get("variationId");
  const definition = typeof kind === "string" ? alertDefinition(kind) : null;
  if (
    !(file instanceof File) ||
    (platform !== "KICK" && platform !== "TWITCH") ||
    (slot !== "visual" && slot !== "audio") ||
    !definition ||
    !selectableAlert(definition, platform) ||
    (variation !== null && !isVariationId(variation))
  )
    throw new AlertHttpError(400, "invalid_media");
  if (file.size > state.limitBytes) throw new AlertHttpError(413, "file_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspected = inspectUpload(bytes, file.name, slot, state.plan);
  if (!inspected.ok) throw new AlertHttpError(400, "invalid_media");
  const id = randomUUID(),
    objectPath = identity.ownerId + "/" + id + "." + inspected.ext;
  const old = checked(
    await db
      .from("alerts_media")
      .select("*")
      .eq("owner_id", identity.ownerId)
      .eq("platform", platform)
      .eq("alert_id", definition.id)
      .eq("slot", slot)
      .eq("variation_key", variation ?? "base")
      .maybeSingle(),
  ) as AssetRow | null;
  checked(
    await db.storage
      .from(BUCKET)
      .upload(objectPath, bytes, { contentType: inspected.mime, upsert: false }),
  );
  const row: AssetRow = {
    id,
    owner_id: identity.ownerId,
    platform,
    alert_id: definition.id,
    slot,
    variation_key: String(variation ?? "base"),
    path: objectPath,
    name: file.name.replace(/[<>\x00-\x1f]/g, "").slice(0, 80),
    bytes: bytes.length,
    mime: inspected.mime,
    ext: inspected.ext,
  };
  const write = await db
    .from("alerts_media")
    .upsert(row, { onConflict: "owner_id,platform,alert_id,slot,variation_key" });
  if (write.error) {
    await db.storage.from(BUCKET).remove([objectPath]);
    throw new AlertHttpError(503, "media_save_failed");
  }
  if (old) await db.storage.from(BUCKET).remove([old.path]);
  const config = variation
    ? state.alerts[platform][definition.id].variations.find((x) => x.id === variation)?.config
    : state.alerts[platform][definition.id];
  if (config) {
    config[slot === "visual" ? "visualSource" : "audioSource"] = "upload";
    config[slot === "visual" ? "visualUrl" : "audioUrl"] = "";
    await saveAlertStudio(identity, {
      alerts: { [platform]: { [definition.id]: state.alerts[platform][definition.id] } },
    });
  }
  return { ok: true, asset: mediaView(row), studio: await readAlertStudio(identity) };
}
export async function getAlertMedia(identity: AlertIdentity, id: string) {
  const row = await asset(identity, id);
  const blob = checked(await db.storage.from(BUCKET).download(row.path));
  return new Response(blob, {
    headers: {
      "content-type": row.mime,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
export async function removeAlertMedia(identity: AlertIdentity, id: string) {
  const row = await asset(identity, id);
  checked(await db.storage.from(BUCKET).remove([row.path]));
  checked(await db.from("alerts_media").delete().eq("owner_id", identity.ownerId).eq("id", id));
  const state = await readAlertStudio(identity),
    config =
      row.variation_key === "base"
        ? state.alerts[row.platform][row.alert_id as MediaAsset["alertId"]]
        : state.alerts[row.platform][row.alert_id as MediaAsset["alertId"]].variations.find(
            (x) => x.id === row.variation_key,
          )?.config;
  if (config && config[row.slot === "visual" ? "visualSource" : "audioSource"] === "upload") {
    config[row.slot === "visual" ? "visualSource" : "audioSource"] = "none";
    await saveAlertStudio(identity, {
      alerts: {
        [row.platform]: {
          [row.alert_id]: state.alerts[row.platform][row.alert_id as MediaAsset["alertId"]],
        },
      },
    });
  }
  return readAlertStudio(identity);
}
async function playable(owner: string, event: AlertEvent): Promise<AlertEvent> {
  const next = structuredClone(event);
  for (const slot of ["visual", "audio"] as const) {
    const id = slot === "visual" ? next.visualId : next.audioId;
    const source = slot === "visual" ? "visualSource" : "audioSource",
      url = slot === "visual" ? "visualUrl" : "audioUrl";
    if (next.config[source] !== "upload" || !id) continue;
    const row = checked(
      await db.from("alerts_media").select("path").eq("owner_id", owner).eq("id", id).maybeSingle(),
    );
    if (!row) {
      next.config[source] = "none";
      continue;
    }
    const signed = checked(await db.storage.from(BUCKET).createSignedUrl(row.path, 300));
    if (!signed) throw new AlertHttpError(503, "media_unavailable");
    next.config[source] = "url";
    next.config[url] = signed.signedUrl;
  }
  return next;
}
export async function enqueueAlertTest(identity: AlertIdentity, body: Record<string, unknown>) {
  const state = await readAlertStudio(identity);
  const platform = body["platform"];
  if (platform !== "KICK" && platform !== "TWITCH")
    throw new AlertHttpError(400, "invalid_platform");
  const definition = alertDefinition(String(body["alertId"] ?? ""));
  if (!definition || !selectableAlert(definition, platform))
    throw new AlertHttpError(400, "unsupported_type");
  if (
    definition.id === "gift" &&
    (!Number.isSafeInteger(body["count"]) ||
      Number(body["count"]) < 1 ||
      Number(body["count"]) > 100000)
  )
    throw new AlertHttpError(400, "invalid_count");
  const simulation = normalizeSimulation({ ...state.simulation, ...body, platform });
  const base = state.alerts[platform][definition.id];
  const variation = selectAlertVariation(base, simulation),
    config = variation?.config ?? base;
  if (!base.enabled || !config.enabled)
    return { queued: false, event: null, message: "alerts.testDisabled" };
  const find = (slot: MediaSlot) =>
    state.media.find(
      (x) =>
        x.platform === platform &&
        x.alertId === definition.id &&
        x.slot === slot &&
        x.variationId === variation?.id,
    );
  const image = find("visual"),
    audio = find("audio");
  const event: AlertEvent = {
    id: randomUUID(),
    alertId: definition.id,
    ...simulation,
    config,
    text: renderAlertText(config.message, simulation),
    visualId: config.visualSource === "upload" ? (image?.id ?? null) : null,
    visualMime: image?.mime ?? null,
    audioId: config.audioSource === "upload" ? (audio?.id ?? null) : null,
    createdAt: Date.now(),
    ...(variation ? { variationId: variation.id } : {}),
  };
  const requestId =
    typeof body["requestId"] === "string" && isVariationId(body["requestId"])
      ? body["requestId"]
      : event.id;
  const result = checked(
    await db.rpc("alerts_enqueue", {
      p_owner: identity.ownerId,
      p_key: "test:" + requestId,
      p_event: event,
    }),
  );
  return {
    ...result,
    message: result.queued ? "alerts.queued" : "alerts.testDisabled",
    event: result.event ? await playable(identity.ownerId, result.event) : null,
  };
}
export async function simulateAlert(identity: AlertIdentity, body: Record<string, unknown>) {
  const platform = body["platform"];
  if (platform !== "KICK" && platform !== "TWITCH")
    throw new AlertHttpError(400, "invalid_platform");
  const match = PLATFORM_EVENT_TYPES[platform].find((x) => x.type === body["type"]);
  if (!match) throw new AlertHttpError(400, "unsupported_type");
  const state = await readAlertStudio(identity);
  // Explicit test path only. Existing production webhooks and CylixBot are not altered.
  return enqueueAlertTest(identity, {
    ...state.simulation,
    ...body,
    alertId: match.alertId,
    platform,
  });
}
export async function controlState(owner: string) {
  const s = checked(
    await db.from("alerts_queue_state").select("*").eq("owner_id", owner).maybeSingle(),
  );
  const rows = checked(
    await db
      .from("alerts_queue")
      .select("id,payload,status")
      .eq("owner_id", owner)
      .in("status", ["pending", "claimed"])
      .order("created_at")
      .limit(100),
  );
  return {
    paused: s?.paused ?? false,
    current: (rows ?? []).find((x) => x.id === s?.current_id)?.payload ?? null,
    pending: (rows ?? []).filter((x) => x.status === "pending").map((x) => x.payload),
    pendingCount: (rows ?? []).filter((x) => x.status === "pending").length,
  };
}
export async function controlAlertQueue(identity: AlertIdentity, action: string) {
  if (!["pause", "resume", "skip", "clear"].includes(action))
    throw new AlertHttpError(400, "invalid_action");
  await studio(identity.ownerId);
  checked(await db.rpc("alerts_control", { p_owner: identity.ownerId, p_action: action }));
  return controlState(identity.ownerId);
}
export async function overlayOwner(token: string): Promise<string> {
  if (!/^alerts-[a-f0-9]{64}$/.test(token)) throw new AlertHttpError(404, "not_found");
  const row = checked(
    await db
      .from("alerts_studios")
      .select("owner_id")
      .eq("overlay_token_hash", hash(token))
      .maybeSingle(),
  );
  if (!row) throw new AlertHttpError(404, "not_found");
  return row.owner_id;
}
export async function overlayOperation(
  token: string,
  action: string,
  body: Record<string, unknown> = {},
) {
  // No settings, upload, queue management, admin or channel-selection operation here.
  if (!["status", "presence", "claim", "ack"].includes(action))
    throw new AlertHttpError(404, "not_found");
  const owner = await overlayOwner(token);
  if (action === "status") {
    const state = checked(
      await db
        .from("alerts_queue_state")
        .select("paused,current_id")
        .eq("owner_id", owner)
        .maybeSingle(),
    );
    return { paused: state?.paused ?? false, currentId: state?.current_id ?? null };
  }
  if (!isVariationId(body["overlayId"])) throw new AlertHttpError(400, "invalid_display");
  if (action === "presence") {
    const active = checked(
      await db.rpc("alerts_presence", { p_owner: owner, p_overlay: body["overlayId"] }),
    );
    if (!active) return { ok: false };
    checked(
      await db
        .from("alerts_studios")
        .update({ overlay_seen_at: new Date().toISOString() })
        .eq("owner_id", owner),
    );
    return { ok: true };
  }
  if (action === "claim") {
    const result = checked(
      await db.rpc("alerts_claim", { p_owner: owner, p_overlay: body["overlayId"] }),
    );
    return result.event ? { ...result, event: await playable(owner, result.event) } : result;
  }
  if (!isVariationId(body["id"]) || !isVariationId(body["claimId"]))
    throw new AlertHttpError(400, "invalid_receipt");
  return {
    ok: checked(
      await db.rpc("alerts_ack", {
        p_owner: owner,
        p_event: body["id"],
        p_overlay: body["overlayId"],
        p_claim: body["claimId"],
      }),
    ),
  };
}
