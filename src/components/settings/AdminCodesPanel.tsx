import { useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Copy, Download, RotateCcw, ShieldOff, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";
import {
  LIFETIME_DAYS,
  durationLabel,
  formatCode,
  useActivationCodes,
  type ActivationCode,
} from "@/hooks/useSubscription";
import { DarkSelect } from "@/components/ui/dark-select";
import { useLanguage } from "@/lib/i18n";

const DURATIONS = [
  { days: 30, label: "30 Days" },
  { days: 60, label: "60 Days" },
  { days: 90, label: "90 Days" },
  { days: 365, label: "365 Days" },
  { days: LIFETIME_DAYS, label: "Lifetime ♾️" },
  { days: 0, label: "Custom Days…" },
];

type Filter = "all" | "available" | "redeemed" | "revoked";

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function AdminCodesPanel() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const codes = useActivationCodes(true);

  const [duration, setDuration] = useState(30);
  const [customDays, setCustomDays] = useState("7");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ row: ActivationCode; mode: "revoke" | "delete" } | null>(
    null,
  );
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState<ActivationCode | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const isCustom = duration === 0;
  const effectiveDays = isCustom ? Number(customDays) : duration;
  const validDays =
    Number.isFinite(effectiveDays) && effectiveDays >= 1 && effectiveDays <= LIFETIME_DAYS;

  const rows = useMemo(() => {
    const list = codes.data ?? [];
    if (filter === "available") return list.filter((row) => !row.is_used && !row.is_revoked);
    if (filter === "redeemed") return list.filter((row) => row.is_used && !row.is_revoked);
    if (filter === "revoked") return list.filter((row) => row.is_revoked);
    return list;
  }, [codes.data, filter]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["activation-codes"] });

  const openEdit = (row: ActivationCode) => {
    setEditing(row);
    setEditCode(row.code);
    setEditNotes(row.notes ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const nextCode = editCode.trim();
    if (!nextCode) {
      toast.error("Enter a code.");
      return;
    }
    setWorking(true);
    const { error } = await supabase
      .from("activation_codes")
      .update({
        ...(editing.is_used ? {} : { code: nextCode }),
        notes: editNotes.trim() ? editNotes.trim() : null,
      })
      .eq("id", editing.id);
    setWorking(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditing(null);
    toast.success("Code updated");
    void refresh();
  };

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(formatCode(code));
    setCopied(code);
    setTimeout(() => setCopied(null), 1600);
    toast.success("Code copied to clipboard");
  };

  const generate = async () => {
    if (!validDays) {
      toast.error("Enter a day count between 1 and 36500.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc("generate_activation_code", {
        p_duration_days: Math.floor(effectiveDays),
        ...(notes.trim() ? { p_notes: notes.trim() } : {}),
      });
      if (error) throw error;
      const result = data as { ok: boolean; code?: string; error?: string } | null;
      if (!result?.ok || !result.code) throw new Error(result?.error ?? "generation_failed");
      setGenerated(result.code);
      setNotes("");
      await refresh();
      toast.success("New code generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate a code.");
    } finally {
      setGenerating(false);
    }
  };

  const toggleActive = async (row: ActivationCode) => {
    const { error } = await supabase
      .from("activation_codes")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success(
      row.is_active
        ? "Code deactivated"
        : "Code reactivated",
    );
  };

  const remove = async (row: ActivationCode) => {
    const { error } = await supabase.from("activation_codes").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success("Code deleted");
  };

  /** Cancels a redeemed code and drops the linked account back to the free plan. */
  const revoke = async (row: ActivationCode) => {
    const { data, error } = await supabase.rpc("revoke_activation_code", { p_code_id: row.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as { ok: boolean; error?: string } | null;
    if (!result?.ok) {
      toast.error(result?.error ?? "Could not revoke this code.");
      return;
    }
    await refresh();
    await queryClient.invalidateQueries({ queryKey: ["subscription"] });
    toast.success("Subscription revoked");
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setWorking(true);
    try {
      if (confirm.mode === "revoke") await revoke(confirm.row);
      else await remove(confirm.row);
      setConfirm(null);
    } finally {
      setWorking(false);
    }
  };

  const exportCsv = () => {
    const available = (codes.data ?? []).filter((row) => !row.is_used && row.is_active && !row.is_revoked);
    if (available.length === 0) {
      toast.error("No available codes to export.");
      return;
    }
    const lines = [
      "code,duration_days,duration,notes,created_at",
      ...available.map((row) =>
        [
          csvEscape(formatCode(row.code)),
          row.duration_days,
          csvEscape(durationLabel(row.duration_days, false)),
          csvEscape(row.notes ?? ""),
          csvEscape(new Date(row.created_at).toISOString()),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `creovix-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${available.length} codes`);
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "available", label: "Available" },
    { key: "redeemed", label: "Redeemed" },
    { key: "revoked", label: "Revoked" },
  ];

  const fieldClass =
    "rounded-lg border border-[oklch(1_0_0/0.1)] bg-[oklch(1_0_0/0.04)] px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
          🔑 {"Activation code generator"}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block text-[0.72rem] font-medium text-muted-foreground">
              {"Validity duration"}
            </span>
            <DarkSelect
              value={String(duration)}
              onValueChange={(next) => setDuration(Number(next))}
              className="w-full"
              options={DURATIONS.map((option) => ({
                value: String(option.days),
                label: option.label,
              }))}
            />
          </label>

          {isCustom ? (
            <label className="space-y-1.5">
              <span className="block text-[0.72rem] font-medium text-muted-foreground">
                {"Custom days"}
              </span>
              <input
                type="number"
                min={1}
                max={LIFETIME_DAYS}
                value={customDays}
                onChange={(event) => setCustomDays(event.target.value)}
                className={`${fieldClass} w-full`}
              />
            </label>
          ) : null}

          <label className="space-y-1.5 sm:col-span-2">
            <span className="block text-[0.72rem] font-medium text-muted-foreground">
              {"Notes / reference (optional)"}
            </span>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={"e.g. Customer #104"}
              className={`${fieldClass} w-full`}
            />
          </label>
        </div>

        <button
          type="button"
          disabled={generating}
          onClick={() => void generate()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Zap className="size-4" aria-hidden />
          {generating
            ? "Generating…"
            : "Generate 16-char code"}
        </button>

        {generated ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
            <code className="font-mono text-lg font-semibold tracking-[0.2em]">
              {formatCode(generated).replace(/-/g, " - ")}
            </code>
            <button
              type="button"
              onClick={() => void copy(generated)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[oklch(1_0_0/0.14)] px-3 py-1.5 text-[0.78rem] font-medium hover:bg-[oklch(1_0_0/0.06)]"
            >
              {copied === generated ? (
                <Check className="size-3.5 text-primary" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {"Copy code"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="border-t border-white/5 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
            {"Codes management"} · {rows.length}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-[oklch(1_0_0/0.1)] p-1">
              {filters.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setFilter(entry.key)}
                  className={`rounded-full px-3 py-1 text-[0.74rem] font-medium transition-colors ${
                    filter === entry.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[oklch(1_0_0/0.12)] px-3 py-1.5 text-[0.74rem] font-medium hover:bg-[oklch(1_0_0/0.06)]"
            >
              <Download className="size-3.5" aria-hidden />
              {"Export CSV"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-start text-[0.78rem]">
            <thead className="text-[0.66rem] uppercase tracking-[0.18em] text-muted-foreground">
              <tr>
                <th className="py-2 text-start">{"Code"}</th>
                <th className="py-2 text-start">{"Duration"}</th>
                <th className="py-2 text-start">{"Status"}</th>
                <th className="py-2 text-start">{"Created"}</th>
                <th className="py-2 text-start">{"Redeemed by"}</th>
                <th className="py-2 text-start">{"Notes"}</th>
                <th className="py-2 text-end">{"Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[oklch(1_0_0/0.06)]">
                  <td className="py-2 font-mono">{formatCode(row.code)}</td>
                  <td className="py-2 text-muted-foreground">
                    {durationLabel(row.duration_days, false)}
                  </td>
                  <td className="py-2">
                    <span
                      className={
                        row.is_revoked
                          ? "rounded-full bg-red-500/10 px-2 py-0.5 text-red-400"
                          : row.is_used
                            ? "rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-300"
                            : row.is_active
                              ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400"
                              : "rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-400"
                      }
                    >
                      {row.is_revoked
                        ? "Revoked"
                        : row.is_used
                          ? "Redeemed"
                          : row.is_active
                            ? "Available"
                            : "Disabled"}
                    </span>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {row.redeemed_by_email ??
                      (row.used_by_user_id ? `${row.used_by_user_id.slice(0, 8)}…` : "—")}
                  </td>
                  <td className="py-2 text-muted-foreground">{row.notes ?? "—"}</td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded-lg border border-[oklch(1_0_0/0.08)] px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t("admin.codes.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copy(row.code)}
                        aria-label={`Copy ${row.code}`}
                        className="rounded-lg border border-[oklch(1_0_0/0.08)] p-1.5 text-muted-foreground hover:text-foreground"
                      >
                        {copied === row.code ? (
                          <Check className="size-3.5 text-primary" aria-hidden />
                        ) : (
                          <Copy className="size-3.5" aria-hidden />
                        )}
                      </button>
                      {!row.is_used && !row.is_revoked ? (
                        <button
                          type="button"
                          onClick={() => void toggleActive(row)}
                          aria-label={row.is_active ? `Deactivate ${row.code}` : `Activate ${row.code}`}
                          className="rounded-lg border border-[oklch(1_0_0/0.08)] p-1.5 text-muted-foreground hover:text-amber-400"
                        >
                          {row.is_active ? (
                            <Ban className="size-3.5" aria-hidden />
                          ) : (
                            <RotateCcw className="size-3.5" aria-hidden />
                          )}
                        </button>
                      ) : null}
                      {row.is_used && !row.is_revoked ? (
                        <button
                          type="button"
                          onClick={() => setConfirm({ row, mode: "revoke" })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-[0.72rem] font-semibold text-red-400 hover:bg-red-500/10"
                        >
                          <ShieldOff className="size-3.5" aria-hidden />
                          {"Revoke Subscription"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setConfirm({ row, mode: "delete" })}
                        aria-label={`Delete ${row.code}`}
                        className="rounded-lg border border-red-500/20 p-1.5 text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-[0.78rem] text-muted-foreground">
              {"No codes to show."}
            </p>
          ) : null}
        </div>
      </section>

      {confirm ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#0a0a0a] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-red-400">
              {confirm.mode === "revoke"
                ? "Revoke subscription?"
                : "Delete code?"}
            </h3>
            <p className="mt-2 text-[0.82rem] text-muted-foreground">
              {confirm.mode === "revoke"
                ? "The linked account is downgraded to Free immediately and this code can never be used again."
                : "This code is deleted permanently and can never be redeemed."}
            </p>
            <p className="mt-3 font-mono text-sm tracking-[0.15em]">{formatCode(confirm.row.code)}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-lg border border-[oklch(1_0_0/0.12)] px-4 py-2 text-sm font-medium hover:bg-[oklch(1_0_0/0.06)]"
              >
                {"Cancel"}
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => void runConfirm()}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {working
                  ? "Working…"
                  : confirm.mode === "revoke"
                    ? "Revoke now"
                    : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <form
            className="w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-[#0a0a0a] p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEdit();
            }}
          >
            <h3 className="text-lg font-semibold">{t("admin.codes.edit")}</h3>
            <label className="block text-xs text-muted-foreground">
              {t("admin.codes.code")}
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-foreground"
                value={editCode}
                disabled={editing.is_used}
                onChange={(event) => setEditCode(event.target.value)}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              {t("admin.codes.notes")}
              <textarea
                className="mt-1 min-h-20 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-foreground"
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-white/10 px-3 py-1.5 text-sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" disabled={working} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                {t("admin.codes.save")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
