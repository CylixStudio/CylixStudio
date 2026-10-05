/**
 * Public email helpers (layout + templates). Safe to import from server modules.
 * Sending via Spacemail SMTP lives in `@/lib/email.server` (SMTP_PASSWORD — server only).
 */
export {
  renderMasterEmailLayout,
  renderSubscriptionEmailLayout,
  emailLogoUrl,
  escapeHtml,
  SUBSCRIPTION_DASHBOARD_URL,
  SUBSCRIPTION_SUPPORT_EMAIL,
  TRANSACTIONAL_FROM_ADDRESS,
  EMAIL_LOGO_CID,
  type EmailLayoutOptions,
} from "@/lib/email/layout";

export {
  buildEmailFromTemplate,
  buildProActivationTemplate,
  buildWelcomeTemplate,
  buildInvoiceNoticeTemplate,
  buildGiftActivationTemplate,
  buildDirectActivatedTemplate,
  type BuiltEmail,
  type EmailLocale,
  type EmailTemplateId,
  type EmailTemplatePayload,
  type ProActivationTemplateInput,
  type WelcomeTemplateInput,
  type InvoiceNoticeTemplateInput,
  type GiftActivationTemplateInput,
  type DirectActivatedTemplateInput,
} from "@/lib/email/templates";
