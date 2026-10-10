import type { TranslationKey } from "@/lib/i18n";
import type { WidgetType } from "@/lib/widgets";

export type StandaloneTool = {
  slug:
    | "kicks-goal"
    | "viewer-counter"
    | "wheel"
    | "event-labels"
    | "donation-goal"
    | "follower-goal"
    | "subscriber-goal"
    | "poll"
    | "prediction";
  type: WidgetType;
  /** Stable English name stored on the widget row. */
  name: string;
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
  /** Customize lives on `/tools/$slug` and saves this kind only. */
  goalEditor?: boolean;
};

export const STANDALONE_TOOLS: StandaloneTool[] = [
  {
    slug: "kicks-goal",
    type: "KICKS_GOAL",
    name: "Kicks Goal",
    nameKey: "home.tool.kicksGoal.name",
    descriptionKey: "home.tool.kicksGoal.desc",
  },
  {
    slug: "viewer-counter",
    type: "VIEWER_COUNTER",
    name: "Viewer counter",
    nameKey: "home.tool.viewerCounter.name",
    descriptionKey: "home.tool.viewerCounter.desc",
  },
  {
    slug: "wheel",
    type: "SPIN_WHEEL",
    name: "Wheel of fortune",
    nameKey: "home.tool.wheel.name",
    descriptionKey: "home.tool.wheel.desc",
  },
  {
    slug: "event-labels",
    type: "EVENT_LABELS",
    name: "Latest events",
    nameKey: "home.tool.eventLabels.name",
    descriptionKey: "home.tool.eventLabels.desc",
  },
  {
    slug: "donation-goal",
    type: "DONATION_GOAL",
    name: "Donation Goal",
    nameKey: "home.tool.donationGoal.name",
    descriptionKey: "home.tool.donationGoal.desc",
    goalEditor: true,
  },
  {
    slug: "follower-goal",
    type: "FOLLOWER_GOAL",
    name: "Follower Goal",
    nameKey: "home.tool.followerGoal.name",
    descriptionKey: "home.tool.followerGoal.desc",
    goalEditor: true,
  },
  {
    slug: "subscriber-goal",
    type: "SUBSCRIBER_GOAL",
    name: "Subscriber Goal",
    nameKey: "home.tool.subscriberGoal.name",
    descriptionKey: "home.tool.subscriberGoal.desc",
    goalEditor: true,
  },
  {
    slug: "poll",
    type: "POLL",
    name: "Poll",
    nameKey: "home.tool.poll.name",
    descriptionKey: "home.tool.poll.desc",
  },
  {
    slug: "prediction",
    type: "PREDICTION",
    name: "Prediction",
    nameKey: "home.tool.prediction.name",
    descriptionKey: "home.tool.prediction.desc",
  },
];

export function standaloneToolBySlug(slug: string): StandaloneTool | null {
  return STANDALONE_TOOLS.find((tool) => tool.slug === slug) ?? null;
}
