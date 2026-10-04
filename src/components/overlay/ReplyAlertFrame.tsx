import type { ReactNode } from "react";

import { useLanguage } from "@/lib/i18n";

/**
 * Shared reply treatment for widget alerts, chat lines, spotlight, and the
 * activity feed. RTL uses logical borders so the thread line stays on the start edge.
 */
export function ReplyAlertFrame({
  active,
  fading = false,
  quote,
  children,
}: {
  active: boolean;
  fading?: boolean;
  quote?: string | null;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  if (!active) return <>{children}</>;

  return (
    <div
      data-reply-alert="true"
      data-fading={fading ? "true" : "false"}
      className="reply-alert flex w-full min-w-0 flex-col items-stretch gap-1.5"
      style={{ transition: "opacity 500ms ease", opacity: fading ? 0 : 1 }}
    >
      <span className="inline-flex w-fit items-center rounded-full border border-primary/40 bg-zinc-950/80 px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-primary">
        {t("alert.reply")}
      </span>
      <div className="min-w-0 border-s-2 border-primary/40 ps-2.5">
        {quote ? (
          <p dir="auto" className="mb-1 line-clamp-2 text-[0.72em] leading-snug text-zinc-400">
            {quote}
          </p>
        ) : (
          <span aria-hidden className="mb-1 block h-3 w-0.5 rounded-full bg-primary/50" />
        )}
        {children}
      </div>
    </div>
  );
}
