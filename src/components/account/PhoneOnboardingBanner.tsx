import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";

import { useLanguage } from "@/lib/i18n";
import { isFirstLogin, normalizeCustomerPhone } from "@/lib/phone";
import { supabase } from "@/lib/supabase/client";
import { isTestMode } from "@/lib/testMode";

export const PHONE_UPDATED_EVENT = "creovix:phone-updated";

const dismissKey = (userId: string) => `creovix.phoneBanner:${userId}`;

function storedPhone(user: User): string {
  const meta = user.user_metadata ?? {};
  const fromMeta = [meta.phone, meta.mobile, meta.phone_number, meta.mobile_phone].find(
    (value) => typeof value === "string" && value.trim(),
  );
  return (typeof fromMeta === "string" ? fromMeta : user.phone) ?? "";
}

export function PhoneOnboardingBanner({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    if (isTestMode()) return;
    let cancelled = false;

    const refresh = async () => {
      if (sessionStorage.getItem(dismissKey(userId)) === "1") {
        if (!cancelled) setVisible(false);
        return;
      }
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (cancelled || !user || user.id !== userId) return;
      const complete = Boolean(normalizeCustomerPhone(storedPhone(user)));
      setWelcome(isFirstLogin(user));
      setVisible(!complete);
    };

    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener(PHONE_UPDATED_EVENT, onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(PHONE_UPDATED_EVENT, onUpdate);
    };
  }, [userId]);

  if (!visible) return null;

  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm"
      role="status"
    >
      <p className="min-w-0 flex-1 text-start leading-relaxed text-zinc-100">
        {welcome ? t("phoneBanner.welcome") : t("phoneBanner.missing")}
      </p>
      <Link
        to="/settings"
        search={{ setup: "phone" }}
        className="inline-flex h-9 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground"
      >
        {t("phoneBanner.cta")}
      </Link>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(dismissKey(userId), "1");
          setVisible(false);
        }}
        className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
        aria-label={t("phoneBanner.dismiss")}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
