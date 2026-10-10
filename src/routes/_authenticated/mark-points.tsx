import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Bookmark, Copy, Link2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { notePlanError, requestUpgrade } from "@/components/subscription/upgradePlan";
import { AppShell } from "@/components/layout/AppShell";
import { HowItWorks } from "@/components/layout/HowItWorks";
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
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLanguage } from "@/lib/i18n";
import {
  addTestAllowlistName,
  applyTestMarkCommand,
  createStudioTestMark,
  deleteTestMark,
  formatUptime,
  loadTestAllowlist,
  loadTestMarks,
  loadTestShareSettings,
  MARK_STATUSES,
  kickChannelUrl,
  markSharePath,
  markSpanSeconds,
  markStatusDotClass,
  markStatusLabel,
  markTitle,
  matchMarkCommand,
  removeTestAllowlistName,
  rotateTestShareToken,
  setTestMarkStatus,
  updateTestMark,
  type MarkStatus,
  type StreamMark,
} from "@/lib/markPoints";
import {
  addMarkAllowlistName,
  closeStudioMark,
  deleteStreamMark,
  getMarkShareSettings,
  listMarkAllowlist,
  listStreamMarks,
  removeMarkAllowlistName,
  rotateMarkShareToken,
  setStreamMarkStatus,
  startStudioMark,
  updateStreamMark,
} from "@/lib/markPoints.functions";
import { cn } from "@/lib/utils";
import { isTestMode } from "@/lib/testMode";

export const Route = createFileRoute("/_authenticated/mark-points")({
  head: () => ({
    meta: [
      { title: "CylixStudio — العلامات المرجعية" },
      {
        name: "description",
        content:
          "Private stream marks from Kick chat. !mark and !emark record stream uptime. Owner, mods and an allowlist only.",
      },
      { property: "og:title", content: "CylixStudio — العلامات المرجعية" },
      {
        property: "og:description",
        content: "Silent Kick marks stored as stream uptime for the channel owner.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarkPointsPage,
});

function buildMarksCopy(t: ReturnType<typeof useLanguage>["t"]) {
  return {
    title: t("marks.title"),
    subtitle: t("marks.subtitle"),
    search: t("marks.search"),
    add: t("marks.add"),
    start: t("marks.start"),
    end: t("marks.end"),
    empty: t("marks.empty"),
    noneMatch: t("marks.noneMatch"),
    open: t("marks.open"),
    offline: t("marks.offline"),
    startLabel: t("marks.startLabel"),
    endLabel: t("marks.endLabel"),
    duration: t("marks.duration"),
    note: t("marks.note"),
    notePlaceholder: t("marks.notePlaceholder"),
    edit: t("marks.edit"),
    delete: t("marks.delete"),
    cancel: t("marks.cancel"),
    save: t("marks.save"),
    modalCreate: t("marks.modalCreate"),
    modalEdit: t("marks.modalEdit"),
    modalHint: t("marks.modalHint"),
    deleteTitle: t("marks.deleteTitle"),
    deleteBody: t("marks.deleteBody"),
    testerTitle: t("marks.testerTitle"),
    testerHint: t("marks.testerHint"),
    testerPlaceholder: t("marks.testerPlaceholder"),
    testerHit: t("marks.testerHit"),
    testerMiss: t("marks.testerMiss"),
    testerApply: t("marks.testerApply"),
    howTitle: t("common.howItWorks"),
    how: [t("marks.how1"), t("marks.how2"), t("marks.how3")],
    whoTitle: t("marks.whoTitle"),
    who: t("marks.who"),
    twitchNote: t("marks.twitchNote"),
    allowTitle: t("marks.allowTitle"),
    allowHint: t("marks.allowHint"),
    shareTitle: t("marks.shareTitle"),
    shareHint: t("marks.shareHint"),
    shareCopy: t("marks.shareCopy"),
    shareCopied: t("marks.shareCopied"),
    shareRotate: t("marks.shareRotate"),
    shareMark: t("marks.shareMark"),
    shareMarkCopied: t("marks.shareMarkCopied"),
    status: t("marks.status"),
    pending: t("marks.pending"),
    approved: t("marks.approved"),
    rejected: t("marks.rejected"),
    allowPlaceholder: t("marks.allowPlaceholder"),
    allowAdd: t("marks.allowAdd"),
    allowEmpty: t("marks.allowEmpty"),
    saved: t("marks.saved"),
    started: t("marks.started"),
    closed: t("marks.closed"),
    startedOffline: t("marks.startedOffline"),
    noOpen: t("marks.noOpen"),
    errSave: t("marks.errSave"),
    errName: t("marks.errName"),
    loadMore: t("marks.loadMore"),
  };
}

type MarksCopy = ReturnType<typeof buildMarksCopy>;

const MARKS_INITIAL = 12;
const MARKS_STEP = 8;

const field =
  "w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/80 focus:border-[#bee1fc]/50 focus:ring-1 focus:ring-[#bee1fc]/35";

function MarkPointsPage() {
  const { user } = Route.useRouteContext();
  const { data: workspace } = useWorkspace(user.id);
  const { t, lang } = useLanguage();
  const c = buildMarksCopy(t);
  const test = isTestMode();
  const queryClient = useQueryClient();
  const fetchMarks = useServerFn(listStreamMarks);
  const persistUpdate = useServerFn(updateStreamMark);
  const persistDelete = useServerFn(deleteStreamMark);
  const persistStart = useServerFn(startStudioMark);
  const persistClose = useServerFn(closeStudioMark);
  const fetchAllowlist = useServerFn(listMarkAllowlist);
  const persistAllowAdd = useServerFn(addMarkAllowlistName);
  const persistAllowRemove = useServerFn(removeMarkAllowlistName);
  const persistStatus = useServerFn(setStreamMarkStatus);
  const fetchShare = useServerFn(getMarkShareSettings);
  const persistRotate = useServerFn(rotateMarkShareToken);

  const [query, setQuery] = useState("");
  const [sample, setSample] = useState("");
  const [allowName, setAllowName] = useState("");
  const [editor, setEditor] = useState<{ id?: string; note: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedMarkId, setCopiedMarkId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [shown, setShown] = useState(MARKS_INITIAL);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mark-points", user.id] });
  const invalidateAllow = () =>
    queryClient.invalidateQueries({ queryKey: ["mark-point-allowlist", user.id] });

  const marksQuery = useQuery({
    queryKey: ["mark-points", user.id],
    queryFn: async () => {
      if (test) return { marks: loadTestMarks(), locked: false };
      return fetchMarks();
    },
    refetchInterval: test ? false : 15000,
  });

  const allowQuery = useQuery({
    queryKey: ["mark-point-allowlist", user.id],
    queryFn: async (): Promise<string[]> => {
      if (test) return loadTestAllowlist();
      return fetchAllowlist();
    },
  });

  const shareQuery = useQuery({
    queryKey: ["mark-point-share", user.id],
    queryFn: async () => {
      if (test) return loadTestShareSettings();
      return fetchShare();
    },
  });

  const marks = marksQuery.data?.marks ?? [];
  const allowlist = allowQuery.data ?? [];
  const share = shareQuery.data;
  const shareUrl = share?.shareToken && origin ? `${origin}${markSharePath(share.shareToken)}` : "";
  const channelUrl = kickChannelUrl(share?.kickUsername);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return marks;
    return marks.filter((mark) => {
      return (
        mark.note.toLowerCase().includes(needle) ||
        mark.author.toLowerCase().includes(needle) ||
        mark.source.toLowerCase().includes(needle)
      );
    });
  }, [marks, query]);

  useEffect(() => {
    setShown(MARKS_INITIAL);
  }, [query]);

  const paged = visible.slice(0, shown);
  const hasMore = shown < visible.length;

  const sampleHit = useMemo(() => matchMarkCommand(sample), [sample]);

  const startMutation = useMutation({
    mutationFn: async (note: string) => {
      if (test) return { ok: true as const, offline: false, marks: createStudioTestMark({ note }) };
      const result = await persistStart({ data: { note } });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      toast.success("offline" in result && result.offline ? c.startedOffline : c.started);
      setEditor(null);
      void invalidate();
    },
    onError: (error: Error) => {
      if (notePlanError(error)) return;
      toast.error(c.errSave);
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (note?: string) => {
      if (test) {
        const result = applyTestMarkCommand(`!emark${note ? ` ${note}` : ""}`, {
          username: "Studio",
          viewerIsMod: true,
          source: "STUDIO",
        });
        if (result.status === "ignored") throw new Error(result.reason ?? "no_open_start");
        return result;
      }
      const result = await persistClose({ data: note ? { note } : {} });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success(c.closed);
      void invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message === "no_open_start" ? c.noOpen : c.errSave);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (draft: { id?: string; note: string }) => {
      if (!draft.id) {
        if (test) return createStudioTestMark({ note: draft.note });
        const result = await persistStart({ data: { note: draft.note } });
        if (!result.ok) throw new Error(result.error);
        return result;
      }
      if (test) return updateTestMark({ id: draft.id, note: draft.note });
      const result = await persistUpdate({ data: { id: draft.id, note: draft.note } });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success(c.saved);
      setEditor(null);
      void invalidate();
    },
    onError: () => toast.error(c.errSave),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (test) return deleteTestMark(id);
      return persistDelete({ data: { id } });
    },
    onSuccess: () => {
      setDeleteId(null);
      void invalidate();
    },
    onError: () => toast.error(c.errSave),
  });

  const addAllowMutation = useMutation({
    mutationFn: async (username: string) => {
      if (test) return { ok: true as const, names: addTestAllowlistName(username) };
      const result = await persistAllowAdd({ data: { username } });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      setAllowName("");
      void invalidateAllow();
    },
    onError: (error: Error) => {
      toast.error(error.message === "name_required" ? c.errName : c.errSave);
    },
  });

  const removeAllowMutation = useMutation({
    mutationFn: async (username: string) => {
      if (test) return removeTestAllowlistName(username);
      return persistAllowRemove({ data: { username } });
    },
    onSuccess: () => void invalidateAllow(),
    onError: () => toast.error(c.errSave),
  });

  const statusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: MarkStatus }) => {
      if (test) return setTestMarkStatus(payload.id, payload.status);
      return persistStatus({ data: payload });
    },
    onSuccess: () => void invalidate(),
    onError: () => toast.error(c.errSave),
  });

  const rotateMutation = useMutation({
    mutationFn: async () => {
      if (test) return rotateTestShareToken();
      return persistRotate();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["mark-point-share"] }),
    onError: () => toast.error(c.errSave),
  });

  const copyShare = async (markId?: string) => {
    const url =
      share?.shareToken && origin
        ? `${origin}${markSharePath(share.shareToken, markId)}`
        : "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      if (markId) {
        setCopiedMarkId(markId);
        window.setTimeout(() => setCopiedMarkId(null), 1600);
      } else {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      toast.error(c.shareCopy);
    }
  };

  const applySample = () => {
    if (!sampleHit) return;
    if (test) {
      const result = applyTestMarkCommand(sample, { username: "Mod", viewerIsMod: true });
      if (result.status === "started") toast.success(c.started);
      else if (result.status === "closed") toast.success(c.closed);
      else toast.error(result.reason === "no_open_start" ? c.noOpen : c.testerMiss);
      void invalidate();
      return;
    }
    if (sampleHit.kind === "mark") startMutation.mutate(sampleHit.note);
    else closeMutation.mutate(sampleHit.note);
  };

  return (
    <AppShell
      user={user}
      profile={workspace?.profile}
      title={c.title}
      subtitle={
        channelUrl ? (
          <a
            href={channelUrl}
            className="inline-block text-start text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            dir="ltr"
          >
            {channelUrl}
          </a>
        ) : (
          c.subtitle
        )
      }
    >
      <div className="space-y-10 text-start">
        {marksQuery.data?.locked ? (
          <button
            type="button"
            onClick={() => requestUpgrade()}
            className="w-full rounded-2xl border border-primary/25 px-4 py-3 text-start text-sm"
          >
            {t("plan.channelLocked")}
          </button>
        ) : null}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative w-44 shrink-0">
              <Search
                className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={c.search}
                aria-label={c.search}
                className="h-8 w-full rounded-lg border border-zinc-800/60 bg-transparent pe-2.5 ps-8 text-[0.78rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-zinc-600"
                dir="auto"
              />
            </label>
            <button
              type="button"
              onClick={() => closeMutation.mutate(undefined)}
              className="inline-flex h-8 items-center rounded-full border border-zinc-800 px-3 text-[0.78rem] text-muted-foreground hover:text-foreground"
            >
              {c.end}
            </button>
            <button
              type="button"
              onClick={() => startMutation.mutate("")}
              className="inline-flex h-8 items-center rounded-full border border-zinc-800 px-3 text-[0.78rem] text-muted-foreground hover:text-foreground"
            >
              {c.start}
            </button>
            <button
              type="button"
              onClick={() => setEditor({ note: "" })}
              className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[0.78rem] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" aria-hidden />
              {c.add}
            </button>
          </div>

          {marks.length === 0 ? (
            <div className="mt-5 space-y-2 py-8 text-start">
              <Bookmark className="size-7 text-muted-foreground" aria-hidden />
              <p className="max-w-md text-[0.82rem] text-muted-foreground">{c.empty}</p>
            </div>
          ) : visible.length === 0 ? (
            <p className="mt-4 text-start text-[0.78rem] text-muted-foreground">{c.noneMatch}</p>
          ) : (
            <div>
              <div className="mt-5 grid w-full grid-cols-[repeat(auto-fill,minmax(190px,1fr))] justify-items-start gap-4">
                {paged.map((mark) => (
                  <MarkCard
                    key={mark.id}
                    mark={mark}
                    copy={c}
                    lang={lang}
                    canShare={Boolean(share?.shareToken && origin)}
                    copiedLink={copiedMarkId === mark.id}
                    onCopyLink={() => void copyShare(mark.id)}
                    onStatus={(status) => statusMutation.mutate({ id: mark.id, status })}
                    onEdit={() => setEditor({ id: mark.id, note: mark.note })}
                    onDelete={() => setDeleteId(mark.id)}
                  />
                ))}
              </div>
              {hasMore ? (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShown((count) => count + MARKS_STEP)}
                    className="inline-flex h-8 items-center rounded-full border border-zinc-800 bg-zinc-900 px-4 text-[0.78rem] font-medium text-zinc-200 hover:bg-zinc-800"
                  >
                    {c.loadMore}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:items-start lg:gap-12 xl:gap-16">
          <div className="min-w-0 space-y-8">
            <section>
              <h2 className="text-[0.95rem] font-semibold">{c.testerTitle}</h2>
              <p className="mt-1 text-[0.78rem] text-muted-foreground">{c.testerHint}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={sample}
                  onChange={(event) => setSample(event.target.value)}
                  placeholder={c.testerPlaceholder}
                  className={`${field} font-mono lg:max-w-md`}
                  dir="auto"
                />
                <button
                  type="button"
                  onClick={applySample}
                  disabled={!sampleHit}
                  className="rounded-full bg-[#bee1fc] px-4 py-2 text-[0.82rem] font-semibold text-[#0a0a0a] disabled:opacity-40"
                >
                  {c.testerApply}
                </button>
              </div>
              <div className="mt-3 rounded-xl border border-white/[0.06] bg-zinc-950/60 p-3 font-mono text-[0.78rem]">
                {sampleHit ? (
                  <p className="text-zinc-200">
                    {c.testerHit}{" "}
                    <span dir="auto">
                      {sampleHit.kind === "emark" ? "!emark" : "!mark"}
                      {sampleHit.note ? ` ${sampleHit.note}` : ""}
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">{c.testerMiss}</p>
                )}
              </div>
            </section>

            <HowItWorks title={c.howTitle} steps={c.how} />
          </div>

          <section className="min-w-0 space-y-8 border-t border-white/[0.06] pt-8 lg:border-t-0 lg:border-s lg:ps-10 lg:pt-0 xl:ps-12">
            <div>
              <h2 className="text-[0.95rem] font-semibold tracking-tight">{c.whoTitle}</h2>
              <p className="mt-2 max-w-prose text-[0.78rem] leading-relaxed text-muted-foreground">{c.who}</p>
              <p className="mt-2 max-w-prose text-[0.72rem] leading-relaxed text-muted-foreground/85">{c.twitchNote}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["!mark", "/mark", "!emark", "/emark"].map((cmd) => (
                  <code
                    key={cmd}
                    className="rounded-lg border border-[#bee1fc]/25 bg-[#bee1fc]/10 px-2.5 py-1 font-mono text-[0.72rem] font-medium text-[#bee1fc]"
                  >
                    {cmd}
                  </code>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-[0.82rem] font-semibold tracking-tight">{c.shareTitle}</h3>
              <p className="mt-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">{c.shareHint}</p>
              <input
                readOnly
                value={shareUrl}
                className="mt-3 h-10 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 font-mono text-[0.72rem] text-zinc-400 outline-none focus:border-[#bee1fc]/40"
                dir="ltr"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copyShare()}
                  disabled={!shareUrl}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#bee1fc] px-4 text-[0.75rem] font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Copy className="size-3.5" aria-hidden />
                  {copied ? c.shareCopied : c.shareCopy}
                </button>
                <button
                  type="button"
                  onClick={() => rotateMutation.mutate()}
                  className="inline-flex h-9 items-center rounded-full border border-white/10 px-4 text-[0.75rem] font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                >
                  {c.shareRotate}
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-[0.82rem] font-semibold tracking-tight">{c.allowTitle}</h3>
              <p className="mt-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">{c.allowHint}</p>
              <form
                className="mt-3 flex items-stretch gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!allowName.trim()) {
                    toast.error(c.errName);
                    return;
                  }
                  addAllowMutation.mutate(allowName);
                }}
              >
                <input
                  value={allowName}
                  onChange={(event) => setAllowName(event.target.value)}
                  placeholder={c.allowPlaceholder}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[#bee1fc]/50 focus:ring-1 focus:ring-[#bee1fc]/35"
                  dir="auto"
                />
                <button
                  type="submit"
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#bee1fc] px-5 text-[0.78rem] font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90"
                >
                  {c.allowAdd}
                </button>
              </form>
              {allowlist.length === 0 ? (
                <p className="mt-3 text-[0.72rem] text-muted-foreground">{c.allowEmpty}</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {allowlist.map((name) => (
                    <li
                      key={name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#bee1fc]/20 bg-[#bee1fc]/10 py-1 ps-2.5 pe-1.5 font-mono text-[0.72rem] text-[#d7efff]"
                    >
                      <span dir="auto">{name}</span>
                      <button
                        type="button"
                        aria-label={`${c.delete} ${name}`}
                        onClick={() => removeAllowMutation.mutate(name)}
                        className="grid size-5 place-items-center rounded-full text-[#bee1fc]/80 transition-colors hover:bg-[#bee1fc]/20 hover:text-[#bee1fc]"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      <MarkEditor
        copy={c}
        draft={editor}
        saving={saveMutation.isPending}
        onClose={() => setEditor(null)}
        onChange={setEditor}
        onSave={() => editor && saveMutation.mutate(editor)}
      />

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle>{c.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{c.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{c.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {c.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function MarkCard({
  mark,
  copy,
  lang,
  canShare,
  copiedLink,
  onCopyLink,
  onStatus,
  onEdit,
  onDelete,
}: {
  mark: StreamMark;
  copy: MarksCopy;
  lang: "en" | "ar";
  canShare: boolean;
  copiedLink: boolean;
  onCopyLink: () => void;
  onStatus: (status: MarkStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const open = !mark.endedAt;
  const startLabel = mark.offline ? copy.offline : formatUptime(mark.uptimeStartSeconds);
  const endLabel = mark.offline
    ? copy.offline
    : open
      ? copy.open
      : formatUptime(mark.uptimeEndSeconds);
  const span = mark.offline ? null : markSpanSeconds(mark);
  const statusText = markStatusLabel(mark.status, lang);

  const actionBtn =
    "inline-flex size-7 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40";

  return (
    <article className="flex w-full min-w-0 flex-col overflow-hidden rounded-[20px] bg-zinc-900">
      <div className="flex flex-1 flex-col justify-center gap-0.5 px-3 pb-2 pt-3 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <span
            className={cn("size-2 shrink-0 rounded-full", markStatusDotClass(mark.status))}
            title={statusText}
            aria-label={statusText}
          />
          <h3
            className="max-w-full truncate font-mono text-sm font-semibold tracking-tight text-zinc-100"
            dir="auto"
          >
            {markTitle(mark, lang)}
          </h3>
        </div>
        <p className="font-mono text-[0.68rem] tabular-nums text-zinc-400" dir="ltr">
          {startLabel}
          {" → "}
          {endLabel}
        </p>
        <p className="text-[0.68rem] text-zinc-500">
          {copy.duration}{" "}
          <span className="font-mono tabular-nums" dir="ltr">
            {mark.offline ? copy.offline : formatUptime(span)}
          </span>
        </p>
        {open || mark.offline ? (
          <p className="text-[0.6rem] uppercase tracking-wide text-zinc-500">
            {mark.offline ? copy.offline : copy.open}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-2 py-1.5">
        <label className="min-w-0">
          <span className="sr-only">{copy.status}</span>
          <select
            value={mark.status}
            onChange={(event) => onStatus(event.target.value as MarkStatus)}
            className="h-7 max-w-full rounded-md border-0 bg-transparent pe-1 text-[0.65rem] text-zinc-200 outline-none"
          >
            {MARK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {copy[status]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={copiedLink ? copy.shareMarkCopied : copy.shareMark}
            title={copiedLink ? copy.shareMarkCopied : copy.shareMark}
            onClick={onCopyLink}
            disabled={!canShare}
            className={actionBtn}
          >
            <Link2 className="size-3.5" aria-hidden />
          </button>
          <button type="button" aria-label={copy.edit} title={copy.edit} onClick={onEdit} className={actionBtn}>
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={copy.delete}
            title={copy.delete}
            onClick={onDelete}
            className={actionBtn}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}

function MarkEditor({
  copy,
  draft,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  copy: MarksCopy;
  draft: { id?: string; note: string } | null;
  saving: boolean;
  onClose: () => void;
  onChange: (next: { id?: string; note: string }) => void;
  onSave: () => void;
}) {
  if (!draft) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.id ? copy.modalEdit : copy.modalCreate}</DialogTitle>
          <DialogDescription>{copy.modalHint}</DialogDescription>
        </DialogHeader>
        <label className="block">
          <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
            {copy.note}
          </span>
          <input
            value={draft.note}
            onChange={(event) => onChange({ ...draft, note: event.target.value.slice(0, 280) })}
            placeholder={copy.notePlaceholder}
            className={field}
            dir="auto"
          />
        </label>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-700 px-4 py-2 text-[0.82rem]"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-full bg-primary px-4 py-2 text-[0.82rem] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {copy.save}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
