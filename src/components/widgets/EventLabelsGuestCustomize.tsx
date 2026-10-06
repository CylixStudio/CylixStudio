import { useState } from "react";

import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { StandaloneWidgetFields } from "@/components/widgets/StandaloneWidgetFields";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { useLanguage } from "@/lib/i18n";
import { SIGNED_OUT_ERROR } from "@/lib/supabase/sessionError";

/** Local event-label editor for a signed-out visit. Nothing is saved and no token is minted. */
export function EventLabelsGuestCustomize() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<Record<string, unknown>>({});

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <div className="space-y-4">
        <SessionAwareError error={SIGNED_OUT_ERROR} signedOutLabel={t("tools.signedOut")} />
        <StandaloneWidgetFields
          type="EVENT_LABELS"
          config={config}
          set={(key, value) => setConfig((prev) => ({ ...prev, [key]: value }))}
        />
      </div>
      <div className="grid min-h-[420px] place-items-center rounded-2xl border border-zinc-800 bg-[repeating-conic-gradient(#16171d_0%_25%,#101116_0%_50%)] bg-[length:32px_32px] p-6">
        <WidgetRenderer
          type="EVENT_LABELS"
          config={config}
          frame={null}
          remaining={0}
          goal={null}
          events={[]}
          spin={null}
        />
      </div>
    </div>
  );
}
