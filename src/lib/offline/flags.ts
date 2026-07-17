/**
 * Phase 8 kill-switch. The entire technician offline layer checks this in one
 * place. Env-based on purpose (ADR-0015 §5): a switch meant to protect against
 * field data-integrity issues must not itself depend on a network/DB read.
 *
 * Default ON. Set NEXT_PUBLIC_OFFLINE_SYNC_ENABLED="false" to revert the tech
 * PWA to plain online-only behavior on next load.
 */
export function isOfflineSyncEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OFFLINE_SYNC_ENABLED !== "false";
}
