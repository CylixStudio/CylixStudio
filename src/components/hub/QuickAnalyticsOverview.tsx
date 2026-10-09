import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import {
  MetricAnalyticsModal,
  type MetricKey,
} from "@/components/activity/MetricAnalyticsModal";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardAnalytics } from "@/hooks/useDashboardAnalytics";
import {
  customRange,
  isoDay,
  presetRange,
  summarizeEvents,
  type AnalyticsEvent,
  type DateRange,
} from "@/lib/dashboardAnalytics";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type RangePreset = "7" | "30" | "custom";

const METRIC_META: Record<
  MetricKey,
  { label: TranslationKey; empty: TranslationKey; hint: TranslationKey; accent: string; money?: boolean }
> = {
  followers: {
    label: "dash.followers",
    empty: "dash.followersEmpty",
    hint: "dash.followersHint",
    accent: "var(--primary)",
  },
  subs: {
    label: "dash.subs",
    empty: "dash.subsEmpty",
    hint: "dash.subsHint",
    accent: "var(--primary)",
  },
  tips: {
    label: "dash.tips",
    empty: "dash.tipsEmpty",
    hint: "dash.tipsHint",
    accent: "var(--primary)",
    money: true,
  },
  bits: {
    label: "dash.bits",
    empty: "dash.bitsEmpty",
    hint: "dash.bitsHint",
    accent: "var(--primary)",
  },
};

const METRIC_ORDER: MetricKey[] = ["followers", "subs", "tips", "bits"];

function formatDay(dateKey: string, lang: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatCount(value: number, lang: string) {
  return Math.round(value).toLocaleString("en-US");
}

function formatMoney(value: number, lang: string) {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMetric(key: MetricKey, value: number, lang: string) {
  return METRIC_META[key].money ? formatMoney(value, lang) : formatCount(value, lang);
}

function metricValue(key: MetricKey, overview: { followers: number; subscribers: number; tips: number; bits: number }) {
  if (key === "followers") return overview.followers;
  if (key === "subs") return overview.subscribers;
  if (key === "tips") return overview.tips;
  return overview.bits;
}

export function QuickAnalyticsOverview({
  chartHeight = 148,
  showHeading = true,
}: {
  chartHeight?: number;
  showHeading?: boolean;
}) {
  const { t } = useLanguage();
  const lang = "en";
  const query = useDashboardAnalytics();
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);

  const events = query.data?.events ?? [];
  const demo = query.data?.source === "demo";
  const loading = query.isLoading && !query.data;

  const chatLine = query.data?.chatTracked
    ? `${formatCount(query.data.messages, lang)} ${t("dash.chatMessages")}${
        query.data.commandsUsed > 0
          ? ` · ${formatCount(query.data.commandsUsed, lang)} ${t("dash.commandsUsed")}`
          : ""
      }`
    : t("dash.chatEmpty");

  return (
    <section className="mb-8" aria-labelledby="dash-analytics-heading">
      <div className="mb-5">
        {showHeading ? (
          <h2 id="dash-analytics-heading" className="text-sm font-medium tracking-tight">
            {t("dash.analytics")}
          </h2>
        ) : (
          <h2 id="dash-analytics-heading" className="sr-only">
            {t("dash.analytics")}
          </h2>
        )}
        <p className={`text-[0.72rem] text-muted-foreground ${showHeading ? "mt-1" : ""}`}>
          {demo ? <span className="text-muted-foreground/70">{t("dash.demo")} · </span> : null}
          {chatLine}
        </p>
      </div>

      {query.isError ? (
        <p className="py-8 text-start text-sm text-muted-foreground">{t("dash.loadError")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {METRIC_ORDER.map((key) => (
            <MetricChartCard
              key={key}
              metric={key}
              events={events}
              demo={demo}
              loading={loading}
              chartHeight={chartHeight}
              onOpen={() => setOpenMetric(key)}
            />
          ))}
        </div>
      )}

      {openMetric ? (
        <MetricAnalyticsModal
          metric={openMetric}
          title={t(METRIC_META[openMetric].label)}
          accent={METRIC_META[openMetric].accent}
          money={METRIC_META[openMetric].money ?? false}
          events={events}
          backLabel={t("dash.back")}
          onClose={() => setOpenMetric(null)}
        />
      ) : null}
    </section>
  );
}

function MetricChartCard({
  metric,
  events,
  demo,
  loading,
  chartHeight,
  onOpen,
}: {
  metric: MetricKey;
  events: AnalyticsEvent[];
  demo: boolean;
  loading: boolean;
  chartHeight: number;
  onOpen: () => void;
}) {
  const { t } = useLanguage();
  const lang = "en";
  const meta = METRIC_META[metric];
  const [preset, setPreset] = useState<RangePreset>("7");
  const [customFrom, setCustomFrom] = useState(() => isoDay(presetRange(14).start));
  const [customTo, setCustomTo] = useState(() => isoDay(new Date()));

  const range: DateRange = useMemo(
    () => (preset === "custom" ? customRange(customFrom, customTo) : presetRange(preset === "30" ? 30 : 7)),
    [customFrom, customTo, preset],
  );

  const overview = useMemo(() => summarizeEvents(events, range), [events, range]);
  const raw = metricValue(metric, overview);
  const empty = !demo && raw === 0;

  const series = useMemo(
    () =>
      overview.series.map((point) => ({
        date: point.date,
        label: formatDay(point.date, lang),
        value: point[metric],
      })),
    [lang, metric, overview.series],
  );

  const chartEmpty = series.every((point) => point.value === 0);
  const chartConfig = {
    value: { label: t(meta.label), color: meta.accent },
  } satisfies ChartConfig;

  return (
    <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-start">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${t(meta.label)}: ${formatMetric(metric, raw, lang)}`}
          className="min-w-0 text-start transition-opacity hover:opacity-80"
        >
          <p
            className="inline-flex items-center gap-1.5 text-[0.72rem]"
            style={{ color: `color-mix(in oklab, ${meta.accent} 72%, white)` }}
          >
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: meta.accent }} aria-hidden />
            {t(meta.label)}
          </p>
          {loading ? (
            <Skeleton className="mt-1.5 h-8 w-20 bg-white/5" />
          ) : (
            <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight" style={{ color: meta.accent }}>
              {formatMetric(metric, raw, lang)}
            </p>
          )}
          <span
            className="mt-2 block h-px w-8"
            style={{ background: `color-mix(in oklab, ${meta.accent} 48%, transparent)` }}
            aria-hidden
          />
          <p className="mt-1.5 text-[0.7rem] text-muted-foreground">{empty ? t(meta.empty) : t(meta.hint)}</p>
        </button>

        <div className="flex flex-col items-end gap-2">
          <div role="group" aria-label={t("dash.analyticsHint")} className="flex flex-wrap items-center gap-1">
            {(["7", "30", "custom"] as const).map((id) => {
              const on = preset === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPreset(id)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[0.68rem] transition-colors",
                    on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  style={
                    on
                      ? {
                          color: meta.accent,
                          background: `color-mix(in oklab, ${meta.accent} 14%, transparent)`,
                        }
                      : undefined
                  }
                >
                  {t(id === "7" ? "dash.range.7" : id === "30" ? "dash.range.30" : "dash.range.custom")}
                </button>
              );
            })}
          </div>
          {preset === "custom" ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <label className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
                {t("dash.rangeFrom")}
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1 text-[0.7rem] text-foreground outline-none"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
                {t("dash.rangeTo")}
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1 text-[0.7rem] text-foreground outline-none"
                />
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <Skeleton className="w-full rounded-xl bg-white/5" style={{ height: chartHeight }} />
      ) : chartEmpty ? (
        <p className="py-8 text-start text-sm text-muted-foreground">{t("dash.chartEmpty")}</p>
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height: chartHeight }}>
          <LineChart data={series} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              reversed={false}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
            />
            <ChartTooltip
              cursor={{ stroke: "rgba(255,255,255,0.18)", strokeOpacity: 0.5 }}
              content={<MetricTooltip lang={lang} metric={metric} />}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={metric}
              stroke={meta.accent}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: meta.accent }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}
    </article>
  );
}

function MetricTooltip({
  active,
  payload,
  lang,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { label?: string; value?: number } }>;
  lang: string;
  metric: MetricKey;
}) {
  const { t } = useLanguage();
  const row = payload?.[0]?.payload;
  if (!active || row?.value == null) return null;
  const accent = METRIC_META[metric].accent;

  return (
    <div className="min-w-[8.5rem] rounded-xl border border-white/10 bg-[rgba(12,14,20,0.95)] px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground">{row.label}</p>
      <p className="mt-1 flex items-center justify-between gap-6">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: accent }} aria-hidden />
          {t(METRIC_META[metric].label)}
        </span>
        <span className="tabular-nums" style={{ color: accent }}>
          {formatMetric(metric, row.value, lang)}
        </span>
      </p>
    </div>
  );
}
