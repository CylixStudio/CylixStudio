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
  CardFooter,
  CardHeader,
  commandBodyClass,
  commandCardClass,
  commandCardOffClass,
  commandIconButtonClass,
  EnableSwitch,
  StatusDot,
} from "@/components/commands/commandCardChrome";
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
            minLabel={t("commands.alert.minimum")}
            messageLabel={t("commands.alert.messageLabel")}
            minHint={t("commands.alert.minHint")}
            showMinimum={item.id === "kicks" || item.id === "raid"}
            onSave={(next) => save.mutate(next)}
          />
        ))}
      </div>
      {paging.showPager ? (
        <CommandGridPager page={paging.page} pageCount={paging.pageCount} onPage={changePage} />
      ) : null}
    </div>
  );
}

function AlertCard({
  alert,
  icon: Icon,
  title,
  info,
  minLabel,
  messageLabel,
  minHint,
  showMinimum,
  onSave,
}: {
  alert: ChatTextAlert;
  icon: LucideIcon;
  title: string;
  info?: string | undefined;
  minLabel: string;
  messageLabel: string;
  minHint: string;
  showMinimum: boolean;
  onSave: (next: ChatTextAlert) => void;
}) {
  const [template, setTemplate] = useState(alert.template);
  const [minimum, setMinimum] = useState(String(alert.minimum));
  const [editing, setEditing] = useState(false);
  const shownTemplate = template === alert.template ? alert.template : template;
  const saveTemplate = (nextTemplate: string) => {
    if (nextTemplate !== alert.template) onSave({ ...alert, template: nextTemplate });
  };
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
          <button
            type="button"
            aria-label={messageLabel}
            aria-pressed={editing}
            onClick={() => setEditing((current) => !current)}
            className={commandIconButtonClass}
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <EnableSwitch
            enabled={alert.enabled}
            onLabel={title}
            offLabel={title}
            onToggle={() => onSave({ ...alert, template: shownTemplate, enabled: !alert.enabled })}
          />
        </div>
      </CardHeader>
      <CardContent>
        <span className="mb-1 block text-[0.68rem] text-zinc-500">{messageLabel}</span>
        {editing ? (
          <textarea
            value={shownTemplate}
            rows={3}
            onChange={(event) => setTemplate(event.target.value.slice(0, 480))}
            onBlur={() => saveTemplate(shownTemplate)}
            className="w-full resize-none rounded-xl border border-white/10 bg-[#0d0e12] p-2.5 text-xs text-zinc-100 focus:border-white/20 focus:outline-none"
            dir="auto"
          />
        ) : (
          <p className={commandBodyClass} dir="auto">
            {shownTemplate}
          </p>
        )}
      </CardContent>
      {showMinimum ? (
        <CardFooter>
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-[0.68rem] text-zinc-500">{minLabel}</span>
            <input
              type="number"
              min={0}
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
              onBlur={() => {
                const next = Math.max(0, Math.round(Number(minimum) || 0));
                setMinimum(String(next));
                if (next !== alert.minimum) onSave({ ...alert, template: shownTemplate, minimum: next });
              }}
              className="h-8 w-28 rounded-xl border border-white/10 bg-[#0d0e12] px-3 text-xs text-zinc-100 focus:border-white/20 focus:outline-none"
              dir="ltr"
            />
            <span className="mt-1 block text-[0.68rem] leading-snug text-zinc-500">{minHint}</span>
          </label>
        </CardFooter>
      ) : null}
    </article>
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
