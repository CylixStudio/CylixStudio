import { useNavigate, useRouteContext } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Crown,
  Gift,
  Info,
  Sparkles,
  Table2,
  UserRoundCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { PlanCompareDialog } from "@/components/onboarding/PlanCompareDialog";
import { RedeemCodeSection } from "@/components/onboarding/RedeemCodeSection";
import { TuwaiqCheckoutDialog } from "@/components/subscription/TuwaiqCheckoutDialog";
import { PlatformAsset } from "@/components/icons/platformAssets";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  ActivityPreview,
  ChatPreview,
  CountdownPreview,
  EmotePreview,
  MediaRequestPreview,
  SocialPreview,
  StreamEventsSchedulePreview,
  TimerPreview,
} from "@/components/hub/previews";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import {
  DEFAULT_PRO_BILLING,
  markGatewayCompleted,
  PLAN_PRICES,
  prepareProCheckout,
  PRO_BILLING_OPTIONS,
  PRO_BILLING_ORDER,
  type ProBillingInterval,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

const PLATFORMS = [
  { id: "kick" as const, labelKey: "home.filterKick" as TranslationKey },
  { id: "twitch" as const, labelKey: "home.filterTwitch" as TranslationKey },
  { id: "youtube" as const, labelKey: "home.filterYouTube" as TranslationKey },
  { id: "tiktok" as const, labelKey: "home.filterTikTok" as TranslationKey },
] as const;

type Bullet = { key: TranslationKey; tipKey: TranslationKey; included: boolean; preview: FeaturePreviewId };
type FeaturePreviewId =
  | "platforms"
  | "commands"
  | "timers"
  | "widgets"
  | "linkInBio"
  | "analytics"
  | "unlimited"
  | "advanced"
  | "emoteRain"
  | "export"
  | "giveaways"
  | "mediaRequests"
  | "streamEvents";

const FREE_FEATURES: Bullet[] = [
  { key: "gateway.free.bullet.platforms", tipKey: "gateway.tip.platforms", included: true, preview: "platforms" },
  { key: "gateway.free.bullet.commands", tipKey: "gateway.tip.commands", included: true, preview: "commands" },
  { key: "gateway.free.bullet.timers", tipKey: "gateway.tip.timers", included: true, preview: "timers" },
  { key: "gateway.free.bullet.widgets", tipKey: "gateway.tip.widgets", included: true, preview: "widgets" },
  { key: "gateway.free.bullet.giveaways", tipKey: "gateway.tip.giveaways", included: false, preview: "giveaways" },
  { key: "gateway.free.bullet.mediaRequests", tipKey: "gateway.tip.mediaRequests", included: false, preview: "mediaRequests" },
  { key: "gateway.free.bullet.streamEvents", tipKey: "gateway.tip.streamEvents", included: false, preview: "streamEvents" },
  { key: "gateway.free.bullet.linkInBio", tipKey: "gateway.tip.linkInBio", included: false, preview: "linkInBio" },
  { key: "gateway.free.bullet.analytics", tipKey: "gateway.tip.analytics", included: false, preview: "analytics" },
];

const PRO_FEATURES: Bullet[] = [
  { key: "gateway.pro.bullet.unlimited", tipKey: "gateway.tip.unlimited", included: true, preview: "unlimited" },
  { key: "gateway.pro.bullet.advanced", tipKey: "gateway.tip.advanced", included: true, preview: "advanced" },
  { key: "gateway.pro.bullet.emoteRain", tipKey: "gateway.tip.emoteRain", included: true, preview: "emoteRain" },
  { key: "gateway.pro.bullet.giveaways", tipKey: "gateway.tip.giveaways", included: true, preview: "giveaways" },
  { key: "gateway.pro.bullet.mediaRequests", tipKey: "gateway.tip.mediaRequests", included: true, preview: "mediaRequests" },
  { key: "gateway.pro.bullet.streamEvents", tipKey: "gateway.tip.streamEvents", included: true, preview: "streamEvents" },
  { key: "gateway.pro.bullet.linkInBio", tipKey: "gateway.tip.linkInBio", included: true, preview: "linkInBio" },
  { key: "gateway.pro.bullet.analytics", tipKey: "gateway.tip.analytics", included: true, preview: "analytics" },
  { key: "gateway.pro.bullet.export", tipKey: "gateway.tip.export", included: true, preview: "export" },
];

const BILLING_LABEL_KEY: Record<ProBillingInterval, TranslationKey> = {
  monthly: "gateway.billing.monthly",
  six_months: "gateway.billing.sixMonths",
  yearly: "gateway.billing.yearly",
};

function FeaturePreviewThumb({ id }: { id: FeaturePreviewId }) {
  const preview =
    id === "platforms" ? (
      <div className="flex h-full items-center justify-center gap-2 px-2">
        {(["kick", "twitch", "youtube", "tiktok"] as const).map((name) => (
          <span
            key={name}
            className="grid size-8 place-items-center rounded-lg border border-white/10 bg-zinc-900/80"
          >
            <PlatformAsset name={name} size={16} variant="Primary" className="size-4" />
          </span>
        ))}
      </div>
    ) : id === "commands" ? (
      <div className="flex h-full flex-col justify-end gap-1.5 px-3 py-2">
        {[
          { cmd: "!discord", reply: "Join our Discord →" },
          { cmd: "!socials", reply: "All links in bio" },
          { cmd: "!uptime", reply: "Live for 2h 14m" },
        ].map((row) => (
          <div
            key={row.cmd}
            className="rounded-lg border border-white/8 bg-zinc-900/70 px-2.5 py-1.5 text-[0.62rem]"
          >
            <span className="font-semibold text-[#bee1fc]">{row.cmd}</span>{" "}
            <span className="text-zinc-400">{row.reply}</span>
          </div>
        ))}
      </div>
    ) : id === "timers" ? (
      <CountdownPreview />
    ) : id === "widgets" ? (
      <ChatPreview />
    ) : id === "linkInBio" ? (
      <SocialPreview />
    ) : id === "analytics" ? (
      <ActivityPreview />
    ) : id === "unlimited" ? (
      <TimerPreview />
    ) : id === "emoteRain" ? (
      <EmotePreview />
    ) : id === "streamEvents" || id === "advanced" ? (
      <StreamEventsSchedulePreview />
    ) : id === "mediaRequests" ? (
      <MediaRequestPreview />
    ) : id === "giveaways" ? (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-3">
        <div className="grid size-14 place-items-center rounded-full border border-[#bee1fc]/35 bg-[#bee1fc]/10 text-[#bee1fc]">
          <Gift className="size-6" aria-hidden />
        </div>
        <p className="text-[0.65rem] text-zinc-400">!join · spin · winner</p>
      </div>
    ) : id === "export" ? (
      <div className="flex h-full flex-col justify-center gap-1.5 px-3 font-mono text-[0.58rem] text-zinc-400">
        <div className="rounded-lg border border-white/8 bg-zinc-900/80 px-2.5 py-2 leading-relaxed">
          <span className="text-emerald-400/90">{"{"}</span>
          <br />
          &nbsp;&nbsp;<span className="text-[#bee1fc]">&quot;version&quot;</span>:{" "}
          <span className="text-amber-200/90">&quot;1&quot;</span>,
          <br />
          &nbsp;&nbsp;<span className="text-[#bee1fc]">&quot;commands&quot;</span>:{" "}
          <span className="text-zinc-300">[…]</span>
          <br />
          <span className="text-emerald-400/90">{"}"}</span>
        </div>
      </div>
    ) : (
      <MediaRequestPreview />
    );

  return (
    <div
      className="relative mt-2 h-[7.25rem] w-full overflow-hidden rounded-lg border border-white/10 bg-[#0a0a0a]"
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, rgba(190,225,252,0.12), transparent 55%), linear-gradient(180deg, rgba(24,24,27,0.4), transparent 40%)",
        }}
      />
      <div className="relative h-full min-h-0">{preview}</div>
    </div>
  );
}

function FeatureList({ items }: { items: Bullet[] }) {
  const { t } = useLanguage();
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.key} className="flex items-start gap-2 text-[0.78rem] leading-snug sm:text-[0.82rem]">
          <span
            className={cn(
              "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
              item.included
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-rose-500/10 text-rose-400/80",
            )}
            aria-hidden
          >
            {item.included ? (
              <Check className="size-2.5 stroke-[2.75]" />
            ) : (
              <X className="size-2.5 stroke-[2.75]" />
            )}
          </span>
          <span className={cn("min-w-0 flex-1", item.included ? "text-zinc-100" : "text-zinc-500")}>
            {t(item.key)}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-zinc-700 bg-zinc-900 text-[0.58rem] font-bold text-zinc-400 transition-colors hover:border-[#bee1fc]/50 hover:text-[#bee1fc]"
                aria-label={t(item.tipKey)}
              >
                <Info className="size-2.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-[17.5rem] border border-zinc-700 bg-zinc-950 p-3 text-start text-[0.72rem] leading-relaxed text-zinc-100 shadow-xl"
            >
              <p>{t(item.tipKey)}</p>
              <FeaturePreviewThumb id={item.preview} />
            </TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

function FreePlanCard({
  title,
  price,
  period,
  description,
  features,
  cta,
  onCta,
}: {
  title: string;
  price: string;
  period: string;
  description: string;
  features: Bullet[];
  cta: string;
  onCta: () => void;
}) {
  return (
    <article className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/90 p-5 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.85)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-zinc-400">{title}</p>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-[2rem]">{price}</span>
            <span className="text-xs text-zinc-500">{period}</span>
          </div>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400">
          <Sparkles className="size-4" aria-hidden />
        </span>
      </div>

      <p className="mt-3 text-[0.82rem] leading-relaxed text-zinc-400">{description}</p>

      <div className="mt-4 min-h-0 flex-1 border-t border-zinc-800/90 pt-4">
        <FeatureList items={features} />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={onCta}
        className="mt-5 h-10 w-full border-zinc-700 bg-zinc-900/70 text-sm font-semibold text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800"
        data-tier="free"
      >
        {cta}
        <ChevronRight className="size-3.5 opacity-70 rtl:rotate-180" aria-hidden />
      </Button>
    </article>
  );
}

function ProBillingSelector({
  value,
  onChange,
}: {
  value: ProBillingInterval;
  onChange: (next: ProBillingInterval) => void;
}) {
  const { t } = useLanguage();
  return (
    <div
      role="tablist"
      aria-label={t("gateway.billing.selectorLabel")}
      className="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-950/80 p-1"
    >
      {PRO_BILLING_ORDER.map((interval) => {
        const active = value === interval;
        return (
          <button
            key={interval}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(interval)}
            className={cn(
              "rounded-md px-1.5 py-1.5 text-[0.68rem] font-semibold transition-colors sm:text-[0.72rem]",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
            )}
          >
            {t(BILLING_LABEL_KEY[interval])}
          </button>
        );
      })}
    </div>
  );
}

function ProPlanCard({
  badge,
  title,
  description,
  features,
  billing,
  onBillingChange,
  onActivateAccount,
  onGiftOrCode,
}: {
  badge: string;
  title: string;
  description: string;
  features: Bullet[];
  billing: ProBillingInterval;
  onBillingChange: (next: ProBillingInterval) => void;
  onActivateAccount: () => void;
  onGiftOrCode: () => void;
}) {
  const { t } = useLanguage();
  const option = PRO_BILLING_OPTIONS[billing];
  const Icon: LucideIcon = Crown;

  return (
    <article className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-primary/45 bg-gradient-to-b from-primary/[0.16] via-zinc-950 to-zinc-950 p-5 pt-6 shadow-[0_0_48px_-14px_color-mix(in_oklab,var(--primary)_55%,transparent)] sm:p-6">
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <span className="inline-flex items-center gap-1 rounded-b-lg border border-t-0 border-primary/35 bg-primary/15 px-3 py-1 text-[0.62rem] font-semibold tracking-wide text-primary">
          <Sparkles className="size-2.5" aria-hidden />
          {badge}
        </span>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-zinc-400">{title}</p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <span className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-[2rem]">
              {option.label}
            </span>
            <span className="text-xs text-zinc-500">{option.periodSuffix}</span>
            {option.savePercent != null ? (
              <span className="inline-flex items-center rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-emerald-300">
                {t("gateway.billing.save").replace("{percent}", String(option.savePercent))}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[0.72rem] text-zinc-400">{option.perMonthLabel}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/15 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>

      <ProBillingSelector value={billing} onChange={onBillingChange} />

      <p className="mt-3 text-[0.82rem] leading-relaxed text-zinc-400">{description}</p>

      <div className="mt-4 min-h-0 flex-1 border-t border-zinc-800/90 pt-4">
        <FeatureList items={features} />
      </div>

      <div
        className="mt-5 grid grid-cols-2 gap-2"
        role="group"
        aria-label={t("gateway.purchaseType.label")}
      >
        <Button
          type="button"
          variant="default"
          onClick={onActivateAccount}
          className="h-10 min-w-0 gap-1.5 px-2 text-[0.72rem] font-semibold shadow-[0_14px_36px_-16px_color-mix(in_oklab,var(--primary)_70%,transparent)] sm:text-[0.78rem]"
          data-tier="pro"
          data-billing-interval={option.id}
          data-amount={option.amount}
          data-currency={option.currency}
          data-months={option.months}
          data-purchase-type="direct"
        >
          <UserRoundCheck className="size-3.5 shrink-0 opacity-90" aria-hidden />
          <span className="truncate">{t("gateway.purchaseType.direct")}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onGiftOrCode}
          className="h-10 min-w-0 gap-1.5 border-zinc-700 bg-zinc-950/60 px-2 text-[0.72rem] font-semibold text-zinc-100 hover:bg-zinc-900 hover:text-white sm:text-[0.78rem]"
          data-tier="pro"
          data-purchase-type="gift"
        >
          <Gift className="size-3.5 shrink-0 opacity-90" aria-hidden />
          <span className="truncate">{t("gateway.purchaseType.gift")}</span>
        </Button>
      </div>
      <p className="mt-2 text-[0.72rem] leading-relaxed text-zinc-500">
        {t("gateway.purchaseType.directHint")} {t("gateway.purchaseType.giftHint")}
      </p>
    </article>
  );
}

export function GatewayPlansPanel({
  onContinueFree,
  className,
}: {
  onContinueFree?: () => void;
  className?: string;
} = {}) {
  const { t } = useLanguage();
  const { user } = useRouteContext({ from: "/_authenticated" });
  const navigate = useNavigate();
  const [compareOpen, setCompareOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [purchaseType, setPurchaseType] = useState<"direct" | "gift">("direct");
  const [proBilling, setProBilling] = useState<ProBillingInterval>(DEFAULT_PRO_BILLING);

  const goDashboard = () => {
    markGatewayCompleted();
    void navigate({ to: "/dashboard" });
  };

  const continueFree = onContinueFree ?? goDashboard;

  const activateOnAccount = () => {
    prepareProCheckout(proBilling, {
      purchaseType: "direct",
      userId: user.id,
      buyerEmail: user.email ?? null,
    });
    setPurchaseType("direct");
    setCheckoutOpen(true);
  };

  const openGiftOrCode = () => {
    prepareProCheckout(proBilling, {
      purchaseType: "gift",
      userId: user.id,
      buyerEmail: user.email ?? null,
    });
    setPurchaseType("gift");
    setCheckoutOpen(true);
  };

  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn("flex w-full flex-col", className)}>
        <section
          className="grid min-h-0 items-stretch gap-4 sm:grid-cols-2 sm:gap-5"
          aria-label={t("gateway.plansLabel")}
        >
          <FreePlanCard
            title={t("gateway.free.name")}
            price={PLAN_PRICES.free.label}
            period={t("gateway.price.period")}
            description={t("gateway.free.description")}
            features={FREE_FEATURES}
            cta={t("gateway.free.cta")}
            onCta={continueFree}
          />
          <ProPlanCard
            badge={t("gateway.pro.badge")}
            title={t("gateway.pro.name")}
            description={t("gateway.pro.description")}
            features={PRO_FEATURES}
            billing={proBilling}
            onBillingChange={setProBilling}
            onActivateAccount={activateOnAccount}
            onGiftOrCode={openGiftOrCode}
          />
        </section>

        <div className="my-5 flex shrink-0 items-center gap-3 sm:my-6" role="presentation">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[0.75rem] font-medium text-zinc-400 transition-colors hover:border-primary/40 hover:bg-zinc-900 hover:text-zinc-100"
          >
            <Table2 className="size-3 text-primary transition-transform group-hover:scale-105" aria-hidden />
            {t("gateway.compare.open")}
          </button>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
        </div>

        <RedeemCodeSection
          id="gateway-redeem"
          className="mx-auto w-full max-w-xl shrink-0"
          onActivated={goDashboard}
        />

        <PlanCompareDialog open={compareOpen} onOpenChange={setCompareOpen} />
        <TuwaiqCheckoutDialog
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          interval={proBilling}
          purchaseType={purchaseType}
        />
      </div>
    </TooltipProvider>
  );
}

export function GatewayPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const goDashboard = () => {
    markGatewayCompleted();
    void navigate({ to: "/dashboard" });
  };

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-charcoal text-foreground">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "var(--gradient-glow)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute start-1/2 top-[-12%] size-[36rem] -translate-x-1/2 rounded-full bg-primary/[0.09] blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <header className="mx-auto w-full max-w-2xl shrink-0 text-center">
          <div className="mb-4 flex justify-center">
            <BrandLogo markOnly size="lg" className="sm:hidden" />
            <BrandLogo markOnly size="xl" className="hidden sm:inline-flex" />
          </div>
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl lg:text-[2.15rem] lg:leading-[1.15]">
            {t("gateway.welcome.title")}
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-pretty text-[0.86rem] leading-relaxed text-zinc-400 sm:text-[0.95rem]">
            {t("gateway.welcome.subtitle")}
          </p>

          <div className="mt-4 flex justify-center">
            <ul
              className="inline-flex flex-wrap items-center justify-center gap-1.5"
              aria-label={t("gateway.welcome.platformsLabel")}
            >
              {PLATFORMS.map((platform) => (
                <li
                  key={platform.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950/90 px-2.5 py-1 text-[0.72rem] text-zinc-200"
                >
                  <PlatformAsset
                    name={platform.id}
                    size={12}
                    variant={platform.id === "kick" ? "Black" : "White"}
                    className="size-3"
                  />
                  {t(platform.labelKey)}
                </li>
              ))}
              <li className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary">
                {t("gateway.welcome.multiPlatform")}
              </li>
            </ul>
          </div>
        </header>

        <div className="mt-8 w-full sm:mt-10">
          <GatewayPlansPanel onContinueFree={goDashboard} />
        </div>
      </div>
    </main>
  );
}
