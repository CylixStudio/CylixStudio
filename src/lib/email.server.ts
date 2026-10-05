/**
 * Production email service — Spacemail SMTP via Nodemailer.
 * Server-only: import from *.server.ts / API routes / createServerFn handlers.
 *
 * fulfillProPurchase sends activation, gift, and direct-confirmation templates
 * through sendTemplateEmail only after the payment is verified. This module
 * does not connect at import time. If SMTP_PASSWORD is unset, send fails with
 * "SMTP is not configured" and does not fall through to another provider.
 *
 * From default: CylixStudio <noreply@cylixstudio.com> (EMAIL_FROM override).
 * Reply-To matches that From address. SMTP auth stays on SMTP_USER.
 *
 * These messages are transactional receipts. Do not add List-Unsubscribe,
 * List-Unsubscribe-Post, or Precedence — those headers classify mail as bulk.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import logoInline from "@/assets/Logo/cylix-studio.png?inline";
import {
  EMAIL_LOGO_CID,
  TRANSACTIONAL_FROM_ADDRESS,
} from "@/lib/email/layout";
import { openSmtpTransport } from "@/lib/email/smtp.server";
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

/** Visible From header. SMTP_USER can stay the authenticated mailbox. */
export const DEFAULT_FROM = `CylixStudio <${TRANSACTIONAL_FROM_ADDRESS}>`;

function mailboxFromHeader(from: string): string {
  const angled = from.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (angled?.[1]) return angled[1];
  const bare = from.trim();
  if (bare.includes("@") && !bare.includes(" ")) return bare;
  return TRANSACTIONAL_FROM_ADDRESS;
}

type LogoAttachment = {
  filename: string;
  content: Buffer;
  cid: string;
  contentType: "image/png";
  contentDisposition: "inline";
};

function logoFromDataUrl(value: string): Buffer | null {
  const match = value.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match?.[1]) return null;
  try {
    const bytes = Buffer.from(match[1].replace(/\s/g, ""), "base64");
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function logoFromDisk(): Buffer | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "src/assets/Logo/cylix-studio.png"),
    path.resolve(here, "../../assets/Logo/cylix-studio.png"),
    path.resolve(here, "../../../src/assets/Logo/cylix-studio.png"),
  ];
  for (const file of candidates) {
    try {
      const bytes = readFileSync(file);
      if (bytes.length > 0) return bytes;
    } catch {
      // Next candidate. Missing logo must not throw at startup.
    }
  }
  return null;
}

/** PNG bytes for the CID logo. Prefers the bundled asset, then the repo file. */
export function transactionalLogoAttachment(): LogoAttachment | null {
  const content =
    (typeof logoInline === "string" ? logoFromDataUrl(logoInline) : null) ?? logoFromDisk();
  if (!content) return null;
  return {
    filename: "cylix-studio.png",
    content,
    cid: EMAIL_LOGO_CID,
    contentType: "image/png",
    contentDisposition: "inline",
  };
}

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
  return process.env["EMAIL_FROM"]?.trim() || DEFAULT_FROM;
}

function redactSmtpPassword(message: string): string {
  const raw = process.env["SMTP_PASSWORD"] ?? "";
  const trimmed = raw.trim();
  let next = message;
  if (raw) next = next.split(raw).join("[redacted]");
  if (trimmed && trimmed !== raw) next = next.split(trimmed).join("[redacted]");
  return next;
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

/** Build the receipt payload without sending. Used by sendEmail and by local checks. */
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
    replyTo: input.replyTo?.trim() || mailboxFromHeader(from),
    headers: transactionalReceiptHeaders(),
  };
  if (input.tags?.length) payload.tags = input.tags;
  return payload;
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

  const opened = openSmtpTransport();
  if (!opened.ok) {
    console.warn("[email] " + opened.error, {
      to: recipients,
      subject: input.subject,
    });
    return { ok: false, error: opened.error, skipped: true };
  }

  const composed = composeTransactionalSend(input);
  if ("error" in composed) {
    opened.transport.close();
    return { ok: false, error: composed.error };
  }

  try {
    const logo = composed.html.includes(`cid:${EMAIL_LOGO_CID}`)
      ? transactionalLogoAttachment()
      : null;
    const info = await opened.transport.sendMail({
      from: composed.from,
      to: composed.to,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
      replyTo: composed.replyTo,
      headers: composed.headers,
      ...(logo ? { attachments: [logo] } : {}),
    });

    const id = info.messageId || "sent";
    console.info("[email] sent", { id, to: recipients, subject: input.subject, from: composed.from });
    return { ok: true, id };
  } catch (err) {
    const message = redactSmtpPassword(err instanceof Error ? err.message : String(err));
    console.error("[email] SMTP send failed", {
      to: recipients,
      subject: input.subject,
      message: message || "smtp_send_failed",
    });
    return { ok: false, error: message || "smtp_send_failed" };
  } finally {
    opened.transport.close();
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
