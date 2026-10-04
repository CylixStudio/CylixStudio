import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Zap } from "lucide-react";

import { TestEventPlatformTabs } from "@/components/activity/TestEventPlatformTabs";
import { PlatformAsset } from "@/components/icons/platformAssets";
import { fireTestEvent, type TestEventInput } from "@/lib/simulate.functions";
import {
  TEST_EVENT_GROUPS,
  type TestEventGroup,
  type TestEventSpec,
} from "@/lib/testEvents";
import { useLanguage } from "@/lib/i18n";

/** Developer harness for firing one simulated event per platform. */
export function EventTestPanel() {
  const { t } = useLanguage();
  const run = useServerFn(fireTestEvent);
  const [name, setName] = useState("");
  const [log, setLog] = useState<{ text: string; ok: boolean }[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [tab, setTab] = useState<TestEventInput["platform"]>(TEST_EVENT_GROUPS[0]!.platform);

  const activeGroup = useMemo(
    () => TEST_EVENT_GROUPS.find((group) => group.platform === tab) ?? TEST_EVENT_GROUPS[0]!,
    [tab],
  );

  const mutation = useMutation({
    mutationFn: async (input: TestEventInput) =>
      (await run({ data: input })) as
        | { ok: true; result: { status: string; secondsAdded?: number } }
        | { ok: false; error: string },
  });

  const fire = async (group: TestEventGroup, event: TestEventSpec) => {
    const label = t(event.labelKey);
    const id = `${group.platform}-${event.type}-${event.labelKey}`;
    setPending(id);
    try {
      const response = await mutation.mutateAsync({
        platform: group.platform,
        eventType: event.type,
        amount: event.amount ?? null,
        actorName: name || null,
        message: event.message ?? null,
        quantity: event.quantity ?? null,
      });
      const text = response.ok
        ? `${t(group.headingKey)} · ${label} → ${response.result.status}${
            response.result.secondsAdded ? ` (+${response.result.secondsAdded}s)` : ""
          }`
        : `${t(group.headingKey)} · ${label} → ${response.error}`;
      setLog((prev) => [{ text, ok: response.ok }, ...prev].slice(0, 12));
    } catch (error) {
      setLog((prev) =>
        [
          { text: `${t(group.headingKey)} · ${label} → ${(error as Error).message}`, ok: false },
          ...prev,
        ].slice(0, 12),
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <section>
      <p className="text-[0.66rem] uppercase tracking-[0.22em] text-muted-foreground">
        {t("settings.test.title")}
      </p>
      <h2 className="mt-1 flex items-center gap-2 text-[0.95rem] font-semibold">
        <Zap className="size-4 text-primary" aria-hidden />
        {t("settings.test.heading")}
      </h2>
      <p className="mt-1 max-w-2xl text-[0.78rem] text-muted-foreground">{t("settings.test.body")}</p>

      <label className="mt-6 block max-w-xs text-sm">
        <span className="text-[0.8rem] text-muted-foreground">{t("settings.test.sender")}</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="TestViewer"
          dir="auto"
          className="mt-1 w-full rounded-lg border border-white/5 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
        <div className="border-b border-white/8 px-3 pb-2.5 pt-3">
          <TestEventPlatformTabs activePlatform={activeGroup.platform} onSelect={setTab} />
        </div>

        <div
          key={activeGroup.platform}
          role="tabpanel"
          className="animate-in fade-in-0 slide-in-from-top-1 p-4 duration-200"
        >
          <p
            className="mb-3 flex items-center gap-2 text-start text-sm font-semibold"
            style={{ color: activeGroup.color }}
            dir="ltr"
          >
            <PlatformAsset name={activeGroup.icon} size={14} label="" />
            <span>{t(activeGroup.headingKey)}</span>
          </p>
          <div className="flex flex-wrap justify-start gap-2">
            {activeGroup.events.map((event) => {
              const id = `${activeGroup.platform}-${event.type}-${event.labelKey}`;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void fire(activeGroup, event)}
                  className="min-h-9 rounded-full border border-white/8 px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <span dir="ltr">{pending === id ? t("settings.test.sending") : t(event.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {log.length > 0 ? (
        <ul className="mt-6 space-y-1 text-xs">
          {log.map((entry, index) => (
            <li
              key={`${entry.text}-${index}`}
              className={entry.ok ? "text-emerald-300" : "text-destructive"}
            >
              {entry.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
