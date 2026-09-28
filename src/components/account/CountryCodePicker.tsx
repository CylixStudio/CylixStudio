import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { countryByIso, countryFlag, searchCountries, type CountryDial } from "@/lib/countryCodes";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function CountryCodePicker({
  iso,
  onChange,
  disabled,
}: {
  iso: string;
  onChange: (country: CountryDial) => void;
  disabled?: boolean;
}) {
  const { t, lang } = useLanguage();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = countryByIso(iso);
  const results = useMemo(() => searchCountries(query), [query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    searchRef.current?.focus();
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 min-w-[7.5rem] items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 text-sm disabled:opacity-50"
        dir="ltr"
      >
        <span aria-hidden>{countryFlag(selected.iso)}</span>
        <span className="font-medium">{selected.dial}</span>
        <ChevronDown className="ms-auto size-3.5 opacity-70" aria-hidden />
      </button>
      {open ? (
        <div
          className="absolute z-50 mt-1 w-72 max-w-[80vw] rounded-xl border border-white/10 bg-zinc-950 p-2 shadow-xl"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("countryCode.search")}
            className="mb-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
            dir="auto"
          />
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto">
            {results.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">{t("countryCode.empty")}</li>
            ) : (
              results.map((country) => {
                const active = country.iso === selected.iso;
                const label = lang === "ar" ? country.nameAr : country.nameEn;
                return (
                  <li key={country.iso}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(country);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5",
                        active && "bg-primary/15 text-primary",
                      )}
                    >
                      <span aria-hidden>{countryFlag(country.iso)}</span>
                      <span className="min-w-0 flex-1 truncate text-start">{label}</span>
                      <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                        {country.dial}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
