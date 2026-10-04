/**
 * Spacemail SMTP transport. Server-only.
 *
 * Defaults: mail.spacemail.com:465 with implicit TLS, user support@cylixstudio.com.
 * Port 587 uses STARTTLS only when SMTP_PORT is explicitly 587.
 * The password is read from SMTP_PASSWORD and is never returned or logged.
 * Calling this module does not connect and does not throw when the password is unset.
 */
import { createTransport, type Transporter } from "nodemailer";
import type { SMTPSentMessageInfo, SMTPTransportOptions } from "nodemailer";

export const DEFAULT_SMTP_HOST = "mail.spacemail.com";
export const DEFAULT_SMTP_PORT = 465;
export const DEFAULT_SMTP_USER = "support@cylixstudio.com";
export const SMTP_NOT_CONFIGURED = "SMTP is not configured";

export type SmtpTransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** True only for explicit port 587 with STARTTLS (secure false). */
  requireTls: boolean;
};

export type OpenSmtpTransportResult =
  | {
      ok: true;
      transport: Transporter<SMTPSentMessageInfo, SMTPTransportOptions>;
      config: SmtpTransportConfig;
    }
  | { ok: false; error: string };

function explicitSecure(raw: string | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return null;
}

function resolvePort(raw: string | undefined): number | { error: string } {
  if (!raw?.trim()) return DEFAULT_SMTP_PORT;
  const port = Number(raw.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "invalid SMTP_PORT" };
  }
  return port;
}

/** Host, port, TLS, and user. Does not read or return the password. */
export function resolveSmtpTransportConfig(
  env: NodeJS.ProcessEnv = process.env,
): SmtpTransportConfig | { error: string } {
  const port = resolvePort(env["SMTP_PORT"]);
  if (typeof port !== "number") return port;

  const explicit = explicitSecure(env["SMTP_SECURE"]);
  let secure: boolean;
  if (explicit !== null) secure = explicit;
  else if (port === 587) secure = false;
  else secure = port === 465;

  return {
    host: env["SMTP_HOST"]?.trim() || DEFAULT_SMTP_HOST,
    port,
    secure,
    user: env["SMTP_USER"]?.trim() || DEFAULT_SMTP_USER,
    requireTls: !secure && port === 587,
  };
}

/**
 * Build a Nodemailer transport. Returns a clear error when SMTP_PASSWORD is unset.
 * Does not connect until send or verify is called.
 */
export function openSmtpTransport(env: NodeJS.ProcessEnv = process.env): OpenSmtpTransportResult {
  const config = resolveSmtpTransportConfig(env);
  if ("error" in config) return { ok: false, error: config.error };

  const pass = env["SMTP_PASSWORD"]?.trim() ?? "";
  if (!pass) return { ok: false, error: SMTP_NOT_CONFIGURED };

  const options: SMTPTransportOptions = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass,
    },
    logger: false,
    debug: false,
    transactionLog: false,
  };
  if (config.requireTls) options.requireTLS = true;

  return {
    ok: true,
    config,
    transport: createTransport(options),
  };
}
