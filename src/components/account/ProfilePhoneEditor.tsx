import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PhoneNumberField } from "@/components/account/PhoneNumberField";
import { PHONE_UPDATED_EVENT } from "@/components/account/PhoneOnboardingBanner";
import { countryByIso, splitStoredPhone } from "@/lib/countryCodes";
import { useLanguage } from "@/lib/i18n";
import { normalizeCustomerPhone } from "@/lib/phone";
import { supabase } from "@/lib/supabase/client";

function readStoredPhone(metadata: Record<string, unknown>, authPhone: string | null | undefined): string {
  const fromMeta = [metadata["phone"], metadata["mobile"], metadata["phone_number"], metadata["mobile_phone"]].find(
    (value) => typeof value === "string" && value.trim(),
  );
  return (typeof fromMeta === "string" ? fromMeta : authPhone) ?? "";
}

export function ProfilePhoneEditor({ autoFocus }: { autoFocus?: boolean }) {
  const { t } = useLanguage();
  const [iso, setIso] = useState("SA");
  const [national, setNational] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      const split = splitStoredPhone(readStoredPhone(user.user_metadata ?? {}, user.phone));
      setIso(split.iso);
      setNational(split.national);
    });
  }, []);

  useEffect(() => {
    if (!autoFocus) return;
    document.getElementById("profile-phone-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("profile-phone")?.focus();
  }, [autoFocus]);

  const save = async () => {
    const digits = national.replace(/\D/g, "").replace(/^0+/, "");
    const phone = normalizeCustomerPhone(`${countryByIso(iso).dial}${digits}`);
    if (!phone) {
      toast.error(t("settings.profile.phoneInvalid"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { phone, phone_country: iso } });
    setBusy(false);
    if (error) {
      toast.error(t("settings.profile.phoneInvalid"));
      return;
    }
    toast.success(t("settings.profile.phoneSaved"));
    window.dispatchEvent(new Event(PHONE_UPDATED_EVENT));
  };

  return (
    <div id="profile-phone-section" className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8rem] text-muted-foreground">{t("settings.profile.phone")}</p>
          <p className="mt-1 max-w-sm text-[0.75rem] leading-relaxed text-muted-foreground">
            {t("settings.profile.phoneHint")}
          </p>
        </div>
        <div className="w-full max-w-md space-y-2">
          <PhoneNumberField
            id="profile-phone"
            iso={iso}
            national={national}
            onIso={setIso}
            onNational={setNational}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="h-9 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? t("settings.profile.phoneSaving") : t("settings.profile.phoneSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
