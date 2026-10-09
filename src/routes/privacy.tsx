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
  { id: "who-we-are", title: "Who we are" },
  { id: "scope", title: "Scope of this policy" },
  { id: "collect", title: "Information we collect" },
  { id: "use", title: "How we use information" },
  { id: "sharing", title: "Sharing and third parties" },
  { id: "cookies", title: "Cookies and local storage" },
  { id: "retention", title: "Retention and deletion" },
  { id: "security", title: "Security" },
  { id: "languages", title: "Languages and encoding" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" },
];

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "CylixStudio — Privacy Policy" },
      {
        name: "tiktok-developers-site-verification",
        content: "TG3OrSUXmfGrebUgymWUiCpJMPANy5z3",
      },
      {
        name: "description",
        content:
          "How CylixStudio collects, uses, stores and deletes data from connected streaming accounts, widgets, media requests and analytics.",
      },
      { property: "og:title", content: "CylixStudio — Privacy Policy" },
      {
        property: "og:description",
        content:
          "What CylixStudio reads from Twitch, Kick and optional connections, how overlays use it, and how you can delete it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      lastUpdated={LEGAL_UPDATED}
      toc={TOC}
      lede="This Privacy Policy explains how CylixStudio handles information when you sign in, connect streaming platforms, run overlays, or use studio tools. It is the platform’s policy text — not legal advice about your stream, your audience, or the laws that apply to you. If you need advice for your own situation, consult qualified counsel."
    >
      <LegalSection id="who-we-are" title="Who we are">
        <p>
          CylixStudio is a live-stream overlay and studio product for creators. The service is
          operated by {LEGAL_OPERATOR}. We have not published a separate registered legal entity
          name or company number in this product.
        </p>
        <p>
          Production site:{" "}
          <span className="text-foreground">https://creovixstudio.org</span>. Privacy questions:{" "}
          <a className="text-foreground underline-offset-4 hover:underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="scope" title="Scope of this policy">
        <p>
          This policy covers the CylixStudio website, control room, public overlay URLs,
          mark-point share links, media-request player, giveaway overlays, schedule feeds,
          and related APIs. It does not replace the privacy policies of Twitch, Kick, TikTok,
          YouTube, Spotify, Anghami, SoundCloud, Streamlabs, StreamElements, OBS, or any payment
          or redeem-code partner you use.
        </p>
        <p>
          The product interface is English only (<code className="text-foreground">lang=&quot;en&quot;</code>,{" "}
          <code className="text-foreground">dir=&quot;ltr&quot;</code>). Viewer chat, titles, commands and other
          user content may still contain other languages; that is user-generated content, not a
          change of our UI language.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="Information we collect">
        <LegalSub title="Account and sign-in">
          <p>
            You sign in with Twitch or Kick OAuth. TikTok connect may appear in the product as{" "}
            <strong className="font-medium text-foreground">Coming Soon</strong> and is not an
            active login path until we enable it. When a provider is connected we receive the
            identifiers they return (for example open id or user id, username, display name,
            avatar, and email if the provider supplies one) and we create a CylixStudio account
            in Supabase Auth.
          </p>
        </LegalSub>

        <LegalSub title="OAuth tokens and platform connections">
          <p>
            Access and refresh tokens for platforms you connect are stored on our servers so
            widgets can keep reading live channel data after you leave the dashboard. Tokens are
            used only to operate the product. We do not sell them. Settings backups export
            connection <em>status</em> (platform, username, whether it is connected) and do{" "}
            <strong className="font-medium text-foreground">not</strong> include OAuth tokens.
          </p>
          <p>
            Depending on what you connect, we may also store Streamlabs or StreamElements socket
            or JWT credentials you paste so donation and tip events can reach overlays. Those
            credentials stay with your account and are not placed in settings export files.
          </p>
        </LegalSub>

        <LegalSub title="Chat ingest, webhooks and channel points">
          <p>
            To drive chat box, spotlight, emote rain, custom commands, message timers, giveaways
            and media requests, we ingest chat and related events from connected
            platforms. Kick channel events may arrive through Kick webhooks. Twitch EventSub and
            similar subscriptions may be used for follows, subscriptions, bits and related
            activity. Channel-point or equivalent redemptions (for example Kick media requests)
            include the redeemer’s platform id, username, avatar if provided, and the text or URL
            they submitted.
          </p>
        </LegalSub>

        <LegalSub title="Widgets, overlays and studio tools">
          <p>We store the configuration and runtime state needed for the tools you enable, including:</p>
          <ul className="list-disc space-y-1 ps-5">
            <li>Chat box, chat spotlight and emote rain layouts and filters.</li>
            <li>Subathon timer rules, remaining time and awarded events.</li>
            <li>Goal bars (followers, subscribers, donations, custom targets).</li>
            <li>Giveaway keywords, entries and winners.</li>
            <li>Custom chat commands.</li>
            <li>Message timers (scheduled chat messages).</li>
            <li>Schedule items and public calendar / ICS tokens.</li>
            <li>Mark points (timestamps, notes, optional VOD links, share tokens).</li>
            <li>Live counter snapshots and favorites you pin in the browser.</li>
            <li>Analytics aggregates derived from ingested events.</li>
          </ul>
          <p>
            Public overlay and share URLs include unguessable tokens. Anyone with a token can
            load that overlay or share page. Treat tokens like passwords.
          </p>
        </LegalSub>

        <LegalSub title="Media requests">
          <p>
            Viewers may submit YouTube, Spotify, Anghami or SoundCloud URLs through chat or
            channel-point flows. We parse the URL, fetch public metadata (title, artist or
            channel, thumbnail, duration, embeddability) from official platform APIs or oEmbed,
            and store a moderated queue. Playback in OBS uses official embeds or widgets — we do
            not host or redistribute pirated files, and we do not promise full-catalog playback
            (Spotify and Anghami embeds are often previews or link-outs).
          </p>
        </LegalSub>

        <LegalSub title="Analytics events">
          <p>
            The Analytics view summarises follows, subscriptions, tips and bits (cheers) over a
            range you choose. Those series come from events we already ingest to run overlays.
            We do not sell analytics to advertisers.
          </p>
        </LegalSub>

        <LegalSub title="Subscriptions and redeem codes">
          <p>
            Some features require an active subscription. Access may be time-limited or{" "}
            <strong className="font-medium text-foreground">Lifetime Access</strong> after a valid
            redeem code. We store subscription status, expiry, the active code, lifetime flag,
            and redeem metadata (who redeemed, when). Payment processors, if used, handle card
            data under their own policies; we do not ask you to paste full card numbers into
            CylixStudio.
          </p>
        </LegalSub>

        <LegalSub title="Test mode">
          <p>
            “Continue without login (Test Mode)” keeps a flag and sample studio data in your
            browser <code className="text-foreground">localStorage</code>. That data stays on the
            device unless you later export it or sign in and import settings. Test mode is not a
            substitute for a secured account.
          </p>
        </LegalSub>
      </LegalSection>

      <LegalSection id="use" title="How we use information">
        <p>We use the information above to:</p>
        <ul className="list-disc space-y-1 ps-5">
          <li>Authenticate you and keep platform connections alive.</li>
          <li>Render OBS / browser overlays and studio control panels.</li>
          <li>Apply subathon rules, goals, giveaways, commands and media queues.</li>
          <li>Show activity history and analytics you request.</li>
          <li>Enforce redeem codes, lifetime flags and feature locks.</li>
          <li>Secure the service, prevent abuse, and respond to deletion requests.</li>
        </ul>
        <p>We do not sell personal information. We do not use connected-account data for third-party advertising.</p>
      </LegalSection>

      <LegalSection id="sharing" title="Sharing and third parties">
        <p>
          We share data with infrastructure we use to run the product (notably Supabase for
          accounts, database and row-level access control) and with the platforms you choose to
          connect. Those platforms’ terms and developer policies apply to you and to us.
        </p>
        <p>
          Third parties you may connect or whose content you display include Twitch, Kick,
          TikTok (when available), YouTube, Spotify, Anghami, SoundCloud, and Streamlabs or
          StreamElements if you paste their credentials. Payment or redeem-code partners only
          receive what is needed to validate access. We do not sell OAuth tokens.
        </p>
        <p>
          Overlay URLs, mark-point links, media-request players and schedule feeds
          are visible to whoever has the link (for example OBS on your PC, or a moderator using
          a queue page). That is intentional product behaviour, not a sale of data.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and local storage">
        <p>
          We use essential cookies and similar storage to keep you signed in and to protect the
          OAuth state handshake. We do not use advertising or cross-site tracking cookies.
        </p>
        <p>
          The browser may also store test-mode data, sidebar collapse, language preference keys
          (the UI remains English), live-counter favorites, and similar studio prefs in{" "}
          <code className="text-foreground">localStorage</code>.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="Retention and deletion">
        <p>
          Disconnect a platform in Settings to revoke that connection and remove stored tokens
          for it. You can export a settings backup (commands, connection
          labels — not tokens) and delete widgets or queue items from the control room.
        </p>
        <p>
          To delete your whole account and associated server-side data (events, commands, marks,
          media queue, subscription records we hold), email{" "}
          <a className="text-foreground underline-offset-4 hover:underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          . We will process the request as soon as reasonably practicable. Copies in backups or
          logs may persist for a limited period. Test-mode data must be cleared in your own
          browser.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          Server records are scoped to the owning account. OAuth tokens are read by our servers
          to call platform APIs; they are not meant to be exposed in the browser or in export
          files. No method of transmission or storage is 100% secure. You are responsible for
          who you share overlay tokens with and for complying with each platform’s security
          rules.
        </p>
      </LegalSection>

      <LegalSection id="languages" title="Languages and encoding">
        <p>
          The product stores text as UTF-8. Chat lines, custom command replies, mark notes and
          media titles may include Arabic or other scripts. Example of user content (not UI
          chrome):
        </p>
        <p
          dir="auto"
          className="rounded-xl border border-border/80 bg-card/60 px-4 py-3 text-sm text-foreground"
        >
          !song أسمع هذا https://youtu.be/dQw4w9WgXcQ
        </p>
        <p>
          Direction is <code className="text-foreground">dir=&quot;auto&quot;</code> only on user-content
          snippets like the one above. The studio chrome stays left-to-right English.
        </p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>
          CylixStudio is aimed at streamers who already have accounts on Twitch, Kick or
          similar platforms. Those platforms set their own minimum ages. We do not knowingly
          collect personal information from children in violation of those rules. If you believe
          we have, contact us and we will delete the account data we hold.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes">
        <p>
          We may update this policy as the product changes. The “Last updated” date at the top
          will change. Continued use after an update means you accept the revised policy for
          future use of the service.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          Operator: {LEGAL_OPERATOR}. Email:{" "}
          <a className="text-foreground underline-offset-4 hover:underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          . Related:{" "}
          <Link to="/terms" className="text-foreground underline-offset-4 hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
