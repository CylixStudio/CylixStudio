import type { ReactNode } from "react";

import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function PublicChannelShell({
  title,
  heading,
  missing,
  loading,
  missingLabel,
  loadingLabel,
  wide = false,
  ink = false,
  showIntro = true,
  children,
}: {
  title: string;
  heading: string;
  missing: boolean;
  loading: boolean;
  missingLabel: string;
  loadingLabel: string;
  /** Wider studio canvas so compact cards sit in a grid instead of stretching. */
  wide?: boolean;
  /** Flat dark canvas for the public commands page. Store leaves this off. */
  ink?: boolean;
  /** When false, the page supplies its own title row. Store keeps the default intro. */
  showIntro?: boolean;
  children: ReactNode;
}) {
  const { dir } = useLanguage();
  return (
    <main
      dir={dir}
      className={cn(
        "min-h-screen px-4 text-foreground",
        wide
          ? ink
            ? "bg-[#09090b] py-8 text-zinc-100"
            : "ambient-field bg-background py-6"
          : "bg-zinc-950 py-10 text-zinc-100",
      )}
    >
      <div className={cn("mx-auto w-full", wide ? "max-w-6xl" : "max-w-3xl")}>
        {showIntro ? (
          <>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", wide ? "text-muted-foreground" : "text-zinc-500")}>
              CylixStudio
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{missing ? title : heading || title}</h1>
          </>
        ) : null}
        {missing ? (
          <p
            className={cn(
              "glass-3d mt-4 rounded-2xl px-4 py-5 text-sm text-muted-foreground",
              !wide && "mt-6 border border-white/10 px-5 py-8 text-zinc-400",
            )}
          >
            {missingLabel}
          </p>
        ) : loading ? (
          <p className={cn("mt-4 text-sm", wide ? "text-muted-foreground" : "mt-6 text-zinc-500")}>{loadingLabel}</p>
        ) : (
          children
        )}
      </div>
    </main>
  );
}
