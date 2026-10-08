import { useLanguage } from "@/lib/i18n";

const labelClass = "text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-400";

export function LayoutPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <p className={labelClass}>{t("layout.picker")}</p>
      <div className="grid gap-2">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={
                selected
                  ? "rounded-xl border border-zinc-100 bg-zinc-800 px-3 py-2 text-start text-sm text-zinc-50"
                  : "rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-start text-sm text-zinc-300 hover:border-zinc-600"
              }
              aria-pressed={selected}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
