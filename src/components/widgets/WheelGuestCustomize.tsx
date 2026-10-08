import { useMemo, useState } from "react";

import { StandaloneWidgetFields } from "@/components/widgets/StandaloneWidgetFields";
import { wheelSpinLockMs } from "@/components/widgets/SpinWheel";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { SessionAwareError } from "@/components/widgets/SessionAwareError";
import { useLanguage } from "@/lib/i18n";
import { SIGNED_OUT_ERROR } from "@/lib/supabase/sessionError";
import { parseSpinConfig, pickWeightedPrize, type SpinState } from "@/lib/widgets";

/** Local wheel editor for a signed-out visit. Nothing is saved and no token is minted. */
export function WheelGuestCustomize() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<Record<string, unknown>>({ prizes: [] });
  const [spin, setSpin] = useState<SpinState | null>(null);
  const [spinning, setSpinning] = useState(false);
  const prizes = useMemo(() => parseSpinConfig(config).prizes, [config]);

  const onSpin = () => {
    if (spinning || prizes.length === 0) return;
    const result = pickWeightedPrize(prizes);
    if (!result) return;
    setSpinning(true);
    setSpin({ result, spunAt: new Date().toISOString(), nonce: Date.now(), origin: null });
    window.setTimeout(() => setSpinning(false), wheelSpinLockMs());
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <div className="space-y-4">
        <SessionAwareError error={SIGNED_OUT_ERROR} signedOutLabel={t("tools.signedOut")} />
        <StandaloneWidgetFields
          type="SPIN_WHEEL"
          config={config}
          set={(key, value) => setConfig((prev) => ({ ...prev, [key]: value }))}
          onSpin={onSpin}
          spinning={spinning}
        />
      </div>
      <div className="grid min-h-[420px] place-items-center rounded-2xl border border-zinc-800 bg-[repeating-conic-gradient(#16171d_0%_25%,#101116_0%_50%)] bg-[length:32px_32px] p-6">
        <WidgetRenderer
          type="SPIN_WHEEL"
          config={config}
          frame={null}
          remaining={0}
          goal={null}
          events={[]}
          spin={spin}
          spinning={spinning}
          demo
        />
      </div>
    </div>
  );
}
