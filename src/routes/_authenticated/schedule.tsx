import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";

import { notePlanError, requestUpgrade } from "@/components/subscription/upgradePlan";
import { MonthCalendar } from "@/components/schedule/MonthCalendar";
import { AppShell } from "@/components/layout/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLanguage } from "@/lib/i18n";
import {
  buildScheduleIcs,
  compressCoverFile,
  deleteTestSlot,
  emptySlotDraft,
  formatClock,
  loadTestSchedule,
  parseClock,
  saveTestScheduleSettings,
  toIsoDate,
  upsertTestSlot,
  weekdayFromIso,
  weekdayLabel,
  zonedIsoDate,
  type ScheduleSlotInput,
} from "@/lib/schedule";
import {
  deleteScheduleSlot,
  getScheduleState,
  saveScheduleSettings,
  upsertScheduleSlot,
} from "@/lib/schedule.functions";
import { isTestMode } from "@/lib/testMode";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Stream Schedule" },
      {
        name: "description",
        content: "Monthly go-live calendar with game, title and a shareable viewer schedule plus ICS export.",
      },
      { property: "og:title", content: "CylixStudio — Stream Schedule" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchedulePage,
});

function buildScheduleCopy(t: ReturnType<typeof useLanguage>["t"]) {
  return {
    title: t("schedule.title"),
    subtitle: t("schedule.subtitle"),
    timezone: t("schedule.timezone"),
    calendarTitle: t("schedule.calendarTitle"),
    reminder: t("schedule.reminder"),
    reminderHint: t("schedule.reminderHint"),
    reminderPlaceholder: t("schedule.reminderPlaceholder"),
    share: t("schedule.share"),
    copy: t("schedule.copy"),
    copied: t("schedule.copied"),
    ics: t("schedule.ics"),
    add: t("schedule.add"),
    empty: t("schedule.empty"),
    modalCreate: t("schedule.modalCreate"),
    modalEdit: t("schedule.modalEdit"),
    date: t("schedule.date"),
    repeat: t("schedule.repeat"),
    cover: t("schedule.cover"),
    coverHint: t("schedule.coverHint"),
    coverRemove: t("schedule.coverRemove"),
    day: t("schedule.day"),
    time: t("schedule.time"),
    duration: t("schedule.duration"),
    sessionTitle: t("schedule.sessionTitle"),
    game: t("schedule.game"),
    notes: t("schedule.notes"),
    enabled: t("schedule.enabled"),
    cancel: t("schedule.cancel"),
    save: t("schedule.save"),
    delete: t("schedule.delete"),
    deleteTitle: t("schedule.deleteTitle"),
    deleteBody: t("schedule.deleteBody"),
    saved: t("schedule.saved"),
    errTitle: t("schedule.errTitle"),
    errTime: t("schedule.errTime"),
    errSave: t("schedule.errSave"),
    errCover: t("schedule.errCover"),
    errStorage: t("schedule.errStorage"),
    howTitle: t("schedule.howTitle"),
    how: t("schedule.how"),
  };
}

const field =
  "w-full border-b border-zinc-800/50 bg-transparent px-0 py-2 text-sm text-foreground outline-none transition-colors focus:border-white/20";
const label = "mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground";

const ZONES = [
  "UTC",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];

function SchedulePage() {
  const { user } = Route.useRouteContext();
  const subscription = useSubscription(user.id);
  const isPro = Boolean(subscription.data?.isActive);
  const { data } = useWorkspace(user.id);
  const { t, lang } = useLanguage();
  const c = buildScheduleCopy(t);
  const queryClient = useQueryClient();
  const test = isTestMode();

  const loadState = useServerFn(getScheduleState);
  const persistSettings = useServerFn(saveScheduleSettings);
  const persistSlot = useServerFn(upsertScheduleSlot);
  const persistDelete = useServerFn(deleteScheduleSlot);

  const state = useQuery({
    queryKey: ["schedule", user.id],
    queryFn: () => (test ? loadTestSchedule() : loadState()),
  });

  const settings = state.data?.settings;
  const slots = state.data?.slots ?? [];
  const [title, setTitle] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [reminderNote, setReminderNote] = useState("");
  const [editor, setEditor] = useState<ScheduleSlotInput | null>(null);
  const [clock, setClock] = useState("18:00");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!settings) return;
    setTitle(settings.title);
    setTimezone(settings.timezone);
    setReminderNote(settings.reminderNote);
  }, [settings]);

  const shareUrl = settings?.shareToken ? `${origin}/overlay/schedule?token=${settings.shareToken}` : "";
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["schedule", user.id] });
  const todayIso = zonedIsoDate(timezone || "UTC");

  const settingsMutation = useMutation({
    mutationFn: async () => {
      if (test) return saveTestScheduleSettings({ title, timezone, reminderNote });
      const result = await persistSettings({ data: { title, timezone, reminderNote } });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success(c.saved);
      void invalidate();
    },
    onError: (error: Error) => {
      if (notePlanError(error)) return;
      toast.error(c.errSave);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: ScheduleSlotInput) => {
      if (!input.title.trim()) throw new Error("title_required");
      if (test) return upsertTestSlot(input);
      const result = await persistSlot({ data: input });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success(c.saved);
      setEditor(null);
      void invalidate();
    },
    onError: (error: Error) => {
      const message =
        error.message === "title_required"
          ? c.errTitle
          : error.message === "storage_full"
            ? c.errStorage
            : error.message === "image_upload"
              ? c.errCover
              : c.errSave;
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (test) return deleteTestSlot(id);
      return persistDelete({ data: { id } });
    },
    onSuccess: () => {
      setDeleteId(null);
      setEditor(null);
      void invalidate();
    },
    onError: (error: Error) => {
      if (notePlanError(error)) return;
      toast.error(c.errSave);
    },
  });

  const openCreate = (iso?: string) => {
    const draft = emptySlotDraft(iso ?? todayIso);
    setClock(formatClock(draft.startMinutes));
    setEditor(draft);
  };

  return (
    <AppShell
      user={user}
      profile={data?.profile}
      title={c.title}
      subtitle={c.subtitle}
      actions={
        <button
          type="button"
          onClick={() => openCreate()}
          className="rounded-full bg-primary px-4 py-2 text-[0.82rem] font-semibold text-primary-foreground hover:opacity-90"
        >
          {c.add}
        </button>
      }
    >
      <div className="space-y-10">
        <section className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <label className="block">
              <span className={label}>{c.calendarTitle}</span>
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} dir="auto" />
            </label>
            <label className="block">
              <span className={label}>{c.timezone}</span>
              <select className={field} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {ZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>{c.reminder}</span>
              <input
                className={field}
                value={reminderNote}
                onChange={(e) => {
                  if (!isPro && e.target.value.trim()) {
                    requestUpgrade();
                    return;
                  }
                  setReminderNote(e.target.value);
                }}
                placeholder={c.reminderPlaceholder}
                maxLength={280}
                dir="auto"
              />
              <p className="mt-1.5 text-[0.75rem] text-muted-foreground">{c.reminderHint}</p>
            </label>
            <button
              type="button"
              onClick={() => settingsMutation.mutate()}
              className="rounded-full bg-primary px-4 py-2 text-[0.82rem] font-semibold text-primary-foreground hover:opacity-90"
            >
              {c.save}
            </button>
          </div>
          <div className="space-y-3">
            <h2 className="text-[0.95rem] font-semibold">{c.share}</h2>
            <p className="break-all font-mono text-[0.75rem] text-muted-foreground">{shareUrl || "—"}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!shareUrl}
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl);
                  toast.success(c.copied);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[0.78rem] hover:bg-white/5"
              >
                <Copy className="size-3.5" />
                {c.copy}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!state.data) return;
                  const ics = buildScheduleIcs(state.data, origin);
                  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "creovix-schedule.ics";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[0.78rem] hover:bg-white/5"
              >
                <Download className="size-3.5" />
                {c.ics}
              </button>
            </div>
            <p className="text-[0.75rem] text-muted-foreground">{c.how}</p>
          </div>
        </section>

        <section>
          {slots.length === 0 ? (
            <p className="mb-4 text-sm text-muted-foreground">{c.empty}</p>
          ) : null}
          <MonthCalendar
            year={cursor.year}
            month={cursor.month}
            slots={slots}
            lang={lang}
            todayIso={todayIso}
            onMonthChange={(year, month) => setCursor({ year, month })}
            onAdd={(iso) => openCreate(iso)}
            onEdit={(id) => {
              const slot = slots.find((item) => item.id === id);
              if (!slot) return;
              setClock(formatClock(slot.startMinutes));
              setEditor({
                id: slot.id,
                weekday: slot.weekday,
                occursOn: slot.occursOn,
                startMinutes: slot.startMinutes,
                durationMinutes: slot.durationMinutes,
                game: slot.game,
                title: slot.title,
                notes: slot.notes,
                coverUrl: slot.coverUrl,
                enabled: slot.enabled,
              });
            }}
          />
        </section>
      </div>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="border-zinc-800/50 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editor?.id ? c.modalEdit : c.modalCreate}</DialogTitle>
            <DialogDescription className="sr-only">{c.sessionTitle}</DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="space-y-4">
              <label className="block">
                <span className={label}>{c.date}</span>
                <input
                  className={field}
                  type="date"
                  value={editor.occursOn ?? ""}
                  onChange={(e) => {
                    const occursOn = e.target.value || null;
                    setEditor({
                      ...editor,
                      occursOn,
                      weekday: occursOn ? weekdayFromIso(occursOn) : editor.weekday,
                    });
                  }}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!editor.occursOn}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setEditor({ ...editor, occursOn: null });
                    } else {
                      const fallback = new Date(cursor.year, cursor.month, 1);
                      while (fallback.getDay() !== editor.weekday) fallback.setDate(fallback.getDate() + 1);
                      setEditor({ ...editor, occursOn: toIsoDate(fallback) });
                    }
                  }}
                />
                {c.repeat}
                {editor.occursOn ? null : (
                  <span className="text-muted-foreground">({weekdayLabel(editor.weekday, lang)})</span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={label}>{c.time}</span>
                  <input
                    className={field}
                    value={clock}
                    onChange={(e) => setClock(e.target.value)}
                    placeholder="18:00"
                  />
                </label>
                <label className="block">
                  <span className={label}>{c.duration}</span>
                  <input
                    className={field}
                    type="number"
                    min={15}
                    max={1440}
                    value={editor.durationMinutes}
                    onChange={(e) => setEditor({ ...editor, durationMinutes: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label className="block">
                <span className={label}>{c.sessionTitle}</span>
                <input
                  className={field}
                  value={editor.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                  maxLength={80}
                  dir="auto"
                />
              </label>
              <label className="block">
                <span className={label}>{c.game}</span>
                <input
                  className={field}
                  value={editor.game}
                  onChange={(e) => setEditor({ ...editor, game: e.target.value })}
                  maxLength={80}
                  dir="auto"
                />
              </label>
              <div>
                <span className={label}>{c.cover}</span>
                <div className="flex items-center gap-3">
                  {editor.coverUrl ? (
                    <img src={editor.coverUrl} alt="" className="h-16 w-12 rounded-lg object-cover opacity-90" />
                  ) : null}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="text-[0.78rem] text-muted-foreground file:me-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-foreground"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (!isPro) {
                        requestUpgrade();
                        return;
                      }
                      void compressCoverFile(file).then((url) => {
                        if (!url) {
                          toast.error(c.errCover);
                          return;
                        }
                        setEditor((current) => (current ? { ...current, coverUrl: url } : current));
                      });
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[0.75rem] text-muted-foreground">{c.coverHint}</p>
                {editor.coverUrl ? (
                  <button
                    type="button"
                    onClick={() => setEditor({ ...editor, coverUrl: "" })}
                    className="mt-1 text-[0.75rem] text-muted-foreground hover:text-foreground"
                  >
                    {c.coverRemove}
                  </button>
                ) : null}
              </div>
              <label className="block">
                <span className={label}>{c.notes}</span>
                <input
                  className={field}
                  value={editor.notes}
                  onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                  maxLength={280}
                  dir="auto"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editor.enabled}
                  onChange={(e) => setEditor({ ...editor, enabled: e.target.checked })}
                />
                {c.enabled}
              </label>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            {editor?.id ? (
              <button
                type="button"
                onClick={() => setDeleteId(editor.id!)}
                className="me-auto text-[0.78rem] text-red-400 hover:text-red-300"
              >
                {c.delete}
              </button>
            ) : null}
            <button type="button" onClick={() => setEditor(null)} className="text-[0.82rem] text-muted-foreground">
              {c.cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!editor) return;
                const start = parseClock(clock);
                if (start === null) {
                  toast.error(c.errTime);
                  return;
                }
                saveMutation.mutate({ ...editor, startMinutes: start });
              }}
              className="rounded-full bg-primary px-4 py-2 text-[0.82rem] font-semibold text-primary-foreground hover:opacity-90"
            >
              {c.save}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{c.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{c.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{c.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {c.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
