/**
 * Shared password-strength policy. Previously only `min(8)` was enforced
 * (security-audit: "Strong password policy" listed as missing). Applied at
 * invitation-accept, password-reset, and admin-driven reset time.
 */

const MIN_LENGTH = 10;
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789",
  "qwertyuiop", "letmein123", "admin1234", "changeme123", "welcome123",
]);

export interface PasswordCheckResult {
  ok: boolean;
  reason?: string;
}

export function checkPasswordStrength(password: string): PasswordCheckResult {
  if (password.length < MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters` };
  }
  if (password.length > 128) {
    return { ok: false, reason: "Password must be 128 characters or fewer" };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, reason: "This password is too common — please choose another" };
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigitOrSymbol = /[0-9]/.test(password) || /[^a-zA-Z0-9]/.test(password);
  if (!hasLetter || !hasDigitOrSymbol) {
    return { ok: false, reason: "Password must contain letters and at least one number or symbol" };
  }
  return { ok: true };
}
