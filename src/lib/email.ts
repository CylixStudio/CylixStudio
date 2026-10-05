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
  STUDIO_CONNECTIONS_URL,
  SUBSCRIPTION_SUPPORT_EMAIL,
  TRANSACTIONAL_FROM_ADDRESS,
  EMAIL_LOGO_CID,
  EMAIL_SIGN_OFF,
  EMAIL_FOOTER_LINE,
  renderEventEmail,
  type EmailLayoutOptions,
  type EventEmailOptions,
  type EmailHero,
} from "@/lib/email/layout";

export {
  buildEmailFromTemplate,
  buildProActivationTemplate,
  buildWelcomeTemplate,
  buildInvoiceNoticeTemplate,
  buildGiftActivationTemplate,
  buildDirectActivatedTemplate,
  buildPlatformConnectedTemplate,
  buildPlatformDisconnectedTemplate,
  buildVersionBroadcastTemplate,
  type BuiltEmail,
  type EmailLocale,
  type EmailTemplateId,
  type EmailTemplatePayload,
  type ProActivationTemplateInput,
  type WelcomeTemplateInput,
  type InvoiceNoticeTemplateInput,
  type GiftActivationTemplateInput,
  type DirectActivatedTemplateInput,
  type PlatformConnectionTemplateInput,
  type PlatformDisconnectedTemplateInput,
  type VersionBroadcastTemplateInput,
} from "@/lib/email/templates";
