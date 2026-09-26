import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Bookmark,
  CalendarDays,
  ChevronsLeft,
  CreditCard,
  Hash,
  Home,
  LogOut,
  MessageSquareCode,
  Link2,
  Scissors,
  Settings,
} from "lucide-react";

import { StreamlabsBridge } from "@/components/layout/StreamlabsBridge";
import { StreamElementsBridge } from "@/components/layout/StreamElementsBridge";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { disableTestMode, isTestMode } from "@/lib/testMode";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import type { Subathon } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  user: { email?: string | undefined; id: string };
  profile?: { name: string | null; image: string | null } | null | undefined;
  subathons?: Subathon[];
  activeSubathonId?: string | null;
};

const SIDEBAR_KEY = "creovix:sidebar-collapsed";
const EXPANDED_W = "16.5rem";
const COLLAPSED_W = "4.75rem";

/** Live sidebar destinations only — unfinished tools stay off the nav until ready. */
const NAV = [
  { to: "/subscription" as const, icon: CreditCard, labelKey: "nav.subscription" },
  { to: "/dashboard" as const, icon: Home, labelKey: "nav.home" },
  { to: "/analytics" as const, icon: BarChart3, labelKey: "nav.analytics" },
  { to: "/activity-feed" as const, icon: Activity, labelKey: "nav.activity" },
  { to: "/custom-commands" as const, icon: MessageSquareCode, labelKey: "nav.chatCommands" },
  { to: "/link-in-bio" as const, icon: Link2, labelKey: "nav.linkInBio" },
  { to: "/live-counter" as const, icon: Hash, labelKey: "nav.counter" },
  { to: "/clip-command" as const, icon: Scissors, labelKey: "nav.clipCommand" },
  { to: "/schedule" as const, icon: CalendarDays, labelKey: "nav.schedule" },
  { to: "/mark-points" as const, icon: Bookmark, labelKey: "nav.markPoints" },
] as const satisfies ReadonlyArray<{
  to: string;
  icon: typeof Home;
  labelKey: TranslationKey;
}>;

const menuSurface = "absolute z-50 min-w-44 rounded-xl border p-1.5";
const menuSurfaceStyle = {
  background: "rgba(10, 10, 10, 0.95)",
  backdropFilter: "blur(12px)",
  borderColor: "rgba(255, 255, 255, 0.1)",
  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.55)",
} as const;

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

function IconTip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: ReactNode;
}) {
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="left" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppShell({ children, title, subtitle, actions, user, profile }: AppShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useClickOutside(() => setProfileOpen(false));

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    disableTestMode();
    if (isSupabaseConfigured()) await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  const initials = (profile?.name?.trim() || "CY").slice(0, 2).toUpperCase();
  const menuItem =
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[0.8rem] transition-colors";
  const sidebarW = collapsed ? COLLAPSED_W : EXPANDED_W;

  const navBtn = (active: boolean) =>
    cn(
      "group relative flex w-full items-center rounded-xl border text-[0.82rem] transition-colors",
      collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
      active
        ? "border-[#bee1fc]/50 bg-[#bee1fc]/20 text-foreground"
        : "border-transparent text-muted-foreground hover:bg-[oklch(1_0_0/0.06)] hover:text-foreground",
    );

  return (
    <TooltipProvider delayDuration={80}>
      <div className="ambient-field min-h-screen bg-background text-foreground">
        {isTestMode() ? null : (
          <>
            <StreamlabsBridge userId={user.id} />
            <StreamElementsBridge userId={user.id} />
          </>
        )}

        <aside
          className="fixed inset-y-0 start-0 z-40 flex flex-col border-e border-[rgba(255,255,255,0.1)] transition-[width] duration-200 ease-out"
          style={{
            width: sidebarW,
            background: "rgba(10, 10, 10, 0.92)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45)",
          }}
        >
          <div className={cn("flex items-center gap-2 border-b border-white/10 px-3 py-3", collapsed && "justify-center")}>
            <Link
              to="/dashboard"
              className={cn("flex min-w-0 items-center gap-2", collapsed && "justify-center")}
              aria-label="CylixStudio home"
            >
              {collapsed ? (
                <BrandLogo markOnly size="sm" title="CylixStudio" />
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <BrandLogo showWordmark size="sm" />
                  <span
                    className={cn(
                      "shrink-0 rounded-md border border-primary/35 bg-primary/10",
                      "px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase leading-none tracking-[0.14em]",
                      "text-primary",
                    )}
                  >
                    Beta
                  </span>
                </span>
              )}
            </Link>
            {collapsed ? null : (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={t("nav.collapseSidebar")}
                className="ms-auto grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <ChevronsLeft className="size-4 rtl:rotate-180" />
              </button>
            )}
          </div>

          {collapsed ? (
            <div className="flex justify-center py-2">
              <IconTip label={t("nav.expandSidebar")} collapsed>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label={t("nav.expandSidebar")}
                  className="grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  <ChevronsLeft className="size-4 rotate-180 rtl:rotate-0" />
                </button>
              </IconTip>
            </div>
          ) : null}

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to;
              const label = t(item.labelKey);
              return (
                <IconTip key={item.to} label={label} collapsed={collapsed}>
                  <Link to={item.to} className={navBtn(active)} aria-current={active ? "page" : undefined}>
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {collapsed ? null : <span className="truncate">{label}</span>}
                  </Link>
                </IconTip>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2 border-t border-white/10 px-2 py-3">
            <div ref={profileRef} className="relative">
              <IconTip label={t("nav.profile")} collapsed={collapsed}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((open) => !open)}
                  aria-label={t("nav.profile")}
                  aria-expanded={profileOpen}
                  dir="ltr"
                  className={cn(
                    "flex w-full items-center rounded-xl transition-colors hover:bg-white/5",
                    collapsed ? "justify-center p-1" : "gap-2.5 px-2 py-1.5",
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-[oklch(1_0_0/0.12)]">
                    {profile?.image ? (
                      <img src={profile.image} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <span className="grid size-full place-items-center bg-secondary text-[0.65rem] font-semibold">
                        {initials}
                      </span>
                    )}
                  </span>
                  {collapsed ? null : (
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-xs font-semibold">
                        {profile?.name ?? "CylixStudio"}
                      </span>
                    </span>
                  )}
                </button>
              </IconTip>

              {profileOpen ? (
                <div
                  className={cn(
                    menuSurface,
                    "min-w-60",
                    collapsed ? "start-full bottom-0 ms-2" : "start-0 bottom-full mb-2",
                  )}
                  style={menuSurfaceStyle}
                  role="menu"
                >
                  <div className="px-3 py-2.5 text-left" dir="ltr">
                    <p className="text-[0.82rem] font-semibold">{profile?.name ?? "CylixStudio"}</p>
                  </div>
                  <div className="my-1 border-t border-[rgba(255,255,255,0.08)]" />
                  <button
                    type="button"
                    role="menuitem"
                    dir="rtl"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate({ to: "/settings" });
                    }}
                    className={`${menuItem} flex-row text-muted-foreground hover:bg-[oklch(1_0_0/0.06)] hover:text-foreground`}
                  >
                    <Settings className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 text-start">{t("nav.settings")}</span>
                  </button>
                  <div className="my-1 border-t border-[rgba(255,255,255,0.08)]" />
                  <button
                    type="button"
                    role="menuitem"
                    dir="rtl"
                    onClick={() => void signOut()}
                    className={`${menuItem} flex-row text-red-500 hover:bg-[rgba(239,68,68,0.15)]`}
                  >
                    <LogOut className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 text-start">{t("nav.signOut")}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div
          className="min-h-screen min-w-0 transition-[padding] duration-200 ease-out"
          style={{ paddingInlineStart: sidebarW }}
        >
          <div className="mx-auto w-full max-w-[1800px] px-4 pb-16 pt-8 md:px-8">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 text-start">
                <h1 className="text-[1.6rem] font-semibold tracking-tight">{title}</h1>
                {subtitle ? <div className="mt-1 text-start text-sm text-muted-foreground">{subtitle}</div> : null}
              </div>
              {actions ? <div className="flex items-center justify-end gap-2 pe-1 sm:pe-2">{actions}</div> : null}
            </div>
            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
