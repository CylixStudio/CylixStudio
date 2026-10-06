import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactElement } from "react";
import { Coins, Copy, Check, Disc3, Tags, Trash2, Users, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { DeleteWidgetDialog } from "@/components/widgets/DeleteWidgetDialog";
import { ToolCard } from "@/components/hub/ToolCard";
import {
  EventLabelsPreview,
  KicksGoalPreview,
  ViewerCounterPreview,
  WheelPreview,
} from "@/components/hub/previews";
import { supabase } from "@/lib/supabase/client";
import { useWidgets } from "@/hooks/useWidgets";
import { useWorkspace } from "@/hooks/useWorkspace";
import { createWidget, widgetErrorText } from "@/lib/createWidget";
import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { isMissingViewerSession } from "@/lib/supabase/sessionError";
import { useLanguage } from "@/lib/i18n";
import { widgetOverlayUrl } from "@/lib/widgetOverlayUrl";
import { STANDALONE_TOOLS } from "@/lib/standaloneTools";
import { WIDGET_LABEL, WIDGET_TYPES, type WidgetType } from "@/lib/widgets";
import { DarkSelect } from "@/components/ui/dark-select";

const TIKTOK_COMING_SOON: WidgetType[] = ["TIKTOK_TAPPERS", "TIKTOK_TAP_GOAL"];

const TOOL_VISUAL: Record<
  (typeof STANDALONE_TOOLS)[number]["slug"],
  { icon: LucideIcon; preview: () => ReactElement }
> = {
  "kicks-goal": { icon: Coins, preview: KicksGoalPreview },
  "viewer-counter": { icon: Users, preview: ViewerCounterPreview },
  wheel: { icon: Disc3, preview: WheelPreview },
  "event-labels": { icon: Tags, preview: EventLabelsPreview },
};
const CREATABLE_WIDGET_TYPES = WIDGET_TYPES.filter(
  (entry) => !TIKTOK_COMING_SOON.includes(entry.value),
);

export const Route = createFileRoute("/_authenticated/widgets/")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Widget Hub" },
      {
        name: "description",
        content:
          "Create and manage OBS widgets: subathon timers, goal bars, alert boxes, activity feeds and spin wheels.",
      },
      { property: "og:title", content: "CylixStudio — Widget Hub" },
      {
        property: "og:description",
        content: "All your browser-source widgets with one-click OBS URLs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WidgetHub,
});

function WidgetHub() {
  const { t } = useLanguage();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: workspace } = useWorkspace(user.id);
  const { data, isLoading } = useWidgets();
  const [type, setType] = useState<WidgetType>("SUBATHON_TIMER");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const subathonId = workspace?.subathons[0]?.id ?? null;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["widgets"] });

  const create = useMutation({
    mutationFn: () => {
      if (TIKTOK_COMING_SOON.includes(type)) {
        throw new Error("TikTok overlays are Coming Soon until OAuth is ready.");
      }
      return createWidget({
        userId: user.id,
        subathonId,
        type,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
    },
    onError: (err: unknown) => {
      const message = widgetErrorText(err, "Could not create this widget.");
      setError(message);
      if (!isMissingViewerSession(message)) toast.error(message);
    },
    onSuccess: async (widget) => {
      setError(null);
      setName("");
      await invalidate();
      navigate({ to: "/widgets/$widgetId", params: { widgetId: widget.id } });
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error: writeError } = await supabase
        .from("widgets")
        .update({ is_enabled: enabled })
        .eq("id", id);
      if (writeError) throw writeError;
    },
    onError: (err: unknown) => {
      const message = widgetErrorText(err, "Could not update this widget.");
      setError(message);
      if (!isMissingViewerSession(message)) toast.error(message);
    },
    onSuccess: () => void invalidate(),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: writeError } = await supabase.from("widgets").delete().eq("id", id);
      if (writeError) throw writeError;
    },
    onError: (err: unknown) => {
      const message = widgetErrorText(err, "Could not delete this widget.");
      setError(message);
      if (!isMissingViewerSession(message)) toast.error(message);
    },
    onSuccess: () => void invalidate(),
  });

  const copyUrl = async (token: string, enabled: boolean) => {
    if (!enabled) {
      toast.error("Enable the widget before copying an OBS URL.");
      return;
    }
    const url = widgetOverlayUrl(window.location.origin, token);
    await navigator.clipboard.writeText(url);
    setCopied(token);
    toast.success("OBS URL copied");
    setTimeout(() => setCopied(null), 1500);
  };

  const fieldClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  const featuredIds = new Set(
    STANDALONE_TOOLS.flatMap((tool) => {
      const match = data?.widgets.find((widget) => widget.type === tool.type);
      return match ? [match.id] : [];
    }),
  );
  const otherWidgets = (data?.widgets ?? []).filter((widget) => !featuredIds.has(widget.id));

  return (
    <AppShell
      user={user}
      profile={workspace?.profile}
      subathons={workspace?.subathons ?? []}
      title="Widget hub"
      subtitle="Every widget gets its own OBS browser-source URL."
    >
      <SessionAwareError error={error} signedOutLabel={t("widget.signedOut")} />

      <section className="mb-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
        {STANDALONE_TOOLS.map((tool) => {
          const existing = data?.widgets.find((widget) => widget.type === tool.type) ?? null;
          const visual = TOOL_VISUAL[tool.slug];
          const Preview = visual.preview;
          return (
            <ToolCard
              key={tool.slug}
              name={t(tool.nameKey)}
              description={t(tool.descriptionKey)}
              category={t("nav.tools")}
              icon={visual.icon}
              preview={<Preview />}
              status={
                existing?.is_enabled
                  ? t("home.status.live")
                  : existing
                    ? t("home.status.paused")
                    : t("home.status.ready")
              }
              live={Boolean(existing?.is_enabled)}
              publicToken={existing?.is_enabled ? existing.public_token : undefined}
              disabled={opening === tool.slug}
              actionLabel={
                opening === tool.slug
                  ? t("home.action.opening")
                  : existing
                    ? t("home.action.customize")
                    : t("home.action.open")
              }
              onOpen={() => {
                if (existing) {
                  void navigate({ to: "/widgets/$widgetId", params: { widgetId: existing.id } });
                  return;
                }
                if (isLoading) return;
                setOpening(tool.slug);
                setError(null);
                void createWidget({
                  userId: user.id,
                  subathonId,
                  type: tool.type,
                  name: tool.name,
                })
                  .then(async (widget) => {
                    await invalidate();
                    await navigate({ to: "/widgets/$widgetId", params: { widgetId: widget.id } });
                  })
                  .catch((err: unknown) => {
                    const message = widgetErrorText(err, "Could not open this widget.");
                    setError(message);
                    if (!isMissingViewerSession(message)) toast.error(message);
                  })
                  .finally(() => setOpening(null));
              }}
              onDelete={
                existing
                  ? () => setPendingDelete({ id: existing.id, name: t(tool.nameKey) })
                  : undefined
              }
            />
          );
        })}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Quick create
        </h2>
        <form
          className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label>
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Widget type
            </span>
            <DarkSelect
              className="mt-2"
              value={type}
              onValueChange={(next) => setType(next as WidgetType)}
              options={CREATABLE_WIDGET_TYPES.map((entry) => ({
                value: entry.value,
                label: `${entry.label} — ${entry.hint}`,
              }))}
            />
          </label>
          <label>
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Name
            </span>
            <input
              className={`${fieldClass} mt-2`}
              placeholder={WIDGET_LABEL[type]}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {create.isPending ? "Creating…" : "Create widget"}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading widgets…</p>
        ) : otherWidgets.length > 0 ? (
          otherWidgets.map((widget) => {
            const goal = (data?.goals ?? []).find((entry) => entry.widget_id === widget.id);
            return (
              <article key={widget.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{widget.name}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-primary">
                      {WIDGET_LABEL[widget.type]}
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={widget.is_enabled}
                      onChange={(event) =>
                        toggle.mutate({ id: widget.id, enabled: event.target.checked })
                      }
                    />
                    <span className="relative h-6 w-11 rounded-full bg-secondary transition-colors peer-checked:bg-primary after:absolute after:start-1 after:top-1 after:size-4 after:rounded-full after:bg-foreground after:transition-transform peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5" />
                  </label>
                </div>

                {goal ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {goal.current_value} / {goal.target_value} {goal.unit}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link
                    to="/widgets/$widgetId"
                    params={{ widgetId: widget.id }}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={!widget.is_enabled}
                    title={
                      widget.is_enabled
                        ? "Copy OBS browser-source URL"
                        : "Enable the widget to copy an OBS URL"
                    }
                    onClick={() => void copyUrl(widget.public_token, widget.is_enabled)}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copied === widget.public_token ? (
                      <Check className="size-4" aria-hidden />
                    ) : (
                      <Copy className="size-4" aria-hidden />
                    )}
                    OBS URL
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${widget.name}`}
                    onClick={() => remove.mutate(widget.id)}
                    className="ms-auto rounded-lg border border-border p-2 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            No widgets yet — create your first one above.
          </p>
        )}
      </section>
      {pendingDelete ? (
        <DeleteWidgetDialog
          widgetName={pendingDelete.name}
          pending={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
          }}
        />
      ) : null}
    </AppShell>
  );
}
