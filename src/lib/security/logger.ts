/**
 * Structured logger with redaction. Replaces ad hoc console.* calls that
 * previously logged raw emails, secret lengths, and other sensitive fields
 * (see docs/audits/security-audit.md M14/M15).
 *
 * Every log line is a single JSON object so it can be parsed by whatever log
 * sink ingests stdout (Vercel, Datadog, etc.) without a custom parser.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

const REDACTED = "[REDACTED]";

// Field names that are never emitted even in structured `fields`, on the
// assumption a caller might pass them without realizing it.
const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "token_hash",
  "secret",
  "authorization",
  "cookie",
  "email",
  "phone",
  "gate_code",
  "access_notes",
]);

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.has(key.toLowerCase())) return REDACTED;
  if (typeof value === "string" && value.length > 200) return `${value.slice(0, 200)}…`;
  return value;
}

function redactFields(fields: LogFields | undefined): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...redactFields(fields),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};

/** Masks an email to its first character + domain, safe for logs that need some identifying context. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return REDACTED;
  return `${email[0]}***@${email.slice(at + 1)}`;
}
