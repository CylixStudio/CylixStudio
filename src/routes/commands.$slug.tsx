import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { StudioPageTabs } from "@/components/layout/StudioPageTabs";
import { PublicChannelShell } from "@/components/public/PublicChannelShell";
import { useLanguage } from "@/lib/i18n";
import { loadPublicCommandsPage, type PublicCommandsPage } from "@/lib/publicChannel.functions";
import { PUBLIC_BUILTIN_COMMANDS } from "@/lib/publicCommands";

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

function PublicCommandsRoute() {
  const { slug } = Route.useParams();
  const { t, lang, dir } = useLanguage();
  const [data, setData] = useState<PublicCommandsPage | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("custom");

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

  return (
    <PublicChannelShell
      wide
      title={t("commands.public.title")}
      heading={found ? data.displayName : t("commands.public.title")}
      missing={missing || data?.found === false}
      loading={!data && !missing}
      missingLabel={t("commands.public.missing")}
      loadingLabel={t("commands.public.loading")}
    >
      {found ? (
        <div className="mt-4 flex items-start gap-4" dir="ltr">
          <aside className="sticky top-4 flex w-[5.25rem] shrink-0 flex-col items-center text-center">
            <span className="grid size-14 place-items-center overflow-hidden rounded-2xl border border-[oklch(1_0_0/0.08)] bg-[oklch(1_0_0/0.04)]">
              {data.avatarUrl ? (
                <img src={data.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-sm font-semibold">{data.displayName.slice(0, 1)}</span>
              )}
            </span>
            <p className="mt-2 line-clamp-3 text-[0.72rem] font-medium leading-snug" dir="auto">
              {data.displayName}
            </p>
          </aside>
          <div className="min-w-0 flex-1" dir={dir}>
            <StudioPageTabs value={tab} onChange={setTab} items={tabs} className="mb-3" />
            {tab === "custom" ? (
              data.commands.length === 0 ? (
                <p className="text-[0.82rem] text-muted-foreground">{t("commands.public.empty")}</p>
              ) : (
                <ul className={COMMAND_GRID}>
                  {data.commands.map((command) => (
                    <li key={command.trigger}>
                      <CommandCard trigger={command.trigger} body={command.response} />
                    </li>
                  ))}
                </ul>
              )
            ) : null}
            {tab === "timers" ? (
              data.timers.length === 0 ? (
                <p className="text-[0.82rem] text-muted-foreground">{t("commands.public.timersEmpty")}</p>
              ) : (
                <ul className={COMMAND_GRID}>
                  {data.timers.map((timer) => (
                    <li key={`${timer.intervalMinutes}:${timer.message}`}>
                      <CommandCard
                        trigger={t("commands.public.every", { n: timer.intervalMinutes })}
                        body={timer.message}
                      />
                    </li>
                  ))}
                </ul>
              )
            ) : null}
            {tab === "defaults" ? (
              <ul className={COMMAND_GRID}>
                {PUBLIC_BUILTIN_COMMANDS.map((command) => (
                  <li key={command.trigger}>
                    <CommandCard trigger={command.trigger} body={command.description[lang]} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </PublicChannelShell>
  );
}

/** Same packing as dashboard command faces: fixed cells, no stretched columns. */
const COMMAND_GRID = "grid grid-cols-[repeat(auto-fill,9.25rem)] justify-start gap-2";

function CommandCard({ trigger, body }: { trigger: string; body: string }) {
  return (
    <article className="glass-3d flex h-[9.25rem] w-[9.25rem] flex-col overflow-hidden rounded-2xl p-2.5 text-start">
      <p className="line-clamp-2 font-mono text-[0.78rem] font-medium leading-snug tracking-tight text-foreground" dir="ltr">
        {trigger}
      </p>
      <ResponseText text={body} />
    </article>
  );
}

function ResponseText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+|\$\([^)\s]+\)|\{[A-Za-z0-9_]+\})/g);
  return (
    <p className="mt-1.5 line-clamp-5 text-[0.7rem] leading-snug text-muted-foreground [overflow-wrap:anywhere]" dir="auto">
      {parts.map((part, index) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={index} href={part} className="text-primary underline" dir="ltr" rel="noreferrer">
              {part}
            </a>
          );
        }
        if (part.startsWith("$(") || part.startsWith("{")) {
          return (
            <code key={index} className="rounded bg-[oklch(1_0_0/0.08)] px-1 font-mono text-foreground" dir="ltr">
              {part}
            </code>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}
