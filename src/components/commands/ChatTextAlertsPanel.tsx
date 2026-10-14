import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Gift,
  Info,
  Pencil,
  RefreshCw,
  Sparkles,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  loadTestChatAlerts,
  listChatTextAlerts,
  saveChatTextAlert,
  saveTestChatAlert,
} from "@/lib/chatTextAlerts.functions";
import type { ChatAlertId, ChatTextAlert } from "@/lib/chatTextAlerts";
import {
  CommandGridPager,
  scrollCommandGrid,
  useCommandPage,
} from "@/components/commands/CommandGridPager";
import {
  ALERT_CARD_GRID,
  CardContent,
  CardHeader,
  commandBodyClass,
  commandCardClass,
  commandCardOffClass,
  commandIconButtonClass,
  EnableSwitch,
  StatusDot,
} from "@/components/commands/commandCardChrome";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { isTestMode } from "@/lib/testMode";
import { cn } from "@/lib/utils";

const ALERTS: { id: ChatAlertId; icon: LucideIcon; titleKey: TranslationKey; infoKey?: TranslationKey }[] = [
  { id: "follow", icon: UserPlus, titleKey: "commands.alert.follow" },
  { id: "kicks", icon: Zap, titleKey: "commands.alert.kicks" },
  { id: "subscription", icon: BadgeCheck, titleKey: "commands.alert.subscription" },
  { id: "resubscription", icon: RefreshCw, titleKey: "commands.alert.resubscription" },
  { id: "gift", icon: Gift, titleKey: "commands.alert.gift" },
  { id: "raid", icon: Users, titleKey: "commands.alert.raid" },
  { id: "welcome", icon: Sparkles, titleKey: "commands.alert.welcome", infoKey: "commands.alert.welcomeInfo" },
];

export function ChatTextAlertsPanel({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const test = isTestMode();
  const queryClient = useQueryClient();
  const load = useServerFn(listChatTextAlerts);
  const persist = useServerFn(saveChatTextAlert);
  const alerts = useQuery({
    queryKey: ["chat-text-alerts", userId],
    queryFn: () => (test ? loadTestChatAlerts() : load()),
  });
  const save = useMutation({
    mutationFn: async (input: ChatTextAlert) => {
      if (test) return saveTestChatAlert(input);
      const result = await persist({ data: input });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chat-text-alerts", userId] });
    },
    onError: () => toast.error(t("commands.errSave")),
  });

  const rows = alerts.data ?? [];
  const cards = ALERTS.flatMap((item) => {
    const alert = rows.find((row) => row.id === item.id);
    return alert ? [{ ...item, alert }] : [];
  });
  const gridRef = useRef<HTMLDivElement>(null);
  const paging = useCommandPage(cards);
  const changePage = (next: number) => {
    paging.setPage(next);
    scrollCommandGrid(gridRef.current);
  };
  const [draft, setDraft] = useState<ChatTextAlert | null>(null);
  const editing = cards.find((item) => item.alert.id === draft?.id);
  return (
    <div dir="rtl">
      <div ref={gridRef} className={`${ALERT_CARD_GRID} scroll-mt-4`}>
        {paging.slice.map((item) => (
          <AlertCard
            key={item.id}
            alert={item.alert}
            icon={item.icon}
            title={t(item.titleKey)}
            info={item.infoKey ? t(item.infoKey) : undefined}
            editLabel={t("common.edit")}
            onEdit={() => setDraft({ ...item.alert })}
            onToggle={() => save.mutate({ ...item.alert, enabled: !item.alert.enabled })}
          />
        ))}
      </div>
      {paging.showPager ? (
        <CommandGridPager page={paging.page} pageCount={paging.pageCount} onPage={changePage} />
      ) : null}
      <AlertEditor
        draft={draft}
        title={editing ? t(editing.titleKey) : ""}
        info={editing?.infoKey ? t(editing.infoKey) : undefined}
        messageLabel={t("commands.alert.messageLabel")}
        minLabel={
          draft?.id === "kicks"
            ? t("commands.alert.minAmount")
            : draft?.id === "raid"
              ? t("commands.alert.minViewers")
              : t("commands.alert.minimum")
        }
        minHint={t("commands.alert.minHint")}
        showMinimum={draft?.id === "kicks" || draft?.id === "raid"}
        enabledLabel={t("common.enabled")}
        onLabel={t("common.on")}
        offLabel={t("common.off")}
        cancelLabel={t("common.cancel")}
        saveLabel={t("common.save")}
        hint={t("commands.alertsSubtitle")}
        saving={save.isPending}
        onClose={() => setDraft(null)}
        onChange={setDraft}
        onSave={() => {
          if (!draft) return;
          save.mutate(draft, { onSuccess: () => setDraft(null) });
        }}
      />
    </div>
  );
}

function AlertCard({
  alert,
  icon: Icon,
  title,
  info,
  editLabel,
  onEdit,
  onToggle,
}: {
  alert: ChatTextAlert;
  icon: LucideIcon;
  title: string;
  info?: string | undefined;
  editLabel: string;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <article className={cn(commandCardClass, "h-auto", !alert.enabled && commandCardOffClass)}>
      <CardHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Icon className="size-4 shrink-0 text-zinc-400" aria-hidden />
          <h3 className={cn("min-w-0 truncate text-sm font-semibold text-zinc-100", !alert.enabled && "text-zinc-300")}>
            {title}
          </h3>
          {info ? <InfoTip text={info} /> : null}
          <StatusDot enabled={alert.enabled} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" aria-label={editLabel} onClick={onEdit} className={commandIconButtonClass}>
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <EnableSwitch enabled={alert.enabled} onLabel={title} offLabel={title} onToggle={onToggle} />
        </div>
      </CardHeader>
      <CardContent>
        <p className={commandBodyClass} dir="auto">
          {alert.template}
        </p>
      </CardContent>
    </article>
  );
}

const alertField =
  "w-full rounded-xl border border-[oklch(1_0_0/0.1)] bg-[oklch(0.14_0.02_265/0.9)] px-3 py-2.5 text-sm text-foreground outline-none";

function AlertEditor({
  draft,
  title,
  info,
  messageLabel,
  minLabel,
  minHint,
  showMinimum,
  enabledLabel,
  onLabel,
  offLabel,
  cancelLabel,
  saveLabel,
  hint,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  draft: ChatTextAlert | null;
  title: string;
  info?: string | undefined;
  messageLabel: string;
  minLabel: string;
  minHint: string;
  showMinimum: boolean;
  enabledLabel: string;
  onLabel: string;
  offLabel: string;
  cancelLabel: string;
  saveLabel: string;
  hint: string;
  saving: boolean;
  onClose: () => void;
  onChange: (next: ChatTextAlert) => void;
  onSave: () => void;
}) {
  if (!draft) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-3d max-h-[90vh] overflow-y-auto border-[oklch(1_0_0/0.1)] sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pe-10">
            <DialogTitle className="min-w-0">{title}</DialogTitle>
            <div className="flex shrink-0 items-center gap-2 text-[0.82rem]">
              <span className="text-muted-foreground">{enabledLabel}</span>
              <EnableSwitch
                enabled={draft.enabled}
                onLabel={onLabel}
                offLabel={offLabel}
                onToggle={() => onChange({ ...draft, enabled: !draft.enabled })}
              />
            </div>
          </div>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
              {title}
              {info ? <InfoTip text={info} /> : null}
            </span>
            <input value={title} readOnly className={`${alertField} cursor-not-allowed opacity-80`} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
              {messageLabel}
            </span>
            <textarea
              value={draft.template}
              onChange={(event) => onChange({ ...draft, template: event.target.value.slice(0, 480) })}
              rows={4}
              className={`${alertField} resize-y`}
              dir="auto"
            />
          </label>
          {showMinimum ? (
            <label className="block">
              <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
                {minLabel}
              </span>
              <input
                type="number"
                min={0}
                value={draft.minimum}
                onChange={(event) =>
                  onChange({ ...draft, minimum: Math.max(0, Math.round(Number(event.target.value) || 0)) })
                }
                className={`${alertField} w-28`}
                dir="ltr"
              />
              <span className="mt-1.5 block text-[0.72rem] text-muted-foreground">{minHint}</span>
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[oklch(1_0_0/0.12)] px-4 py-2 text-[0.82rem]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-full bg-primary px-4 py-2 text-[0.82rem] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saveLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={text}
        onClick={() => setOpen((current) => !current)}
        className="text-zinc-400"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className={cn(
          "bg-[#1c1d22] border border-white/10 rounded-xl p-3 text-xs text-zinc-300 shadow-xl max-w-xs z-50 absolute start-0 top-6",
          open ? "block" : "hidden group-hover:block",
        )}
      >
        {text}
      </span>
    </span>
  );
}
