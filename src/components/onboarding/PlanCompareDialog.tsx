import { Check, Minus, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { SaudiRiyalAmount } from "@/components/brand/SaudiRiyalSymbol";
import { PLAN_FEATURES, PLAN_PRICES, type FeatureAvailability } from "@/lib/plans";
import { cn } from "@/lib/utils";

function CellValue({ value }: { value: FeatureAvailability }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center text-emerald-400" aria-label="Included">
        <Check className="size-4" aria-hidden />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center text-rose-400" aria-label="Not included">
        <X className="size-4 stroke-[2.5]" aria-hidden />
      </span>
    );
  }
  return <span className="text-[0.8rem] font-medium text-foreground/90">{value}</span>;
}

type PlanCompareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PlanCompareDialog({ open, onOpenChange }: PlanCompareDialogProps) {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(100%,42rem)] max-w-none flex-col overflow-hidden border-white/10 bg-zinc-950 p-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 border-b border-white/8 px-5 py-4 text-start sm:px-6">
          <DialogTitle className="text-lg tracking-tight">{t("gateway.compare.title")}</DialogTitle>
          <DialogDescription className="text-[0.82rem] text-muted-foreground">
            {t("gateway.compare.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5 pt-1 sm:px-4">
          <table className="w-full min-w-[28rem] border-collapse text-start">
            <thead>
              <tr className="border-b border-white/8 text-[0.72rem] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-3 py-3 font-medium">{t("gateway.compare.feature")}</th>
                <th className="px-3 py-3 text-center font-medium">
                  {t("gateway.free.name")}
                  <span className="mt-0.5 flex items-baseline justify-center gap-1 text-[0.65rem] normal-case tracking-normal text-muted-foreground/80">
                    <SaudiRiyalAmount amount={PLAN_PRICES.free.amount} />
                    {t("gateway.price.period")}
                  </span>
                </th>
                <th className="px-3 py-3 text-center font-medium text-primary">
                  {t("gateway.pro.name")}
                  <span className="mt-0.5 flex items-baseline justify-center gap-1 text-[0.65rem] normal-case tracking-normal text-primary/80">
                    <SaudiRiyalAmount amount={PLAN_PRICES.pro.amount} />
                    {t("gateway.price.period")}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-white/[0.04]",
                    index % 2 === 0 ? "bg-white/[0.015]" : "bg-transparent",
                  )}
                >
                  <td className="px-3 py-3 text-[0.84rem] text-foreground/90">
                    {t(row.labelKey as TranslationKey)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <CellValue value={row.free} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <CellValue value={row.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-4 flex items-start gap-2 px-3 text-[0.72rem] text-muted-foreground">
            <Minus className="mt-0.5 size-3.5 shrink-0 opacity-60" aria-hidden />
            {t("gateway.compare.note")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
