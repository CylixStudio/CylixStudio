import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

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
  is_active: boolean;
  image_url: string | null;
  stock: number | null;
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
  const { t } = useLanguage();
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
        .select("id, name, description, cost, enabled, is_active, image_url, stock")
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

      {tab === "shop" ? (
        <ShopTab
          rows={blocked ? [] : (shop.data ?? [])}
          loading={!blocked && shop.isLoading}
          error={blocked ? null : shop.error}
          userId={user?.id ?? ""}
          guest={blocked}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ["loyalty-shop", user?.id] })}
        />
      ) : blocked ? (
        <SessionAwareError error={SIGNED_OUT_ERROR} signedOutLabel={t("loyalty.signedOut")} />
      ) : tab === "ranking" ? (
        <RankingTab
          rows={members.data ?? []}
          loading={members.isLoading}
          error={members.error}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ["loyalty-members", user?.id] })}
        />
      ) : (
        <SalesTab
          rows={sales.data ?? []}
          members={members.data ?? []}
          loading={sales.isLoading || members.isLoading}
          error={sales.error}
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

const SHOP_BUCKET = "loyalty-shop";

type ShopDraft = {
  name: string;
  description: string;
  cost: string;
  stock: string;
  imageUrl: string;
  file: File | null;
  active: boolean;
};

const emptyShopDraft = (): ShopDraft => ({
  name: "",
  description: "",
  cost: "100",
  stock: "",
  imageUrl: "",
  file: null,
  active: true,
});

function ShopTab({
  rows,
  loading,
  error,
  userId,
  guest,
  onChanged,
}: {
  rows: ShopItem[];
  loading: boolean;
  error: unknown;
  userId: string;
  guest: boolean;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<ShopDraft>(emptyShopDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ShopItem | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (guest || isTestMode()) throw new Error(SIGNED_OUT_ERROR);
      const imageUrl = await resolveShopImage(draft, userId);
      const stock = draft.stock.trim() === "" ? null : Math.max(0, Math.round(Number(draft.stock) || 0));
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim().slice(0, 400),
        cost: Math.max(0, Math.round(Number(draft.cost) || 0)),
        stock,
        image_url: imageUrl,
        is_active: draft.active,
        enabled: draft.active,
      };
      if (editingId) {
        const { error: writeError } = await supabase
          .from("loyalty_shop_items")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", userId);
        if (writeError) throw writeError;
        return;
      }
      const { error: writeError } = await supabase.from("loyalty_shop_items").insert({
        user_id: userId,
        ...payload,
      });
      if (writeError) throw writeError;
    },
    onSuccess: () => {
      setDraft(emptyShopDraft());
      setEditingId(null);
      setNotice(null);
      onChanged();
    },
    onError: (err: { code?: string; message?: string }) => {
      if (isMissingViewerSession(err) || err.message === SIGNED_OUT_ERROR) {
        setNotice(SIGNED_OUT_ERROR);
        return;
      }
      setNotice(err.code === "23505" ? t("loyalty.duplicate") : t("loyalty.saveFailed"));
    },
  });

  const remove = useMutation({
    mutationFn: async (item: ShopItem) => {
      if (guest || isTestMode()) throw new Error(SIGNED_OUT_ERROR);
      const { error: writeError } = await supabase.from("loyalty_shop_items").delete().eq("id", item.id).eq("user_id", userId);
      if (writeError) throw writeError;
    },
    onSuccess: () => {
      setPendingDelete(null);
      onChanged();
    },
    onError: (err: { message?: string }) => {
      setPendingDelete(null);
      setNotice(isMissingViewerSession(err) || err.message === SIGNED_OUT_ERROR ? SIGNED_OUT_ERROR : t("loyalty.saveFailed"));
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    save.mutate();
  };

  const startEdit = (item: ShopItem) => {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      description: item.description,
      cost: String(item.cost),
      stock: item.stock == null ? "" : String(item.stock),
      imageUrl: item.image_url ?? "",
      file: null,
      active: item.is_active,
    });
  };

  if (loading) return <p className="text-sm text-muted-foreground">{t("loyalty.loading")}</p>;
  if (error && !isMissingViewerSession(error)) {
    return <p className="text-sm text-amber-200/90">{t("loyalty.loadFailed")}</p>;
  }

  return (
    <section className="space-y-4">
      <form className="space-y-3 rounded-2xl border border-white/10 bg-zinc-950 p-4" onSubmit={onSubmit}>
        <SessionAwareError error={notice} signedOutLabel={t("loyalty.signedOut")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("loyalty.shop.name")}</span>
            <input className={`${fieldClass} mt-2`} value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
          </label>
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("loyalty.shop.cost")}</span>
            <input className={`${fieldClass} mt-2`} inputMode="numeric" value={draft.cost} onChange={(event) => setDraft((prev) => ({ ...prev, cost: event.target.value }))} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("loyalty.shop.description")}</span>
            <textarea className={`${fieldClass} mt-2 min-h-20`} value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} />
          </label>
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("loyalty.shop.stock")}</span>
            <input className={`${fieldClass} mt-2`} inputMode="numeric" value={draft.stock} onChange={(event) => setDraft((prev) => ({ ...prev, stock: event.target.value }))} />
          </label>
          <label className="block">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("loyalty.shop.status")}</span>
            <DarkSelect
              className="mt-2 w-full"
              aria-label={t("loyalty.shop.status")}
              value={draft.active ? "active" : "stopped"}
              onValueChange={(next) => setDraft((prev) => ({ ...prev, active: next === "active" }))}
              options={[
                { value: "active", label: t("loyalty.shop.available") },
                { value: "stopped", label: t("loyalty.shop.stopped") },
              ]}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("loyalty.shop.image")}</span>
            <input
              className={`${fieldClass} mt-2`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setDraft((prev) => ({ ...prev, file: event.target.files?.[0] ?? null }))}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("loyalty.shop.imageUrl")}</span>
            <input className={`${fieldClass} mt-2`} value={draft.imageUrl} onChange={(event) => setDraft((prev) => ({ ...prev, imageUrl: event.target.value }))} />
          </label>
        </div>
        <div className="flex gap-2">
          {editingId ? (
            <button
              type="button"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyShopDraft());
              }}
            >
              {t("loyalty.cancel")}
            </button>
          ) : null}
          <button type="submit" disabled={save.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            {editingId ? t("loyalty.save") : t("loyalty.shop.add")}
          </button>
        </div>
      </form>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("loyalty.shop.empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((item) => (
            <li key={item.id} className="rounded-2xl border border-white/10 bg-zinc-950 p-3">
              <ShopImage url={item.image_url} alt={item.name} emptyLabel={t("loyalty.shop.noImage")} />
              <p className="mt-3 text-sm font-medium">{item.name}</p>
              {item.description ? <p className="mt-1 text-xs text-muted-foreground">{item.description}</p> : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {t("loyalty.shop.cost")}: {item.cost}
              </p>
              <button
                type="button"
                className="mt-1 font-mono text-xs text-primary"
                dir="ltr"
                onClick={() => {
                  void navigator.clipboard.writeText(`!buy ${item.name}`);
                  toast.success(t("loyalty.shop.copied"));
                }}
              >
                !buy {item.name}
              </button>
              <p className="text-xs text-muted-foreground">
                {t("loyalty.shop.stock")}: {item.stock == null ? t("loyalty.shop.unlimited") : item.stock}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.is_active ? t("loyalty.shop.available") : t("loyalty.shop.stopped")}
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="text-xs text-primary" onClick={() => startEdit(item)}>
                  {t("loyalty.edit")}
                </button>
                <button type="button" className="text-xs text-red-300" onClick={() => setPendingDelete(item)}>
                  {t("loyalty.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pendingDelete ? (
        <ConfirmDialog
          title={pendingDelete.name}
          pending={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => remove.mutate(pendingDelete)}
        />
      ) : null}
    </section>
  );
}

async function resolveShopImage(draft: ShopDraft, userId: string): Promise<string | null> {
  if (draft.file) {
    const ext = draft.file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(SHOP_BUCKET).upload(path, draft.file, {
      contentType: draft.file.type || "image/png",
      upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from(SHOP_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  const pasted = draft.imageUrl.trim();
  return pasted || null;
}

function ShopImage({ url, alt, emptyLabel }: { url: string | null; alt: string; emptyLabel: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div className="grid h-28 place-items-center rounded-xl bg-zinc-900 text-xs text-muted-foreground">{emptyLabel}</div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className="h-28 w-full rounded-xl object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function formatSaleTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

function SalesTab({
  rows,
  members,
  loading,
  error,
}: {
  rows: Sale[];
  members: Member[];
  loading: boolean;
  error: unknown;
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
            <th className="px-2 py-2 font-medium">{t("loyalty.sales.username")}</th>
            <th className="px-2 py-2 font-medium">{t("loyalty.sales.product")}</th>
            <th className="px-2 py-2 font-medium">{t("loyalty.sales.spent")}</th>
            <th className="px-2 py-2 font-medium">{t("loyalty.sales.time")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-white/5">
              <td className="px-2 py-2">{row.member_id ? (names.get(row.member_id) ?? "—") : "—"}</td>
              <td className="px-2 py-2">{row.item_name}</td>
              <td className="px-2 py-2 tabular-nums">{row.points}</td>
              <td className="px-2 py-2" dir="ltr">
                {formatSaleTime(row.created_at)}
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
