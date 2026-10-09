import { createFileRoute, Link } from "@tanstack/react-router";

import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_OPERATOR,
  LEGAL_UPDATED,
  LegalDocument,
  LegalSection,
  LegalSub,
  type LegalTocItem,
} from "@/components/legal/LegalDocument";

const TOC: LegalTocItem[] = [
  { id: "agreement", title: "Agreement" },
  { id: "service", title: "The service" },
  { id: "accounts", title: "Accounts and authentication" },
  { id: "access", title: "Subscriptions and redeem codes" },
  { id: "platforms", title: "Connected platforms" },
  { id: "overlays", title: "Widgets and overlays" },
  { id: "media", title: "Media requests" },
  { id: "ugc", title: "User-generated content" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "availability", title: "Availability" },
  { id: "ip", title: "Intellectual property" },
  { id: "disclaimer", title: "Disclaimers" },
  { id: "liability", title: "Liability" },
  { id: "termination", title: "Termination" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" },
];

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Terms of Service" },
      {
        name: "tiktok-developers-site-verification",
        content: "FMGidZnFrpK7GvuJ8jmtExedcI6gVHIF",
      },
      {
        name: "description",
        content:
          "Terms of Service for CylixStudio: accounts, overlays, media requests, redeem codes, platform policies and acceptable use.",
      },
      { property: "og:title", content: "CylixStudio — Terms of Service" },
      {
        property: "og:description",
        content: "Rules for using CylixStudio widgets, overlays, media queues and studio tools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      lastUpdated={LEGAL_UPDATED}
      toc={TOC}
      lede="These Terms of Service are the rules for using CylixStudio. They are the platform’s contract text, not legal advice about streaming, copyright, gambling, giveaways or privacy law in your country. You are responsible for your own compliance. If you need advice, consult qualified counsel."
    >
      <LegalSection id="agreement" title="1. Agreement">
        <p>
          By signing in, redeeming a code, using Test Mode, or loading an overlay, you agree to
          these Terms and to the{" "}
          <Link to="/privacy" className="text-foreground underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          . If you do not agree, do not use the service.
        </p>
        <p>
          The service is operated by {LEGAL_OPERATOR}. We have not published a separate company
          registration number in this product. Contact:{" "}
          <a className="text-foreground underline-offset-4 hover:underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="service" title="2. The service">
        <p>
          CylixStudio provides a control room and browser sources for live streams. Features
          include, without limitation:
        </p>
        <ul className="list-disc space-y-1 ps-5">
          <li>Chat box, chat spotlight and emote rain.</li>
          <li>Subathon timer with configurable rules and a dedicated overlay.</li>
          <li>Goal bars for followers, subscribers, donations or custom targets.</li>
          <li>Media requests (YouTube, Spotify, Anghami, SoundCloud) with a moderated queue.</li>
          <li>Giveaways, custom commands and message timers.</li>
          <li>Schedule, mark points, live counter and analytics.</li>
        </ul>
        <p>
          TikTok login and some TikTok-specific overlays (for example tap leaderboards or tap
          goals) may be labelled <strong className="font-medium text-foreground">Coming Soon</strong>{" "}
          and may be unavailable until we enable them.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="3. Accounts and authentication">
        <p>
          Sign-in is via Twitch or Kick OAuth. TikTok connect may be Coming Soon. You must have
          the right to authorise the requested scopes. You are responsible for activity under
          your account and for keeping overlay tokens and dashboard access private.
        </p>
        <p>
          Test Mode stores demo data in browser localStorage and does not create a full hosted
          account. Data in Test Mode can be lost if you clear site data.
        </p>
      </LegalSection>

      <LegalSection id="access" title="4. Subscriptions, redeem codes and lifetime access">
        <p>
          Some tools are locked until you have an active subscription. Access may be granted for
          a fixed number of days after you redeem an activation code, or as{" "}
          <strong className="font-medium text-foreground">Lifetime Access</strong> when a code or
          account flag says so (the same language the app shows in Settings).
        </p>
        <p>
          Codes become valid when redeemed. We may refuse, revoke or cancel a code that was
          leaked, resold against our instructions, obtained improperly, or used to evade a
          suspension. Revoking a redeemed code can return the account to the free / locked plan.
          Unused time is not automatically refunded in cash unless a separate purchase terms
          document says otherwise.
        </p>
      </LegalSection>

      <LegalSection id="platforms" title="5. Connected platforms and third-party terms">
        <p>
          When you connect Twitch, Kick, optional TikTok, Streamlabs, StreamElements or media
          platforms, you authorise CylixStudio to use tokens and events solely to operate
          widgets. Those tokens are stored to keep overlays working; they are not sold.
        </p>
        <p>
          You must comply with each provider’s terms and developer policies, including Twitch,
          Kick, YouTube, Spotify, Anghami, SoundCloud, and Streamlabs or StreamElements if
          connected, plus any payment or redeem partner. If a provider suspends your app access
          or changes an API, related widgets may stop without that being a breach by us.
        </p>
      </LegalSection>

      <LegalSection id="overlays" title="6. Widgets, overlays and broadcasting software">
        <p>
          Overlays are browser pages you add to OBS, Streamlabs Desktop or similar. We do not
          control your encoder, scene collection, GPU, or network. A widget that works in our
          preview can still fail in a misconfigured browser source.
        </p>
        <LegalSub title="Subathon timers">
          <p>
            Timer logic follows the rules you configure and the events we successfully ingest.
            Clock drift, missed webhooks, duplicate events, or a disconnected platform can
            change the displayed time. We do not guarantee that a subathon clock is a legal
            record of stream length or of money owed to anyone.
          </p>
        </LegalSub>
        <LegalSub title="Chat, commands, giveaways, marks, schedule">
          <p>
            Custom commands, message timers, giveaway keywords, schedule copy and mark-point
            notes are your content. Giveaways must follow the laws and platform rules that apply
            to your stream. Mark-point share links and schedule ICS feeds are public to anyone
            with the token.
          </p>
        </LegalSub>
      </LegalSection>

      <LegalSection id="media" title="7. Media requests">
        <p>
          Media Requests resolve public metadata and play items through official YouTube,
          Spotify, Anghami or SoundCloud embeds or widgets. The product is not a download
          locker, ripper or pirate CDN. You and your viewers must only submit links you are
          allowed to play on stream.
        </p>
        <p>
          Official embeds may be region-blocked, age-gated, preview-only, or refused by the
          platform. Kick channel-point text and chat URLs are stored in the queue so you can
          moderate them. We may refuse or drop items that look unlawful or that violate a
          provider’s terms.
        </p>
      </LegalSection>

      <LegalSection id="ugc" title="8. User-generated content">
        <p>
          Chat messages, media URLs, custom command text, mark notes, giveaway entries
          and similar material are user-generated content. You (and, where relevant, your
          viewers) are responsible for it. You grant {LEGAL_OPERATOR} a limited licence to host,
          display and transmit that content as needed to run the features you enable.
        </p>
        <p>
          Do not use the service for illegal content, including copyright infringement,
          child sexual abuse material, malware, or content that platforms forbid. We may remove
          content, queues, overlays or accounts when we believe these Terms or the law require
          it. We are not obligated to monitor all UGC.
        </p>
        <p>
          Example of a command a streamer might save (user content, not product UI):
        </p>
        <p
          dir="auto"
          className="rounded-xl border border-border/80 bg-card/60 px-4 py-3 text-sm text-foreground"
        >
          !uptime الرد: احنا لسه مكملين — timer overlays stay in English chrome.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="9. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 ps-5">
          <li>Break Twitch, Kick or other platform rules through our widgets.</li>
          <li>Harass people, scrape other users’ data, or attack the service.</li>
          <li>Share overlay tokens publicly if you need them to stay private.</li>
          <li>Circumvent subscription locks, redeem-code limits or rate limits.</li>
          <li>Use media request to traffic in pirated or unlicensed copies.</li>
        </ul>
      </LegalSection>

      <LegalSection id="availability" title="10. Availability">
        <p>
          We provide the service on a best-effort basis. We do not guarantee 100% uptime,
          webhook delivery, token refresh, or that every overlay will stay in sync for an entire
          stream. Maintenance, provider outages, and your local OBS or browser source can
          interrupt widgets.
        </p>
        <p>
          Subathon timers, live counters, analytics and media queues can lag or reset if events
          are missed. Lost stream time, donations or revenue are not our responsibility.
        </p>
      </LegalSection>

      <LegalSection id="ip" title="11. Intellectual property">
        <p>
          CylixStudio’s software, design and documentation remain ours or our licensors’.
          Platform logos and media you play remain those companies’ or the rights holders’.
          Your widget configs and UGC remain yours, subject to the licence in section 8.
        </p>
      </LegalSection>

      <LegalSection id="disclaimer" title="12. Disclaimers — not legal advice">
        <p>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE”. To the fullest extent permitted by
          law, we disclaim warranties of merchantability, fitness for a particular purpose, and
          non-infringement.
        </p>
        <p>
          This document is CylixStudio’s own policy and terms text. It is not legal advice
          to streamers about local law, tax, giveaways, music licensing, or platform enforcement.
          You should consult your own counsel for compliance in the places you stream.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="13. Limitation of liability">
        <p>
          To the fullest extent permitted by law, {LEGAL_OPERATOR} is not liable for indirect,
          incidental, special, consequential or lost-profit damages, including missed
          subscriptions, failed subathon clocks, overlay downtime, or a platform banning your
          channel. Our total liability for claims relating to the service is limited to the
          amount you paid us for access in the three months before the claim, or zero if you
          only used a free or redeem-code grant we did not charge for.
        </p>
        <p>
          You agree to indemnify {LEGAL_OPERATOR} against claims arising from your content, your
          streams, your giveaways, or your breach of these Terms or a third-party policy.
        </p>
      </LegalSection>

      <LegalSection id="termination" title="14. Termination">
        <p>
          You may stop using the service and disconnect platforms at any time. We may suspend or
          terminate accounts that breach these Terms, abuse redeem codes, or create risk for
          other users or platform partnerships. After termination, overlay URLs and tokens may
          stop working.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="15. Changes">
        <p>
          We may update these Terms as the product changes. The “Last updated” date will change.
          If you continue to use the service after an update, the new Terms apply to that
          continued use.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="16. Contact">
        <p>
          Questions about these terms:{" "}
          <a className="text-foreground underline-offset-4 hover:underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          . Operator: {LEGAL_OPERATOR}. Related:{" "}
          <Link to="/privacy" className="text-foreground underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
