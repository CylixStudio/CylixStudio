import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, Loader2 } from "lucide-react";

import { TestEventPlatformTabs } from "@/components/activity/TestEventPlatformTabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fireTestEvent, sendTestChatMessage, type TestEventInput } from "@/lib/simulate.functions";
import {
  TEST_EVENT_GROUPS,
  type TestEventSpec,
} from "@/lib/testEvents";
import { isTestMode } from "@/lib/testMode";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type InjectedFeedEvent = {
  id: string;
  platform: string;
  event_type: string;
  actor_name: string | null;
  amount: number | null;
  currency: string | null;
  quantity: number;
  seconds_added: number;
  message: string | null;
  created_at: string;
};

type Connection = { platform: string; is_active?: boolean | null };

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

function buildLocalEvent(
  platform: TestEventInput["platform"],
  spec: TestEventSpec,
): InjectedFeedEvent {
  const amount =
    spec.amount ??
    (spec.type === "DONATION" ? 5 : spec.type === "BITS" ? 100 : null);
  const quantity = Math.max(1, Math.round(spec.quantity ?? 1));

  return {
    id: `local-${crypto.randomUUID()}`,
    platform,
    event_type: spec.type,
    actor_name: actorFor(spec.type),
    amount,
    currency: spec.type === "DONATION" ? "USD" : null,
    quantity,
    seconds_added: 0,
    message: spec.message ?? null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Header control: fire a synthetic event for any ingest source.
 * Platform tabs keep the panel short; only the active source’s events show.
 */
export function TestEventMenu({
  widgetId,
  onInject,
  onPersisted,
}: {
  connections: Connection[];
  widgetId?: string | null;
  onInject: (event: InjectedFeedEvent) => void;
  onPersisted?: (localId: string, realId: string) => void;
}) {
  const { t } = useLanguage();
  const fire = useServerFn(fireTestEvent);
  const testChat = useServerFn(sendTestChatMessage);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<TestEventInput["platform"]>(TEST_EVENT_GROUPS[0]!.platform);

  const activeGroup = useMemo(
    () => TEST_EVENT_GROUPS.find((group) => group.platform === tab) ?? TEST_EVENT_GROUPS[0]!,
    [tab],
  );

  const pick = async (platform: TestEventInput["platform"], spec: TestEventSpec) => {
    if (pending) return;
    const local = buildLocalEvent(platform, spec);
    onInject(local);
    if (isTestMode()) return;

    setPending(true);
    try {
      const response = (await fire({
        data: {
          platform,
          eventType: spec.type,
          amount: local.amount,
          actorName: local.actor_name,
          message: local.message,
          quantity: local.quantity,
        },
      })) as
        | { ok: true; result: { status: string; eventId?: string | null } }
        | { ok: false; error: string };

      if (response.ok && response.result.eventId) {
        onPersisted?.(local.id, response.result.eventId);
      }

      if (widgetId) {
        const author = local.actor_name ?? "TestViewer";
        void testChat({
          data: {
            widgetId,
            author,
            text: `${author} ${t(CHAT_KEY[spec.type])}`,
          },
        }).catch(() => {
          /* overlay chat is best-effort; the feed row already landed */
        });
      }
    } catch {
      /* local row stays — auth/subathon gaps should not hide the test */
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-4 py-2.5",
            "text-sm font-medium text-white",
            "transition-colors hover:bg-zinc-800 hover:border-white/15",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
            "disabled:pointer-events-none disabled:opacity-60",
          )}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin text-white/80" aria-hidden />
          ) : (
            <FlaskConical className="size-4 text-white/80" aria-hidden />
          )}
          {t("activity.testEvent")}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(30rem,calc(100vw-1rem))] !overflow-x-visible !overflow-y-auto rounded-2xl border-white/10 bg-[rgba(10,10,12,0.96)] p-0 shadow-2xl shadow-black/60 backdrop-blur-2xl"
      >
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
            <p className="text-start text-[0.72rem] font-semibold tracking-[0.02em] text-muted-foreground" dir="ltr">
              {t(activeGroup.headingKey)}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {activeGroup.events.map((event) => (
              <DropdownMenuItem
                key={`${activeGroup.platform}-${event.type}-${event.labelKey}`}
                disabled={pending}
                className="cursor-pointer rounded-xl border border-transparent px-3 py-2.5 text-[0.82rem] focus:border-white/8 focus:bg-white/[0.06]"
                onSelect={() => void pick(activeGroup.platform, event)}
              >
                <span
                  className="me-2 size-1.5 shrink-0 rounded-full"
                  style={{ background: activeGroup.color }}
                />
                <span dir="ltr">{t(event.labelKey)}</span>
              </DropdownMenuItem>
            ))}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
