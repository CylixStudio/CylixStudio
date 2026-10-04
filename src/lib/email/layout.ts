/**
 * CylixStudio master transactional email layout.
 * Table-based HTML for broad client support; RTL-first Arabic + brand #bee1fc.
 */

export type EmailLayoutOptions = {
  /** Absolute site origin, e.g. https://www.cylixstudio.com */
  siteUrl: string;
  /** Document language — drives dir + lang. Default ar. */
  locale?: "ar" | "en";
  /** Main headline inside the card */
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

const BRAND = {
  bg: "#0a0a0a",
  card: "#111111",
  border: "rgba(255,255,255,0.08)",
  text: "#fafafa",
  muted: "#a1a1aa",
  faint: "#71717a",
  primary: "#bee1fc",
  primaryText: "#111111",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Absolute logo URL for email clients (PNG, not SVG). */
export function emailLogoUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, "")}/apple-touch-icon.png`;
}

/**
 * Wraps arbitrary body HTML in the CylixStudio master shell.
 * Uses inline CSS only — no external stylesheets.
 */
export function renderMasterEmailLayout(options: EmailLayoutOptions): string {
  const locale = options.locale ?? "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";
  const site = options.siteUrl.replace(/\/$/, "");
  const logo = emailLogoUrl(site);
  const year = new Date().getFullYear();
  const preheader = options.preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(options.preheader)}</div>`
    : "";

  const eyebrow = options.eyebrow
    ? `<p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.faint};font-family:Tahoma,'Segoe UI',Arial,sans-serif;">${escapeHtml(options.eyebrow)}</p>`
    : "";

  const cta = options.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0;">
        <tr>
          <td style="border-radius:10px;background:${BRAND.primary};">
            <a href="${escapeHtml(options.cta.href)}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:700;color:${BRAND.primaryText};text-decoration:none;font-family:Tahoma,'Segoe UI',Arial,sans-serif;">${escapeHtml(options.cta.label)}</a>
          </td>
        </tr>
      </table>`
    : "";

  const footerLinks =
    locale === "ar"
      ? `
        <a href="${site}" style="color:${BRAND.muted};text-decoration:none;margin:0 8px;">الموقع</a>
        <span style="color:${BRAND.faint};">·</span>
        <a href="${site}/settings?setup=subscription" style="color:${BRAND.muted};text-decoration:none;margin:0 8px;">الاشتراك</a>
        <span style="color:${BRAND.faint};">·</span>
        <a href="${site}/privacy" style="color:${BRAND.muted};text-decoration:none;margin:0 8px;">الخصوصية</a>
        <span style="color:${BRAND.faint};">·</span>
        <a href="${site}/terms" style="color:${BRAND.muted};text-decoration:none;margin:0 8px;">الشروط</a>
      `
      : `
        <a href="${site}" style="color:${BRAND.muted};text-decoration:none;margin:0 8px;">Website</a>
        <span style="color:${BRAND.faint};">·</span>
        <a href="${site}/settings?setup=subscription" style="color:${BRAND.muted};text-decoration:none;margin:0 8px;">Subscription</a>
        <span style="color:${BRAND.faint};">·</span>
        <a href="${site}/privacy" style="color:${BRAND.muted};text-decoration:none;margin:0 8px;">Privacy</a>
        <span style="color:${BRAND.faint};">·</span>
        <a href="${site}/terms" style="color:${BRAND.muted};text-decoration:none;margin:0 8px;">Terms</a>
      `;

  const copyright =
    locale === "ar"
      ? `© ${year} CylixStudio — جميع الحقوق محفوظة`
      : `© ${year} CylixStudio — All rights reserved`;

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <title>${escapeHtml(options.title)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};color:${BRAND.text};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.bg};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding:0 0 20px;">
              <a href="${site}" style="text-decoration:none;">
                <img src="${logo}" width="56" height="56" alt="CylixStudio" style="display:block;border:0;border-radius:14px;outline:none;" />
              </a>
              <p style="margin:10px 0 0;font-size:15px;font-weight:700;letter-spacing:0.04em;color:${BRAND.text};font-family:Tahoma,'Segoe UI',Arial,sans-serif;">CylixStudio</p>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;padding:28px 24px;">
              ${eyebrow}
              <h1 style="margin:0 0 14px;font-size:22px;line-height:1.35;font-weight:700;color:${BRAND.text};font-family:Tahoma,'Segoe UI',Arial,sans-serif;">${escapeHtml(options.title)}</h1>
              <div style="font-size:14px;line-height:1.7;color:${BRAND.muted};font-family:Tahoma,'Segoe UI',Arial,sans-serif;">
                ${options.bodyHtml}
              </div>
              ${cta}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 8px 0;font-size:12px;line-height:1.6;color:${BRAND.faint};font-family:Tahoma,'Segoe UI',Arial,sans-serif;">
              <div style="margin:0 0 8px;">${footerLinks}</div>
              <p style="margin:0;">${copyright}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Production dashboard linked from payment and gift emails. */
export const SUBSCRIPTION_DASHBOARD_URL = "https://cylixstudio.com/dashboard";

/** From, Reply-To, and the support line on payment and gift receipts. */
export const SUBSCRIPTION_SUPPORT_EMAIL = "support@cylixstudio.com";

const PAYMENT = {
  bg: "#0d0d0d",
  card: "#161616",
  border: "#2a2a2a",
  text: "#f4f4f5",
  muted: "#d4d4d8",
  faint: "#a1a1aa",
  accent: "#22c55e",
  accentText: "#052e16",
};

/**
 * Dark transactional shell for verified Pro payments and gift codes.
 * Table layout, inline CSS, and a fluid container so it stays readable on phones.
 */
export function renderSubscriptionEmailLayout(options: EmailLayoutOptions): string {
  const locale = options.locale ?? "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";
  const year = new Date().getFullYear();
  const support = SUBSCRIPTION_SUPPORT_EMAIL;
  const preheader = options.preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(options.preheader)}</div>`
    : "";

  const eyebrow = options.eyebrow
    ? `<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.04em;color:${PAYMENT.accent};font-weight:700;font-family:Tahoma,'Segoe UI',Arial,sans-serif;">${escapeHtml(options.eyebrow)}</p>`
    : "";

  const cta = options.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0;">
        <tr>
          <td style="border-radius:10px;background:${PAYMENT.accent};">
            <a href="${escapeHtml(options.cta.href)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:${PAYMENT.accentText};text-decoration:none;font-family:Tahoma,'Segoe UI',Arial,sans-serif;">${escapeHtml(options.cta.label)}</a>
          </td>
        </tr>
      </table>`
    : "";

  const supportLine =
    locale === "ar"
      ? `للدعم: <a href="mailto:${support}" style="color:${PAYMENT.accent};text-decoration:none;">${support}</a>`
      : `Support: <a href="mailto:${support}" style="color:${PAYMENT.accent};text-decoration:none;">${support}</a>`;

  const copyright = `© ${year} CylixStudio`;

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="x-ua-compatible" content="ie=edge" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .cs-shell { padding: 20px 10px !important; }
      .cs-card { padding: 22px 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${PAYMENT.bg};color:${PAYMENT.text};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="cs-shell" style="background:${PAYMENT.bg};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="${dir === "rtl" ? "right" : "left"}" style="padding:0 4px 16px;font-family:Tahoma,'Segoe UI',Arial,sans-serif;">
              <p style="margin:0;font-size:20px;line-height:1.3;font-weight:700;color:${PAYMENT.text};">CylixStudio <span style="color:${PAYMENT.accent};">v0.2</span></p>
            </td>
          </tr>
          <tr>
            <td class="cs-card" style="background:${PAYMENT.card};border:1px solid ${PAYMENT.border};border-radius:16px;padding:28px 24px;">
              ${eyebrow}
              <h1 style="margin:0 0 14px;font-size:22px;line-height:1.35;font-weight:700;color:${PAYMENT.text};font-family:Tahoma,'Segoe UI',Arial,sans-serif;">${escapeHtml(options.title)}</h1>
              <div style="font-size:14px;line-height:1.7;color:${PAYMENT.muted};font-family:Tahoma,'Segoe UI',Arial,sans-serif;">
                ${options.bodyHtml}
              </div>
              ${cta}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 8px 0;font-size:12px;line-height:1.7;color:${PAYMENT.faint};font-family:Tahoma,'Segoe UI',Arial,sans-serif;">
              <p style="margin:0 0 6px;">${supportLine}</p>
              <p style="margin:0;">${copyright}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export { escapeHtml };
