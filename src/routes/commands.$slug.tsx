import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PublicChannelShell } from "@/components/public/PublicChannelShell";
import { useLanguage } from "@/lib/i18n";
import { loadPublicCommandsPage, type PublicCommandsPage } from "@/lib/publicChannel.functions";

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

function PublicCommandsRoute() {
  const { slug } = Route.useParams();
  const { t } = useLanguage();
  const [data, setData] = useState<PublicCommandsPage | null>(null);
  const [missing, setMissing] = useState(false);

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
        data.commands.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-400">{t("commands.public.empty")}</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {data.commands.map((command) => (
              <li key={command.trigger} className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3">
                <p className="font-mono text-sm text-zinc-100" dir="ltr">
                  {command.trigger}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{command.response}</p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </PublicChannelShell>
  );
}
