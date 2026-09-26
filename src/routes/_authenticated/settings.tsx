import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { AdminCodesPanel } from "@/components/settings/AdminCodesPanel";
import { ConnectionsPanel } from "@/components/settings/ConnectionsPanel";
import { EventTestPanel } from "@/components/settings/EventTestPanel";
import { SettingsBackupPanel } from "@/components/settings/SettingsBackupPanel";
import { SubscriptionPanel } from "@/components/settings/SubscriptionPanel";
import { useIsAdmin } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

type SettingsSearch = {
  connected?: string | undefined;
  setup?: string | undefined;
};

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    connected: typeof search["connected"] === "string" ? search["connected"] : undefined,
    setup: typeof search["setup"] === "string" ? search["setup"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "CylixStudio — Settings" },
      {
        name: "description",
        content: "Manage platform connections, your creator profile and account backup.",
      },
      { property: "og:title", content: "CylixStudio — Settings" },
      {
        property: "og:description",
        content: "Connections, profile and account backup in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const BASE_TABS = [
  { id: "Profile", label: "settings.tab.profile" },
  { id: "Connections", label: "settings.tab.connections" },
] as const satisfies ReadonlyArray<{ id: string; label: TranslationKey }>;

const ADMIN_TABS = [
  { id: "Admin", label: "settings.tab.admin" },
  { id: "Test", label: "settings.tab.test" },
] as const satisfies ReadonlyArray<{ id: string; label: TranslationKey }>;

type Tab = (typeof BASE_TABS)[number]["id"] | (typeof ADMIN_TABS)[number]["id"];

function initialTab(search: SettingsSearch): Tab {
  if (search.setup === "connections" || search.connected) return "Connections";
  if (search.setup === "subscription") return "Profile";
  return "Profile";
}

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const { data } = useWorkspace(user.id);
  const isAdmin = useIsAdmin(user.id);
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>(() => initialTab(search));
  const [emailVisible, setEmailVisible] = useState(false);

  const tabs = isAdmin.data ? [...BASE_TABS, ...ADMIN_TABS] : [...BASE_TABS];

  return (
    <AppShell
      user={user}
      profile={data?.profile}
      title={t("settings.title")}
      subtitle={t("settings.subtitle")}
    >
      <div className="mb-8 inline-flex flex-wrap gap-1 rounded-full border border-white/5 p-1">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-full px-4 py-1.5 text-[0.8rem] font-medium transition-colors ${
              tab === entry.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(entry.label)}
          </button>
        ))}
      </div>

      {tab === "Admin" && isAdmin.data ? <AdminCodesPanel /> : null}

      {tab === "Test" && isAdmin.data ? <EventTestPanel /> : null}

      {tab === "Connections" ? <ConnectionsPanel userId={user.id} /> : null}

      {tab === "Profile" ? (
        <section className="max-w-2xl">
          <h2 className="text-[0.95rem] font-semibold">{t("settings.profile.heading")}</h2>
          <div className="mt-6 divide-y divide-white/5 border-y border-white/5">
            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-[0.8rem] text-muted-foreground">{t("settings.profile.name")}</p>
              <p className="text-sm font-medium" dir="auto">{data?.profile?.name ?? "CylixStudio"}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-[0.8rem] text-muted-foreground">{t("settings.profile.email")}</p>
              <div className="flex items-center gap-2" dir="ltr">
                <p className="font-mono text-sm tracking-wide">
                  {emailVisible ? (user.email ?? "—") : "••••••••••"}
                </p>
                <button
                  type="button"
                  onClick={() => setEmailVisible((visible) => !visible)}
                  className="grid size-8 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground"
                  aria-pressed={emailVisible}
                  aria-label={emailVisible ? t("settings.profile.hideEmail") : t("settings.profile.showEmail")}
                >
                  {emailVisible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-3 py-4">
              <p className="text-[0.8rem] text-muted-foreground">{t("settings.profile.login")}</p>
              <p className="max-w-sm text-end text-[0.8rem] text-muted-foreground">
                {t("settings.profile.loginHint")}
              </p>
            </div>
            <SubscriptionPanel userId={user.id} />
          </div>
          <div className="mt-10 border-t border-white/5 pt-8">
            <SettingsBackupPanel />
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
