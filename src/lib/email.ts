/**
 * Public email helpers (layout + templates). Safe to import from server modules.
 * Sending with Resend lives in `@/lib/email.server` (API key — server only).
 */
export {
  renderMasterEmailLayout,
  renderSubscriptionEmailLayout,
  emailLogoUrl,
  escapeHtml,
  SUBSCRIPTION_DASHBOARD_URL,
  SUBSCRIPTION_SUPPORT_EMAIL,
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
