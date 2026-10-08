import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
  const { t, lang } = useLanguage();
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
      title={t("commands.public.title")}
      heading={found ? data.displayName : t("commands.public.title")}
      missing={missing || data?.found === false}
      loading={!data && !missing}
      missingLabel={t("commands.public.missing")}
      loadingLabel={t("commands.public.loading")}
    >
      {found ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={
                  tab === item.id
                    ? "rounded-xl border border-zinc-100 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                    : "rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"
                }
              >
                {item.label}
              </button>
            ))}
          </div>
          {tab === "custom" ? (
            data.commands.length === 0 ? (
              <p className="text-sm text-zinc-400">{t("commands.public.empty")}</p>
            ) : (
              <ul className="grid gap-3">
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
              <p className="rounded-2xl border border-white/10 bg-zinc-950 px-5 py-8 text-sm text-zinc-400">
                {t("commands.public.timersEmpty")}
              </p>
            ) : (
              <ul className="grid gap-3">
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
            <ul className="grid gap-3">
              {PUBLIC_BUILTIN_COMMANDS.map((command) => (
                <li key={command.trigger}>
                  <CommandCard trigger={command.trigger} body={command.description[lang]} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </PublicChannelShell>
  );
}

function CommandCard({ trigger, body }: { trigger: string; body: string }) {
  return (
    <article className="glass-3d rounded-2xl border border-white/10 p-5">
      <p className="font-mono text-sm font-semibold text-zinc-50" dir="ltr">
        {trigger}
      </p>
      <ResponseText text={body} />
    </article>
  );
}

function ResponseText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+|\$\([^)\s]+\)|\{[A-Za-z0-9_]+\})/g);
  return (
    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200" dir="auto">
      {parts.map((part, index) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={index} href={part} className="text-sky-300 underline" dir="ltr" rel="noreferrer">
              {part}
            </a>
          );
        }
        if (part.startsWith("$(") || part.startsWith("{")) {
          return (
            <code key={index} className="rounded bg-white/10 px-1 font-mono text-zinc-50" dir="ltr">
              {part}
            </code>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}
