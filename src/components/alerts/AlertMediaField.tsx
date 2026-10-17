import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileImage, Link2, Music2, Trash2, Upload } from "lucide-react";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { useAlertStudioKey } from "./alertApi";
import { useAlertMediaUrl } from "./useAlertMediaUrl";
import {
  alertUrlIsVideo,
  formatBytes,
  inspectUpload,
  normalizeAlertMediaUrl,
  type AlertKind,
  type AlertPlatform,
  type AlertStudioState,
  type MediaSlot,
  type AlertMediaSource,
} from "@/lib/alertStudio";

const ACCEPT = { visual: ".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm", audio: ".mp3,.wav,.ogg" };

export function AlertMediaField({
  studio,
  platform,
  alertId,
  slot,
  label,
  variationId,
  source,
  url,
  onSourceChange,
}: {
  studio: AlertStudioState;
  platform: AlertPlatform;
  alertId: AlertKind;
  slot: MediaSlot;
  label: string;
  variationId?: string | undefined;
  source: AlertMediaSource;
  url: string;
  onSourceChange: (source: AlertMediaSource, url: string) => void;
}) {
  const { t } = useLanguage();
  const alertStudioKey = useAlertStudioKey();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<TranslationKey | "">("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [urlDraft, setUrlDraft] = useState(url);
  const [failedUrl, setFailedUrl] = useState("");
  useEffect(() => {
    if (source !== "url" || url) setUrlDraft(url);
  }, [url, source]);
  const asset = studio.media.find(
    (item) =>
      item.platform === platform &&
      item.alertId === alertId &&
      item.slot === slot &&
      item.variationId === variationId,
  );
  const safeUrl = normalizeAlertMediaUrl(urlDraft, slot);
  const invalidUrl = source === "url" && Boolean(urlDraft) && !safeUrl;
  useEffect(() => {
    urlRef.current?.setCustomValidity(invalidUrl ? t("alerts.urlInvalid") : "");
  }, [invalidUrl, t]);

  const upload = async (file?: File) => {
    if (!file || busy) return;
    setError("");
    setBusy(true);
    try {
      if (file.size > studio.limitBytes) {
        setError("alerts.tooLarge");
        return;
      }
      const checked = inspectUpload(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
        slot,
        studio.plan,
      );
      if (!checked.ok) {
        setError("alerts.invalidFile");
        return;
      }
      const body = new FormData();
      body.set("file", file);
      body.set("platform", platform);
      body.set("alertId", alertId);
      body.set("slot", slot);
      if (variationId) body.set("variationId", variationId);
      const response = await fetch("/api/alerts/media", { method: "POST", body });
      const payload = (await response.json()) as { studio?: AlertStudioState };
      if (!response.ok || !payload.studio) {
        setError(response.status === 413 ? "alerts.tooLarge" : "alerts.uploadFail");
        return;
      }
      queryClient.setQueryData(alertStudioKey, payload.studio);
      setUrlDraft("");
      setFailedUrl("");
      onSourceChange("upload", "");
    } catch {
      setError("alerts.uploadFail");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setError("");
    if (source !== "upload" || !asset) {
      setUrlDraft("");
      setFailedUrl("");
      onSourceChange("none", "");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/alerts/media/${asset.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError("alerts.removeFail");
        return;
      }
      queryClient.setQueryData(alertStudioKey, await response.json());
      setUrlDraft("");
      onSourceChange("none", "");
    } catch {
      setError("alerts.removeFail");
    } finally {
      setBusy(false);
    }
  };

  const previewUrl =
    source === "url"
      ? safeUrl
      : source === "upload" && asset
        ? `/api/alerts/media/${asset.id}`
        : "";
  const video =
    source === "url" ? alertUrlIsVideo(previewUrl) : Boolean(asset?.mime.startsWith("video/"));
  const resolvedPreview = useAlertMediaUrl(previewUrl);
  const previewFailed = Boolean(previewUrl && failedUrl === previewUrl) || resolvedPreview.failed;
  return (
    <div className="alert-media" data-media-slot={slot} data-media-source={source}>
      <div
        className={`alert-media-bar alert-media-unified ${over ? "is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void upload(event.dataTransfer.files[0]);
        }}
      >
        <div className="alert-file-name">
          {slot === "visual" ? <FileImage size={18} /> : <Music2 size={18} />}
          {source === "url" ? (
            <input
              ref={urlRef}
              className="alert-media-url"
              dir="ltr"
              type="url"
              aria-label={`${label} — ${t("alerts.url")}`}
              placeholder={
                slot === "audio" ? "https://example.com/alert.mp3" : "https://example.com/alert.gif"
              }
              value={urlDraft}
              onChange={(event) => {
                const value = event.target.value;
                setUrlDraft(value);
                setFailedUrl("");
                setError("");
                onSourceChange("url", normalizeAlertMediaUrl(value, slot));
              }}
            />
          ) : (
            <>
              <span>
                {busy
                  ? t("alerts.processing")
                  : source === "upload" && asset
                    ? asset.name
                    : t("alerts.noFile")}
              </span>
              {source === "upload" && asset && <small dir="ltr">{formatBytes(asset.bytes)}</small>}
            </>
          )}
        </div>
        <button
          type="button"
          className="alert-button icon-button"
          disabled={busy}
          title={t("alerts.upload")}
          aria-label={`${t("alerts.upload")} — ${label}`}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={16} />
        </button>
        <button
          type="button"
          className="alert-button icon-button"
          disabled={busy}
          aria-pressed={source === "url"}
          title={t("alerts.url")}
          aria-label={`${t("alerts.url")} — ${label}`}
          onClick={() => {
            setError("");
            setFailedUrl("");
            if (source !== "url") {
              setUrlDraft("");
              onSourceChange("url", "");
            }
            requestAnimationFrame(() => urlRef.current?.focus());
          }}
        >
          <Link2 size={16} />
        </button>
        {(source === "url" || (source === "upload" && asset)) && (
          <button
            type="button"
            className="alert-button icon-button"
            disabled={busy}
            title={t("alerts.removeMedia")}
            aria-label={`${t("alerts.removeMedia")} — ${label}`}
            onClick={() => void remove()}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        aria-label={`${t("alerts.upload")} — ${label}`}
        type="file"
        hidden
        accept={ACCEPT[slot]}
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <p className="alert-hint">
        <bdi>
          {slot === "visual" ? "PNG · JPG · JPEG · WEBP · GIF · MP4 · WEBM" : "MP3 · WAV · OGG"}
        </bdi>
        {" · "}
        {source === "url"
          ? t("alerts.externalLimit")
          : t("alerts.uploadLimit", { limit: formatBytes(studio.limitBytes) })}
      </p>
      {resolvedPreview.url && !previewFailed && (
        <div className="alert-media-preview" key={previewUrl}>
          {slot === "audio" ? (
            <audio
              src={resolvedPreview.url}
              controls
              preload="metadata"
              onError={() => setFailedUrl(previewUrl)}
            />
          ) : video ? (
            <video
              src={resolvedPreview.url}
              controls
              preload="metadata"
              onError={() => setFailedUrl(previewUrl)}
            />
          ) : (
            <img
              src={resolvedPreview.url}
              alt={t("alerts.mediaPreview")}
              referrerPolicy="no-referrer"
              onError={() => setFailedUrl(previewUrl)}
            />
          )}
        </div>
      )}
      {(error || invalidUrl || previewFailed) && (
        <p role="alert" className="alert-error">
          {t(error || (invalidUrl ? "alerts.urlInvalid" : "alerts.mediaFailed"), {
            limit: formatBytes(studio.limitBytes),
          })}
        </p>
      )}
    </div>
  );
}
