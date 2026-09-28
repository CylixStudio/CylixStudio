import { countryByIso } from "@/lib/countryCodes";
import { useLanguage } from "@/lib/i18n";

import { CountryCodePicker } from "@/components/account/CountryCodePicker";

export function PhoneNumberField({
  id,
  iso,
  national,
  onIso,
  onNational,
  disabled,
}: {
  id?: string;
  iso: string;
  national: string;
  onIso: (iso: string) => void;
  onNational: (national: string) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const dial = countryByIso(iso).dial;

  return (
    <div className="flex items-center gap-2" dir="ltr">
      <CountryCodePicker iso={iso} onChange={(country) => onIso(country.iso)} disabled={disabled} />
      <input
        id={id}
        inputMode="tel"
        autoComplete="tel-national"
        disabled={disabled}
        value={national}
        onChange={(event) => onNational(event.target.value.replace(/[^\d]/g, "").slice(0, 15))}
        placeholder={t("settings.profile.phonePlaceholder")}
        aria-label={t("settings.profile.phone")}
        className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none disabled:opacity-50"
      />
      <span className="sr-only">
        {dial}
        {national}
      </span>
    </div>
  );
}
