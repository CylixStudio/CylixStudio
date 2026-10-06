import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { StudioPageTabs } from "@/components/layout/StudioPageTabs";
import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { DarkSelect } from "@/components/ui/dark-select";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { SIGNED_OUT_ERROR, isMissingViewerSession } from "@/lib/supabase/sessionError";
import { isTestMode } from "@/lib/testMode";

type Tab = "ranking" | "shop" | "sales";

type Member = {
  id: string;
  display_name: string;
  level: number;
  points: number;
  watch_seconds: number;
};

type ShopItem = {
  id: string;
  name: string;
  description: string;
  cost: number;
  enabled: boolean;
};

type Sale = {
  id: string;
  member_id: string | null;
  item_name: string;
  points: number;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/loyalty")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Loyalty" },
      { name: "description", content: "Loyalty ranking, shop, and sales log." },
    ],
  }),
  component: LoyaltyPage,
});

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-primary";

function LoyaltyPage() {
  const { user } = Route.useRouteContext();
  const { t, lang } = useLanguage();
  const workspace = useWorkspace(user?.id ?? "");
  const guest = isTestMode();
  const [tab, setTab] = useState<Tab>("ranking");
  const queryClient = useQueryClient();

  const members = useQuery({
    queryKey: ["loyalty-members", user?.id],
    enabled: !guest && Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_members")
        .select("id, display_name, level, points, watch_seconds")
        .order("points", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const shop = useQuery({
    queryKey: ["loyalty-shop", user?.id],
    enabled: !guest && Boolean(user?.id) && tab === "shop",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_shop_items")
        .select("id, name, description, cost, enabled")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShopItem[];
    },
  });

  const sales = useQuery({
    queryKey: ["loyalty-sales", user?.id],
    enabled: !guest && Boolean(user?.id) && tab === "sales",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_sales")
        .select("id, member_id, item_name, points, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sale[];
    },
  });

  const blocked =
    guest ||
    isMissingViewerSession(members.error) ||
    isMissingViewerSession(shop.error) ||
    isMissingViewerSession(sales.error);

  return (
    <AppShell
      user={user}
      profile={workspace.data?.profile}
      title={t("loyalty.title")}
      subtitle={t("loyalty.subtitle")}
    >
      <StudioPageTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "ranking", label: t("loyalty.tab.ranking") },
          { id: "shop", label: t("loyalty.tab.shop") },
          { id: "sales", label: t("loyalty.tab.sales") },
        ]}
      />

      {blocked ? (
        <SessionAwareError error={SIGNED_OUT_ERROR} signedOutLabel={t("loyalty.signedOut")} />
      ) : tab === "ranking" ? (
        <RankingTab
          rows={members.data ?? []}
          loading={members.isLoading}
          error={members.error}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ["loyalty-members", user?.id] })}
        />
      ) : tab === "shop" ? (
        <ShopTab
          rows={shop.data ?? []}
          loading={shop.isLoading}
          error={shop.error}
          userId={user.id}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ["loyalty-shop", user?.id] })}
        />
      ) : (
        <SalesTab
          rows={sales.data ?? []}
          members={members.data ?? []}
          loading={sales.isLoading}
          error={sales.error}
          lang={lang}
        />
      )}
    </AppShell>
  );
}

function RankingTab({
  rows,
  loading,
  error,
  onChanged,
}: {
  rows: Member[];
  loading: boolean;
  error: unknown;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Member | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null);

  const ranked = useMemo(() => {
    const ordered = rows.map((row, index) => ({ ...row, rank: index + 1 }));
    const needle = query.trim().toLowerCase();
    return needle ? ordered.filter((row) => row.display_name.toLowerCase().includes(needle)) : ordered;
  }, [query, rows]);

  const pageCount = Math.max(1, Math.ceil(ranked.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = ranked.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: writeError } = await supabase.from("loyalty_members").delete().eq("id", id);
      if (writeError) throw writeError;
    },
    onSuccess: () => {
      setPendingDelete(null);
      onChanged();
    },
  });

  if (loading) return <p className="text-sm text-muted-foreground">{t("loyalty.loading")}</p>;
  if (error && !isMissingViewerSession(error)) {
    return <p className="text-sm text-amber-200/90">{t("loyalty.loadFailed")}</p>;
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950 p-4">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("loyalty.search")}
          </span>
          <input
            className={`${fieldClass} mt-2`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("loyalty.rows")}
          </span>
          <DarkSelect
            className="mt-2 w-28"
            value={String(pageSize)}
            onValueChange={(next) => {
              setPageSize(Number(next));
              setPage(0);
            }}
            options={[10, 25, 50].map((size) => ({ value: String(size), label: String(size) }))}
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("loyalty.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-start text-sm">
            <thead className="text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">{t("loyalty.col.rank")}</th>
                <th className="px-2 py-2 font-medium">{t("loyalty.col.name")}</th>
                <th className="px-2 py-2 font-medium">{t("loyalty.col.level")}</th>
                <th className="px-2 py-2 font-medium">{t("loyalty.col.points")}</th>
                <th className="px-2 py-2 font-medium">{t("loyalty.col.watch")}</th>
                <th className="px-2 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-white/5">
                  <td className="px-2 py-2 tabular-nums">{row.rank}</td>
                  <td className="px-2 py-2">{row.display_name}</td>
                  <td className="px-2 py-2 tabular-nums">{row.level}</td>
                  <td className="px-2 py-2 tabular-nums">{row.points}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {t("loyalty.watchValue", {
                      hours: Math.floor(row.watch_seconds / 3600),
                      minutes: Math.floor((row.watch_seconds % 3600) / 60),
                    })}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="text-xs text-primary" onClick={() => setEditing(row)}>
                        {t("loyalty.edit")}
                      </button>
                      <button type="button" className="text-xs text-red-400" onClick={() => setPendingDelete(row)}>
                        {t("loyalty.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("loyalty.page", { page: safePage + 1, pages: pageCount })}</span>
        <div className="flex gap-2">
          <button type="button" disabled={safePage === 0} className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40" onClick={() => setPage((value) => Math.max(0, value - 1))}>
            {t("loyalty.prev")}
          </button>
          <button type="button" disabled={safePage >= pageCount - 1} className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40" onClick={() => setPage((value) => value + 1)}>
            {t("loyalty.next")}
          </button>
        </div>
      </div>

      {editing ? (
        <MemberDialog
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          title={t("loyalty.confirmDelete")}
          pending={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => remove.mutate(pendingDelete.id)}
        />
      ) : null}
    </section>
  );
}

function MemberDialog({
  member,
  onClose,
  onSaved,
}: {
  member: Member;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(member.display_name);
  const [level, setLevel] = useState(String(member.level));
  const [points, setPoints] = useState(String(member.points));
  const [watch, setWatch] = useState(String(member.watch_seconds));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { error: writeError } = await supabase
        .from("loyalty_members")
        .update({
          display_name: name.trim(),
          level: Math.max(1, Number(level) || 1),
          points: Math.max(0, Number(points) || 0),
          watch_seconds: Math.max(0, Number(watch) || 0),
        })
        .eq("id", member.id);
      if (writeError) throw writeError;
    },
    onSuccess: onSaved,
    onError: () => setError(t("loyalty.saveFailed")),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <form
        className="glass-3d w-full max-w-md space-y-3 rounded-2xl p-5"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="text-base font-medium">{t("loyalty.edit")}</h2>
        <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required />
        <input className={fieldClass} inputMode="numeric" value={level} onChange={(event) => setLevel(event.target.value)} />
        <input className={fieldClass} inputMode="numeric" value={points} onChange={(event) => setPoints(event.target.value)} />
        <input className={fieldClass} inputMode="numeric" value={watch} onChange={(event) => setWatch(event.target.value)} />
        {error ? <p className="text-xs text-amber-200/90">{error}</p> : null}
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={onClose}>
            {t("loyalty.cancel")}
          </button>
          <button type="submit" disabled={save.isPending} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
            {t("loyalty.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ShopTab({
  rows,
  loading,
  error,
  userId,
  onChanged,
}: {
  rows: ShopItem[];
  loading: boolean;
  error: unknown;
  userId: string;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [cost, setCost] = useState("100");
  const [notice, setNotice] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      const { error: writeError } = await supabase.from("loyalty_shop_items").insert({
        user_id: userId,
        name: name.trim(),
        description: "",
        cost: Math.max(0, Number(cost) || 0),
        enabled: true,
      });
      if (writeError) throw writeError;
    },
    onSuccess: () => {
      setName("");
      setNotice(null);
      onChanged();
    },
    onError: (err: { code?: string }) => {
      setNotice(err.code === "23505" ? t("loyalty.duplicate") : t("loyalty.saveFailed"));
    },
  });

  const toggle = useMutation({
    mutationFn: async (item: ShopItem) => {
      const { error: writeError } = await supabase
        .from("loyalty_shop_items")
        .update({ enabled: !item.enabled })
        .eq("id", item.id);
      if (writeError) throw writeError;
    },
    onSuccess: onChanged,
  });

  if (loading) return <p className="text-sm text-muted-foreground">{t("loyalty.loading")}</p>;
  if (error && !isMissingViewerSession(error)) {
    return <p className="text-sm text-amber-200/90">{t("loyalty.loadFailed")}</p>;
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950 p-4">
      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          add.mutate();
        }}
      >
        <label className="min-w-[12rem] flex-1">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("loyalty.shop.name")}
          </span>
          <input className={`${fieldClass} mt-2`} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="w-28">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("loyalty.shop.cost")}
          </span>
          <input className={`${fieldClass} mt-2`} inputMode="numeric" value={cost} onChange={(event) => setCost(event.target.value)} />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          {t("loyalty.shop.add")}
        </button>
      </form>
      {notice ? <p className="mb-3 text-xs text-amber-200/90">{notice}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("loyalty.shop.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{t("loyalty.shop.cost")}: {item.cost}</p>
              </div>
              <button type="button" className="text-xs text-primary" onClick={() => toggle.mutate(item)}>
                {item.enabled ? t("loyalty.shop.enabled") : t("loyalty.shop.disabled")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SalesTab({
  rows,
  members,
  loading,
  error,
  lang,
}: {
  rows: Sale[];
  members: Member[];
  loading: boolean;
  error: unknown;
  lang: string;
}) {
  const { t } = useLanguage();
  const names = useMemo(() => new Map(members.map((member) => [member.id, member.display_name])), [members]);
  if (loading) return <p className="text-sm text-muted-foreground">{t("loyalty.loading")}</p>;
  if (error && !isMissingViewerSession(error)) {
    return <p className="text-sm text-amber-200/90">{t("loyalty.loadFailed")}</p>;
  }
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("loyalty.sales.empty")}</p>;
  return (
    <section className="overflow-x-auto rounded-2xl border border-white/10 bg-zinc-950 p-4">
      <table className="w-full min-w-[36rem] text-start text-sm">
        <thead className="text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
          <tr>
            <th className="px-2 py-2 font-medium">{t("loyalty.sales.who")}</th>
            <th className="px-2 py-2 font-medium">{t("loyalty.sales.item")}</th>
            <th className="px-2 py-2 font-medium">{t("loyalty.sales.points")}</th>
            <th className="px-2 py-2 font-medium">{t("loyalty.sales.when")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-white/5">
              <td className="px-2 py-2">{row.member_id ? (names.get(row.member_id) ?? "—") : "—"}</td>
              <td className="px-2 py-2">{row.item_name}</td>
              <td className="px-2 py-2 tabular-nums">{row.points}</td>
              <td className="px-2 py-2" dir="ltr">
                {new Date(row.created_at).toLocaleString(lang === "ar" ? "ar" : "en-US")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ConfirmDialog({
  title,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onCancel}>
      <div className="glass-3d w-full max-w-sm rounded-2xl p-5" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm">{title}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={onCancel}>
            {t("loyalty.cancel")}
          </button>
          <button type="button" disabled={pending} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white" onClick={onConfirm}>
            {t("loyalty.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
