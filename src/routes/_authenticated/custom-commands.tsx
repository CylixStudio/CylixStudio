import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ListFilter, MessageSquareCode, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CommandVariablesSidebar } from "@/components/commands/CommandVariables";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/EmptyState";
import { HowItWorks } from "@/components/layout/HowItWorks";
import { StudioPageTabs } from "@/components/layout/StudioPageTabs";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { notePlanError, requestUpgrade } from "@/components/subscription/upgradePlan";
import { FREE_PLAN_LIMITS } from "@/lib/plans";
import {
  COMMAND_ROLES,
  PREFIX_MARKERS,
  QUESTION_SUFFIX,
  commandTrigger,
  isSuffixMarker,
  questionSuffixForText,
  deleteTestCommand,
  emptyCommandDraft,
  loadTestCommandState,
  saveTestCommandSettings,
  setTestCommandEnabled,
  upsertTestCommand,
  type ChatCommandPlatform,
  type CommandRole,
  type CustomChatCommand,
  type CustomChatCommandInput,
} from "@/lib/customCommands";
import {
  deleteCustomCommand,
  getCustomCommandsState,
  saveCustomCommandSettings,
  setCustomCommandEnabled as persistCommandEnabled,
  upsertCustomCommand,
} from "@/lib/customCommands.functions";
import {
  loadTestDefaultCommands,
  mergeDefaultCommands,
  setTestDefaultCommandEnabled,
  upsertTestDefaultCommand,
  type DefaultCommand,
  type DefaultCommandInput,
} from "@/lib/defaultCommands";
import {
  listDefaultCommands,
  setDefaultCommandEnabled,
  upsertDefaultCommand,
} from "@/lib/defaultCommands.functions";
import {
  deleteMessageTimer,
  listMessageTimers,
  setMessageTimerEnabled,
  tickMessageTimers,
  upsertMessageTimer,
} from "@/lib/messageTimers.functions";
import {
  deleteTestTimer,
  emptyTimerDraft,
  loadTestTimers,
  setTestTimerEnabled,
  tickTestTimers,
  upsertTestTimer,
  type MessageTimer,
  type MessageTimerInput,
} from "@/lib/messageTimers";
import { isTestMode } from "@/lib/testMode";
import { PlatformIcon } from "@/components/widgets/PlatformIcon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/custom-commands")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Custom Chat Commands" },
      {
        name: "description",
        content:
          "Create custom chat commands with a flexible prefix, auto-replies, platform targeting and enable/disable controls.",
      },
      { property: "og:title", content: "CylixStudio — Custom Chat Commands" },
      {
        property: "og:description",
        content: "Streamer-owned chat commands with optional prefixes and automatic bot replies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomCommandsPage,
});

function buildCommandsCopy(t: ReturnType<typeof useLanguage>["t"]) {
  return {
    title: t("commands.title"),
    subtitle: t("commands.subtitle"),
    prefixTitle: t("commands.prefixTitle"),
    prefixHint: t("commands.prefixHint"),
    none: t("commands.none"),
    savePrefix: t("commands.savePrefix"),
    add: t("commands.add"),
    emptyTitle: t("commands.emptyTitle"),
    empty: t("commands.empty"),
    createFirst: t("commands.createFirst"),
    name: t("commands.name"),
    reply: t("commands.reply"),
    platform: t("commands.platform"),
    status: t("commands.status"),
    on: t("common.on"),
    off: t("common.off"),
    edit: t("common.edit"),
    delete: t("common.delete"),
    modalCreate: t("commands.modalCreate"),
    modalEdit: t("commands.modalEdit"),
    modalHint: t("commands.modalHint"),
    nameLabel: t("commands.nameLabel"),
    namePlaceholder: t("commands.namePlaceholder"),
    prefixLabel: t("commands.prefixLabel"),
    inherit: t("commands.inherit"),
    suffixAuto: t("commands.suffixAuto"),
    testerPlaceholder: t("commands.testerPlaceholder"),
    showVariables: t("commands.showVariables"),
    hideVariables: t("commands.hideVariables"),
    responseLabel: t("commands.responseLabel"),
    responsePlaceholder: t("commands.responsePlaceholder"),
    platformsLabel: t("commands.platformsLabel"),
    rolesLabel: t("commands.rolesLabel"),
    cooldown: t("commands.cooldown"),
    enabled: t("common.enabled"),
    cancel: t("common.cancel"),
    save: t("commands.save"),
    deleteTitle: t("commands.deleteTitle"),
    deleteBody: t("commands.deleteBody"),
    previewTitle: t("commands.previewTitle"),
    testerTitle: t("commands.testerTitle"),
    testerHint: t("commands.testerHint"),
    testerHit: t("commands.testerHit"),
    testerMiss: t("commands.testerMiss"),
    howTitle: t("common.howItWorks"),
    how: [t("commands.how1"), t("commands.how2"), t("commands.how3")],
    errName: t("commands.errName"),
    errReply: t("commands.errReply"),
    errDup: t("commands.errDup"),
    errSave: t("commands.errSave"),
    saved: t("common.saved"),
    prefixSaved: t("commands.prefixSaved"),
    search: t("commands.search"),
    filters: t("commands.filters"),
    filterAll: t("commands.filterAll"),
    filterRoles: t("commands.filterRoles"),
    filterDisabled: t("commands.filterDisabled"),
    filterNone: t("commands.filterNone"),
    loadMore: t("common.loadMore"),
    tabDefaults: t("commands.tabDefaults"),
    tabCommands: t("commands.tabCommands"),
    tabTimers: t("commands.tabTimers"),
    defaultSubtitle: t("commands.defaultSubtitle"),
    defaultHint: t("commands.defaultHint"),
    defaultVars: t("commands.defaultVars"),
    defaultHowTitle: t("common.howItWorks"),
    defaultHow: [t("commands.defaultHow1"), t("commands.defaultHow2"), t("commands.defaultHow3")],
    defaultSave: t("commands.defaultSave"),
    fallbackLabel: t("commands.fallbackLabel"),
    errReserved: t("commands.errReserved"),
    errFreeCommands: t("commands.errFreeCommands", { n: FREE_PLAN_LIMITS.customCommands }),
    errFreeTimers: t("commands.errFreeTimers", { n: FREE_PLAN_LIMITS.messageTimers }),
    timerSubtitle: t("commands.timerSubtitle"),
    addTimer: t("commands.addTimer"),
    timerEmpty: t("commands.timerEmpty"),
    timerModalCreate: t("commands.timerModalCreate"),
    timerModalEdit: t("commands.timerModalEdit"),
    timerHint: t("commands.timerHint"),
    timerMessage: t("commands.timerMessage"),
    timerMessagePlaceholder: t("commands.timerMessagePlaceholder"),
    timerInterval: t("commands.timerInterval"),
    timerEveryPrefix: t("commands.timerEveryPrefix"),
    timerMinutesUnit: t("commands.timerMinutesUnit"),
    timerSave: t("commands.timerSave"),
    timerDeleteTitle: t("commands.timerDeleteTitle"),
    timerDeleteBody: t("commands.timerDeleteBody"),
    errTimerMessage: t("commands.errTimerMessage"),
    errTimerSave: t("commands.errTimerSave"),
    timerHowTitle: t("common.howItWorks"),
    timerHow: [t("commands.timerHow1"), t("commands.timerHow2"), t("commands.timerHow3")],
  };
}

type CommandsCopy = ReturnType<typeof buildCommandsCopy>;

const ROLE_LABEL_KEY = {
  Everyone: "commands.role.everyone",
  Subs: "commands.role.subs",
  VIPs: "commands.role.vips",
  Mods: "commands.role.mods",
} as const satisfies Record<CommandRole, TranslationKey>;

const field =
  "w-full rounded-xl border border-[oklch(1_0_0/0.1)] bg-[oklch(0.14_0.02_265/0.9)] px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-[color-mix(in_oklab,var(--primary)_55%,transparent)]";
const pill =
  "inline-flex items-center rounded-full border px-3 py-1.5 text-[0.78rem] font-medium transition-colors";

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Keep ASCII markers and Arabic names in a stable visual order inside pills. */
function TriggerPreview({
  name,
  marker = "",
  placement,
  className,
}: {
  name: string;
  marker?: string;
  placement: "none" | "prefix" | "suffix";
  className?: string;
}) {
  const rtlName = ARABIC_SCRIPT.test(name);
  const nameDir = rtlName ? "rtl" : "auto";

  if (placement === "none" || !marker) {
    return (
      <span className={cn("font-mono", className)} dir={nameDir}>
        {name}
      </span>
    );
  }

  if (placement === "suffix") {
    return (
      <span className={cn("inline-flex items-center font-mono", className)} dir="ltr">
        <span dir={nameDir}>{name}</span>
        <span className="ps-0.5" dir="ltr">
          {marker}
        </span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center font-mono", className)} dir="ltr">
      <span className="pe-0.5" dir="ltr">
        {marker}
      </span>
      <span dir={nameDir}>{name}</span>
    </span>
  );
}

const PLATFORMS: { id: ChatCommandPlatform; label: string }[] = [
  { id: "KICK", label: "Kick" },
  { id: "TWITCH", label: "Twitch" },
];

const ROLE_FILTER_IDS: CommandRole[] = ["Everyone", "Subs", "VIPs", "Mods"];

const FACE_GRID = "grid grid-cols-[repeat(auto-fill,190px)] justify-start gap-3";
const FACE_ROW = "flex flex-wrap justify-start gap-3";
const FACE_PAGE_INITIAL = 12;
const FACE_PAGE_STEP = 8;

function useFaceLoadMore(itemCount: number) {
  const [limit, setLimit] = useState(FACE_PAGE_INITIAL);
  useEffect(() => {
    setLimit(FACE_PAGE_INITIAL);
  }, [itemCount]);
  return {
    limit,
    canLoadMore: limit < itemCount,
    loadMore: () => setLimit((current) => current + FACE_PAGE_STEP),
  };
}

function LoadMoreButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="mt-4 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg px-3 py-1.5 text-[0.82rem] font-medium text-muted-foreground transition-colors hover:bg-zinc-800 hover:text-foreground"
      >
        {label}
      </button>
    </div>
  );
}

type StatusFilter = "all" | "enabled" | "disabled";
type PlatformFilter = "all" | ChatCommandPlatform;
type RoleFilter = "all" | CommandRole;

function CustomCommandsPage() {
  const { user } = Route.useRouteContext();
  const { data } = useWorkspace(user.id);
  const subscription = useSubscription(user.id);
  const { t, lang } = useLanguage();
  const c = buildCommandsCopy(t);
  const queryClient = useQueryClient();
  const test = isTestMode();
  const isPro = Boolean(subscription.data?.isActive);

  const loadState = useServerFn(getCustomCommandsState);
  const persistSettings = useServerFn(saveCustomCommandSettings);
  const persistCommand = useServerFn(upsertCustomCommand);
  const persistEnabled = useServerFn(persistCommandEnabled);
  const persistDelete = useServerFn(deleteCustomCommand);
  const loadTimers = useServerFn(listMessageTimers);
  const persistTimer = useServerFn(upsertMessageTimer);
  const persistTimerEnabled = useServerFn(setMessageTimerEnabled);
  const persistTimerDelete = useServerFn(deleteMessageTimer);
  const persistTimerTick = useServerFn(tickMessageTimers);
  const loadDefaults = useServerFn(listDefaultCommands);
  const persistDefault = useServerFn(upsertDefaultCommand);
  const persistDefaultEnabled = useServerFn(setDefaultCommandEnabled);

  const state = useQuery({
    queryKey: ["custom-commands", user.id],
    queryFn: () => (test ? loadTestCommandState() : loadState()),
  });

  const settings = state.data?.settings ?? { defaultPrefix: "!" };
  const commands = state.data?.commands ?? [];

  const [defaultPrefix, setDefaultPrefix] = useState<string | null>(null);
  const prefixValue = defaultPrefix ?? settings.defaultPrefix;

  const [editor, setEditor] = useState<CustomChatCommandInput | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [pageTab, setPageTab] = useState<"defaults" | "commands" | "timers">("defaults");
  const [timerEditor, setTimerEditor] = useState<MessageTimerInput | null>(null);
  const [timerDeleteId, setTimerDeleteId] = useState<string | null>(null);
  const [defaultEditor, setDefaultEditor] = useState<DefaultCommandInput | null>(null);

  const timers = useQuery({
    queryKey: ["message-timers", user.id],
    queryFn: () => (test ? loadTestTimers() : loadTimers()),
  });
  const timerRows = timers.data ?? [];

  const defaultState = useQuery({
    queryKey: ["default-commands", user.id, lang],
    queryFn: async () => {
      if (test) return loadTestDefaultCommands(lang);
      const rows = await loadDefaults();
      return mergeDefaultCommands(rows, lang);
    },
  });
  const defaultRows = defaultState.data ?? [];
  const invalidateDefaults = () =>
    queryClient.invalidateQueries({ queryKey: ["default-commands", user.id] });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["custom-commands", user.id] });
  const invalidateTimers = () => queryClient.invalidateQueries({ queryKey: ["message-timers", user.id] });

  useEffect(() => {
    const run = () => {
      if (test) {
        tickTestTimers();
        return;
      }
      void persistTimerTick();
    };
    run();
    const id = window.setInterval(run, 30_000);
    return () => window.clearInterval(id);
  }, [test, persistTimerTick]);

  const prefixMutation = useMutation({
    mutationFn: async (value: string) => {
      if (test) return saveTestCommandSettings(value);
      const result = await persistSettings({ data: { defaultPrefix: value } });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success(c.prefixSaved);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message || c.errSave),
  });

  const saveMutation = useMutation({
    mutationFn: async (input: CustomChatCommandInput) => {
      if (test) {
        if (!input.name.trim()) throw new Error("name_required");
        if (!input.response.trim()) throw new Error("response_required");
        return upsertTestCommand(input);
      }
      const result = await persistCommand({ data: input });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success(c.saved);
      setEditor(null);
      void invalidate();
    },
    onError: (error: Error) => {
      const code = error.message;
      if (notePlanError(error)) return;
      toast.error(
        code === "name_required"
          ? c.errName
          : code === "response_required"
            ? c.errReply
            : code === "duplicate_name"
              ? c.errDup
              : code === "reserved_name"
                ? c.errReserved
                : code === "free_limit_commands"
                  ? c.errFreeCommands
                  : code && code !== "Could not save the command."
                    ? code
                    : c.errSave,
      );
    },
  });

  const enabledMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      if (test) return setTestCommandEnabled(id, enabled);
      return persistEnabled({ data: { id, enabled } });
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(error.message || c.errSave),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (test) return deleteTestCommand(id);
      return persistDelete({ data: { id } });
    },
    onSuccess: () => {
      setDeleteId(null);
      void invalidate();
    },
    onError: (error: Error) => {
      if (notePlanError(error)) return;
      toast.error(error.message || c.errSave);
    },
  });

  const visibleCommands = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commands.filter((command) => {
      if (statusFilter === "enabled" && !command.enabled) return false;
      if (statusFilter === "disabled" && command.enabled) return false;
      if (platformFilter !== "all" && !command.platforms.includes(platformFilter)) return false;
      if (roleFilter !== "all") {
        const roles = command.roles.length ? command.roles : ["Everyone"];
        if (!roles.includes(roleFilter)) return false;
      }
      if (!needle) return true;
      const trigger = commandTrigger(command, prefixValue).toLowerCase();
      return (
        command.name.toLowerCase().includes(needle) ||
        trigger.includes(needle) ||
        command.response.toLowerCase().includes(needle)
      );
    });
  }, [commands, query, statusFilter, platformFilter, roleFilter, prefixValue]);

  const timerSaveMutation = useMutation({
    mutationFn: async (input: MessageTimerInput) => {
      if (test) {
        if (!input.message.trim()) throw new Error("message_required");
        return upsertTestTimer(input);
      }
      const result = await persistTimer({ data: input });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success(c.saved);
      setTimerEditor(null);
      void invalidateTimers();
    },
    onError: (error: Error) => {
      if (notePlanError(error)) return;
      toast.error(error.message === "message_required" ? c.errTimerMessage : c.errTimerSave);
    },
  });

  const timerEnabledMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      if (test) return setTestTimerEnabled(id, enabled);
      return persistTimerEnabled({ data: { id, enabled } });
    },
    onSuccess: () => void invalidateTimers(),
    onError: (error: Error) => toast.error(error.message || c.errSave),
  });

  const timerDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (test) return deleteTestTimer(id);
      return persistTimerDelete({ data: { id } });
    },
    onSuccess: () => {
      setTimerDeleteId(null);
      void invalidateTimers();
    },
    onError: (error: Error) => toast.error(error.message || c.errSave),
  });

  const defaultSaveMutation = useMutation({
    mutationFn: async (input: DefaultCommandInput) => {
      if (test) {
        if (!input.response.trim()) throw new Error("response_required");
        return upsertTestDefaultCommand(input, lang);
      }
      const result = await persistDefault({ data: input });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success(c.saved);
      setDefaultEditor(null);
      void invalidateDefaults();
    },
    onError: (error: Error) => {
      toast.error(error.message === "response_required" ? c.errReply : c.errSave);
    },
  });

  const defaultEnabledMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: DefaultCommand["id"]; enabled: boolean }) => {
      if (test) return setTestDefaultCommandEnabled(id, enabled, lang);
      return persistDefaultEnabled({ data: { id, enabled } });
    },
    onSuccess: () => void invalidateDefaults(),
    onError: (error: Error) => toast.error(error.message || c.errSave),
  });

  const openCreate = () => {
    if (subscription.isSuccess && !isPro && commands.length >= FREE_PLAN_LIMITS.customCommands) {
      requestUpgrade();
      return;
    }
    setEditor(emptyCommandDraft());
  };
  const openAddTimer = () => {
    if (subscription.isSuccess && !isPro && timerRows.length >= FREE_PLAN_LIMITS.messageTimers) {
      requestUpgrade();
      return;
    }
    setTimerEditor(emptyTimerDraft());
  };
  const openEdit = (command: CustomChatCommand) =>
    setEditor({
      id: command.id,
      name: command.name,
      prefix: command.prefix,
      response: command.response,
      enabled: command.enabled,
      platforms: command.platforms,
      roles: command.roles,
      cooldownSeconds: command.cooldownSeconds,
    });

  return (
    <AppShell
      user={user}
      profile={data?.profile}
      title={pageTab === "defaults" ? c.tabDefaults : pageTab === "timers" ? c.tabTimers : c.title}
      subtitle={
        pageTab === "defaults" ? c.defaultSubtitle : pageTab === "timers" ? c.timerSubtitle : c.subtitle
      }
    >
      <StudioPageTabs
        value={pageTab}
        onChange={setPageTab}
        items={[
          { id: "defaults", label: c.tabDefaults },
          { id: "commands", label: c.tabCommands },
          { id: "timers", label: c.tabTimers },
        ]}
      />

      {pageTab === "defaults" ? (
        <DefaultCommandsPanel
          copy={c}
          commands={defaultRows}
          onEdit={(command) =>
            setDefaultEditor({
              id: command.id,
              enabled: command.enabled,
              response: command.response,
              fallbackResponse: command.fallbackResponse,
              platforms: command.platforms,
              cooldownSeconds: command.cooldownSeconds,
            })
          }
          onToggle={(id, enabled) => defaultEnabledMutation.mutate({ id, enabled })}
        />
      ) : pageTab === "timers" ? (
        <MessageTimersPanel
          copy={c}
          timers={timerRows}
          onAdd={openAddTimer}
          onEdit={(timer) =>
            setTimerEditor({
              id: timer.id,
              message: timer.message,
              intervalMinutes: timer.intervalMinutes,
              enabled: timer.enabled,
              platforms: timer.platforms,
            })
          }
          onDelete={(id) => setTimerDeleteId(id)}
          onToggle={(id, enabled) => timerEnabledMutation.mutate({ id, enabled })}
        />
      ) : (
      <div className="space-y-8">
        <HowItWorks title={c.howTitle} steps={c.how} />
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
            <CommandFilterMenu
              copy={c}
              statusFilter={statusFilter}
              platformFilter={platformFilter}
              roleFilter={roleFilter}
              onStatusFilter={setStatusFilter}
              onPlatformFilter={setPlatformFilter}
              onRoleFilter={setRoleFilter}
            />
            <button
              type="button"
              onClick={openCreate}
              className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[0.78rem] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" aria-hidden />
              {c.add}
            </button>
          </div>

          {commands.length === 0 ? (
            <EmptyState
              className="mt-5"
              icon={MessageSquareCode}
              title={c.emptyTitle}
              description={c.empty}
              actionLabel={c.createFirst}
              onAction={openCreate}
            />
          ) : visibleCommands.length === 0 ? (
            <p className="mt-4 text-start text-[0.78rem] text-muted-foreground">{c.filterNone}</p>
          ) : (
            <PagedCommandGrid
              commands={visibleCommands}
              defaultPrefix={prefixValue}
              copy={c}
              onToggle={(id, enabled) => enabledMutation.mutate({ id, enabled })}
              onEdit={openEdit}
              onDelete={(id) => setDeleteId(id)}
            />
          )}
        </div>

        <section className="rounded-xl border border-white/[0.06] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[0.95rem] font-semibold">{c.prefixTitle}</h2>
              <p className="mt-1 max-w-xl text-[0.78rem] text-muted-foreground">{c.prefixHint}</p>
            </div>
            <button
              type="button"
              onClick={() => prefixMutation.mutate(prefixValue)}
              className="rounded-full bg-primary px-4 py-2 text-[0.82rem] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {c.savePrefix}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDefaultPrefix("")}
              className={cn(
                pill,
                prefixValue === ""
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-[oklch(1_0_0/0.1)] text-muted-foreground hover:text-foreground",
              )}
            >
              {c.none}
            </button>
            {PREFIX_MARKERS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDefaultPrefix(preset)}
                className={cn(
                  pill,
                  prefixValue === preset
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-[oklch(1_0_0/0.1)] text-muted-foreground hover:text-foreground",
                )}
              >
                <TriggerPreview name="name" marker={preset} placement="prefix" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDefaultPrefix(QUESTION_SUFFIX)}
              className={cn(
                pill,
                "gap-1",
                isSuffixMarker(prefixValue)
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-[oklch(1_0_0/0.1)] text-muted-foreground hover:text-foreground",
              )}
            >
              <TriggerPreview name="question" marker="?" placement="suffix" />
              <span className="text-muted-foreground">/</span>
              <TriggerPreview name="سؤال" marker="؟" placement="suffix" />
            </button>
          </div>
          {isSuffixMarker(prefixValue) ? (
            <p className="mt-2 text-[0.72rem] text-muted-foreground">{c.suffixAuto}</p>
          ) : null}

        </section>
      </div>
      )}

      <DefaultCommandEditor
        copy={c}
        draft={defaultEditor}
        saving={defaultSaveMutation.isPending}
        onClose={() => setDefaultEditor(null)}
        onChange={setDefaultEditor}
        onSave={() => defaultEditor && defaultSaveMutation.mutate(defaultEditor)}
      />

      <CommandEditor
        copy={c}
        defaultPrefix={prefixValue}
        draft={editor}
        saving={saveMutation.isPending}
        onClose={() => setEditor(null)}
        onChange={setEditor}
        onSave={() => editor && saveMutation.mutate(editor)}
      />

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="glass-3d border-[oklch(1_0_0/0.1)]">
          <AlertDialogHeader>
            <AlertDialogTitle>{c.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{c.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{c.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {c.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TimerEditor
        copy={c}
        draft={timerEditor}
        saving={timerSaveMutation.isPending}
        onClose={() => setTimerEditor(null)}
        onChange={setTimerEditor}
        onSave={() => timerEditor && timerSaveMutation.mutate(timerEditor)}
      />

      <AlertDialog open={Boolean(timerDeleteId)} onOpenChange={(open) => !open && setTimerDeleteId(null)}>
        <AlertDialogContent className="glass-3d border-[oklch(1_0_0/0.1)]">
          <AlertDialogHeader>
            <AlertDialogTitle>{c.timerDeleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{c.timerDeleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{c.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 text-white hover:bg-rose-500/90"
              onClick={() => timerDeleteId && timerDeleteMutation.mutate(timerDeleteId)}
            >
              {c.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function CommandFilterMenu({
  copy,
  statusFilter,
  platformFilter,
  roleFilter,
  onStatusFilter,
  onPlatformFilter,
  onRoleFilter,
}: {
  copy: CommandsCopy;
  statusFilter: StatusFilter;
  platformFilter: PlatformFilter;
  roleFilter: RoleFilter;
  onStatusFilter: (value: StatusFilter) => void;
  onPlatformFilter: (value: PlatformFilter) => void;
  onRoleFilter: (value: RoleFilter) => void;
}) {
  const { t } = useLanguage();
  const active = statusFilter !== "all" || platformFilter !== "all" || roleFilter !== "all";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800/60 px-2.5 text-[0.78rem] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:border-zinc-600"
        >
          <ListFilter className="size-3.5" aria-hidden />
          {copy.filters}
          {active ? <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden /> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44 text-start">
        <DropdownMenuLabel className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
          {copy.status}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={statusFilter}
          onValueChange={(value) => onStatusFilter(value as StatusFilter)}
        >
          <DropdownMenuRadioItem value="all">{copy.filterAll}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="enabled">{copy.enabled}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="disabled">{copy.filterDisabled}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
          {copy.platform}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={platformFilter}
          onValueChange={(value) => onPlatformFilter(value as PlatformFilter)}
        >
          <DropdownMenuRadioItem value="all">{copy.filterAll}</DropdownMenuRadioItem>
          {PLATFORMS.map((platform) => (
            <DropdownMenuRadioItem key={platform.id} value={platform.id}>
              <span className="inline-flex items-center gap-1.5">
                <PlatformIcon platform={platform.id} size={12} />
                {platform.label}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
          {copy.filterRoles}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={roleFilter}
          onValueChange={(value) => onRoleFilter(value as RoleFilter)}
        >
          <DropdownMenuRadioItem value="all">{copy.filterAll}</DropdownMenuRadioItem>
          {ROLE_FILTER_IDS.map((id) => (
            <DropdownMenuRadioItem key={id} value={id}>
              {t(ROLE_LABEL_KEY[id])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EnableSwitch({
  enabled,
  onLabel,
  offLabel,
  onToggle,
}: {
  enabled: boolean;
  onLabel: string;
  offLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? onLabel : offLabel}
      onClick={onToggle}
      className={cn(
        "relative h-3.5 w-6 shrink-0 rounded-full transition-colors duration-200",
        enabled ? "bg-emerald-400/25" : "bg-zinc-700/80",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[2px] size-2.5 rounded-full transition-[inset-inline-start,background-color] duration-200 ease-out",
          enabled ? "start-[0.7rem] bg-white" : "start-[2px] bg-zinc-400",
        )}
      />
    </button>
  );
}

function DefaultCommandsPanel({
  copy,
  commands,
  onEdit,
  onToggle,
}: {
  copy: CommandsCopy;
  commands: DefaultCommand[];
  onEdit: (command: DefaultCommand) => void;
  onToggle: (id: DefaultCommand["id"], enabled: boolean) => void;
}) {
  const page = useFaceLoadMore(commands.length);
  return (
    <div className="space-y-8">
      <HowItWorks title={copy.defaultHowTitle} steps={copy.defaultHow} />
      <div>
        <div className={FACE_ROW}>
          {commands.slice(0, page.limit).map((command) => (
            <StudioFaceCard
              key={command.id}
              enabled={command.enabled}
              onToggle={() => onToggle(command.id, !command.enabled)}
              onLabel={copy.on}
              offLabel={copy.off}
              onEdit={() => onEdit(command)}
              editLabel={copy.edit}
            >
              <h3 className="max-w-full font-mono text-sm font-semibold tracking-tight text-zinc-100" dir="auto">
                {command.trigger}
              </h3>
            </StudioFaceCard>
          ))}
        </div>
        {page.canLoadMore ? <LoadMoreButton label={copy.loadMore} onClick={page.loadMore} /> : null}
      </div>
    </div>
  );
}

function DefaultCommandEditor({
  copy,
  draft,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  copy: CommandsCopy;
  draft: DefaultCommandInput | null;
  saving: boolean;
  onClose: () => void;
  onChange: (next: DefaultCommandInput) => void;
  onSave: () => void;
}) {
  if (!draft) return null;
  const showFallback = draft.id === "followage" || draft.id === "so";
  const trigger = `!${draft.id}`;

  const togglePlatform = (platform: ChatCommandPlatform) => {
    const has = draft.platforms.includes(platform);
    const next = has ? draft.platforms.filter((item) => item !== platform) : [...draft.platforms, platform];
    onChange({ ...draft, platforms: next.length ? next : [platform] });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-3d max-h-[90vh] overflow-y-auto border-[oklch(1_0_0/0.1)] sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pe-10">
            <DialogTitle className="min-w-0">{copy.modalEdit}</DialogTitle>
            <div className="flex shrink-0 items-center gap-2 text-[0.82rem]">
              <span className="text-muted-foreground">{copy.enabled}</span>
              <EnableSwitch
                enabled={draft.enabled}
                onLabel={copy.on}
                offLabel={copy.off}
                onToggle={() => onChange({ ...draft, enabled: !draft.enabled })}
              />
            </div>
          </div>
          <DialogDescription>{copy.defaultHint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
              {copy.nameLabel}
            </span>
            <input value={trigger} readOnly className={`${field} cursor-not-allowed opacity-80`} dir="ltr" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
              {copy.responseLabel}
            </span>
            <textarea
              value={draft.response}
              onChange={(event) => onChange({ ...draft, response: event.target.value.slice(0, 480) })}
              rows={4}
              className={`${field} resize-y`}
              dir="auto"
            />
            <span className="mt-1.5 block text-[0.72rem] text-muted-foreground">{copy.defaultVars}</span>
          </label>

          {showFallback ? (
            <label className="block">
              <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
                {copy.fallbackLabel}
              </span>
              <textarea
                value={draft.fallbackResponse}
                onChange={(event) =>
                  onChange({ ...draft, fallbackResponse: event.target.value.slice(0, 480) })
                }
                rows={3}
                className={`${field} resize-y`}
                dir="auto"
              />
            </label>
          ) : null}

          <div>
            <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
              {copy.platformsLabel}
            </span>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => {
                const active = draft.platforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => togglePlatform(platform.id)}
                    className={cn(
                      pill,
                      "inline-flex items-center gap-2",
                      active
                        ? "border-primary/50 bg-primary/15"
                        : "border-[oklch(1_0_0/0.1)] text-muted-foreground",
                    )}
                  >
                    <PlatformIcon platform={platform.id} size={14} />
                    {platform.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
              {copy.cooldown}
            </span>
            <input
              type="number"
              min={0}
              max={3600}
              value={draft.cooldownSeconds}
              onChange={(event) =>
                onChange({ ...draft, cooldownSeconds: Number(event.target.value) || 0 })
              }
              className={`${field} w-28`}
              dir="ltr"
            />
          </label>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[oklch(1_0_0/0.12)] px-4 py-2 text-[0.82rem]"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-full bg-primary px-4 py-2 text-[0.82rem] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {copy.defaultSave}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageTimersPanel({
  copy,
  timers,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
}: {
  copy: CommandsCopy;
  timers: MessageTimer[];
  onAdd: () => void;
  onEdit: (timer: MessageTimer) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const page = useFaceLoadMore(timers.length);
  return (
    <div className="space-y-8">
      <HowItWorks title={copy.timerHowTitle} steps={copy.timerHow} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[0.78rem] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" aria-hidden />
          {copy.addTimer}
        </button>
      </div>

      {timers.length === 0 ? (
        <p className="text-start text-[0.82rem] text-muted-foreground">{copy.timerEmpty}</p>
      ) : (
        <div>
        <div className={FACE_GRID}>
          {timers.slice(0, page.limit).map((timer) => (
            <StudioFaceCard
              key={timer.id}
              enabled={timer.enabled}
              onToggle={() => onToggle(timer.id, !timer.enabled)}
              onLabel={copy.on}
              offLabel={copy.off}
              onEdit={() => onEdit(timer)}
              onDelete={() => onDelete(timer.id)}
              editLabel={copy.edit}
              deleteLabel={copy.delete}
            >
              <p
                className="line-clamp-2 max-w-full text-[0.78rem] font-medium leading-snug text-zinc-100"
                dir="auto"
              >
                {timer.message}
              </p>
              <p className="mt-1 text-[0.68rem] text-zinc-500">
                {copy.timerEveryPrefix} {timer.intervalMinutes} {copy.timerMinutesUnit}
              </p>
            </StudioFaceCard>
          ))}
        </div>
        {page.canLoadMore ? <LoadMoreButton label={copy.loadMore} onClick={page.loadMore} /> : null}
        </div>
      )}
    </div>
  );
}

function TimerEditor({
  copy,
  draft,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  copy: CommandsCopy;
  draft: MessageTimerInput | null;
  saving: boolean;
  onClose: () => void;
  onChange: (next: MessageTimerInput) => void;
  onSave: () => void;
}) {
  if (!draft) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-3d max-h-[90vh] overflow-y-auto border-[oklch(1_0_0/0.1)] sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pe-10">
            <DialogTitle className="min-w-0">
              {draft.id ? copy.timerModalEdit : copy.timerModalCreate}
            </DialogTitle>
            <div className="flex shrink-0 items-center gap-2 text-[0.82rem]">
              <span className="text-muted-foreground">{copy.enabled}</span>
              <EnableSwitch
                enabled={draft.enabled}
                onLabel={copy.on}
                offLabel={copy.off}
                onToggle={() => onChange({ ...draft, enabled: !draft.enabled })}
              />
            </div>
          </div>
          <DialogDescription>{copy.timerHint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
              {copy.timerMessage}
            </span>
            <textarea
              value={draft.message}
              onChange={(event) => onChange({ ...draft, message: event.target.value.slice(0, 480) })}
              placeholder={copy.timerMessagePlaceholder}
              rows={4}
              className={`${field} resize-y`}
              dir="auto"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
              {copy.timerInterval}
            </span>
            <input
              type="number"
              min={1}
              max={1440}
              value={draft.intervalMinutes}
              onChange={(event) =>
                onChange({ ...draft, intervalMinutes: Number(event.target.value) || 15 })
              }
              className={`${field} w-28`}
              dir="ltr"
            />
          </label>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[oklch(1_0_0/0.12)] px-4 py-2 text-[0.82rem]"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-full bg-primary px-4 py-2 text-[0.82rem] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {copy.timerSave}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudioFaceCard({
  enabled,
  onToggle,
  onLabel,
  offLabel,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  children,
}: {
  enabled: boolean;
  onToggle: () => void;
  onLabel: string;
  offLabel: string;
  onEdit: () => void;
  onDelete?: () => void;
  editLabel: string;
  deleteLabel?: string;
  children: ReactNode;
}) {
  return (
    <article
      className="group relative h-[95px] w-[190px] shrink-0 overflow-hidden rounded-[20px] border border-white/[0.06]"
      style={{ backgroundColor: "#101114" }}
    >
      <span
        role="switch"
        tabIndex={0}
        aria-checked={enabled}
        aria-label={enabled ? onLabel : offLabel}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        className={
          enabled
            ? "absolute top-2 left-1/2 z-20 box-border block h-2 w-2 -translate-x-1/2 rounded-full bg-emerald-600 p-0 leading-none"
            : "absolute top-2 left-1/2 z-20 box-border block h-2 w-2 -translate-x-1/2 rounded-full bg-zinc-600 p-0 leading-none"
        }
      />

      <div className="flex h-full items-center justify-center px-3 text-center transition duration-200 ease-out group-hover:blur-sm group-focus-within:blur-sm">
        {children}
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[20px] bg-black/45 opacity-0 transition-opacity duration-200 ease-out group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={editLabel}
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2.5 py-1 text-[0.72rem] font-medium text-zinc-200"
          >
            <Pencil className="size-3.5" aria-hidden />
            {editLabel}
          </button>
          {onDelete && deleteLabel ? (
            <button
              type="button"
              aria-label={deleteLabel}
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-md bg-red-950/70 px-2.5 py-1 text-[0.72rem] font-medium text-red-300/90"
            >
              <Trash2 className="size-3.5" aria-hidden />
              {deleteLabel}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function PagedCommandGrid({
  commands,
  defaultPrefix,
  copy,
  onToggle,
  onEdit,
  onDelete,
}: {
  commands: CustomChatCommand[];
  defaultPrefix: string;
  copy: CommandsCopy;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (command: CustomChatCommand) => void;
  onDelete: (id: string) => void;
}) {
  const page = useFaceLoadMore(commands.length);
  return (
    <div className="mt-3">
      <div className={FACE_GRID}>
        {commands.slice(0, page.limit).map((command) => (
          <CommandCard
            key={command.id}
            command={command}
            defaultPrefix={defaultPrefix}
            copy={copy}
            onToggle={() => onToggle(command.id, !command.enabled)}
            onEdit={() => onEdit(command)}
            onDelete={() => onDelete(command.id)}
          />
        ))}
      </div>
      {page.canLoadMore ? <LoadMoreButton label={copy.loadMore} onClick={page.loadMore} /> : null}
    </div>
  );
}

function CommandCard({
  command,
  defaultPrefix,
  copy,
  onToggle,
  onEdit,
  onDelete,
}: {
  command: CustomChatCommand;
  defaultPrefix: string;
  copy: CommandsCopy;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <StudioFaceCard
      enabled={command.enabled}
      onToggle={onToggle}
      onLabel={copy.on}
      offLabel={copy.off}
      onEdit={onEdit}
      onDelete={onDelete}
      editLabel={copy.edit}
      deleteLabel={copy.delete}
    >
      <h3 className="max-w-full text-sm font-semibold tracking-tight text-zinc-100 [overflow-wrap:anywhere]">
        <TriggerPreview
          name={command.name || "name"}
          marker={
            command.prefix === null
              ? defaultPrefix
              : isSuffixMarker(command.prefix)
                ? questionSuffixForText(command.name)
                : command.prefix
          }
          placement={
            command.prefix === ""
              ? "none"
              : isSuffixMarker(command.prefix === null ? defaultPrefix : command.prefix)
                ? "suffix"
                : (command.prefix === null ? defaultPrefix : command.prefix)
                  ? "prefix"
                  : "none"
          }
        />
      </h3>
    </StudioFaceCard>
  );
}

function CommandEditor({
  copy,
  defaultPrefix,
  draft,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  copy: CommandsCopy;
  defaultPrefix: string;
  draft: CustomChatCommandInput | null;
  saving: boolean;
  onClose: () => void;
  onChange: (next: CustomChatCommandInput) => void;
  onSave: () => void;
}) {
  const { t } = useLanguage();
  const [showVars, setShowVars] = useState(false);
  const responseRef = useRef<HTMLTextAreaElement>(null);
  if (!draft) return null;
  const prefixMode = draft.prefix === null ? "inherit" : draft.prefix === "" ? "none" : "custom";
  const suffixSelected = draft.prefix !== null && isSuffixMarker(draft.prefix);
  const liveName = draft.name.trim() || "name";
  const liveSuffix = questionSuffixForText(liveName);

  const togglePlatform = (platform: ChatCommandPlatform) => {
    const has = draft.platforms.includes(platform);
    const next = has ? draft.platforms.filter((item) => item !== platform) : [...draft.platforms, platform];
    onChange({ ...draft, platforms: next.length ? next : [platform] });
  };

  const toggleRole = (role: string) => {
    const has = draft.roles.includes(role);
    const next = has ? draft.roles.filter((item) => item !== role) : [...draft.roles, role];
    onChange({ ...draft, roles: next.length ? next : ["Everyone"] });
  };

  const insertTag = (tag: string) => {
    const el = responseRef.current;
    const current = draft.response;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${tag}${current.slice(end)}`.slice(0, 480);
    onChange({ ...draft, response: next });
    requestAnimationFrame(() => {
      el?.focus();
      const pos = Math.min(start + tag.length, 480);
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "glass-3d max-h-[90vh] overflow-y-auto border-[oklch(1_0_0/0.1)]",
          showVars ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pe-10">
            <DialogTitle className="min-w-0">{draft.id ? copy.modalEdit : copy.modalCreate}</DialogTitle>
            <div className="flex shrink-0 items-center gap-2 text-[0.82rem]">
              <span className="text-muted-foreground">{copy.enabled}</span>
              <EnableSwitch
                enabled={draft.enabled}
                onLabel={copy.on}
                offLabel={copy.off}
                onToggle={() => onChange({ ...draft, enabled: !draft.enabled })}
              />
            </div>
          </div>
          <DialogDescription>{copy.modalHint}</DialogDescription>
        </DialogHeader>

        <div className={cn("gap-4", showVars && "lg:flex")}>
          <div className="min-w-0 flex-1 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
                {copy.nameLabel}
              </span>
              <input
                value={draft.name}
                onChange={(event) => {
                  const name = event.target.value;
                  const prefix =
                    draft.prefix !== null && isSuffixMarker(draft.prefix)
                      ? questionSuffixForText(name)
                      : draft.prefix;
                  onChange({ ...draft, name, prefix });
                }}
                placeholder={copy.namePlaceholder}
                className={field}
                dir="auto"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
                {copy.prefixLabel}
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, prefix: null })}
                  className={cn(
                    pill,
                    "gap-1.5",
                    prefixMode === "inherit"
                      ? "border-primary/50 bg-primary/15"
                      : "border-[oklch(1_0_0/0.1)] text-muted-foreground",
                  )}
                >
                  <span>{copy.inherit}</span>
                  <span className="inline-flex items-center gap-0.5 opacity-90" dir="ltr">
                    <span>(</span>
                    <TriggerPreview
                      name={liveName}
                      marker={defaultPrefix}
                      placement={defaultPrefix ? (isSuffixMarker(defaultPrefix) ? "suffix" : "prefix") : "none"}
                    />
                    <span>)</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, prefix: "" })}
                  className={cn(
                    pill,
                    prefixMode === "none"
                      ? "border-primary/50 bg-primary/15"
                      : "border-[oklch(1_0_0/0.1)] text-muted-foreground",
                  )}
                >
                  {copy.none}
                </button>
                {PREFIX_MARKERS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChange({ ...draft, prefix: preset })}
                    className={cn(
                      pill,
                      draft.prefix === preset
                        ? "border-primary/50 bg-primary/15"
                        : "border-[oklch(1_0_0/0.1)] text-muted-foreground",
                    )}
                  >
                    <TriggerPreview name={liveName} marker={preset} placement="prefix" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onChange({ ...draft, prefix: questionSuffixForText(liveName) })}
                  className={cn(
                    pill,
                    suffixSelected
                      ? "border-primary/50 bg-primary/15"
                      : "border-[oklch(1_0_0/0.1)] text-muted-foreground",
                  )}
                >
                  <TriggerPreview name={liveName} marker={liveSuffix} placement="suffix" />
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
                  {copy.responseLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setShowVars((open) => !open)}
                  className="text-[0.72rem] font-medium text-[#bee1fc] hover:underline"
                >
                  {showVars ? copy.hideVariables : copy.showVariables}
                </button>
              </div>
              <textarea
                ref={responseRef}
                value={draft.response}
                onChange={(event) => onChange({ ...draft, response: event.target.value.slice(0, 480) })}
                placeholder={copy.responsePlaceholder}
                rows={4}
                className={`${field} resize-y`}
                dir="auto"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
                  {copy.platformsLabel}
                </span>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((platform) => {
                    const active = draft.platforms.includes(platform.id);
                    return (
                      <button
                        key={platform.id}
                        type="button"
                        onClick={() => togglePlatform(platform.id)}
                        className={cn(
                          pill,
                          "inline-flex items-center gap-2",
                          active
                            ? "border-primary/50 bg-primary/15"
                            : "border-[oklch(1_0_0/0.1)] text-muted-foreground",
                        )}
                      >
                        <PlatformIcon platform={platform.id} size={14} />
                        {platform.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
                  {copy.rolesLabel}
                </span>
                <div className="flex flex-wrap gap-2">
                  {COMMAND_ROLES.map((role) => {
                    const active = draft.roles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={cn(
                          pill,
                          active
                            ? "border-primary/50 bg-primary/15"
                            : "border-[oklch(1_0_0/0.1)] text-muted-foreground",
                        )}
                      >
                        {t(ROLE_LABEL_KEY[role])}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
                {copy.cooldown}
              </span>
              <input
                type="number"
                min={0}
                max={3600}
                value={draft.cooldownSeconds}
                onChange={(event) =>
                  onChange({ ...draft, cooldownSeconds: Number(event.target.value) || 0 })
                }
                className={`${field} w-28`}
                dir="ltr"
              />
            </label>
          </div>
          {showVars ? <CommandVariablesSidebar onInsert={insertTag} /> : null}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[oklch(1_0_0/0.12)] px-4 py-2 text-[0.82rem]"
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
