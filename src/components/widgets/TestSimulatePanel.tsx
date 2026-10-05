import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { TestEventPlatformTabs } from "@/components/activity/TestEventPlatformTabs";
import { widgetErrorText } from "@/lib/createWidget";
import { isMissingViewerSession } from "@/lib/supabase/sessionError";
import { fireTestEvent, sendTestChatMessage, type TestEventInput } from "@/lib/simulate.functions";
import { TEST_EVENT_GROUPS, type TestEventSpec } from "@/lib/testEvents";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

const CHAT_KEY: Record<TestEventInput["eventType"], TranslationKey> = {
  FOLLOW: "activity.chat.FOLLOW",
  DONATION: "activity.chat.DONATION",
  SUBSCRIPTION: "activity.chat.SUBSCRIPTION",
  BITS: "activity.chat.BITS",
  GIFT_SUB: "activity.chat.GIFT_SUB",
  RAID: "activity.chat.RAID",
  LIKE: "activity.chat.LIKE",
};

function actorFor(type: TestEventInput["eventType"]): string {
  const stamp = Math.floor(Math.random() * 900 + 100);
  if (type === "DONATION") return `TestDonor${stamp}`;
  if (type === "SUBSCRIPTION") return `TestSub${stamp}`;
  if (type === "GIFT_SUB") return `TestGifter${stamp}`;
  if (type === "BITS") return `TestCheer${stamp}`;
  if (type === "RAID") return `TestRaider${stamp}`;
  if (type === "LIKE") return `TestFan${stamp}`;
  return `TestFan${stamp}`;
}

/**
 * Widget test control. Same platform-icon tabs and per-platform event list
 * as the Activity "Test Event" menu.
 */
export function TestSimulatePanel({ widgetId }: { widgetId: string }) {
  const { t } = useLanguage();
  const fire = useServerFn(fireTestEvent);
  const testChat = useServerFn(sendTestChatMessage);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<TestEventInput["platform"]>(TEST_EVENT_GROUPS[0]!.platform);

  const activeGroup = useMemo(
    () => TEST_EVENT_GROUPS.find((group) => group.platform === tab) ?? TEST_EVENT_GROUPS[0]!,
    [tab],
  );

  const pick = async (platform: TestEventInput["platform"], spec: TestEventSpec) => {
    if (pending) return;
    setPending(true);
    setNotice(null);
    const actor = actorFor(spec.type);
    const amount =
      spec.amount ?? (spec.type === "DONATION" ? 5 : spec.type === "BITS" ? 100 : null);
    const quantity = Math.max(1, Math.round(spec.quantity ?? 1));
    try {
      const response = (await fire({
        data: {
          platform,
          eventType: spec.type,
          amount,
          actorName: actor,
          message: spec.message ?? null,
          quantity,
        },
      })) as
        | { ok: true; result: { status: string } }
        | { ok: false; error: string };

      if (!response.ok) {
        setNotice(response.error);
        return;
      }

      void testChat({
        data: {
          widgetId,
          author: actor,
          text: `${actor} ${t(CHAT_KEY[spec.type])}`,
        },
      }).catch(() => {
        /* overlay chat is best-effort; the event already went through ingest */
      });
      setNotice(t(spec.labelKey));
    } catch (error) {
      const message = widgetErrorText(error, "Failed");
      setNotice(isMissingViewerSession(message) ? t("widget.signedOut") : message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[rgba(10,10,12,0.96)] shadow-2xl shadow-black/60">
      <div className="border-b border-white/8 px-3 pb-3 pt-3">
        <p className="mb-2.5 text-start text-[0.62rem] font-semibold tracking-[0.02em] text-muted-foreground">
          {t("settings.test.platformsAria")}
        </p>
        <TestEventPlatformTabs activePlatform={activeGroup.platform} onSelect={setTab} />
      </div>

      <div
        key={activeGroup.platform}
        role="tabpanel"
        className="animate-in fade-in-0 slide-in-from-top-1 p-3 duration-200"
      >
        <div className="mb-2.5 flex items-center gap-2">
          <span
            className="size-1.5 rounded-full"
            style={{ background: activeGroup.color }}
            aria-hidden
          />
          <p
            className="text-start text-[0.72rem] font-semibold tracking-[0.02em] text-muted-foreground"
            dir="ltr"
          >
            {t(activeGroup.headingKey)}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {activeGroup.events.map((event) => (
            <button
              key={`${activeGroup.platform}-${event.type}-${event.labelKey}`}
              type="button"
              disabled={pending}
              onClick={() => void pick(activeGroup.platform, event)}
              className="flex cursor-pointer items-center rounded-xl border border-transparent px-3 py-2.5 text-start text-[0.82rem] transition-colors hover:border-white/8 hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-60"
            >
              <span
                className="me-2 size-1.5 shrink-0 rounded-full"
                style={{ background: activeGroup.color }}
              />
              <span dir="ltr">{t(event.labelKey)}</span>
            </button>
          ))}
        </div>
        {notice ? (
          <p className="mt-2 text-xs text-muted-foreground" dir="ltr">
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}
