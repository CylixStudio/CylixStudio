import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import pageStyles from "../../routes/commands.page.module.css";

const publicPager = pageStyles as {
  pager: string;
  pageBtn: string;
  pageActive: string;
  chevron: string;
};

export const COMMAND_CARD_GRID =
  "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5";

/** Wide desktop is one column calmer than the six-column grid. */
export const COMMAND_CARD_GRID_CALM =
  "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5";

export const COMMAND_PAGE_SIZE = 24;

export function useCommandPage<T extends { id: string }>(items: readonly T[]) {
  const [page, setPage] = useState(1);
  const identity = items.map((item) => item.id).join("|");
  useEffect(() => {
    setPage(1);
  }, [identity]);
  const pageCount = Math.max(1, Math.ceil(items.length / COMMAND_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * COMMAND_PAGE_SIZE;
  return {
    page: safePage,
    pageCount,
    slice: items.slice(start, start + COMMAND_PAGE_SIZE),
    showPager: items.length > COMMAND_PAGE_SIZE,
    setPage,
  };
}

export function scrollCommandGrid(anchor: HTMLElement | null) {
  anchor?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function pageWindow(pageCount: number, current: number): number[] {
  const width = Math.min(5, pageCount);
  let start = current - Math.floor((width - 1) / 2);
  if (start < 1) start = 1;
  if (start + width - 1 > pageCount) start = Math.max(1, pageCount - width + 1);
  return Array.from({ length: width }, (_, index) => start + index);
}

export function CommandGridPager({
  page,
  pageCount,
  onPage,
  variant = "studio",
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  variant?: "studio" | "public";
}) {
  if (pageCount <= 1) return null;
  if (variant === "public") {
    return (
      <nav className={publicPager.pager} dir="ltr" aria-label="pagination">
        <button
          type="button"
          className={publicPager.pageBtn}
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="<"
        >
          <ChevronLeft className={publicPager.chevron} />
        </button>
        {pageWindow(pageCount, page).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => onPage(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={
              entry === page ? `${publicPager.pageBtn} ${publicPager.pageActive}` : publicPager.pageBtn
            }
          >
            {entry}
          </button>
        ))}
        <button
          type="button"
          className={publicPager.pageBtn}
          onClick={() => onPage(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          aria-label=">"
        >
          <ChevronRight className={publicPager.chevron} />
        </button>
      </nav>
    );
  }
  const idle = "text-zinc-400 hover:text-white transition-colors";
  return (
    <nav
      aria-label="pagination"
      dir="ltr"
      className="bg-[#0d0e12] border border-white/5 rounded-2xl px-4 py-2 flex items-center gap-2 shadow-lg mx-auto w-fit my-8"
    >
      <button
        type="button"
        className={idle}
        aria-label="<"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {"<"}
      </button>
      {Array.from({ length: pageCount }, (_, index) => {
        const number = index + 1;
        const active = number === page;
        return (
          <button
            key={number}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onPage(number)}
            className={
              active
                ? "bg-[#a5f3fc] text-black font-bold rounded-[12px] px-3.5 py-1.5 text-sm leading-none"
                : idle
            }
          >
            {number}
          </button>
        );
      })}
      <button
        type="button"
        className={idle}
        aria-label=">"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
      >
        {">"}
      </button>
    </nav>
  );
}
