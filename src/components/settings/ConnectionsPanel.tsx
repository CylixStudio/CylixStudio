import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, ExternalLink, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  connectStreamElements,
  disconnectPlatformConnection,
  startPlatformLink,
} from "@/lib/connections.functions";
import { BotRixPanel } from "@/components/hub/BotRixPanel";
import { InfoTip } from "@/components/ui/info-tip";
import { PlatformIcon } from "@/components/widgets/PlatformIcon";
import { STUDIO_PLATFORMS, parseStudioPlatform, type StudioPlatform } from "@/lib/defaultPlatform";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

type OAuthProviderId = "twitch" | "kick" | "tiktok";

const OAUTH_PLATFORMS: Array<{
  platform: "TWITCH" | "KICK" | "TIKTOK";
  provider: OAuthProviderId;
  label: string;
  hint: TranslationKey;
  buttonClass: string;
  comingSoon?: boolean;
}> = [
  {
    platform: "TWITCH",
    provider: "twitch",
    label: "Twitch",
    hint: "settings.connections.twitchHint",
    buttonClass: "bg-twitch text-twitch-foreground",
  },
  {
    platform: "KICK",
    provider: "kick",
    label: "Kick",
    hint: "settings.connections.kickHint",
    buttonClass: "bg-kick text-kick-foreground",
  },
  {
    platform: "TIKTOK",
    provider: "tiktok",
    label: "TikTok",
    hint: "settings.connections.tiktokHint",
    buttonClass: "bg-[#FE2C55] text-white",
    comingSoon: true,
  },
];

const quietBtn =
  "h-8 rounded-lg border border-white/5 px-3 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground";
const dangerBtn =
  "h-8 rounded-lg border border-white/5 px-3 text-[0.75rem] font-medium text-destructive transition-colors hover:bg-destructive/10";
const tokenField =
  "h-9 min-w-[12rem] flex-1 rounded-lg border border-white/5 bg-background px-3 pe-9 font-mono text-xs outline-none focus:border-primary";

function StatusBadge({
  connection,
  t,
}: {
  connection: { is_active: boolean } | undefined;
  t: (key: TranslationKey) => string;
}) {
  if (!connection) {
    return (
      <span className="shrink-0 rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
        {t("settings.connections.disconnected")}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
        connection.is_active
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-white/[0.04] text-muted-foreground"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connection.is_active ? "animate-pulse bg-emerald-400" : "bg-muted-foreground"
        }`}
      />
      {connection.is_active
        ? t("settings.connections.connected")
        : t("settings.connections.paused")}
    </span>
  );
}

function ConnectionRow({
  icon,
  label,
  hint,
  account,
  status,
  actions,
  extra,
  comingSoon = false,
  comingSoonLabel,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  account?: string | null;
  status: ReactNode;
  actions: ReactNode;
  extra?: ReactNode;
  comingSoon?: boolean;
  comingSoonLabel?: string;
}) {
  return (
    <div className={`relative py-4 ${comingSoon ? "pointer-events-none" : ""}`}>
      <div className={comingSoon ? "blur-[3px] saturate-50" : undefined}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center">{icon}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{label}</p>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted-foreground">{hint}</p>
              {account ? (
                <p className="mt-0.5 text-[0.75rem] text-muted-foreground">
                  <span>{account}</span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
            {status}
            {actions}
          </div>
        </div>
        {extra}
      </div>
      {comingSoon ? (
        <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[1px]">
          <span
            className="flex items-center gap-1.5 rounded-full border border-[oklch(1_0_0/0.14)] px-3 py-1.5 text-[0.66rem] font-semibold text-foreground"
            style={{ background: "rgba(10, 10, 10, 0.85)" }}
          >
            <Lock className="size-3.5 text-primary" aria-hidden />
            {comingSoonLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function ConnectionsPanel({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data } = useWorkspace(userId);
  const { t } = useLanguage();

  const linkFn = useServerFn(startPlatformLink);
  const connectSeFn = useServerFn(connectStreamElements);
  const disconnectFn = useServerFn(disconnectPlatformConnection);

  const [jwtDraft, setJwtDraft] = useState("");
  const [showJwt, setShowJwt] = useState(false);
  const [seError, setSeError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (!connected) return;
    const labels: Record<string, TranslationKey> = {
      tiktok: "settings.connections.toast.tiktok",
      twitch: "settings.connections.toast.twitch",
      kick: "settings.connections.toast.kick",
      streamlabs: "settings.connections.toast.sl",
    };
    toast.success(t(labels[connected] ?? "settings.connections.toast.generic"));
    params.delete("connected");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, [t]);

  const connections = data?.connections ?? [];
  const findConnection = (platform: string) => connections.find((c) => c.platform === platform);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["workspace", userId] });
  const savedPlatform = parseStudioPlatform(data?.profile?.default_platform);

  const saveDefaultPlatform = async (platform: StudioPlatform | null) => {
    if (platform === savedPlatform) return;
    setBusy("default-platform");
    setError(null);
    const { data: updated, error: writeError } = await supabase
      .from("users")
      .update({ default_platform: platform })
      .eq("id", userId)
      .select("id");
    if (writeError) {
      setBusy(null);
      setError(writeError.message);
      return;
    }
    if (!updated?.length) {
      const { error: insertError } = await supabase
        .from("users")
        .upsert({ id: userId, default_platform: platform }, { onConflict: "id" });
      if (insertError) {
        setBusy(null);
        setError(insertError.message);
        return;
      }
    }
    setBusy(null);
    toast.success(t("settings.defaultPlatform.saved"));
    void refresh();
  };

  const startOAuth = async (provider: OAuthProviderId | "streamlabs") => {
    const blocked = OAUTH_PLATFORMS.find((entry) => entry.provider === provider);
    if (blocked?.comingSoon) return;
    setBusy(provider);
    setError(null);
    try {
      const { url } = await linkFn({ data: { provider } });
      window.location.href = url;
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const saveStreamElements = async () => {
    const token = jwtDraft.trim().replace(/^bearer\s+/i, "").replace(/^["']|["']$/g, "").trim();
    if (!token) return;
    setBusy("STREAMELEMENTS");
    setSeError(null);
    try {
      const result = await connectSeFn({ data: { token } });
      if (!result.ok) {
        setSeError(t("settings.connections.seInvalid"));
        return;
      }
      setJwtDraft("");
      setShowJwt(false);
      toast.success(`${t("settings.connections.toast.se")} (${result.username})`);
      void refresh();
    } catch (err) {
      setSeError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    const { error: writeError } = await supabase
      .from("platform_connections")
      .update({ is_active: isActive })
      .eq("id", id);
    if (writeError) setError(writeError.message);
    void refresh();
  };

  const disconnect = async (id: string) => {
    setError(null);
    try {
      const result = await disconnectFn({ data: { id } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const seConnection = findConnection("STREAMELEMENTS");
  const slSocketConnection =
    connections.find(
      (c) =>
        c.platform === "STREAMLABS" &&
        (c.metadata as { source?: string } | null)?.source === "oauth",
    ) ?? connections.find((c) => c.platform === "STREAMLABS");
  const slAvatar = slSocketConnection?.metadata
    ? (slSocketConnection.metadata as { avatar_url?: string | null }).avatar_url
    : null;

  const connectedActions = (connection: { id: string; is_active: boolean }) => (
    <>
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => toggleActive(connection.id, !connection.is_active)}
          className={quietBtn}
        >
          {connection.is_active
            ? t("settings.connections.pause")
            : t("settings.connections.resume")}
        </button>
        <InfoTip text={t("tooltips.settings.pause")} />
      </span>
      <button type="button" onClick={() => disconnect(connection.id)} className={dangerBtn}>
        {t("settings.connections.disconnect")}
      </button>
    </>
  );

  const liveOauth = OAUTH_PLATFORMS.filter((entry) => !entry.comingSoon);

  const renderOAuthRow = (entry: (typeof OAUTH_PLATFORMS)[number]) => {
    const connection = findConnection(entry.platform);
    const avatar = connection?.metadata
      ? (connection.metadata as { avatar_url?: string | null }).avatar_url
      : null;
    return (
      <ConnectionRow
        key={entry.platform}
        comingSoon={Boolean(entry.comingSoon)}
        comingSoonLabel={t("home.comingSoon")}
        icon={
          avatar ? (
            <img
              src={avatar}
              alt=""
              className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10"
            />
          ) : (
            <PlatformIcon platform={entry.platform} size={18} />
          )
        }
        label={entry.label}
        hint={t(entry.hint)}
        account={
          connection?.username
            ? `${t("settings.connections.account")}: ${connection.username}`
            : null
        }
        status={
          entry.comingSoon ? (
            <span className="shrink-0 rounded-full bg-zinc-800/80 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {t("home.comingSoon")}
            </span>
          ) : (
            <StatusBadge connection={connection} t={t} />
          )
        }
        actions={
          entry.comingSoon ? (
            <button
              type="button"
              disabled
              className="inline-flex h-8 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-zinc-800/80 px-3 text-[0.75rem] font-semibold text-muted-foreground opacity-70"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden />
              {t("home.comingSoon")}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy === entry.provider}
                onClick={() => startOAuth(entry.provider)}
                className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[0.75rem] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${entry.buttonClass}`}
              >
                {busy === entry.provider ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {connection
                  ? t("settings.connections.reconnect")
                  : t("settings.connections.connect")}
              </button>
              {connection ? connectedActions(connection) : null}
            </>
          )
        }
      />
    );
  };

  return (
    <section>
      <h2 className="text-[0.95rem] font-semibold">{t("settings.connections.heading")}</h2>
      <p className="mt-1 max-w-2xl text-[0.78rem] text-muted-foreground">
        {t("settings.connections.hint")}
      </p>

      <div className="mt-6 max-w-2xl rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t("settings.defaultPlatform.label")}</h3>
          <InfoTip text={t("tooltips.settings.defaultPlatform")} />
        </div>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-muted-foreground">
          {t("settings.defaultPlatform.hint")}
        </p>
        <div
          role="radiogroup"
          aria-label={t("settings.defaultPlatform.aria")}
          className="mt-3 flex flex-wrap gap-2"
        >
          <button
            type="button"
            role="radio"
            aria-checked={savedPlatform === null}
            disabled={busy === "default-platform"}
            onClick={() => void saveDefaultPlatform(null)}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[0.78rem] font-medium transition-colors disabled:opacity-50 ${
              savedPlatform === null
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("settings.defaultPlatform.none")}
          </button>
          {STUDIO_PLATFORMS.map((platform) => {
            const active = savedPlatform === platform;
            return (
              <button
                key={platform}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={busy === "default-platform"}
                onClick={() => void saveDefaultPlatform(platform)}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[0.78rem] font-medium transition-colors disabled:opacity-50 ${
                  active
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-white/10 text-muted-foreground hover:text-foreground"
                }`}
              >
                <PlatformIcon platform={platform} size={14} />
                {platform === "KICK"
                  ? "Kick"
                  : platform === "TWITCH"
                    ? "Twitch"
                    : platform === "YOUTUBE"
                      ? "YouTube"
                      : "TikTok"}
              </button>
            );
          })}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 divide-y divide-white/5 border-y border-white/5">
        {liveOauth.map(renderOAuthRow)}

        <ConnectionRow
          icon={
            slAvatar ? (
              <img
                src={slAvatar}
                alt=""
                className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10"
              />
            ) : (
              <PlatformIcon platform="STREAMLABS" size={18} />
            )
          }
          label="Streamlabs"
          hint={t("settings.connections.slHint")}
          account={
            slSocketConnection?.username
              ? `${t("settings.connections.account")}: ${slSocketConnection.username}`
              : null
          }
          status={<StatusBadge connection={slSocketConnection} t={t} />}
          actions={
            <>
              <button
                type="button"
                disabled={busy === "streamlabs"}
                onClick={() => startOAuth("streamlabs")}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#31C48D] px-3 text-[0.75rem] font-semibold text-[#04231a] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy === "streamlabs" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {slSocketConnection
                  ? t("settings.connections.reconnect")
                  : t("settings.connections.connectStreamlabs")}
              </button>
              {slSocketConnection ? connectedActions(slSocketConnection) : null}
            </>
          }
        />

        <ConnectionRow
          icon={<PlatformIcon platform="STREAMELEMENTS" size={18} />}
          label="StreamElements"
          hint={t("settings.connections.seHint")}
          account={
            seConnection?.username
              ? `${t("settings.connections.account")}: ${seConnection.username}`
              : null
          }
          status={<StatusBadge connection={seConnection} t={t} />}
          actions={
            <>
              <button
                type="button"
                disabled={busy === "STREAMELEMENTS" || !jwtDraft.trim()}
                onClick={saveStreamElements}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#0066FF] px-3 text-[0.75rem] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy === "STREAMELEMENTS" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t("settings.connections.saveConnect")}
              </button>
              {seConnection ? connectedActions(seConnection) : null}
            </>
          }
          extra={
            <div className="mt-3 max-w-xl space-y-1.5 ps-11">
              <div className="relative flex items-center">
                <input
                  type={showJwt ? "text" : "password"}
                  value={jwtDraft}
                  onChange={(event) => {
                    setJwtDraft(event.target.value);
                    setSeError(null);
                  }}
                  placeholder={t("settings.connections.jwtPlaceholder")}
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  className={`${tokenField} w-full`}
                />
                <button
                  type="button"
                  onClick={() => setShowJwt((v) => !v)}
                  aria-label={
                    showJwt
                      ? t("settings.connections.hideToken")
                      : t("settings.connections.showToken")
                  }
                  className="absolute inset-y-0 end-1 my-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.04]"
                >
                  {showJwt ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {seError ? <p className="text-[11px] text-destructive">{seError}</p> : null}
              <a
                href="https://streamelements.com/dashboard/account/channels"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                {t("settings.connections.jwtHelp")}
              </a>
            </div>
          }
        />
      </div>

      <BotRixPanel />
    </section>
  );
}
