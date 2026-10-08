import type { ReactNode } from "react";

import { useLanguage } from "@/lib/i18n";

export function PublicChannelShell({
  title,
  heading,
  missing,
  loading,
  missingLabel,
  loadingLabel,
  children,
}: {
  title: string;
  heading: string;
  missing: boolean;
  loading: boolean;
  missingLabel: string;
  loadingLabel: string;
  children: ReactNode;
}) {
  const { dir } = useLanguage();
  return (
    <main dir={dir} className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">CylixStudio</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{missing ? title : heading || title}</h1>
        {missing ? (
          <p className="glass-3d mt-6 rounded-2xl border border-white/10 px-5 py-8 text-sm text-zinc-400">
            {missingLabel}
          </p>
        ) : loading ? (
          <p className="mt-6 text-sm text-zinc-500">{loadingLabel}</p>
        ) : (
          children
        )}
      </div>
    </main>
  );
}
