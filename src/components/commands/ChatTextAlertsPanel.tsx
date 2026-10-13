import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Gift,
  Info,
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
  return (
    <div dir="rtl">
      {ALERTS.map((item) => {
        const alert = rows.find((row) => row.id === item.id);
        if (!alert) return null;
        return (
          <AlertCard
            key={item.id}
            alert={alert}
            icon={item.icon}
            title={t(item.titleKey)}
            info={item.infoKey ? t(item.infoKey) : undefined}
            minLabel={item.id === "kicks" ? t("commands.alert.minAmount") : t("commands.alert.minViewers")}
            minHint={t("commands.alert.minHint")}
            showMinimum={item.id === "kicks" || item.id === "raid"}
            onSave={(next) => save.mutate(next)}
          />
        );
      })}
    </div>
  );
}

function AlertCard({
  alert,
  icon: Icon,
  title,
  info,
  minLabel,
  minHint,
  showMinimum,
  onSave,
}: {
  alert: ChatTextAlert;
  icon: LucideIcon;
  title: string;
  info?: string | undefined;
  minLabel: string;
  minHint: string;
  showMinimum: boolean;
  onSave: (next: ChatTextAlert) => void;
}) {
  const [template, setTemplate] = useState(alert.template);
  const [minimum, setMinimum] = useState(String(alert.minimum));
  const shownTemplate = template === alert.template ? alert.template : template;
  return (
    <article className="bg-[#121318] border border-white/5 rounded-2xl p-5 mb-4 flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-zinc-300" aria-hidden />
          <h3 className="truncate text-sm font-semibold text-zinc-100">{title}</h3>
          {info ? <InfoTip text={info} /> : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={alert.enabled}
          aria-label={title}
          onClick={() => onSave({ ...alert, template: shownTemplate, enabled: !alert.enabled })}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            alert.enabled ? "bg-emerald-500" : "bg-zinc-700",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-0.5 size-4 rounded-full bg-white transition-[inset-inline-start]",
              alert.enabled ? "start-4" : "start-0.5",
            )}
          />
        </button>
      </header>
      <textarea
        value={shownTemplate}
        rows={3}
        onChange={(event) => setTemplate(event.target.value.slice(0, 480))}
        onBlur={() => {
          if (shownTemplate !== alert.template) onSave({ ...alert, template: shownTemplate });
        }}
        className="bg-[#0d0e12] border border-white/10 rounded-xl p-3 text-white text-sm w-full resize-none focus:outline-none focus:border-emerald-500/80"
        dir="auto"
      />
      {showMinimum ? (
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-300">{minLabel}</span>
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
            className="w-28 rounded-xl border border-white/10 bg-[#0d0e12] px-3 py-2 text-sm text-white focus:border-emerald-500/80 focus:outline-none"
            dir="ltr"
          />
          <span className="mt-1.5 block text-xs text-zinc-500">{minHint}</span>
        </label>
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
