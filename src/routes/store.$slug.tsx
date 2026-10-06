import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PublicChannelShell } from "@/components/public/PublicChannelShell";
import { useLanguage } from "@/lib/i18n";
import { loadPublicStorePage, type PublicStorePage } from "@/lib/publicChannel.functions";

export const Route = createFileRoute("/store/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `CylixStudio — ${params.slug}` },
      { name: "description", content: "Loyalty shop items for this channel." },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: PublicStoreRoute,
});

function PublicStoreRoute() {
  const { slug } = Route.useParams();
  const { t } = useLanguage();
  const [data, setData] = useState<PublicStorePage | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stopped = false;
    setData(null);
    setMissing(false);
    void loadPublicStorePage({ data: { slug } })
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
      title={t("store.public.title")}
      heading={found ? data.displayName : t("store.public.title")}
      missing={missing || data?.found === false}
      loading={!data && !missing}
      missingLabel={t("store.public.missing")}
      loadingLabel={t("store.public.loading")}
    >
      {found ? (
        <>
          <p className="mt-3 text-sm text-zinc-400">{t("store.public.buyHint")}</p>
          {data.items.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-400">{t("store.public.empty")}</p>
          ) : (
            <ul className="mt-6 space-y-3">
              {data.items.map((item) => (
                <li key={item.name} className="flex gap-4 rounded-2xl border border-white/10 bg-zinc-900 p-4">
                  <ShopImage url={item.imageUrl} alt={item.name} empty={t("store.public.noImage")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium">{item.name}</p>
                    {item.description ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{item.description}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-zinc-200">{t("store.public.price", { count: item.cost })}</p>
                    {typeof item.stock === "number" ? (
                      <p className="mt-1 text-xs text-zinc-500">{t("store.public.stock", { count: item.stock })}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </PublicChannelShell>
  );
}

function ShopImage({ url, alt, empty }: { url: string | null; alt: string; empty: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-zinc-950 text-center text-[0.65rem] text-zinc-500">
        {empty}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className="size-20 shrink-0 rounded-xl object-cover"
      onError={() => setBroken(true)}
    />
  );
}
