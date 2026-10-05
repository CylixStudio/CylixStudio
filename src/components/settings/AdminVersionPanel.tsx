import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";
import { saveStudioVersionAndBroadcast } from "@/lib/studioVersion.functions";
import { useLanguage } from "@/lib/i18n";

export function AdminVersionPanel() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const saveBroadcast = useServerFn(saveStudioVersionAndBroadcast);
  const current = useQuery({
    queryKey: ["studio-version"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studio_settings")
        .select("value")
        .eq("key", "app_version")
        .maybeSingle();
      if (error) return null;
      return data?.value?.trim() || null;
    },
  });
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (current.data) setVersion(current.data);
  }, [current.data]);

  const save = async () => {
    const next = version.trim();
    if (!next) {
      toast.error(t("settings.admin.version.invalid"));
      return;
    }
    setBusy(true);
    try {
      const result = await saveBroadcast({ data: { version: next } });
      if (!result.ok) {
        toast.error(
          result.error === "forbidden"
            ? t("settings.admin.version.forbidden")
            : t("settings.admin.version.invalid"),
        );
        return;
      }
      toast.success(t("settings.admin.version.saved"));
      toast.message(
        t("settings.admin.version.broadcastResult", {
          sent: result.sent,
          failed: result.failed,
        }),
      );
      await queryClient.invalidateQueries({ queryKey: ["studio-version"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.admin.version.invalid"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8 max-w-2xl rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <h2 className="text-[0.95rem] font-semibold">{t("settings.admin.version.label")}</h2>
      <p className="mt-1 text-[0.78rem] leading-relaxed text-muted-foreground">
        {t("settings.admin.version.hint")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={version}
          onChange={(event) => setVersion(event.target.value)}
          placeholder={t("settings.admin.version.placeholder")}
          dir="ltr"
          maxLength={40}
          className="h-9 w-36 rounded-lg border border-white/10 bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={busy || !version.trim()}
          onClick={() => void save()}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-[0.78rem] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? t("settings.admin.version.saving") : t("settings.admin.version.saveBroadcast")}
        </button>
      </div>
    </section>
  );
}
