import { useEffect, useState } from "react";

export const COMMAND_CARD_GRID =
  "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3.5";

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

export function CommandGridPager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
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
