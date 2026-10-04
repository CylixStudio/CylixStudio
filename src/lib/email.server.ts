/**
 * Production email service — Resend SDK.
 * Server-only: import from *.server.ts / API routes / createServerFn handlers.
 *
 * Sending domain noted in `.env.example`: cylixstudio.com (Resend domain verification).
 * From / Reply-To default: CylixStudio <support@cylixstudio.com>
 * Env: RESEND_API_KEY (required), EMAIL_FROM or RESEND_FROM (optional From override)
 *
 * These messages are transactional receipts. Do not add List-Unsubscribe,
 * List-Unsubscribe-Post, or Precedence — those headers classify mail as bulk.
 */
import { Resend } from "resend";

import { SUBSCRIPTION_SUPPORT_EMAIL } from "@/lib/email/layout";
import {
  buildEmailFromTemplate,
  type BuiltEmail,
  type EmailTemplatePayload,
} from "@/lib/email/templates";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

/** Mailbox on the cylixstudio.com sending domain. Display name is CylixStudio. */
export const DEFAULT_FROM = `CylixStudio <${SUBSCRIPTION_SUPPORT_EMAIL}>`;

/**
 * Receipt headers only. Absent on purpose: List-Unsubscribe, List-Unsubscribe-Post, Precedence.
 */
export function transactionalReceiptHeaders(): Record<string, string> {
  return {
    "Auto-Submitted": "auto-generated",
    "X-Auto-Response-Suppress": "All, OOF, AutoReply",
  };
}

function resolveFrom(): string {
  return (
    process.env["EMAIL_FROM"]?.trim() ||
    process.env["RESEND_FROM"]?.trim() ||
    DEFAULT_FROM
  );
}

export type TransactionalSendPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo: string;
  headers: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
};

/** Build the Resend payload without sending. Used by sendEmail and by local checks. */
export function composeTransactionalSend(
  input: SendEmailInput,
  from = resolveFrom(),
): TransactionalSendPayload | { error: "invalid_recipient" } {
  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) return { error: "invalid_recipient" };

  const payload: TransactionalSendPayload = {
    from,
    to: recipients,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo?.trim() || SUBSCRIPTION_SUPPORT_EMAIL,
    headers: transactionalReceiptHeaders(),
  };
  if (input.tags?.length) payload.tags = input.tags;
  return payload;
}

function getResendClient(): Resend | null {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function normalizeRecipients(to: string | string[]): string[] {
  const list = (Array.isArray(to) ? to : [to])
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.includes("@"));
  return [...new Set(list)];
}

/** Low-level send — HTML + text already built. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) {
    console.error("[email] invalid recipient", { to: input.to });
    return { ok: false, error: "invalid_recipient" };
  }

  const client = getResendClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY missing — skipping send", {
      to: recipients,
      subject: input.subject,
    });
    return { ok: false, error: "email_not_configured", skipped: true };
  }

  const composed = composeTransactionalSend(input);
  if ("error" in composed) {
    return { ok: false, error: composed.error };
  }

  try {
    const { data, error } = await client.emails.send({
      from: composed.from,
      to: composed.to,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
      replyTo: composed.replyTo,
      headers: composed.headers,
      ...(composed.tags?.length ? { tags: composed.tags } : {}),
    });

    if (error) {
      console.error("[email] Resend API error", {
        to: recipients,
        subject: input.subject,
        message: error.message,
        name: error.name,
      });
      return { ok: false, error: error.message || "resend_error" };
    }

    const id = data?.id ?? "sent";
    console.info("[email] sent", { id, to: recipients, subject: input.subject, from: composed.from });
    return { ok: true, id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] Resend threw", { to: recipients, subject: input.subject, message });
    return { ok: false, error: message };
  }
}

/**
 * Build a named template (or custom body) with the master layout, then send.
 */
export async function sendTemplateEmail(
  to: string | string[],
  payload: EmailTemplatePayload,
  options?: { replyTo?: string; tags?: Array<{ name: string; value: string }> },
): Promise<SendEmailResult & { built?: BuiltEmail }> {
  let built: BuiltEmail;
  try {
    built = buildEmailFromTemplate(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] template build failed", { message, template: payload.template });
    return { ok: false, error: `template_build_failed:${message}` };
  }

  const result = await sendEmail({
    to,
    subject: built.subject,
    html: built.html,
    text: built.text,
    ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
    tags: options?.tags ?? [{ name: "template", value: payload.template }],
  });

  return { ...result, built };
}

/** Optional SMS via Twilio when TWILIO_* env vars + phone are present. */
export async function sendSms(
  toPhone: string,
  body: string,
): Promise<SendEmailResult> {
  const sid = process.env["TWILIO_ACCOUNT_SID"]?.trim();
  const token = process.env["TWILIO_AUTH_TOKEN"]?.trim();
  const from = process.env["TWILIO_FROM"]?.trim();
  if (!sid || !token || !from) {
    return { ok: false, error: "sms_not_configured", skipped: true };
  }

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: toPhone, From: from, Body: body }).toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[sms] Twilio failed", res.status, text.slice(0, 200));
      return { ok: false, error: `twilio_${res.status}` };
    }

    return { ok: true, id: "sms_sent" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sms] Twilio threw", message);
    return { ok: false, error: message };
  }
}
