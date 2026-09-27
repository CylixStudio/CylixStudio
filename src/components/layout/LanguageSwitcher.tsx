import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** AR / EN control. Sits beside the sidebar profile. */
export function LanguageSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { lang, setLang, t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t("lang.switch")}
      dir="ltr"
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg border border-white/10 bg-white/[0.04] p-0.5",
        collapsed ? "w-full justify-center" : "",
      )}
    >
      <LocaleButton active={lang === "ar"} label={t("lang.ar")} onClick={() => setLang("ar")} />
      <LocaleButton active={lang === "en"} label={t("lang.en")} onClick={() => setLang("en")} />
    </div>
  );
}

function LocaleButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-1.5 py-1 text-[0.65rem] font-semibold tracking-wide transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
