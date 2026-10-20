/**
 * @payswap/client-certification — pinned wire shapes of the command
 * surface's session contract (P8-W2, lane p8-w2; commit 1/4).
 *
 * Authority: @payswap/command (merged @ f9392a3). The command plane is
 * one of the four certified surface kinds (web/desktop/extension/
 * command); its fail-closed session vocabulary is the interaction-
 * surface anchor the browser-verification contract correlates key
 * interactions to. PINS ARE NOT IMPORTS.
 */

// ---------------------------------------------------------------------------
// Fail-closed session lookup reasons (the closed vocabulary)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/command src/session-contract.ts
 * `SessionLookup` invalid arms (byte-identical closed vocabulary; the
 * order of checks is the contract). An invalid session fails closed
 * with one of these reasons — never a silent re-login, never a
 * fabricated continuation.
 */
export const PINNED_SESSION_LOOKUP_REASONS = Object.freeze([
  "UNKNOWN_TOKEN",
  "REVOKED",
  "EXPIRED",
  "STALE_SECURITY_EPOCH",
] as const);

/** STRUCTURAL PIN — authority: @payswap/command session-lookup reason. */
export type PinnedSessionLookupReason =
  (typeof PINNED_SESSION_LOOKUP_REASONS)[number];

// ---------------------------------------------------------------------------
// Protocol-correlation identifiers (browser wiring binds to protocol IDs)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: the old-repo browser-verification contracts
 * (payswap.org@8a735bf packages/operations/src/browser-verification.ts
 * `KeyInteraction.correlatedProtocolId` values; re-authorized against
 * the canonical command/economic planes at f9392a3). Browser wiring
 * evidence binds to a PROTOCOL identifier, never to a DOM artifact.
 */
export const PINNED_PROTOCOL_CORRELATION_IDS = Object.freeze([
  "attemptId",
  "commandId",
  "settlementId",
  "obligationId",
  "evidenceId",
  "reconciliationCaseId",
  "eventId",
] as const);

/** STRUCTURAL PIN — the protocol-correlation identifier vocabulary. */
export type PinnedProtocolCorrelationId =
  (typeof PINNED_PROTOCOL_CORRELATION_IDS)[number];

/**
 * VALUE PIN — authority: @payswap/command session discipline (the
 * fail-closed law this package re-asserts for customer-visible session
 * state): an expired session produces an EXPLICIT reauthentication /
 * customer-action-required state.
 */
export const PINNED_EXPIRED_SESSION_HANDLING =
  "EXPLICIT_REAUTHENTICATION_REQUIRED" as const;
