/**
 * @payswap/merchant — the PINNED WIRE SHAPES of the financial protocol
 * authority (P5-W3, lane R3-W3; commit 1/4 — the type-level pins).
 *
 * LAYER LAW: zero sibling imports (the v1 leaf-in-flight law). Every
 * mirror below names its AUTHORITY — @payswap/protocol, the Financial
 * Protocol Authority's contract package (P1-W2). The mirrors are
 * deliberately SUBSET-typed: this package requires LESS than the
 * authority, so any genuine authority value remains structurally
 * assignable to the pin, while a pin can never widen an authority law.
 * The money lifecycle is PINNED HERE, NEVER OWNED HERE: money movement
 * is DELEGATED (the wallet-payment injection port in
 * src/pins/wallet-payment.ts is the only execution seam, and it exits by
 * HANDOFF ONLY).
 *
 * Pins in this module (authority: @payswap/protocol):
 * - PinnedMoney / PinnedCurrencyCode / PinnedTimestampMs (exact money law)
 * - PinnedSettlementInstructionId — the TYPED REFERENCE this package
 *   carries wherever a settlement leg exists (never a local settlement
 *   engine; the protocol lane owns instruction semantics)
 * - PINNED_SETTLEMENT_INSTRUCTION_ID_MAX_LENGTH + the shape law
 * - PinnedSettlementAttemptState / PinnedSettlementAttemptEvent +
 *   PINNED_SETTLEMENT_ATTEMPT_TRANSITIONS — the canonical settlement
 *   attempt machine (byte-pinned: SUCCEEDED/FAILED terminal, UNKNOWN
 *   exits ONLY through reconciliation — INV-04)
 * - PinnedExternalOutcome / PinnedUnknownOutcomeResolution (the
 *   reconciliation-resolution authority shape)
 */

// ---------------------------------------------------------------------------
// Exact money (authority: @payswap/protocol src/money.ts, src/clock.ts)
// ---------------------------------------------------------------------------

/** STRUCTURAL PIN — authority: @payswap/protocol `CurrencyCode` (branded). */
export type PinnedCurrencyCode = string;

/** STRUCTURAL PIN — authority: @payswap/protocol `Money` (exact minor units). */
export interface PinnedMoney {
  /** Exact integer minor units (bigint — INV-2: exact/lossless only). */
  readonly value: bigint;
  readonly currency: PinnedCurrencyCode;
}

/** STRUCTURAL PIN — authority: @payswap/protocol `TimestampMs` (bigint ms). */
export type PinnedTimestampMs = bigint;

// ---------------------------------------------------------------------------
// The settlement-instruction typed reference (the DELEGATION handle)
// ---------------------------------------------------------------------------

declare const PinnedSettlementInstructionIdBrand: unique symbol;

/**
 * STRUCTURAL PIN — authority: @payswap/protocol src/netting.ts
 * `SettlementInstructionId`. This is the ONLY settlement handle this
 * package may carry: merchant work items REFERENCE the protocol-owned
 * settlement instruction; they never own, derive or execute one. The
 * brand is local (the leaf-in-flight law) but the VALIDATION LAW is
 * pinned byte-identical (see `pinnedSettlementInstructionIdIsShaped`).
 */
export type PinnedSettlementInstructionId = string & {
  readonly [PinnedSettlementInstructionIdBrand]: "PinnedSettlementInstructionId";
};

/**
 * VALUE PIN — authority: @payswap/protocol src/netting.ts
 * `MAX_ID_LENGTH` for `asSettlementInstructionId` (256, byte-identical).
 */
export const PINNED_SETTLEMENT_INSTRUCTION_ID_MAX_LENGTH = 256 as const;

/**
 * The pinned SHAPE LAW of a SettlementInstructionId (authority:
 * @payswap/protocol `asSettlementInstructionId`): non-empty, at most 256
 * characters, no surrounding whitespace. Pure predicate — the throwing
 * validator is the protocol lane's own; this package re-implements the
 * law locally in src/identifiers.ts so a foreign id can never smuggle a
 * wider shape through the merchant boundary.
 */
export function pinnedSettlementInstructionIdIsShaped(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (value.length > PINNED_SETTLEMENT_INSTRUCTION_ID_MAX_LENGTH) {
    return false;
  }
  return value.trim() === value;
}

// ---------------------------------------------------------------------------
// The canonical settlement-attempt lifecycle (PINNED, never owned)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/protocol src/settlement/attempts.ts
 * `SettlementAttemptState` members (byte-identical). The merchant
 * attempt/intent/refund machines are LOCAL WORK-ITEM machines that
 * PROJECT onto this canonical lifecycle; they never replace it.
 */
export const PINNED_SETTLEMENT_ATTEMPT_STATES = Object.freeze([
  "PENDING",
  "IN_FLIGHT",
  "OUTCOME_UNKNOWN",
  "SUCCEEDED",
  "FAILED",
] as const);

/** STRUCTURAL PIN — authority: @payswap/protocol `SettlementAttemptState`. */
export type PinnedSettlementAttemptState = (typeof PINNED_SETTLEMENT_ATTEMPT_STATES)[number];

/**
 * VALUE PIN — authority: @payswap/protocol src/settlement/attempts.ts
 * `SettlementAttemptEvent` members (byte-identical).
 */
export const PINNED_SETTLEMENT_ATTEMPT_EVENTS = Object.freeze([
  "START",
  "CONFIRM_SUCCEEDED",
  "CONFIRM_FAILED",
  "OUTCOME_UNKNOWN",
  "RECONCILE_RESOLVED_SUCCEEDED",
  "RECONCILE_RESOLVED_FAILED",
] as const);

/** STRUCTURAL PIN — authority: @payswap/protocol `SettlementAttemptEvent`. */
export type PinnedSettlementAttemptEvent = (typeof PINNED_SETTLEMENT_ATTEMPT_EVENTS)[number];

/**
 * VALUE PIN — authority: @payswap/protocol
 * `settlementAttemptStateMachine.transitions` (byte-identical rule set).
 * THE MONEY LIFECYCLE LAW, pinned: SUCCEEDED and FAILED are TERMINAL and
 * monotonic (a retry mints a NEW attempt — the failed record is never
 * rewritten); `OUTCOME_UNKNOWN` is deliberately NON-TERMINAL and can ONLY
 * be exited through the reconciliation resolution events (INV-04) — no
 * declared rule exists from OUTCOME_UNKNOWN to any ordinary event, and
 * no coercion to FAILED exists anywhere.
 */
export const PINNED_SETTLEMENT_ATTEMPT_TRANSITIONS = Object.freeze([
  { from: "PENDING", on: "START", to: "IN_FLIGHT" },
  { from: "IN_FLIGHT", on: "CONFIRM_SUCCEEDED", to: "SUCCEEDED" },
  { from: "IN_FLIGHT", on: "CONFIRM_FAILED", to: "FAILED" },
  { from: "IN_FLIGHT", on: "OUTCOME_UNKNOWN", to: "OUTCOME_UNKNOWN" },
  { from: "OUTCOME_UNKNOWN", on: "RECONCILE_RESOLVED_SUCCEEDED", to: "SUCCEEDED" },
  { from: "OUTCOME_UNKNOWN", on: "RECONCILE_RESOLVED_FAILED", to: "FAILED" },
] as const);

/**
 * VALUE PIN — authority: @payswap/protocol
 * `settlementAttemptStateMachine.terminalStates` (byte-identical).
 */
export const PINNED_SETTLEMENT_ATTEMPT_TERMINAL_STATES = Object.freeze([
  "SUCCEEDED",
  "FAILED",
] as const);

// ---------------------------------------------------------------------------
// External outcomes + reconciliation resolutions (INV-04 / INV-5)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/protocol
 * src/settlement/attempts.ts `ExternalOutcome`.
 */
export type PinnedExternalOutcome = "SUCCEEDED" | "FAILED" | "OUTCOME_UNKNOWN";

/**
 * STRUCTURAL PIN — authority: @payswap/protocol
 * src/settlement/attempts.ts `UnknownOutcomeResolution`. The
 * reconciliation-resolution record that is the ONLY lawful exit from an
 * ambiguous outcome; consumed verbatim by the local work-item machines.
 */
export interface PinnedUnknownOutcomeResolution {
  readonly resolvedOutcome: "CONFIRMED_SUCCEEDED" | "CONFIRMED_FAILED";
  readonly resolvedBy: string;
  readonly caseId: string;
  readonly evidenceIds: readonly string[];
}
