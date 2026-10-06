import { useState, type FormEvent, type ReactNode } from "react";

import { DarkSelect } from "@/components/ui/dark-select";
import { Input } from "@/components/ui/input";
import {
  BOTRIX_PLATFORMS,
  type BotRixLookupResult,
  type BotRixPlatform,
  type BotRixSection,
} from "@/lib/botrix";
import { lookupBotRixPublic } from "@/lib/botrix.functions";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

const PLATFORM_KEYS: Record<BotRixPlatform, TranslationKey> = {
  kick: "botrix.platform.kick",
  twitch: "botrix.platform.twitch",
  youtube: "botrix.platform.youtube",
};

function formErrorKey(error: "invalid_name" | "invalid_platform" | "unavailable"): TranslationKey {
  if (error === "invalid_name") return "botrix.error.invalidName";
  if (error === "invalid_platform") return "botrix.error.invalidPlatform";
  return "botrix.error.unexpected";
}

function formatCount(value: number, lang: string) {
  return value.toLocaleString(lang === "ar" ? "ar" : "en-US");
}

function SectionFrame({
  title,
  section,
  empty,
  children,
}: {
  title: string;
  section: BotRixSection<unknown>;
  empty: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section className="rounded-xl border border-white/10 bg-zinc-950/50 p-3">
      <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
      {section.ok ? (
        section.items.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">{children}</ul>
        )
      ) : (
        <p role="alert" className="mt-2 text-sm text-amber-200/90">
          {t(section.error === "timeout" ? "botrix.error.timeout" : "botrix.error.section")}
        </p>
      )}
    </section>
  );
}

export function BotRixPanel() {
  const { t, lang } = useLanguage();
  const [streamerName, setStreamerName] = useState("");
  const [platform, setPlatform] = useState<BotRixPlatform>("kick");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<TranslationKey | null>(null);
  const [result, setResult] = useState<Extract<BotRixLookupResult, { ok: true }> | null>(null);

  const count = (value: number) => formatCount(value, lang);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setFormError(null);
    setResult(null);
    try {
      const next = await lookupBotRixPublic({ data: { streamerName, platform } });
      if (!next.ok) {
        setFormError(formErrorKey(next.error));
        return;
      }
      setResult(next);
    } catch {
      setFormError("botrix.error.unexpected");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-busy={loading} className="glass-3d mb-5 rounded-2xl border border-white/10 bg-zinc-950 p-5">
      <h2 className="text-base font-medium tracking-tight">{t("botrix.title")}</h2>
      <p className="mt-1 text-[0.78rem] text-muted-foreground">{t("botrix.subtitle")}</p>

      <form onSubmit={(event) => void onSubmit(event)} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-start">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("botrix.channel")}
          </span>
          <Input
            value={streamerName}
            onChange={(event) => setStreamerName(event.target.value)}
            placeholder={t("botrix.channelPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
            dir="ltr"
            className="text-start"
          />
        </label>
        <label className="flex w-full flex-col gap-1.5 text-start sm:w-44">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("botrix.platform")}
          </span>
          <DarkSelect
            value={platform}
            onValueChange={(next) => {
              if (next === "kick" || next === "twitch" || next === "youtube") setPlatform(next);
            }}
            aria-label={t("botrix.platform")}
            className="h-9"
            options={BOTRIX_PLATFORMS.map((id) => ({ value: id, label: t(PLATFORM_KEYS[id]) }))}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="h-9 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? t("botrix.loading") : t("botrix.submit")}
        </button>
      </form>

      {formError ? (
        <p role="alert" className="mt-3 text-sm text-amber-200/90">
          {t(formError)}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <SectionFrame
            title={t("botrix.commands")}
            section={result.commands}
            empty={t("botrix.empty.commands")}
          >
            {result.commands.ok
              ? result.commands.items.map((item, index) => (
                  <li key={`${item.cmd}-${index}`} className="rounded-lg border border-white/5 px-2.5 py-2">
                    <p className="flex flex-wrap items-center gap-2 font-mono text-sm" dir="ltr">
                      {item.cmd}
                      {item.mods ? (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 font-sans text-[0.65rem] text-muted-foreground">
                          {t("botrix.mods")}
                        </span>
                      ) : null}
                    </p>
                    {item.message ? (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{item.message}</p>
                    ) : null}
                  </li>
                ))
              : null}
          </SectionFrame>

          <SectionFrame title={t("botrix.shop")} section={result.shop} empty={t("botrix.empty.shop")}>
            {result.shop.ok
              ? result.shop.items.map((item, index) => (
                  <li
                    key={`${item.name}-${item.price ?? "x"}-${index}`}
                    className="flex gap-3 rounded-lg border border-white/5 px-2.5 py-2"
                  >
                    {item.image ? (
                      <img src={item.image} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                    ) : null}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.price !== null ? (
                        <p className="text-xs text-muted-foreground">{t("botrix.points", { count: count(item.price) })}</p>
                      ) : null}
                      {item.description ? (
                        <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                      ) : null}
                    </div>
                  </li>
                ))
              : null}
          </SectionFrame>

          <SectionFrame
            title={t("botrix.leaderboard")}
            section={result.leaderboard}
            empty={t("botrix.empty.leaderboard")}
          >
            {result.leaderboard.ok
              ? result.leaderboard.items.map((item, index) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-white/5 px-2.5 py-2"
                  >
                    <p className="min-w-0 truncate text-sm font-medium">
                      <span className="me-2 text-muted-foreground">{index + 1}</span>
                      {item.name}
                    </p>
                    <p className="shrink-0 text-end text-[0.68rem] leading-5 text-muted-foreground">
                      {item.level !== null ? <span className="block">{t("botrix.level", { count: count(item.level) })}</span> : null}
                      {item.points !== null ? (
                        <span className="block">{t("botrix.points", { count: count(item.points) })}</span>
                      ) : null}
                      {item.xp !== null ? <span className="block">{t("botrix.xp", { count: count(item.xp) })}</span> : null}
                      {item.watchtime !== null ? (
                        <span className="block">{t("botrix.watchtime", { count: count(item.watchtime) })}</span>
                      ) : null}
                    </p>
                  </li>
                ))
              : null}
          </SectionFrame>
        </div>
      ) : null}
    </section>
  );
}
