/**
 * PaySwap Desktop (P7-W2) — structural pins of the @payswap/protocol
 * financial-protocol lifecycle contracts (mirrors packages/protocol/src/
 * {settlement/attempts,settlement/evidence,authorization}.ts at the base
 * commit recorded in pin-registry.ts; pin protocol.lifecycle).
 *
 * LIFECYCLE LAW (ported with the pins):
 * - OUTCOME_UNKNOWN is a first-class, NON-TERMINAL attempt state (INV-04):
 *   it is exited ONLY through a reconciliation resolution that carries
 *   evidence — there is no coercion to FAILED anywhere, and no blind retry
 *   of an unresolved UNKNOWN.
 * - SUCCEEDED/FAILED are terminal and monotonic: a retry mints a NEW
 *   attempt record; history is append-only (INV-03).
 * - Evidence kinds are DISTINCT — funding, conversion, payout, observation
 *   and finality are never conflated, because conflating them produces
 *   exactly the fake-success ambiguity the architecture forbids (INV-24:
 *   a "payout sent" record is NOT beneficiary-account credit).
 * - AuthorizationRef is an OPAQUE structural lineage ref: the desktop
 *   validates structural completeness only; trust-lane semantics stay with
 *   the trust lane (P1-W2 pattern).
 *
 * The desktop product COMPOSES these shapes; it never re-implements the
 * engines behind them (no parallel payment engine — P5-W3 law applies to
 * desktop too).
 */

// ---------------------------------------------------------------------------
// Settlement attempt lifecycle (mirrors settlement/attempts.ts)
// ---------------------------------------------------------------------------

/** Mirrors SettlementAttemptState (the five attempt states). */
export const PINNED_SETTLEMENT_ATTEMPT_STATES = [
  "PENDING",
  "IN_FLIGHT",
  "OUTCOME_UNKNOWN",
  "SUCCEEDED",
  "FAILED",
] as const;

export type PinnedSettlementAttemptState = (typeof PINNED_SETTLEMENT_ATTEMPT_STATES)[number];

/** Mirrors SettlementAttemptEvent. */
export const PINNED_SETTLEMENT_ATTEMPT_EVENTS = [
  "START",
  "CONFIRM_SUCCEEDED",
  "CONFIRM_FAILED",
  "OUTCOME_UNKNOWN",
  "RECONCILE_RESOLVED_SUCCEEDED",
  "RECONCILE_RESOLVED_FAILED",
] as const;

export type PinnedSettlementAttemptEvent = (typeof PINNED_SETTLEMENT_ATTEMPT_EVENTS)[number];

/**
 * The terminal, monotonic attempt states (mirrors the mirrored machine's
 * terminal set — a retry mints a new record; these never reopen).
 */
export const PINNED_TERMINAL_ATTEMPT_STATES = ["SUCCEEDED", "FAILED"] as const;

/**
 * The desktop's wire record of one settlement attempt — the DATA half of
 * the mirrored SettlementAttempt (id, instruction linkage, state, evidence
 * linkage, correlation). The lifecycle MACHINE stays with the protocol
 * authority; the desktop renders recorded attempts only.
 */
export interface PinnedSettlementAttemptRecord {
  readonly attemptId: string;
  /** The settlement instruction this attempt executes (opaque ref). */
  readonly instructionRef: string;
  readonly state: PinnedSettlementAttemptState;
  /** Evidence node ids linked to this attempt's recorded outcomes (INV-05). */
  readonly evidenceRefs: readonly string[];
  /** Provider correlation id, when the provider acknowledged the command. */
  readonly correlationId?: string;
  /** When the attempt was recorded (ISO-8601 string, explicit input). */
  readonly recordedAt: string;
}

// ---------------------------------------------------------------------------
// Evidence kinds (mirrors settlement/evidence.ts)
// ---------------------------------------------------------------------------

/**
 * Mirrors EvidenceNodeKind — the DISTINCT kinds. `PAYOUT` is PaySwap's
 * outgoing action; `OBSERVATION` is an external system's state — never
 * conflated.
 */
export const PINNED_EVIDENCE_NODE_KINDS = [
  "AUTHORIZATION",
  "FUNDING",
  "CONVERSION",
  "PAYOUT",
  "OBSERVATION",
  "FINALITY",
  "RECONCILIATION",
] as const;

export type PinnedEvidenceNodeKind = (typeof PINNED_EVIDENCE_NODE_KINDS)[number];

/**
 * The desktop's wire record of one evidence node — the DATA half of the
 * mirrored EvidenceNode (kind, action linkage, provenance source label,
 * payload hash). Evidence semantics (believable strength, mutation
 * refusal) stay with the protocol authority.
 */
export interface PinnedEvidenceNodeRecord {
  readonly nodeId: string;
  readonly kind: PinnedEvidenceNodeKind;
  readonly actionRef: string;
  /** Provenance source label (PROTOCOL_LEDGER / AUTHENTICATED_PROVIDER / ...). */
  readonly provenanceSource: string;
  readonly payloadHash: string;
}

// ---------------------------------------------------------------------------
// Authorization lineage (mirrors authorization.ts / refs.ts pattern)
// ---------------------------------------------------------------------------

/**
 * Mirrors the AuthorizationRef structural shape (P1-W2 pattern, pinned the
 * same way @payswap/provider-runtime pins it in refs.ts): opaque ids + the
 * security epoch. The trust lane owns the semantics; the desktop validates
 * structural completeness only — it never re-derives authority.
 */
export interface PinnedAuthorizationRef {
  readonly artifactId: string;
  readonly mandateRef: string;
  readonly approverRef: string;
  /**
   * Security/policy epoch at issuance. bigint in the owning lane; carried
   * as a canonical decimal string on the desktop wire (JSON-safe — the
   * desktop never computes with it).
   */
  readonly epoch: string;
  readonly artifactHash?: string;
}

/** Structural validation of the pinned authorization ref (fail-closed). */
export function validatePinnedAuthorizationRef(ref: PinnedAuthorizationRef): void {
  if (ref === null || typeof ref !== "object") {
    throw new Error("validatePinnedAuthorizationRef: ref must be an AuthorizationRef object");
  }
  for (const field of ["artifactId", "mandateRef", "approverRef"] as const) {
    const value = ref[field];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(
        `validatePinnedAuthorizationRef: ${field} must be a non-empty opaque id`,
      );
    }
    if (value.length > 256) {
      throw new Error(
        `validatePinnedAuthorizationRef: ${field} exceeds 256 characters`,
      );
    }
    if (value.trim() !== value) {
      throw new Error(
        `validatePinnedAuthorizationRef: ${field} must not carry surrounding whitespace`,
      );
    }
  }
  if (typeof ref.epoch !== "string" || !/^(0|[1-9][0-9]*)$/.test(ref.epoch)) {
    throw new Error(
      "validatePinnedAuthorizationRef: epoch must be a canonical non-negative decimal string",
    );
  }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Guard: an attempt state is in the pinned (mirrored) vocabulary. */
export function isPinnedSettlementAttemptState(
  value: unknown,
): value is PinnedSettlementAttemptState {
  return (
    typeof value === "string" &&
    (PINNED_SETTLEMENT_ATTEMPT_STATES as readonly unknown[]).includes(value)
  );
}

/** Guard: an evidence node kind is in the pinned (mirrored) vocabulary. */
export function isPinnedEvidenceNodeKind(value: unknown): value is PinnedEvidenceNodeKind {
  return (
    typeof value === "string" &&
    (PINNED_EVIDENCE_NODE_KINDS as readonly unknown[]).includes(value)
  );
}
