import { getResend } from "./resend";
import { logger } from "@/lib/security/logger";

/**
 * Safe mail abstraction (Phase 3). Real customer sending is an external-action
 * approval gate, so this defaults to NOT actually delivering:
 *
 *   - ESTIMATE_EMAIL_MODE unset or "preview" → nothing is sent; the render is
 *     returned for inspection and the send is logged as preview_mode.
 *   - "test"  → delivery is redirected to ESTIMATE_TEST_RECIPIENT regardless of
 *     the requested recipient (test-recipient override).
 *   - "live"  → delivers to the real recipient. Only reachable when an operator
 *     has explicitly set the env var — never the default.
 *
 * Templates are pre-escaped by the caller (see estimate-proposal template).
 * No secrets or PII are logged — only coarse booleans and the message id.
 */

export type MailMode = "preview" | "test" | "live";

export function resolveMailMode(): MailMode {
  const raw = (process.env.ESTIMATE_EMAIL_MODE ?? "preview").toLowerCase();
  if (raw === "live") return "live";
  if (raw === "test") return "test";
  return "preview";
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export type SafeSendResult =
  | { delivered: true; mode: MailMode; effectiveRecipient: string; providerMessageId?: string; previewMode: false; testOverride: boolean }
  | { delivered: false; mode: "preview"; effectiveRecipient: string; previewMode: true; testOverride: false }
  | { delivered: false; mode: MailMode; error: string; effectiveRecipient: string; previewMode: false; testOverride: boolean };

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@serviceops.app";

export async function safeSend(args: SendArgs): Promise<SafeSendResult> {
  const mode = resolveMailMode();

  if (mode === "preview") {
    logger.info("[mail] preview mode — not delivering", { subjectLength: args.subject.length });
    return { delivered: false, mode: "preview", effectiveRecipient: args.to, previewMode: true, testOverride: false };
  }

  const testOverride = mode === "test";
  const effectiveRecipient = testOverride
    ? process.env.ESTIMATE_TEST_RECIPIENT ?? ""
    : args.to;

  if (testOverride && !effectiveRecipient) {
    const error = "ESTIMATE_EMAIL_MODE=test but ESTIMATE_TEST_RECIPIENT is not set";
    logger.error("[mail] test mode misconfigured");
    return { delivered: false, mode, error, effectiveRecipient: args.to, previewMode: false, testOverride: true };
  }

  try {
    const { data, error } = await getResend().emails.send({
      from: args.from ?? DEFAULT_FROM,
      to: [effectiveRecipient],
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (error) {
      logger.error("[mail] provider error", { mode });
      return { delivered: false, mode, error: String((error as { message?: string }).message ?? error), effectiveRecipient, previewMode: false, testOverride };
    }
    logger.info("[mail] delivered", { mode, testOverride });
    return { delivered: true, mode, effectiveRecipient, providerMessageId: data?.id, previewMode: false, testOverride };
  } catch (err) {
    logger.error("[mail] send threw", { mode });
    return {
      delivered: false,
      mode,
      error: err instanceof Error ? err.message : String(err),
      effectiveRecipient,
      previewMode: false,
      testOverride,
    };
  }
}
