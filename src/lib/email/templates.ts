import type { ProBillingInterval } from "@/lib/plans";
import { formatActivationCode, intervalLabel } from "@/lib/proPurchase";
import {
  escapeHtml,
  renderMasterEmailLayout,
  renderSubscriptionEmailLayout,
  SUBSCRIPTION_DASHBOARD_URL,
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
  locale?: EmailLocale;
};

export type DirectActivatedTemplateInput = {
  siteUrl: string;
  interval: ProBillingInterval | "lifetime" | "custom";
  durationDays: number;
  expiresAt?: string | null;
  locale?: EmailLocale;
};

/** Buyer's own activation code — dark receipt layout, dashboard CTA. */
export function buildProActivationTemplate(input: ProActivationTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const pretty = formatActivationCode(input.code);
  const duration = intervalLabel(input.interval, input.durationDays);
  const dashboardUrl = SUBSCRIPTION_DASHBOARD_URL;

  if (locale === "en") {
    const subject = "تفاصيل تفعيل حسابك في CylixStudio";
    const bodyHtml = `
      <p style="margin:0 0 16px;">Payment confirmed. Your <strong style="color:#f4f4f5;">CylixStudio Pro</strong> plan (<strong style="color:#f4f4f5;">${escapeHtml(duration)}</strong>) is ready to activate. The plan stays inactive until you redeem this code.</p>
      ${giftCodeBlock("Activation code", pretty)}
      <p style="margin:0 0 8px;font-weight:700;color:#f4f4f5;">How to activate</p>
      <ol style="margin:0;padding-inline-start:18px;">
        <li>Sign in to CylixStudio</li>
        <li>Open <strong style="color:#f4f4f5;">Settings → Account &amp; subscription</strong></li>
        <li>Choose <strong style="color:#f4f4f5;">Enter activation code</strong> and paste the code</li>
      </ol>
      <p style="margin:18px 0 0;font-size:12px;color:#a1a1aa;">Do not share this code. It can only be used once.</p>
    `;
    const text = [
      subject,
      "",
      "Payment confirmed.",
      "Plan: CylixStudio Pro",
      `Interval: ${duration}`,
      "Status: awaiting activation",
      `Code: ${pretty}`,
      "",
      "Sign in, open Settings → Account & subscription, and enter the code.",
      dashboardUrl,
      "",
      "The code works once. Pro stays inactive until you redeem it.",
    ].join("\n");

    return {
      subject,
      text,
      html: renderSubscriptionEmailLayout({
        siteUrl: input.siteUrl,
        locale: "en",
        eyebrow: "Account activation",
        title: "Your account activation details",
        preheader: subject,
        bodyHtml,
        cta: { label: "Open dashboard", href: dashboardUrl },
      }),
    };
  }

  const subject = "تفاصيل تفعيل حسابك في CylixStudio";
  const bodyHtml = `
    <p style="margin:0 0 16px;">تم تأكيد الدفع. خطة <strong style="color:#f4f4f5;">CylixStudio Pro</strong> لمدة <strong style="color:#f4f4f5;">${escapeHtml(duration)}</strong> جاهزة للتفعيل. تبقى الخطة غير نشطة حتى تدخل الرمز.</p>
    ${giftCodeBlock("رمز التفعيل", pretty)}
    <p style="margin:0 0 8px;font-weight:700;color:#f4f4f5;">طريقة التفعيل</p>
    <ol style="margin:0;padding-inline-start:18px;">
      <li>سجّل الدخول إلى CylixStudio</li>
      <li>افتح <strong style="color:#f4f4f5;">الإعدادات ← الحساب والاشتراك</strong></li>
      <li>اختر <strong style="color:#f4f4f5;">إدخال رمز التفعيل</strong> والصق الرمز</li>
    </ol>
    <p style="margin:18px 0 0;font-size:12px;color:#a1a1aa;">لا تشارك هذا الرمز. يُستخدم مرة واحدة فقط.</p>
  `;
  const text = [
    subject,
    "",
    "تم تأكيد الدفع.",
    "الخطة: CylixStudio Pro",
    `المدة: ${duration}`,
    "الحالة: بانتظار التفعيل",
    `الرمز: ${pretty}`,
    "",
    "سجّل الدخول، ثم من الإعدادات ← الحساب والاشتراك أدخل الرمز.",
    dashboardUrl,
    "",
    "الرمز لمرة واحدة. تبقى الخطة غير نشطة حتى التفعيل.",
  ].join("\n");

  return {
    subject,
    text,
    html: renderSubscriptionEmailLayout({
      siteUrl: input.siteUrl,
      locale: "ar",
      eyebrow: "تفعيل الحساب",
      title: "تفاصيل تفعيل حسابك",
      preheader: subject,
      bodyHtml,
      cta: { label: "فتح لوحة التحكم", href: dashboardUrl },
    }),
  };
}

export function buildWelcomeTemplate(input: WelcomeTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const name = input.displayName?.trim() || (locale === "ar" ? "صديقنا" : "there");
  const site = input.siteUrl.replace(/\/$/, "");

  if (locale === "en") {
    const subject = "Welcome to CylixStudio";
    const bodyHtml = `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(name)},</p>
      <p style="margin:0;">You’re in. Connect Kick or Twitch, build your overlays, and go live with CylixStudio.</p>
    `;
    return {
      subject,
      text: `Welcome to CylixStudio, ${name}. Open ${site}/dashboard to get started.`,
      html: renderMasterEmailLayout({
        siteUrl: site,
        locale: "en",
        eyebrow: "Welcome",
        title: "You’re ready to stream",
        preheader: "Welcome to CylixStudio",
        bodyHtml,
        cta: { label: "Open dashboard", href: `${site}/dashboard` },
      }),
    };
  }

  const subject = "مرحبًا بك في CylixStudio";
  const bodyHtml = `
    <p style="margin:0 0 12px;">أهلًا ${escapeHtml(name)}،</p>
    <p style="margin:0;">تم إنشاء حسابك. اربط Kick أو Twitch وابنِ أدواتك المباشرة من لوحة التحكم.</p>
  `;
  return {
    subject,
    text: `مرحبًا بك في CylixStudio. ابدأ من: ${site}/dashboard`,
    html: renderMasterEmailLayout({
      siteUrl: site,
      locale: "ar",
      eyebrow: "ترحيب",
      title: "حسابك جاهز للبث",
      preheader: "مرحبًا بك في CylixStudio",
      bodyHtml,
      cta: { label: "فتح لوحة التحكم", href: `${site}/dashboard` },
    }),
  };
}

export function buildInvoiceNoticeTemplate(input: InvoiceNoticeTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const site = input.siteUrl.replace(/\/$/, "");

  if (locale === "en") {
    const subject = `Payment received — ${input.amountLabel}`;
    const bodyHtml = `
      <p style="margin:0 0 12px;">We received your payment of <strong style="color:#e4e4e7;">${escapeHtml(input.amountLabel)}</strong> for <strong style="color:#e4e4e7;">${escapeHtml(input.intervalLabel)}</strong>.</p>
      <p style="margin:0;font-size:12px;color:#71717a;direction:ltr;">Reference: ${escapeHtml(input.paymentId)}</p>
      <p style="margin:16px 0 0;">Your Pro activation code is sent in a separate email (or the same checkout flow).</p>
    `;
    return {
      subject,
      text: `Payment ${input.amountLabel} for ${input.intervalLabel}. Ref: ${input.paymentId}`,
      html: renderMasterEmailLayout({
        siteUrl: site,
        locale: "en",
        eyebrow: "Billing",
        title: "Payment confirmed",
        preheader: subject,
        bodyHtml,
      }),
    };
  }

  const subject = `تم استلام الدفع — ${input.amountLabel}`;
  const bodyHtml = `
    <p style="margin:0 0 12px;">استلمنا دفعتك بمبلغ <strong style="color:#e4e4e7;">${escapeHtml(input.amountLabel)}</strong> لمدة <strong style="color:#e4e4e7;">${escapeHtml(input.intervalLabel)}</strong>.</p>
    <p style="margin:0;font-size:12px;color:#71717a;direction:ltr;">Reference: ${escapeHtml(input.paymentId)}</p>
    <p style="margin:16px 0 0;">رمز تفعيل Pro يُرسل في بريد منفصل ضمن نفس عملية الشراء.</p>
  `;
  return {
    subject,
    text: `تم الدفع ${input.amountLabel} — ${input.intervalLabel}. المرجع: ${input.paymentId}`,
    html: renderMasterEmailLayout({
      siteUrl: site,
      locale: "ar",
      eyebrow: "الفواتير",
      title: "تأكيد الدفع",
      preheader: subject,
      bodyHtml,
    }),
  };
}

function billingPhrase(
  interval: ProBillingInterval | "lifetime" | "custom",
  durationDays: number,
  locale: EmailLocale,
): string {
  if (locale === "en") return intervalLabel(interval, durationDays);
  if (interval === "lifetime" || durationDays >= 36500) return "مدى الحياة";
  if (interval === "yearly" || durationDays >= 365) return "سنة واحدة";
  if (interval === "six_months" || durationDays >= 180) return "6 أشهر";
  if (interval === "monthly" || durationDays >= 30) return "شهر واحد";
  return `${durationDays} يومًا`;
}

function giftCodeBlock(label: string, pretty: string): string {
  return `<div style="margin:0 0 20px;padding:18px 16px;border-radius:12px;background:#0d0d0d;border:1px solid rgba(34,197,94,0.45);text-align:center;">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.08em;color:#a1a1aa;">${escapeHtml(label)}</p>
        <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:22px;letter-spacing:0.16em;color:#22c55e;font-weight:700;direction:ltr;">${escapeHtml(pretty)}</p>
      </div>`;
}

/** Gift activation code — personal message + dashboard redeem CTA. */
export function buildGiftActivationTemplate(input: GiftActivationTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const pretty = formatActivationCode(input.code);
  const duration = billingPhrase(input.interval, input.durationDays, locale);
  const dashboardUrl = SUBSCRIPTION_DASHBOARD_URL;
  const fromLabel = input.fromName?.trim() || "";
  const message = input.giftMessage?.trim();

  const messageBlock = message
    ? locale === "en"
      ? `<blockquote style="margin:0 0 20px;padding:14px 16px;border-radius:12px;border:1px solid #2a2a2a;background:#0d0d0d;color:#f4f4f5;font-style:italic;line-height:1.65;">“${escapeHtml(message)}”</blockquote>
         ${fromLabel ? `<p style="margin:0 0 16px;font-size:12px;color:#a1a1aa;">— ${escapeHtml(fromLabel)}</p>` : ""}`
      : `<blockquote style="margin:0 0 20px;padding:14px 16px;border-radius:12px;border:1px solid #2a2a2a;background:#0d0d0d;color:#f4f4f5;font-style:italic;line-height:1.65;">«${escapeHtml(message)}»</blockquote>
         ${fromLabel ? `<p style="margin:0 0 16px;font-size:12px;color:#a1a1aa;">— ${escapeHtml(fromLabel)}</p>` : ""}`
    : "";

  if (locale === "en") {
    const subject = "Your CylixStudio gift details";
    const intro = fromLabel
      ? `<p style="margin:0 0 16px;"><strong style="color:#f4f4f5;">${escapeHtml(fromLabel)}</strong> sent a <strong style="color:#f4f4f5;">CylixStudio Pro</strong> gift for <strong style="color:#f4f4f5;">${escapeHtml(duration)}</strong>. This code does not activate a plan by itself.</p>`
      : `<p style="margin:0 0 16px;">Your <strong style="color:#f4f4f5;">CylixStudio Pro</strong> gift code for <strong style="color:#f4f4f5;">${escapeHtml(duration)}</strong> is ready. This purchase does not turn Pro on automatically.</p>`;
    const bodyHtml = `
      ${intro}
      ${messageBlock}
      ${giftCodeBlock("Gift code", pretty)}
      <p style="margin:0 0 8px;font-weight:700;color:#f4f4f5;">How to redeem</p>
      <ol style="margin:0;padding-inline-start:18px;">
        <li>Open the dashboard and sign in, or create an account</li>
        <li>Redeem this gift code on the account that should receive Pro</li>
      </ol>
      <p style="margin:18px 0 0;font-size:12px;color:#a1a1aa;">The code works once. Don’t share it publicly.</p>
    `;
    const text = [
      "CylixStudio Pro — gift code",
      "",
      fromLabel ? `From: ${fromLabel}` : null,
      message ? `Message: ${message}` : null,
      `Plan: CylixStudio Pro`,
      `Interval: ${duration}`,
      `Code: ${pretty}`,
      "",
      "This code does not activate Pro on its own.",
      `Sign in and redeem at: ${dashboardUrl}`,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      subject,
      text,
      html: renderSubscriptionEmailLayout({
        siteUrl: input.siteUrl,
        locale: "en",
        eyebrow: "Gift",
        title: "Your Pro gift code",
        preheader: `Pro gift ${duration} — ${pretty}`,
        bodyHtml,
        cta: { label: "Open dashboard", href: dashboardUrl },
      }),
    };
  }

  const subject = "تفاصيل هديتك في CylixStudio";
  const intro = fromLabel
    ? `<p style="margin:0 0 16px;">أرسل <strong style="color:#f4f4f5;">${escapeHtml(fromLabel)}</strong> هدية <strong style="color:#f4f4f5;">CylixStudio Pro</strong> لمدة <strong style="color:#f4f4f5;">${escapeHtml(duration)}</strong>. الرمز وحده لا يفعّل الخطة.</p>`
    : `<p style="margin:0 0 16px;">رمز هدية <strong style="color:#f4f4f5;">CylixStudio Pro</strong> لمدة <strong style="color:#f4f4f5;">${escapeHtml(duration)}</strong> جاهز. هذا الشراء لا يفعّل Pro تلقائيًا.</p>`;
  const bodyHtml = `
    ${intro}
    ${messageBlock}
    ${giftCodeBlock("رمز الهدية", pretty)}
    <p style="margin:0 0 8px;font-weight:700;color:#f4f4f5;">طريقة التفعيل</p>
    <ol style="margin:0;padding-inline-start:18px;">
      <li>افتح لوحة التحكم وسجّل الدخول، أو أنشئ حسابًا</li>
      <li>فعّل رمز الهدية على الحساب الذي يجب أن يحصل على Pro</li>
    </ol>
    <p style="margin:18px 0 0;font-size:12px;color:#a1a1aa;">الرمز لمرة واحدة فقط. لا تنشره علنًا.</p>
  `;
  const text = [
    "CylixStudio Pro — رمز هدية",
    "",
    fromLabel ? `من: ${fromLabel}` : null,
    message ? `الرسالة: ${message}` : null,
    "الخطة: CylixStudio Pro",
    `المدة: ${duration}`,
    `الرمز: ${pretty}`,
    "",
    "الرمز لا يفعّل Pro من تلقاء نفسه.",
    `سجّل الدخول وفعّل الرمز من: ${dashboardUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    text,
    html: renderSubscriptionEmailLayout({
      siteUrl: input.siteUrl,
      locale: "ar",
      eyebrow: "هدية",
      title: "رمز هدية Pro",
      preheader: `هدية Pro ${duration} — ${pretty}`,
      bodyHtml,
      cta: { label: "فتح لوحة التحكم", href: dashboardUrl },
    }),
  };
}

function planFactRows(
  rows: Array<{ label: string; value: string }>,
): string {
  const cells = rows
    .map(
      (row) => `<tr>
        <td style="padding:8px 0;color:#a1a1aa;font-size:13px;vertical-align:top;">${escapeHtml(row.label)}</td>
        <td style="padding:8px 0 8px 16px;color:#f4f4f5;font-size:13px;font-weight:700;vertical-align:top;">${escapeHtml(row.value)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border-top:1px solid #2a2a2a;">${cells}</table>`;
}

/** Confirmation after direct Pro activation (no code). */
export function buildDirectActivatedTemplate(input: DirectActivatedTemplateInput): BuiltEmail {
  const locale = input.locale ?? "ar";
  const duration = billingPhrase(input.interval, input.durationDays, locale);
  const site = input.siteUrl.replace(/\/$/, "");
  const dashUrl = SUBSCRIPTION_DASHBOARD_URL;
  const expires =
    input.expiresAt && !Number.isNaN(Date.parse(input.expiresAt))
      ? new Date(input.expiresAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

  if (locale === "en") {
    const subject = "تفاصيل تفعيل حسابك في CylixStudio";
    const rows = [
      { label: "Plan", value: "CylixStudio Pro" },
      { label: "Interval", value: duration },
      { label: "Status", value: "Active" },
      ...(expires ? [{ label: "Expires", value: expires }] : []),
    ];
    const bodyHtml = `
      <p style="margin:0 0 16px;">Your payment succeeded. <strong style="color:#f4f4f5;">CylixStudio Pro</strong> is active on your account.</p>
      ${planFactRows(rows)}
      <p style="margin:0;">No activation code is required. Continue from the dashboard.</p>
    `;
    return {
      subject,
      text: [
        "Payment succeeded.",
        "Plan: CylixStudio Pro",
        `Interval: ${duration}`,
        "Status: Active",
        expires ? `Expires: ${expires}` : null,
        "",
        dashUrl,
      ]
        .filter(Boolean)
        .join("\n"),
      html: renderSubscriptionEmailLayout({
        siteUrl: site,
        locale: "en",
        eyebrow: "Payment succeeded",
        title: "CylixStudio Pro is active",
        preheader: subject,
        bodyHtml,
        cta: { label: "Open dashboard", href: dashUrl },
      }),
    };
  }

  const subject = "تفاصيل تفعيل حسابك في CylixStudio";
  const rows = [
    { label: "الخطة", value: "CylixStudio Pro" },
    { label: "المدة", value: duration },
    { label: "الحالة", value: "نشط" },
    ...(expires ? [{ label: "ينتهي في", value: expires }] : []),
  ];
  const bodyHtml = `
    <p style="margin:0 0 16px;">تم الدفع بنجاح. اشتراك <strong style="color:#f4f4f5;">CylixStudio Pro</strong> نشط الآن على حسابك.</p>
    ${planFactRows(rows)}
    <p style="margin:0;">لا تحتاج رمز تفعيل. تابع من لوحة التحكم.</p>
  `;
  return {
    subject,
    text: [
      "تم الدفع بنجاح.",
      "الخطة: CylixStudio Pro",
      `المدة: ${duration}`,
      "الحالة: نشط",
      expires ? `ينتهي في: ${expires}` : null,
      "",
      dashUrl,
    ]
      .filter(Boolean)
      .join("\n"),
    html: renderSubscriptionEmailLayout({
      siteUrl: site,
      locale: "ar",
      eyebrow: "تم الدفع بنجاح",
      title: "اشتراك CylixStudio Pro نشط",
      preheader: subject,
      bodyHtml,
      cta: { label: "فتح لوحة التحكم", href: dashUrl },
    }),
  };
}

export type EmailTemplateId =
  | "pro_activation"
  | "welcome"
  | "invoice_notice"
  | "gift_activation"
  | "direct_activated";

export type EmailTemplatePayload =
  | { template: "pro_activation"; data: ProActivationTemplateInput }
  | { template: "welcome"; data: WelcomeTemplateInput }
  | { template: "invoice_notice"; data: InvoiceNoticeTemplateInput }
  | { template: "gift_activation"; data: GiftActivationTemplateInput }
  | { template: "direct_activated"; data: DirectActivatedTemplateInput }
  | { template: "custom"; data: { siteUrl: string; title: string; bodyHtml: string; subject: string; text: string; locale?: EmailLocale; cta?: { label: string; href: string } } };

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
    case "custom": {
      const locale = payload.data.locale ?? "ar";
      return {
        subject: payload.data.subject,
        text: payload.data.text,
        html: renderMasterEmailLayout({
          siteUrl: payload.data.siteUrl,
          locale,
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
