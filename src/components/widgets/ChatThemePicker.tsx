import { CHAT_LAYOUTS, type ChatLayout } from "@/lib/widgets";
import { ROYAL_COMPACT_THEME_ID } from "@/lib/royalCompact";
import { useLanguage } from "@/lib/i18n";

function LayoutMini({ id }: { id: ChatLayout }) {
  if (id === "transparent") {
    return (
      <div className="flex h-14 items-center bg-transparent px-2 text-[10px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
        Nova hello
      </div>
    );
  }
  if (id === "island") {
    return (
      <div className="flex h-14 items-center px-2">
        <span className="rounded-full border border-violet-400/40 bg-[rgba(15,15,26,0.85)] px-2 py-1 text-[10px] text-white">
          Nova hello
        </span>
      </div>
    );
  }
  if (id === "bubble") {
    return (
      <div className="flex h-14 items-center px-2">
        <span className="rounded-2xl rounded-ss-sm border border-slate-600/60 bg-slate-800/90 px-2 py-1 text-[10px] text-white">
          Nova hello
        </span>
      </div>
    );
  }
  return (
    <div className="flex h-14 items-center px-2">
      <span className="w-full rounded-md border border-white/10 bg-slate-900/70 px-2 py-1 text-[10px] text-white backdrop-blur">
        Nova hello
      </span>
    </div>
  );
}

function RoyalMini() {
  return (
    <div className="flex h-14 items-center gap-1 bg-transparent px-2">
      <span className="size-5 shrink-0 rounded-full border-2 border-white/30 bg-[rgba(17,20,25,0.88)]" />
      <span className="inline-flex max-w-full items-center gap-1 rounded-xl bg-[rgba(17,20,25,0.88)] px-2 py-1 text-[10px] text-white shadow-[0_1px_2px_rgba(0,0,0,0.16)]">
        <span className="size-2 rounded-sm bg-amber-300" />
        <span className="font-bold text-amber-200">Nova</span>
        <span>hello</span>
      </span>
    </div>
  );
}

export function ChatThemePicker({
  layout,
  royalSelected,
  onSelectLayout,
  onSelectRoyal,
}: {
  layout: ChatLayout;
  royalSelected: boolean;
  onSelectLayout: (layout: ChatLayout) => void;
  onSelectRoyal: () => void;
}) {
  const { t } = useLanguage();
  const card =
    "flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-zinc-950/40 text-start transition-colors hover:border-primary/50";
  const nameClass =
    "flex min-h-11 flex-wrap items-center gap-1.5 px-2 py-1.5 text-xs font-semibold leading-snug break-words";
  return (
    <div className="grid grid-cols-2 items-stretch gap-2">
      {CHAT_LAYOUTS.map((entry) => {
        const selected = !royalSelected && layout === entry.value;
        return (
          <button
            key={entry.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelectLayout(entry.value)}
            className={`${card} ${selected ? "border-primary" : "border-border"}`}
          >
            <div className="bg-[repeating-conic-gradient(#1c1d24_0%_25%,#121318_0%_50%)] bg-[length:12px_12px]">
              <LayoutMini id={entry.value} />
            </div>
            <span className={nameClass}>{entry.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={royalSelected}
        data-theme-id={ROYAL_COMPACT_THEME_ID}
        onClick={onSelectRoyal}
        className={`${card} ${royalSelected ? "border-primary" : "border-border"}`}
      >
        <div className="bg-[repeating-conic-gradient(#1c1d24_0%_25%,#121318_0%_50%)] bg-[length:12px_12px]">
          <RoyalMini />
        </div>
        <span className={nameClass}>
          <span className="min-w-0 break-words">{t("chat.theme.royal")}</span>
          <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
            Pro
          </span>
        </span>
      </button>
    </div>
  );
}
