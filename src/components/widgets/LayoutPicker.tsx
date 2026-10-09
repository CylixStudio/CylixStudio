import { DarkSelect } from "@/components/ui/dark-select";
import { useLanguage } from "@/lib/i18n";

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
  const selected = options.some((option) => option.id === value) ? value : (options[0]?.id ?? value);
  return (
    <label className="block space-y-2">
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-400">
        {t("layout.picker")}
      </span>
      <DarkSelect
        value={selected}
        onValueChange={onChange}
        aria-label={t("layout.picker")}
        options={options.map((option) => ({ value: option.id, label: option.label }))}
      />
    </label>
  );
}
