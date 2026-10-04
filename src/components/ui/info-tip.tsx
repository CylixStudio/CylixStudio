import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Info-icon tooltip. Uses the shared portal tooltip (same pattern as GatewayPage). */
export function InfoTip({
  text,
  side = "top",
}: {
  text: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-grid size-4 shrink-0 place-items-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 transition-colors hover:border-[#bee1fc]/50 hover:text-[#bee1fc]"
          aria-label={text}
        >
          <Info className="size-2.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        align="center"
        sideOffset={10}
        className="w-[min(18rem,calc(100vw-1.5rem))] text-start"
      >
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}
