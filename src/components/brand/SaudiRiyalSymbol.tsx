import riyalSymbolUrl from "@/assets/Sa/Saudi_Riyal_Symbol-2.svg";

import { cn } from "@/lib/utils";

/** Official Saudi Riyal mark from the SVG asset. Color follows the surrounding text. */
export function SaudiRiyalSymbol({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-[0.85em] w-[0.76em] shrink-0 bg-current", className)}
      style={{
        maskImage: `url("${riyalSymbolUrl}")`,
        WebkitMaskImage: `url("${riyalSymbolUrl}")`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

/** Amount with the riyal mark kept on the left of the digits. */
export function SaudiRiyalAmount({
  amount,
  className,
  iconClassName,
}: {
  amount: number | string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span dir="ltr" className={cn("inline-flex items-baseline gap-1", className)}>
      <SaudiRiyalSymbol className={iconClassName} />
      <span>{amount}</span>
    </span>
  );
}
