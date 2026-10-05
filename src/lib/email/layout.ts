/**
 * CylixStudio transactional email shell.
 * Table layout, inline CSS, fluid to 560px. Logo is a CID attachment.
 * Page #2b2b2b, cards a step lighter, accent #bee1fc.
 */

export type EmailLayoutOptions = {
  /** Absolute site origin, e.g. https://cylixstudio.com */
  siteUrl: string;
  /** Document language — drives dir + lang. Default ar. */
  locale?: "ar" | "en";
  /** Main headline */
  title: string;
  /** Optional eyebrow above the title */
  eyebrow?: string;
  /** Inner HTML (already escaped where needed) */
  bodyHtml: string;
  /** Optional primary CTA */
  cta?: { label: string; href: string };
  /** Preheader text for inbox preview */
  preheader?: string;
};

export type EmailHero = "kick" | "twitch" | "youtube" | "pro" | "disconnect" | "version" | "studio";

export type PlatformStatusCard = {
  platform: string;
  username?: string | null;
  /** Visible status, e.g. `● متصل` */
  status: string;
  connected: boolean;
};

export type EventEmailOptions = EmailLayoutOptions & {
  hero: EmailHero;
  platformCard?: PlatformStatusCard;
  /** Small line above the support footer. Omitted when empty. */
  tagline?: string | null;
};

const FONT = "Tahoma,'Segoe UI',Arial,sans-serif";

const BRAND = {
  page: "#2b2b2b",
  card: "#353535",
  inset: "#3c3c3c",
  text: "#f7f7f7",
  muted: "#cfcfcf",
  faint: "#bdbdbd",
  accent: "#bee1fc",
  accentText: "#1a1a1a",
};

/** Content-ID for the inline PNG attached by the SMTP sender. */
export const EMAIL_LOGO_CID = "cylixstudio-logo";

/** Visible From / Reply-To mailbox unless EMAIL_FROM overrides it. */
export const TRANSACTIONAL_FROM_ADDRESS = "noreply@cylixstudio.com";

/** Human close on every event email. */
export const EMAIL_SIGN_OFF = "جاهز للبث؟ إحنا جاهزين معك.";

/** Footer line on every event email. */
export const EMAIL_FOOTER_LINE = "Cylix Studio · support@cylixstudio.com";

/** Production dashboard linked from event emails. */
export const SUBSCRIPTION_DASHBOARD_URL = "https://cylixstudio.com/dashboard";

/** Connections tab on the public settings route. */
export const STUDIO_CONNECTIONS_URL = "https://cylixstudio.com/settings?setup=connections";

/** Support address printed in the footer. From / Reply-To use noreply. */
export const SUBSCRIPTION_SUPPORT_EMAIL = "support@cylixstudio.com";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @deprecated Transactional HTML uses `cid:cylixstudio-logo`. Kept so older
 * imports still resolve; do not put this URL in a message body.
 */
export function emailLogoUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/apple-touch-icon.png`;
}

const HERO_GLOW: Record<EmailHero, { glow: string; edge: string; name: string; check: boolean }> = {
  kick: { glow: "rgba(93,222,160,0.55)", edge: "rgba(93,222,160,0.7)", name: "Kick", check: true },
  twitch: { glow: "rgba(145,70,255,0.58)", edge: "rgba(167,139,250,0.75)", name: "Twitch", check: true },
  youtube: { glow: "rgba(255,77,77,0.5)", edge: "rgba(255,99,99,0.72)", name: "YouTube", check: true },
  pro: { glow: "rgba(190,225,252,0.62)", edge: "rgba(125,206,160,0.7)", name: "Pro", check: true },
  disconnect: { glow: "rgba(240,140,70,0.5)", edge: "rgba(232,93,76,0.8)", name: "", check: false },
  version: { glow: "rgba(190,225,252,0.55)", edge: "rgba(190,225,252,0.75)", name: "Studio", check: false },
  studio: { glow: "rgba(190,225,252,0.4)", edge: "rgba(190,225,252,0.55)", name: "Cylix", check: false },
};

function logoBlock(): string {
  return `<img src="cid:${EMAIL_LOGO_CID}" width="40" alt="Cylix Studio" style="display:block;width:40px;max-width:40px;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto;" />`;
}

/** Static glow. Clients strip CSS animation, so this is box-shadow and a radial wash only. */
function heroBlock(hero: EmailHero): string {
  const spec = HERO_GLOW[hero];
  const identity = spec.name
    ? `<span style="font-family:${FONT};font-size:28px;line-height:1;font-weight:800;color:${BRAND.text};letter-spacing:-0.03em;">${escapeHtml(spec.name)}</span>`
    : `<span style="font-family:${FONT};font-size:28px;line-height:1;font-weight:800;color:#f0a05a;">●</span>`;
  const check = spec.check
    ? `<span style="display:inline-block;margin-inline-start:10px;width:22px;height:22px;line-height:22px;border-radius:999px;background:${BRAND.accent};color:${BRAND.accentText};font-family:${FONT};font-size:14px;font-weight:800;text-align:center;vertical-align:middle;">&#10003;</span>`
    : "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:22px auto 0;">
    <tr>
      <td align="center" style="border-radius:999px;background-color:${BRAND.card};background-image:radial-gradient(circle at 50% 40%, ${spec.glow}, ${BRAND.card} 72%);box-shadow:0 0 0 1px ${spec.edge}, 0 0 28px ${spec.glow};padding:16px 28px;">
        ${identity}${check}
      </td>
    </tr>
  </table>`;
}

function bulletproofButton(label: string, href: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto 0;">
    <tr>
      <td align="center" bgcolor="${BRAND.accent}" style="border-radius:999px;background:${BRAND.accent};">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="50%" stroke="f" fillcolor="${BRAND.accent}">
          <w:anchorlock/>
          <center style="color:${BRAND.accentText};font-family:Tahoma,Arial,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center>
        </v:roundrect>
        <![endif]-->
        <a href="${safeHref}" style="display:inline-block;padding:13px 28px;font-size:15px;line-height:20px;font-weight:700;color:${BRAND.accentText};text-decoration:none;border-radius:999px;font-family:${FONT};mso-hide:all;">${safeLabel}</a>
      </td>
    </tr>
  </table>`;
}

function platformCardBlock(card: PlatformStatusCard): string {
  const username = card.username?.trim();
  const statusColor = card.connected ? BRAND.accent : "#f0a05a";
  const usernameHtml = username
    ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:700;color:${BRAND.text};direction:ltr;unicode-bidi:embed;">${escapeHtml(username)}</p>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 0;background:${BRAND.inset};border-radius:16px;">
    <tr>
      <td style="padding:18px 18px 16px;">
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.4;color:${BRAND.faint};">${escapeHtml(card.platform)}</p>
        ${usernameHtml}
        <p style="margin:10px 0 0;font-family:${FONT};font-size:14px;line-height:1.4;font-weight:700;color:${statusColor};">${escapeHtml(card.status)}</p>
      </td>
    </tr>
  </table>`;
}

/**
 * Shared shell for every transactional event email.
 */
export function renderEventEmail(options: EventEmailOptions): string {
  const locale = options.locale ?? "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";
  const preheader = options.preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(options.preheader)}</div>`
    : "";
  const eyebrow = options.eyebrow
    ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:13px;line-height:1.4;font-weight:700;color:${BRAND.accent};">${escapeHtml(options.eyebrow)}</p>`
    : "";
  const cta = options.cta ? bulletproofButton(options.cta.label, options.cta.href) : "";
  const platform = options.platformCard ? platformCardBlock(options.platformCard) : "";
  const tagline = options.tagline?.trim()
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.5;letter-spacing:0.08em;color:${BRAND.accent};">${escapeHtml(options.tagline.trim())}</p>`
    : "";
  const titleDir = /[A-Za-z]/.test(options.title) && locale === "ar" ? ` dir="ltr"` : "";

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .cs-shell { padding: 24px 10px !important; }
      .cs-card { padding: 28px 18px !important; }
    }
  </style>
</head>
<body dir="${dir}" style="margin:0;padding:0;background:${BRAND.page};color:${BRAND.text};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="cs-shell" style="background:${BRAND.page};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding:8px 8px 8px;">
              ${logoBlock()}
              ${heroBlock(options.hero)}
            </td>
          </tr>
          <tr>
            <td class="cs-card" style="background:${BRAND.card};border-radius:22px;padding:36px 32px 32px;">
              ${eyebrow}
              <h1${titleDir} style="margin:0;font-family:${FONT};font-size:32px;line-height:1.25;font-weight:800;color:${BRAND.text};">${escapeHtml(options.title)}</h1>
              <div style="margin-top:14px;font-family:${FONT};font-size:16px;line-height:1.7;color:${BRAND.muted};">
                ${options.bodyHtml}
              </div>
              ${platform}
              ${cta}
              <p style="margin:32px 0 0;font-family:${FONT};font-size:16px;line-height:1.6;font-weight:700;color:${BRAND.text};">${EMAIL_SIGN_OFF}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 8px 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.faint};">
              ${tagline}
              <p style="margin:0;">${EMAIL_FOOTER_LINE}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Older call sites use the same charcoal / ice-blue shell. */
export function renderMasterEmailLayout(options: EmailLayoutOptions): string {
  return renderEventEmail({ ...options, hero: "studio" });
}

/** Payment and gift mail use the same shell as every other event email. */
export function renderSubscriptionEmailLayout(options: EmailLayoutOptions): string {
  return renderEventEmail({ ...options, hero: "studio" });
}

export { escapeHtml };
