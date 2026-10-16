import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Copy, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { PublicChannelShell } from "@/components/public/PublicChannelShell";
import { useLanguage } from "@/lib/i18n";
import { loadPublicCommandsPage } from "@/lib/publicChannel.functions";
import { PUBLIC_BUILTIN_COMMANDS } from "@/lib/publicCommands";

import pageStyles from "./commands.page.module.css";

const styles = pageStyles as {
  page: string;
  wrap: string;
  channel: string;
  identity: string;
  avatar: string;
  avatarFallback: string;
  name: string;
  count: string;
  brand: string;
  brandMark: string;
  brandTitle: string;
  tabs: string;
  tab: string;
  tabActive: string;
  search: string;
  searchIcon: string;
  searchInput: string;
  empty: string;
  grid: string;
  card: string;
  cardName: string;
  copy: string;
  copyDone: string;
  copyIcon: string;
  body: string;
  pager: string;
  pageBtn: string;
  pageActive: string;
  chevron: string;
};

export const Route = createFileRoute("/commands/$slug")({
  loader: async ({ params }) => {
    try {
      return await loadPublicCommandsPage({ data: { slug: params.slug } });
    } catch {
      return { found: false as const };
    }
  },
  head: ({ params }) => ({
    meta: [
      { title: `CylixStudio — ${params.slug}` },
      { name: "description", content: "Enabled chat commands for this channel." },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: PublicCommandsRoute,
});

type Tab = "custom" | "timers" | "defaults";

type CardItem = {
  key: string;
  trigger: string;
  body: string;
};

const MAX_ROWS = 3;
const DESKTOP_LOCK = 1024;

function columnCount(width: number) {
  if (width >= 1024) return 6;
  if (width >= 768) return 3;
  if (width >= 640) return 2;
  return 1;
}

function PublicCommandsRoute() {
  const data = Route.useLoaderData();
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState<Tab>("custom");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState(6);
  const [rows, setRows] = useState(MAX_ROWS);
  const gridRef = useRef<HTMLUListElement>(null);

  const found = data.found === true;
  const tabs: { id: Tab; label: string }[] = [
    { id: "custom", label: "الأوامر المخصصة" },
    { id: "timers", label: "الرسائل المؤقتة" },
    { id: "defaults", label: "الأوامر الافتراضية" },
  ];

  const items = useMemo(() => {
    if (!found) return [];
    if (tab === "custom") {
      return data.commands.map((command) => ({
        key: command.trigger,
        trigger: command.trigger,
        body: command.response,
      }));
    }
    if (tab === "timers") {
      return data.timers.map((timer) => ({
        key: `${timer.intervalMinutes}:${timer.message}`,
        trigger: t("commands.public.every", { n: timer.intervalMinutes }),
        body: timer.message,
      }));
    }
    return PUBLIC_BUILTIN_COMMANDS.map((command) => ({
      key: command.trigger,
      trigger: command.trigger,
      body: command.description[lang],
    }));
  }, [data, found, lang, t, tab]);

  const availableCount = found ? data.commands.length + data.timers.length + PUBLIC_BUILTIN_COMMANDS.length : 0;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) => item.trigger.toLowerCase().includes(needle) || item.body.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const pageSize = Math.max(1, columns * rows);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useLayoutEffect(() => {
    const applyColumns = () => setColumns(columnCount(window.innerWidth));
    applyColumns();
    window.addEventListener("resize", applyColumns);
    return () => window.removeEventListener("resize", applyColumns);
  }, []);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const applyRows = () => {
      if (window.innerWidth < DESKTOP_LOCK) {
        setRows(MAX_ROWS);
        return;
      }
      const page = grid.closest("main");
      const pager = page?.querySelector("nav");
      if (!page || !pager) return;
      const renderedCard = grid.querySelector("li")?.getBoundingClientRect().height ?? 0;
      const cardH = renderedCard || Number.parseFloat(getComputedStyle(grid).getPropertyValue("--card-h")) || 170;
      const rowGap = Number.parseFloat(getComputedStyle(grid).rowGap) || 0;
      const wrap = grid.parentElement;
      const wrapGap = wrap ? Number.parseFloat(getComputedStyle(wrap).rowGap) || 0 : 0;
      const wrapStyle = wrap ? getComputedStyle(wrap) : null;
      const pad =
        (wrapStyle ? Number.parseFloat(wrapStyle.paddingTop) || 0 : 0) +
        (wrapStyle ? Number.parseFloat(wrapStyle.paddingBottom) || 0 : 0);
      let chrome = pad;
      if (wrap) {
        for (const child of wrap.children) {
          if (child !== grid) chrome += child.getBoundingClientRect().height;
        }
        chrome += wrapGap * Math.max(0, wrap.children.length - 1);
      }
      const available = window.innerHeight - chrome;
      const fits = (count: number) => count * cardH + Math.max(0, count - 1) * rowGap <= available + 1;
      const next = fits(3) ? 3 : fits(2) ? 2 : 1;
      setRows(next);
    };

    applyRows();
    const observer = new ResizeObserver(applyRows);
    observer.observe(grid);
    window.addEventListener("resize", applyRows);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyRows);
    };
  }, [found, filtered.length]);

  useEffect(() => {
    setPage(1);
  }, [tab, query]);

  const emptyLabel = tab === "timers" ? t("commands.public.timersEmpty") : t("commands.public.empty");

  if (!found) {
    return (
      <PublicChannelShell
        wide
        ink
        showIntro
        title={t("commands.public.title")}
        heading={t("commands.public.title")}
        missing
        loading={false}
        missingLabel={t("commands.public.missing")}
        loadingLabel={t("commands.public.loading")}
      >
        {null}
      </PublicChannelShell>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.channel} dir="ltr">
          <div className={styles.identity}>
            <ChannelAvatar url={data.avatarUrl} name={data.displayName} />
            <div className="min-w-0">
              <p className={styles.name}>{data.displayName}</p>
              <p className={styles.count}>{availableCount} أمر متاح</p>
            </div>
          </div>
          <div className={styles.brand}>
            <p className={styles.brandMark}>CYLIXSTUDIO</p>
            <p className={styles.brandTitle}>صفحة أوامر القناة</p>
          </div>
        </header>

        <div className={styles.tabs} dir="ltr">
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <label className={styles.search} dir="ltr">
          <Search className={styles.searchIcon} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث عن أمر..."
            dir="rtl"
            className={styles.searchInput}
          />
        </label>

        {filtered.length === 0 ? (
          <p className={styles.empty}>{query.trim() ? t("commands.public.noResults") : emptyLabel}</p>
        ) : (
          <ul
            ref={gridRef}
            className={styles.grid}
            dir="ltr"
            style={
              {
                "--rows": Math.min(rows, Math.max(1, Math.ceil(visible.length / columns))),
              } as CSSProperties
            }
          >
            {visible.map((item) => (
              <li key={item.key}>
                <CommandCard item={item} copyLabel={t("commands.public.copy")} />
              </li>
            ))}
          </ul>
        )}

        <nav className={styles.pager} dir="ltr" aria-label="صفحة أوامر القناة">
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((value) => Math.max(1, Math.min(value, pageCount) - 1))}
            disabled={currentPage <= 1}
            aria-label={t("commands.public.prev")}
          >
            <ChevronLeft className={styles.chevron} />
          </button>
          {pageWindow(pageCount, currentPage).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setPage(entry)}
              aria-label={t("commands.public.page", { n: entry })}
              aria-current={entry === currentPage ? "page" : undefined}
              className={entry === currentPage ? `${styles.pageBtn} ${styles.pageActive}` : styles.pageBtn}
            >
              {entry}
            </button>
          ))}
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            disabled={currentPage >= pageCount}
            aria-label={t("commands.public.next")}
          >
            <ChevronRight className={styles.chevron} />
          </button>
        </nav>
      </div>
    </main>
  );
}

function pageWindow(pageCount: number, current: number): number[] {
  const width = Math.min(5, pageCount);
  let start = current - Math.floor((width - 1) / 2);
  if (start < 1) start = 1;
  if (start + width - 1 > pageCount) start = Math.max(1, pageCount - width + 1);
  return Array.from({ length: width }, (_, index) => start + index);
}

function ChannelAvatar({ url, name }: { url: string; name: string }) {
  const photo = url.trim();
  if (photo) {
    return (
      <img src={photo} alt="" referrerPolicy="no-referrer" className={styles.avatar} />
    );
  }
  return <span className={styles.avatarFallback}>{name.slice(0, 1)}</span>;
}

function CommandCard({ item, copyLabel }: { item: CardItem; copyLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(item.body || item.trigger);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className={styles.card} dir="ltr">
      <p className={styles.cardName} dir="auto">
        {item.trigger}
      </p>
      <button
        type="button"
        onClick={() => void copyContent()}
        className={copied ? `${styles.copy} ${styles.copyDone}` : styles.copy}
        aria-label={copyLabel}
      >
        {copied ? <Check className={styles.copyIcon} /> : <Copy className={styles.copyIcon} />}
      </button>
      <ResponseText text={item.body} />
    </article>
  );
}

function ResponseText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <p className={styles.body}>
      {parts.map((part, index) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={index} href={part} dir="ltr" rel="noreferrer">
              {part}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}
