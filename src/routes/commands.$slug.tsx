import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PublicChannelShell } from "@/components/public/PublicChannelShell";
import { useLanguage } from "@/lib/i18n";
import { loadPublicCommandsPage, type PublicCommandsPage } from "@/lib/publicChannel.functions";
import { PUBLIC_BUILTIN_COMMANDS } from "@/lib/publicCommands";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/commands/$slug")({
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

const PAGE_SIZE = 18;

function PublicCommandsRoute() {
  const { slug } = Route.useParams();
  const { t, lang } = useLanguage();
  const [data, setData] = useState<PublicCommandsPage | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("custom");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let stopped = false;
    setData(null);
    setMissing(false);
    void loadPublicCommandsPage({ data: { slug } })
      .then((next) => {
        if (!stopped) setData(next);
      })
      .catch(() => {
        if (!stopped) setMissing(true);
      });
    return () => {
      stopped = true;
    };
  }, [slug]);

  const found = data?.found === true;
  const tabs: { id: Tab; label: string }[] = [
    { id: "custom", label: t("commands.public.tabCustom") },
    { id: "timers", label: t("commands.public.tabTimers") },
    { id: "defaults", label: t("commands.public.tabDefaults") },
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [tab, query]);

  const emptyLabel = tab === "timers" ? t("commands.public.timersEmpty") : t("commands.public.empty");

  return (
    <PublicChannelShell
      wide
      ink
      showIntro={!found}
      title={t("commands.public.title")}
      heading={found ? data.displayName : t("commands.public.title")}
      missing={missing || data?.found === false}
      loading={!data && !missing}
      missingLabel={t("commands.public.missing")}
      loadingLabel={t("commands.public.loading")}
    >
      {found ? (
        <div className="space-y-4" dir="ltr">
          <header className="rounded-2xl border border-white/5 bg-[#0d0e12] px-4 py-3.5 sm:px-5">
            <div className="flex items-center justify-between gap-4" dir="ltr">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <ChannelAvatar url={data.avatarUrl} name={data.displayName} />
                <div className="min-w-0 text-left">
                  <p className="truncate text-lg font-bold tracking-tight text-zinc-50" dir="auto">
                    {data.displayName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {t("commands.public.available", { n: availableCount })}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[0.65rem] font-medium tracking-[0.22em] text-zinc-400">CYLIXSTUDIO</p>
                <p className="mt-1 text-xs text-zinc-500" dir="auto">
                  {t("commands.public.section")}
                </p>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "rounded-xl border px-2 py-2.5 text-center text-xs transition sm:px-3 sm:text-sm",
                    active
                      ? "border-[#00D8FF]/80 bg-[#0c1c22] text-zinc-50 shadow-[0_0_16px_rgba(0,216,255,0.32)]"
                      : "border-white/5 bg-[#121318] text-zinc-400 hover:border-white/10 hover:text-zinc-200",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <label className="relative block" dir="ltr">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("commands.public.search")}
              className="h-11 w-full rounded-xl border border-white/5 bg-[#0d0e12] pl-10 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/15"
            />
          </label>

          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-400">{query.trim() ? t("commands.public.noResults") : emptyLabel}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              {visible.map((item) => (
                <li key={item.key}>
                  <CommandCard item={item} copyLabel={t("commands.public.copy")} />
                </li>
              ))}
            </ul>
          )}

          {filtered.length > PAGE_SIZE ? (
            <nav
              className="flex items-center justify-center gap-1.5 pt-1"
              dir="ltr"
              aria-label={t("commands.public.section")}
            >
              <button
                type="button"
                className="grid size-8 place-items-center rounded-lg border border-white/10 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                onClick={() => setPage((value) => Math.max(1, Math.min(value, pageCount) - 1))}
                disabled={currentPage <= 1}
                aria-label={t("commands.public.prev")}
              >
                {"<"}
              </button>
              {pageWindow(pageCount, currentPage).map((entry, index) =>
                entry === "gap" ? (
                  <span key={`gap-${index}`} className="px-1 text-zinc-500">
                    …
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setPage(entry)}
                    aria-label={t("commands.public.page", { n: entry })}
                    aria-current={entry === currentPage ? "page" : undefined}
                    className={cn(
                      "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm",
                      entry === currentPage
                        ? "rounded-full bg-[#00D8FF] font-medium text-zinc-950 shadow-[0_0_14px_rgba(0,216,255,0.4)]"
                        : "border border-white/10 bg-[#121318] text-zinc-300 hover:bg-white/5",
                    )}
                  >
                    {entry}
                  </button>
                ),
              )}
              <button
                type="button"
                className="grid size-8 place-items-center rounded-lg border border-white/10 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={currentPage >= pageCount}
                aria-label={t("commands.public.next")}
              >
                {">"}
              </button>
            </nav>
          ) : null}
        </div>
      ) : null}
    </PublicChannelShell>
  );
}

function pageWindow(pageCount: number, current: number): Array<number | "gap"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set<number>([1, pageCount, current - 1, current, current + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const windowed: Array<number | "gap"> = [];
  for (const value of sorted) {
    const previous = windowed[windowed.length - 1];
    if (typeof previous === "number" && value - previous > 1) windowed.push("gap");
    windowed.push(value);
  }
  return windowed;
}

function ChannelAvatar({ url, name }: { url: string; name: string }) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(url) && !broken;
  return (
    <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-[0_0_18px_rgba(0,216,255,0.22)] sm:size-16">
      {showImage ? (
        <img src={url} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="text-lg font-semibold text-zinc-200">{name.slice(0, 1)}</span>
      )}
    </span>
  );
}

function CommandCard({ item, copyLabel }: { item: CardItem; copyLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function copyTrigger() {
    try {
      await navigator.clipboard.writeText(item.trigger);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="relative flex h-full min-h-[8.5rem] flex-col rounded-xl border border-white/5 bg-[#121318] p-2.5 transition hover:border-white/15 hover:bg-[#181a21]">
      <p className="line-clamp-2 pr-7 text-sm font-bold leading-snug tracking-tight text-zinc-50" dir="ltr">
        {item.trigger}
      </p>
      <button
        type="button"
        onClick={() => void copyTrigger()}
        className="absolute top-2 right-2 grid size-6 place-items-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
        aria-label={copyLabel}
      >
        {copied ? <Check className="size-3.5 text-cyan-300" /> : <Copy className="size-3.5" />}
      </button>
      <ResponseText text={item.body} />
    </article>
  );
}

function ResponseText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <p className="mt-2 line-clamp-5 text-[0.72rem] font-normal leading-snug text-zinc-400 [overflow-wrap:anywhere] [&_a]:!font-normal [&_a]:!text-zinc-400 [&_a]:![text-decoration:none]" dir="auto">
      {parts.map((part, index) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={index}
              href={part}
              className="!font-normal !text-zinc-400 ![text-decoration:none]"
              dir="ltr"
              rel="noreferrer"
            >
              {part}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}
