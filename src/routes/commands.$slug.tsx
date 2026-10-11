import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Copy, Search } from "lucide-react";
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
        <div dir="ltr">
          <header
            className="bg-[#0d0e12] border border-white/5 rounded-2xl p-5 mb-5 flex items-center justify-between"
            dir="ltr"
          >
            <div className="flex min-w-0 items-center gap-4">
              <ChannelAvatar url={data.avatarUrl} name={data.displayName} />
              <div className="min-w-0 text-left">
                <p className="truncate text-base font-bold text-white" dir="auto">
                  {data.displayName}
                </p>
                <p className="mt-0.5 truncate text-sm text-zinc-500">
                  {t("commands.public.available", { n: availableCount })}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[0.65rem] font-medium tracking-[0.22em] text-zinc-500">CYLIXSTUDIO</p>
              <p className="mt-1 text-sm text-zinc-400" dir="auto">
                {t("commands.public.section")}
              </p>
            </div>
          </header>

          <div className="bg-[#0d0e12] border border-white/5 rounded-2xl p-1.5 grid grid-cols-3 gap-2 mb-4 text-center">
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "w-full py-2.5 rounded-xl text-sm font-medium transition-all",
                    active
                      ? "border border-[#00D8FF] text-white bg-white/[0.03] shadow-[inset_0_0_18px_rgba(0,216,255,0.14),0_0_16px_rgba(0,216,255,0.18)]"
                      : "border-0 bg-transparent text-zinc-500",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <label
            className="bg-[#0d0e12] border border-white/5 rounded-2xl px-4 py-3 mb-6 flex items-center gap-3"
            dir="ltr"
          >
            <Search className="size-4 shrink-0 text-zinc-500" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("commands.public.search")}
              dir="ltr"
              className="min-w-0 flex-1 bg-transparent text-left text-sm text-zinc-100 outline-none placeholder:text-left placeholder:text-zinc-500"
            />
          </label>

          {filtered.length === 0 ? (
            <p className="mb-8 text-sm text-zinc-400">{query.trim() ? t("commands.public.noResults") : emptyLabel}</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-8">
              {visible.map((item) => (
                <li key={item.key} className="min-w-0">
                  <CommandCard item={item} copyLabel={t("commands.public.copy")} />
                </li>
              ))}
            </ul>
          )}

          {filtered.length > PAGE_SIZE ? (
            <nav className="flex items-center justify-center gap-1.5" dir="ltr" aria-label={t("commands.public.section")}>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 disabled:opacity-40"
                onClick={() => setPage((value) => Math.max(1, Math.min(value, pageCount) - 1))}
                disabled={currentPage <= 1}
                aria-label={t("commands.public.prev")}
              >
                <ChevronLeft className="size-4" />
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
                        ? "border border-[#00D8FF] bg-[#00D8FF]/25 font-medium text-white shadow-[0_0_12px_rgba(0,216,255,0.28)]"
                        : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300",
                    )}
                  >
                    {entry}
                  </button>
                ),
              )}
              <button
                type="button"
                className="grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 disabled:opacity-40"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={currentPage >= pageCount}
                aria-label={t("commands.public.next")}
              >
                <ChevronRight className="size-4" />
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
  const photo = url.trim();
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        referrerPolicy="no-referrer"
        className="w-16 h-16 rounded-2xl object-cover border border-white/10"
      />
    );
  }
  return (
    <span className="grid w-16 h-16 shrink-0 place-items-center rounded-2xl border border-white/10 bg-zinc-900 text-lg font-semibold text-zinc-200">
      {name.slice(0, 1)}
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
    <article className="bg-[#121318] border border-white/5 rounded-xl p-4 flex flex-col justify-between h-full min-h-[7.25rem]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-bold text-white break-all" dir="ltr">
          {item.trigger}
        </p>
        <button
          type="button"
          onClick={() => void copyTrigger()}
          className="grid size-5 shrink-0 place-items-center text-zinc-500 hover:text-zinc-200"
          aria-label={copyLabel}
        >
          {copied ? <Check className="size-3.5 text-cyan-300" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <ResponseText text={item.body} />
    </article>
  );
}

function ResponseText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <p className="text-zinc-400 text-xs font-normal break-all line-clamp-4 mt-2 [&_a]:!text-inherit [&_a]:![text-decoration:none]">
      {parts.map((part, index) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={index}
              href={part}
              dir="ltr"
              rel="noreferrer"
              className="text-inherit no-underline"
              style={{ color: "inherit", textDecoration: "none" }}
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
