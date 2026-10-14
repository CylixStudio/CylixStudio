import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";

import { LinkInBioPlatformLogo } from "@/components/link-in-bio/LinkInBioPlatformLogo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/i18n";
import {
  applySavedLinkOrder,
  beginLinkOrder,
  cancelLinkOrder,
  LINK_PLATFORMS,
  moveLinkOrderDraft,
  type LinkInBioLink,
  type LinkOrderSession,
} from "@/lib/linkInBio";
import { cn } from "@/lib/utils";

function rowLabel(link: LinkInBioLink): string {
  if (link.title.trim()) return link.title;
  return LINK_PLATFORMS.find((item) => item.id === link.platform)?.label ?? link.platform;
}

function indexAtPointer(list: HTMLUListElement | null, clientY: number, fallback: number): number {
  const rows = list?.querySelectorAll<HTMLElement>("[data-order-row]");
  if (!rows?.length) return fallback;
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index]!.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return index;
  }
  return rows.length - 1;
}

export function LinkOrderDialog({
  open,
  links,
  saving,
  failed,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  links: LinkInBioLink[];
  saving: boolean;
  failed: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (next: LinkInBioLink[]) => void;
}) {
  const { t } = useLanguage();
  const [session, setSession] = useState<LinkOrderSession>(() => beginLinkOrder(links));
  const [drag, setDrag] = useState<{ from: number; over: number; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const byId = new Map(links.map((link) => [link.id, link]));
  const rows = session.draftIds.map((id) => byId.get(id)).filter((link): link is LinkInBioLink => Boolean(link));

  useEffect(() => {
    if (!open) return;
    setSession(beginLinkOrder(links));
    setDrag(null);
  }, [open, links]);

  const move = (from: number, to: number) => {
    setSession((current) => moveLinkOrderDraft(current, from, to));
  };

  const onHandlePointerDown = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ from: index, over: index, x: event.clientX, y: event.clientY });
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const over = indexAtPointer(listRef.current, event.clientY, drag.over);
    setDrag({ ...drag, over, x: event.clientX, y: event.clientY });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const over = indexAtPointer(listRef.current, event.clientY, drag.over);
    setSession((current) => moveLinkOrderDraft(current, drag.from, over));
    setDrag(null);
  };

  const dragged = drag ? rows[drag.from] : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSession((current) => cancelLinkOrder(current));
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[min(88dvh,40rem)] w-[min(100%-1.5rem,28rem)] max-w-md gap-3 overflow-hidden p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle>{t("linkInBio.reorderTitle")}</DialogTitle>
          <DialogDescription>{t("linkInBio.reorderHint")}</DialogDescription>
        </DialogHeader>
        <ul ref={listRef} className="max-h-[min(52dvh,24rem)] space-y-2 overflow-y-auto pe-1" aria-label={t("linkInBio.reorderTitle")}>
          {rows.map((link, index) => {
            const target = drag?.over === index;
            return (
              <li
                key={link.id}
                data-order-row
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2",
                  target && drag && drag.from !== drag.over && "border-dashed border-white/70 bg-white/10",
                  drag?.from === index && "opacity-40",
                )}
              >
                <button
                  type="button"
                  className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground active:cursor-grabbing"
                  aria-label={t("linkInBio.dragHandle")}
                  onPointerDown={(event) => onHandlePointerDown(index, event)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={finishDrag}
                  onPointerCancel={finishDrag}
                >
                  <GripVertical className="size-4" />
                </button>
                <LinkInBioPlatformLogo platform={link.platform} size={28} />
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-start text-sm font-medium"
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      move(index, index - 1);
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      move(index, index + 1);
                    }
                  }}
                >
                  <span dir="auto">{rowLabel(link)}</span>
                </button>
                <span className="w-6 text-center text-xs tabular-nums text-muted-foreground" aria-hidden>
                  {index + 1}
                </span>
                <div className="flex shrink-0 flex-col">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={t("linkInBio.moveUp")}
                    disabled={index === 0 || saving}
                    onClick={() => move(index, index - 1)}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={t("linkInBio.moveDown")}
                    disabled={index === rows.length - 1 || saving}
                    onClick={() => move(index, index + 1)}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {failed ? (
          <p className="text-sm text-rose-300" role="alert">
            {t("linkInBio.err.orderSave")}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={saving}
            onClick={() => {
              setSession((current) => cancelLinkOrder(current));
              onOpenChange(false);
            }}
          >
            {t("linkInBio.cancel")}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={saving || rows.length === 0}
            onClick={() => onSave(applySavedLinkOrder(links, session.draftIds))}
          >
            {t("linkInBio.saveOrder")}
          </Button>
        </DialogFooter>
        {drag && dragged && typeof document !== "undefined"
          ? createPortal(
              <div
                className="pointer-events-none fixed z-[80] flex max-w-[16rem] items-center gap-2 rounded-xl border border-white/70 bg-zinc-900 px-3 py-2 text-sm shadow-xl"
                style={{ top: drag.y + 14, left: drag.x + 14 }}
              >
                <GripVertical className="size-4 text-muted-foreground" />
                <LinkInBioPlatformLogo platform={dragged.platform} size={22} />
                <span className="truncate" dir="auto">
                  {rowLabel(dragged)}
                </span>
              </div>,
              document.body,
            )
          : null}
      </DialogContent>
    </Dialog>
  );
}
