import { useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  applyTestCommandImport,
  buildLocalSettingsBackup,
  downloadSettingsBackup,
  parseSettingsBackup,
  readLocalPrefs,
  summarizeBackup,
  writeLocalPrefs,
  type CommandImportMode,
  type SettingsBackupFile,
  type SettingsBackupSummary,
} from "@/lib/settingsBackup";
import { exportSettingsBackup, importSettingsBackup } from "@/lib/settingsBackup.functions";
import { isTestMode } from "@/lib/testMode";
import { useLanguage } from "@/lib/i18n";

const quietBtn =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/5 px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground disabled:opacity-50";

export function SettingsBackupPanel() {
  const { t, setLang } = useLanguage();
  const queryClient = useQueryClient();
  const exportFn = useServerFn(exportSettingsBackup);
  const importFn = useServerFn(importSettingsBackup);
  const fileRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pending, setPending] = useState<{
    file: SettingsBackupFile;
    summary: SettingsBackupSummary;
  } | null>(null);
  const [mode, setMode] = useState<CommandImportMode>("merge");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["custom-commands"] });
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
  };

  const exportSettings = async () => {
    setExporting(true);
    try {
      if (isTestMode()) {
        downloadSettingsBackup(buildLocalSettingsBackup({}));
      } else {
        const remote = await exportFn();
        downloadSettingsBackup({
          ...remote,
          prefs: readLocalPrefs(),
        });
      }
      toast.success(t("settings.backup.exportOk"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings.backup.exportFail"));
    } finally {
      setExporting(false);
    }
  };

  const onPickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseSettingsBackup(JSON.parse(text) as unknown);
      if (!parsed.ok) {
        toast.error(
          parsed.error === "unsupported"
            ? t("settings.backup.unsupported")
            : t("settings.backup.invalid"),
        );
        return;
      }
      setMode("merge");
      setPending({ file: parsed.data, summary: summarizeBackup(parsed.data) });
    } catch {
      toast.error(t("settings.backup.invalid"));
    }
  };

  const applyImport = async () => {
    if (!pending) return;
    setApplying(true);
    try {
      writeLocalPrefs(pending.file.prefs);
      if (pending.file.prefs.language) setLang(pending.file.prefs.language);

      if (isTestMode()) {
        applyTestCommandImport(pending.file, mode);
      } else {
        const result = await importFn({
          data: {
            mode,
            defaultPrefix: pending.file.customCommands.defaultPrefix,
            commands: pending.file.customCommands.commands,
          },
        });
        if (!result.ok) throw new Error(result.error);
      }
      refresh();
      setPending(null);
      toast.success(t("settings.backup.importOk"));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      toast.error(code === "free_limit_commands" ? t("settings.backup.freeLimit") : code || t("settings.backup.importFail"));
    } finally {
      setApplying(false);
    }
  };

  const summary = pending?.summary;

  return (
    <section>
      <h2 className="text-[0.95rem] font-semibold">{t("settings.backup.heading")}</h2>
      <p className="mt-1 max-w-2xl text-[0.78rem] text-muted-foreground">
        {t("settings.backup.body")}
      </p>
      <p className="mt-2 max-w-2xl text-[0.75rem] text-muted-foreground">
        {t("settings.backup.secretsHint")}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={exporting} onClick={() => void exportSettings()} className={quietBtn}>
          {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {t("settings.backup.export")}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={quietBtn}
        >
          <Upload className="size-3.5" />
          {t("settings.backup.import")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => void onPickFile(event)}
        />
      </div>

      {pending && summary ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-backup-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl">
            <h3 id="settings-backup-title" className="text-lg font-semibold">
              {t("settings.backup.confirmTitle")}
            </h3>
            <p className="mt-2 text-[0.82rem] text-muted-foreground">{t("settings.backup.confirmBody")}</p>

            <ul className="mt-4 space-y-1.5 text-[0.82rem]">
              <li>
                {t("settings.backup.summaryCommands")}: {summary.commandCount}
              </li>
              <li>
                {t("settings.backup.summaryPrefix")}:{" "}
                <span className="font-mono" dir="ltr">
                  {summary.defaultPrefix || "—"}
                </span>
              </li>
              <li>
                {t("settings.backup.summaryLanguage")}: {summary.language ?? t("settings.backup.none")}
              </li>
              <li>
                {t("settings.backup.summaryConnections")}: {summary.connectionCount}
              </li>
            </ul>

            <p className="mt-4 text-[0.75rem] text-muted-foreground">{t("settings.backup.prefsHint")}</p>
            <p className="mt-1 text-[0.75rem] text-muted-foreground">
              {t("settings.backup.connectionsHint")}
            </p>

            <fieldset className="mt-5 space-y-2">
              <legend className="text-[0.8rem] font-medium">{t("settings.backup.modeLegend")}</legend>
              <label className="flex items-start gap-2 text-[0.8rem]">
                <input
                  type="radio"
                  name="backup-mode"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="font-medium">{t("settings.backup.mergeLabel")}</span>
                  <span className="mt-0.5 block text-[0.75rem] text-muted-foreground">
                    {t("settings.backup.mergeHint")}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[0.8rem]">
                <input
                  type="radio"
                  name="backup-mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="font-medium">{t("settings.backup.replaceLabel")}</span>
                  <span className="mt-0.5 block text-[0.75rem] text-muted-foreground">
                    {t("settings.backup.replaceHint")}
                  </span>
                </span>
              </label>
            </fieldset>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={applying}
                onClick={() => setPending(null)}
                className={quietBtn}
              >
                {t("settings.backup.cancel")}
              </button>
              <button
                type="button"
                disabled={applying}
                onClick={() => void applyImport()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {applying ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {applying ? t("settings.backup.applying") : t("settings.backup.apply")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
