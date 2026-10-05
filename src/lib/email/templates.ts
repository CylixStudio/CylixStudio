import type { ProBillingInterval } from "@/lib/plans";
import { formatActivationCode } from "@/lib/proPurchase";
import {
  EMAIL_FOOTER_LINE,
  EMAIL_SIGN_OFF,
  escapeHtml,
  renderEventEmail,
  STUDIO_CONNECTIONS_URL,
  SUBSCRIPTION_DASHBOARD_URL,
  type EmailHero,
  type PlatformStatusCard,
} from "@/lib/email/layout";

export type EmailLocale = "ar" | "en";

export type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
};

export type ProActivationTemplateInput = {
  siteUrl: string;
  code: string;
  interval: ProBillingInterval | "lifetime" | "custom";
  durationDays: number;
  /** StreamPay payment id or purchase id, when fulfillment already has one. */
  transactionId?: string | null;
  locale?: EmailLocale;
};

export type WelcomeTemplateInput = {
  siteUrl: string;
  displayName?: string | null;
  locale?: EmailLocale;
};

export type InvoiceNoticeTemplateInput = {
  siteUrl: string;
  amountLabel: string;
  intervalLabel: string;
  paymentId: string;
  locale?: EmailLocale;
};

export type GiftActivationTemplateInput = {
  siteUrl: string;
  code: string;
  interval: ProBillingInterval | "lifetime" | "custom";
  durationDays: number;
  giftMessage?: string | null;
  /** Buyer display — shown as the sender of the gift */
  fromName?: string | null;
  /** Included only when the purchase record already has a payment id. */
  transactionId?: string | null;
  locale?: EmailLocale;
};

export type DirectActivatedTemplateInput = {
  siteUrl: string;
  interval: ProBillingInterval | "lifetime" | "custom";
  durationDays: number;
  expiresAt?: string | null;
  /** StreamPay payment id or purchase id already stored by fulfillProPurchase. */
  transactionId?: string | null;
  locale?: EmailLocale;
};

export type PlatformConnectionTemplateInput = {
  siteUrl: string;
  platform: "KICK" | "TWITCH" | "YOUTUBE";
  username?: string | null;
  locale?: EmailLocale;
};

export type PlatformDisconnectedTemplateInput = {
  siteUrl: string;
  platform: "KICK" | "TWITCH" | "YOUTUBE";
  username?: string | null;
  locale?: EmailLocale;
};

export type VersionBroadcastTemplateInput = {
  siteUrl: string;
  version: string;
  locale?: EmailLocale;
};

const DASHBOARD_URL = SUBSCRIPTION_DASHBOARD_URL;

function closeText(lines: Array<string | null>): string {
  return [...lines.filter((line): line is string => Boolean(line)), "", EMAIL_SIGN_OFF, EMAIL_FOOTER_LINE].join("\n");
}

function planPhrase(
  interval: ProBillingInterval | "lifetime" | "custom",
  durationDays: number,
  locale: EmailLocale,
): string {
  const resolved: ProBillingInterval | "lifetime" | "custom" =
    interval === "lifetime" || durationDays >= 36500
      ? "lifetime"
      : interval === "yearly" || durationDays >= 365
        ? "yearly"
        : interval === "six_months" || durationDays >= 180
          ? "six_months"
          : interval === "monthly" || durationDays >= 30
            ? "monthly"
            : interval;
  if (locale === "en") {
    if (resolved === "monthly") return "Monthly Plan";
    if (resolved === "six_months") return "6 months";
    if (resolved === "yearly") return "Yearly Plan";
    if (resolved === "lifetime") return "Lifetime Plan";
    return "Pro Plan";
  }
  if (resolved === "monthly") return "الخطة الشهرية";
  if (resolved === "six_months") return "6 أشهر";
  if (resolved === "yearly") return "الخطة السنوية";
  if (resolved === "lifetime") return "مدى الحياة";
  return "خطة Pro";
}

function humanExpiry(value: string | null | undefined, locale: EmailLocale): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  const date = new Date(value);
  if (locale === "ar") {
    return new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function knownTransactionId(value: string | null | undefined): string | null {
  const id = value?.trim();
  return id ? id : null;
}

/** One quiet payment line. Omitted when fulfillment has no id. */
function paymentLine(locale: EmailLocale, transactionId: string | null | undefined): string {
  const id = knownTransactionId(transactionId);
  if (!id) return "";
  const label = locale === "ar" ? "رقم العملية" : "Payment";
  return `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#bdbdbd;">${label} <span style="direction:ltr;unicode-bidi:embed;">${escapeHtml(id)}</span></p>`;
}

function codeBlock(label: string, pretty: string): string {
  return `<div style="margin:18px 0 0;padding:18px 16px;border-radius:16px;background:#3c3c3c;text-align:center;">
    <p style="margin:0 0 8px;font-size:12px;color:#bdbdbd;">${escapeHtml(label)}</p>
    <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:22px;letter-spacing:0.14em;color:#bee1fc;font-weight:700;direction:ltr;">${escapeHtml(pretty)}</p>
  </div>`;
}

function studioCta(locale: EmailLocale): { label: string; href: string } {
  return { label: locale === "ar" ? "فتح الاستوديو" : "Open Studio", href: DASHBOARD_URL };
}

function platformName(platform: "KICK" | "TWITCH" | "YOUTUBE"): string {
  if (platform === "KICK") return "Kick";
  if (platform === "TWITCH") return "Twitch";
  return "YouTube";
}

function platformHero(platform: "KICK" | "TWITCH" | "YOUTUBE"): EmailHero {
  if (platform === "KICK") return "kick";
  if (platform === "TWITCH") return "twitch";
  return "youtube";
}

function statusCard(
  platform: "KICK" | "TWITCH" | "YOUTUBE",
  username: string | null | undefined,
  locale: EmailLocale,
  connected: boolean,
): PlatformStatusCard {
  const status = connected
    ? locale === "ar"
      ? "● متصل"
      : "● Connected"
    : locale === "ar"
      ? "● غير متصل"
      : "● Disconnected";
  const card: PlatformStatusCard = {
    platform: platformName(platform),
    status,
    connected,
  };
  const name = username?.trim();
  if (name) card.username = name;
  return card;
}

const CONNECTED_HEADLINE: Record<"KICK" | "TWITCH" | "YOUTUBE", string> = {
  KICK: "تم ربط Kick. صار حسابك جاهز.",
  TWITCH: "تم ربط Twitch. صار حسابك جاهز.",
  YOUTUBE: "تم ربط YouTube. صار حسابك جاهز.",
};

/** Buyer's own activation code. Pro stays off until the code is redeemed. */
export function buildProActivationTemplate(input: ProActivationTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const pretty = formatActivationCode(input.code);
  const duration = planPhrase(input.interval, input.durationDays, locale);
  const subject = "تفاصيل تفعيل حسابك في CylixStudio";
  const payment = knownTransactionId(input.transactionId);

  if (locale === "en") {
    const bodyHtml = `
      <p style="margin:0;">Payment confirmed. Your CylixStudio Pro code is ready. The plan stays inactive until you redeem it.</p>
      <p style="margin:14px 0 0;color:#f7f7f7;font-weight:700;">${escapeHtml(duration)}</p>
      ${codeBlock("Activation code", pretty)}
      <p style="margin:18px 0 0;">Sign in, open Settings, and paste the code. It works once.</p>
      ${paymentLine("en", input.transactionId)}
    `;
    return {
      subject,
      text: closeText([
        subject,
        "",
        "Payment confirmed. Redeem the code to turn Pro on.",
        duration,
        `Code: ${pretty}`,
        payment ? `Payment ${payment}` : null,
        DASHBOARD_URL,
      ]),
      html: renderEventEmail({
        siteUrl: input.siteUrl,
        locale: "en",
        hero: "studio",
        title: "Your activation code is ready.",
        preheader: subject,
        bodyHtml,
        cta: studioCta("en"),
      }),
    };
  }

  const bodyHtml = `
    <p style="margin:0;">تم تأكيد الدفع. رمز CylixStudio Pro جاهز، والخطة تبقى غير نشطة حتى تدخل الرمز.</p>
    <p style="margin:14px 0 0;color:#f7f7f7;font-weight:700;">${escapeHtml(duration)}</p>
    ${codeBlock("رمز التفعيل", pretty)}
    <p style="margin:18px 0 0;">سجّل الدخول، افتح الإعدادات، والصق الرمز. يُستخدم مرة واحدة.</p>
    ${paymentLine("ar", input.transactionId)}
  `;
  return {
    subject,
    text: closeText([
      subject,
      "",
      "تم تأكيد الدفع. فعّل الرمز ليبدأ Pro.",
      duration,
      `الرمز: ${pretty}`,
      payment ? `رقم العملية ${payment}` : null,
      DASHBOARD_URL,
    ]),
    html: renderEventEmail({
      siteUrl: input.siteUrl,
      locale: "ar",
      hero: "studio",
      title: "رمز التفعيل جاهز.",
      preheader: subject,
      bodyHtml,
      cta: studioCta("ar"),
    }),
  };
}

export function buildWelcomeTemplate(input: WelcomeTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const name = input.displayName?.trim() || (locale === "ar" ? "صديقنا" : "there");
  const site = input.siteUrl.replace(/\/$/, "");

  if (locale === "en") {
    const subject = "Welcome to CylixStudio";
    return {
      subject,
      text: closeText([`Welcome to CylixStudio, ${name}.`, DASHBOARD_URL]),
      html: renderEventEmail({
        siteUrl: site,
        locale: "en",
        hero: "studio",
        title: "You’re ready to stream",
        preheader: subject,
        bodyHtml: `<p style="margin:0;">Hi ${escapeHtml(name)}. Connect Kick, Twitch, or YouTube and open the studio.</p>`,
        cta: studioCta("en"),
      }),
    };
  }

  const subject = "مرحبًا بك في CylixStudio";
  return {
    subject,
    text: closeText([`مرحبًا بك في CylixStudio.`, DASHBOARD_URL]),
    html: renderEventEmail({
      siteUrl: site,
      locale: "ar",
      hero: "studio",
      title: "حسابك جاهز للبث",
      preheader: subject,
      bodyHtml: `<p style="margin:0;">أهلًا ${escapeHtml(name)}. اربط Kick أو Twitch أو YouTube وافتح الاستوديو.</p>`,
      cta: studioCta("ar"),
    }),
  };
}

export function buildInvoiceNoticeTemplate(input: InvoiceNoticeTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const site = input.siteUrl.replace(/\/$/, "");
  const subject = locale === "en" ? `Payment received — ${input.amountLabel}` : `تم استلام الدفع — ${input.amountLabel}`;
  const bodyHtml =
    locale === "en"
      ? `<p style="margin:0;">We received ${escapeHtml(input.amountLabel)} for ${escapeHtml(input.intervalLabel)}.</p>${paymentLine("en", input.paymentId)}`
      : `<p style="margin:0;">استلمنا ${escapeHtml(input.amountLabel)} مقابل ${escapeHtml(input.intervalLabel)}.</p>${paymentLine("ar", input.paymentId)}`;
  return {
    subject,
    text: closeText([subject, input.paymentId, DASHBOARD_URL]),
    html: renderEventEmail({
      siteUrl: site,
      locale,
      hero: "studio",
      title: locale === "en" ? "Payment confirmed" : "تم تأكيد الدفع",
      preheader: subject,
      bodyHtml,
      cta: studioCta(locale),
    }),
  };
}

/** Gift code mail. Does not activate Pro for the buyer. */
export function buildGiftActivationTemplate(input: GiftActivationTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const pretty = formatActivationCode(input.code);
  const duration = planPhrase(input.interval, input.durationDays, locale);
  const fromLabel = input.fromName?.trim() || "";
  const message = input.giftMessage?.trim();
  const payment = knownTransactionId(input.transactionId);
  const messageBlock = message
    ? `<p style="margin:16px 0 0;padding:14px 16px;border-radius:16px;background:#3c3c3c;color:#f7f7f7;">${locale === "en" ? "“" : "«"}${escapeHtml(message)}${locale === "en" ? "”" : "»"}</p>${fromLabel ? `<p style="margin:8px 0 0;font-size:13px;color:#bdbdbd;">— ${escapeHtml(fromLabel)}</p>` : ""}`
    : "";

  if (locale === "en") {
    const subject = "Your CylixStudio gift details";
    const intro = fromLabel
      ? `<p style="margin:0;">${escapeHtml(fromLabel)} sent a CylixStudio Pro gift for ${escapeHtml(duration)}. This code does not turn Pro on by itself.</p>`
      : `<p style="margin:0;">Your CylixStudio Pro gift code for ${escapeHtml(duration)} is ready. This purchase does not turn Pro on automatically.</p>`;
    return {
      subject,
      text: closeText([
        "CylixStudio Pro gift code",
        fromLabel ? `From: ${fromLabel}` : null,
        message ? `Message: ${message}` : null,
        duration,
        `Code: ${pretty}`,
        "This code does not activate Pro on its own.",
        payment ? `Payment ${payment}` : null,
        DASHBOARD_URL,
      ]),
      html: renderEventEmail({
        siteUrl: input.siteUrl,
        locale: "en",
        hero: "studio",
        title: "A Pro gift is waiting.",
        preheader: subject,
        bodyHtml: `${intro}${messageBlock}${codeBlock("Gift code", pretty)}<p style="margin:18px 0 0;">Open the studio, sign in, and redeem the code on the account that should receive Pro.</p>${paymentLine("en", input.transactionId)}`,
        cta: studioCta("en"),
      }),
    };
  }

  const subject = "تفاصيل هديتك في CylixStudio";
  const intro = fromLabel
    ? `<p style="margin:0;">أرسل ${escapeHtml(fromLabel)} هدية CylixStudio Pro لمدة ${escapeHtml(duration)}. الرمز وحده لا يفعّل الخطة.</p>`
    : `<p style="margin:0;">رمز هدية CylixStudio Pro لمدة ${escapeHtml(duration)} جاهز. هذا الشراء لا يفعّل Pro تلقائيًا.</p>`;
  return {
    subject,
    text: closeText([
      "رمز هدية CylixStudio Pro",
      fromLabel ? `من: ${fromLabel}` : null,
      message ? `الرسالة: ${message}` : null,
      duration,
      `الرمز: ${pretty}`,
      "الرمز لا يفعّل Pro من تلقاء نفسه.",
      payment ? `رقم العملية ${payment}` : null,
      DASHBOARD_URL,
    ]),
    html: renderEventEmail({
      siteUrl: input.siteUrl,
      locale: "ar",
      hero: "studio",
      title: "هدية Pro بانتظارك.",
      preheader: subject,
      bodyHtml: `${intro}${messageBlock}${codeBlock("رمز الهدية", pretty)}<p style="margin:18px 0 0;">افتح الاستوديو، سجّل الدخول، وفعّل الرمز على الحساب الذي يجب أن يحصل على Pro.</p>${paymentLine("ar", input.transactionId)}`,
      cta: studioCta("ar"),
    }),
  };
}

/** Confirmation after verified direct Pro activation. */
export function buildDirectActivatedTemplate(input: DirectActivatedTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const duration = planPhrase(input.interval, input.durationDays, locale);
  const expires = humanExpiry(input.expiresAt, locale);
  const payment = knownTransactionId(input.transactionId);
  const subject = "تفاصيل تفعيل حسابك في CylixStudio";
  const lead =
    locale === "en"
      ? "Your payment is verified. CylixStudio Pro is on and the studio tools are unlocked."
      : "تم التحقق من الدفع. CylixStudio Pro صار نشط وكل أدوات الاستوديو مفتوحة.";
  const bodyHtml = `
    <p style="margin:0;">${lead}</p>
    <p style="margin:16px 0 0;color:#f7f7f7;font-weight:700;">${escapeHtml(duration)}</p>
    ${expires ? `<p style="margin:6px 0 0;color:#f7f7f7;">${escapeHtml(expires)}</p>` : ""}
    ${paymentLine(locale, input.transactionId)}
  `;
  return {
    subject,
    text: closeText([
      "Pro is active. Everything is unlocked.",
      lead,
      duration,
      expires,
      payment ? (locale === "ar" ? `رقم العملية ${payment}` : `Payment ${payment}`) : null,
      DASHBOARD_URL,
      "Build. Stream. Create.",
    ]),
    html: renderEventEmail({
      siteUrl: input.siteUrl,
      locale,
      hero: "pro",
      title: "Pro is active. Everything is unlocked.",
      preheader: subject,
      bodyHtml,
      cta: { label: "Open Studio", href: DASHBOARD_URL },
      tagline: "Build. Stream. Create.",
    }),
  };
}

export function buildPlatformConnectedTemplate(input: PlatformConnectionTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const name = platformName(input.platform);
  const headline =
    locale === "ar"
      ? CONNECTED_HEADLINE[input.platform]
      : `${name} is connected. Your account is ready.`;
  const lead =
    locale === "ar"
      ? `حساب ${name} صار مربوطًا بالاستوديو، وتقدر تكمل من لوحة التحكم.`
      : `Your ${name} account is linked. You can go live from the studio.`;
  const subject = headline;
  return {
    subject,
    text: closeText([headline, lead, input.username?.trim() || null, DASHBOARD_URL]),
    html: renderEventEmail({
      siteUrl: input.siteUrl,
      locale,
      hero: platformHero(input.platform),
      title: headline,
      preheader: headline,
      bodyHtml: `<p style="margin:0;">${escapeHtml(lead)}</p>`,
      platformCard: statusCard(input.platform, input.username, locale, true),
      cta: studioCta(locale),
    }),
  };
}

export function buildPlatformDisconnectedTemplate(input: PlatformDisconnectedTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const name = platformName(input.platform);
  const headline = locale === "ar" ? `تم فصل ${name}.` : `${name} was disconnected.`;
  const lead =
    locale === "ar"
      ? `الربط مع ${name} ما عاد نشط. تقدر ترجعه من الإعدادات متى ما تبي.`
      : `The ${name} link is no longer active. You can connect it again from settings.`;
  const subject = headline;
  const cta =
    locale === "ar"
      ? { label: "فتح الإعدادات", href: STUDIO_CONNECTIONS_URL }
      : { label: "Open settings", href: STUDIO_CONNECTIONS_URL };
  return {
    subject,
    text: closeText([headline, lead, input.username?.trim() || null, STUDIO_CONNECTIONS_URL]),
    html: renderEventEmail({
      siteUrl: input.siteUrl,
      locale,
      hero: "disconnect",
      title: headline,
      preheader: headline,
      bodyHtml: `<p style="margin:0;">${escapeHtml(lead)}</p>`,
      platformCard: statusCard(input.platform, input.username, locale, false),
      cta,
    }),
  };
}

export function buildVersionBroadcastTemplate(input: VersionBroadcastTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const version = input.version.trim();
  const headline = locale === "ar" ? "نزل إصدار جديد من الاستوديو." : "A new studio version is out.";
  const subject = locale === "ar" ? `إصدار جديد من Cylix Studio ${version}` : `Cylix Studio ${version} is out`;
  const lead =
    locale === "ar"
      ? `الاستوديو صار على الإصدار ${version}. افتحه وكمّل البث من آخر نسخة.`
      : `The studio is now on ${version}. Open it and keep streaming on the latest build.`;
  return {
    subject,
    text: closeText([headline, version, lead, DASHBOARD_URL, "Build. Stream. Create."]),
    html: renderEventEmail({
      siteUrl: input.siteUrl,
      locale,
      hero: "version",
      title: headline,
      preheader: subject,
      bodyHtml: `<p style="margin:0;">${escapeHtml(lead)}</p><p style="margin:16px 0 0;color:#f7f7f7;font-weight:800;font-size:22px;direction:ltr;unicode-bidi:embed;">${escapeHtml(version)}</p>`,
      cta: { label: "Open Studio", href: DASHBOARD_URL },
      tagline: "Build. Stream. Create.",
    }),
  };
}

export type EmailTemplateId =
  | "pro_activation"
  | "welcome"
  | "invoice_notice"
  | "gift_activation"
  | "direct_activated"
  | "platform_connected"
  | "platform_disconnected"
  | "version_broadcast";

export type EmailTemplatePayload =
  | { template: "pro_activation"; data: ProActivationTemplateInput }
  | { template: "welcome"; data: WelcomeTemplateInput }
  | { template: "invoice_notice"; data: InvoiceNoticeTemplateInput }
  | { template: "gift_activation"; data: GiftActivationTemplateInput }
  | { template: "direct_activated"; data: DirectActivatedTemplateInput }
  | { template: "platform_connected"; data: PlatformConnectionTemplateInput }
  | { template: "platform_disconnected"; data: PlatformDisconnectedTemplateInput }
  | { template: "version_broadcast"; data: VersionBroadcastTemplateInput }
  | {
      template: "custom";
      data: {
        siteUrl: string;
        title: string;
        bodyHtml: string;
        subject: string;
        text: string;
        locale?: EmailLocale;
        cta?: { label: string; href: string };
      };
    };

export function buildEmailFromTemplate(payload: EmailTemplatePayload): BuiltEmail {
  switch (payload.template) {
    case "pro_activation":
      return buildProActivationTemplate(payload.data);
    case "welcome":
      return buildWelcomeTemplate(payload.data);
    case "invoice_notice":
      return buildInvoiceNoticeTemplate(payload.data);
    case "gift_activation":
      return buildGiftActivationTemplate(payload.data);
    case "direct_activated":
      return buildDirectActivatedTemplate(payload.data);
    case "platform_connected":
      return buildPlatformConnectedTemplate(payload.data);
    case "platform_disconnected":
      return buildPlatformDisconnectedTemplate(payload.data);
    case "version_broadcast":
      return buildVersionBroadcastTemplate(payload.data);
    case "custom": {
      const locale = payload.data.locale ?? "ar";
      return {
        subject: payload.data.subject,
        text: payload.data.text,
        html: renderEventEmail({
          siteUrl: payload.data.siteUrl,
          locale,
          hero: "studio",
          title: payload.data.title,
          bodyHtml: payload.data.bodyHtml,
          ...(payload.data.cta ? { cta: payload.data.cta } : {}),
          preheader: payload.data.subject,
        }),
      };
    }
    default: {
      const _exhaustive: never = payload;
      return _exhaustive;
    }
  }
}
