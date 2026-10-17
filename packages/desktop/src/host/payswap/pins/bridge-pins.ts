/**
 * PaySwap Desktop (P7-W2) — structural pins of the @payswap/provider-runtime
 * execution-bridge law (mirrors packages/provider-runtime/src/
 * {result-envelope,execution-bridge,execution-mode}.ts at the base commit
 * recorded in pin-registry.ts; pin provider-runtime.bridge-law).
 *
 * BRIDGE LAW (ported with the pins — the honest-states source of truth for
 * the desktop):
 * - The three-value external-effect outcome (INV-04): CONFIRMED / UNKNOWN /
 *   FAILED. An ambiguous outcome after a potentially effective external
 *   command is UNKNOWN and must be reconciled before any consequential
 *   retry — never collapsed into a failure.
 * - A delivered 5xx is a FAILED provider answer; a timeout after dispatch
 *   is UNKNOWN (the command may have landed); malformed bytes back are
 *   UNKNOWN (never a guess).
 * - A CONFIRMED envelope requires at least one provider reference.
 * - AuthorizedCommand carries an OPAQUE authorization ref in (P1-W2
 *   pattern); command params must be clean of secret material (INV-19).
 * - The SANDBOX/LIVE execution-mode law (INV-25): a sandbox run is never
 *   proof of live behavior — live certification is P8.
 *
 * DELEGATION LAW (P5-W3, applied to desktop): the desktop NEVER executes
 * money movement itself. It delegates via TYPED REFERENCES to the backend
 * plane that owns the bridge; these pins describe the envelope shapes the
 * desktop READS back (provider-verified observations), never an execution
 * API it owns.
 */

import type { PinnedAuthorizationRef } from "./lifecycle-pins.js";

// ---------------------------------------------------------------------------
// The three-value outcome (mirrors result-envelope.ts)
// ---------------------------------------------------------------------------

/** Mirrors EXTERNAL_EFFECT_OUTCOMES (INV-04). */
export const PINNED_EXTERNAL_EFFECT_OUTCOMES = ["CONFIRMED", "UNKNOWN", "FAILED"] as const;

export type PinnedExternalEffectOutcome = (typeof PINNED_EXTERNAL_EFFECT_OUTCOMES)[number];

/** Mirrors AmbiguityReason — why an outcome is UNKNOWN. */
export const PINNED_AMBIGUITY_REASONS = [
  "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
  "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH",
  "MALFORMED_RESPONSE_AFTER_DISPATCH",
] as const;

export type PinnedAmbiguityReason = (typeof PINNED_AMBIGUITY_REASONS)[number];

/** Mirrors ProviderFailureMetadata — provider failure with ambiguity classification. */
export interface PinnedProviderFailureMetadata {
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly retryable: boolean;
  readonly ambiguity: "NONE" | "OUTCOME_UNKNOWN";
}

/**
 * Mirrors ExecutionResultEnvelope — exactly one of CONFIRMED / UNKNOWN /
 * FAILED, with provider references, failure metadata, ambiguity reason and
 * the raw-state retention pointer. Timestamps are ISO-8601 strings on the
 * desktop wire (bigint-safe: TimestampMs in the owning lane).
 */
export interface PinnedExecutionResultEnvelope {
  readonly outcome: PinnedExternalEffectOutcome;
  readonly providerReferences: readonly string[];
  /** Present for FAILED (and never for CONFIRMED). */
  readonly providerFailure?: PinnedProviderFailureMetadata;
  /** Present for UNKNOWN — the recorded ambiguity reason. */
  readonly ambiguityReason?: PinnedAmbiguityReason;
  /** Retained raw provider-state record (lossless retention upstream). */
  readonly rawStateRecordId?: string;
  readonly dispatchedAt: string;
  readonly completedAt: string;
}

// ---------------------------------------------------------------------------
// The authorized command (mirrors execution-bridge.ts)
// ---------------------------------------------------------------------------

/**
 * Mirrors AuthorizedCommand — the command entering the bridge: an OPAQUE
 * authorization lineage ref in, an operation binding, params clean of
 * secret material. The desktop NEVER constructs one for local execution;
 * it forwards typed references only (delegation law).
 */
export interface PinnedAuthorizedCommand {
  readonly commandId: string;
  readonly correlationId: string;
  readonly authorization: PinnedAuthorizationRef;
  readonly operationId: string;
  readonly params: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Execution modes (mirrors execution-mode.ts)
// ---------------------------------------------------------------------------

/**
 * Mirrors ExecutionMode — the mechanically distinct SANDBOX/LIVE law
 * (INV-25): a sandbox can never be represented as proof of live behavior.
 */
export const PINNED_EXECUTION_MODES = ["SANDBOX", "LIVE"] as const;

export type PinnedExecutionMode = (typeof PINNED_EXECUTION_MODES)[number];

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Guard: an outcome is in the pinned (mirrored) three-value vocabulary. */
export function isPinnedExternalEffectOutcome(
  value: unknown,
): value is PinnedExternalEffectOutcome {
  return (
    typeof value === "string" &&
    (PINNED_EXTERNAL_EFFECT_OUTCOMES as readonly unknown[]).includes(value)
  );
}

/** Guard: an ambiguity reason is in the pinned (mirrored) vocabulary. */
export function isPinnedAmbiguityReason(value: unknown): value is PinnedAmbiguityReason {
  return (
    typeof value === "string" &&
    (PINNED_AMBIGUITY_REASONS as readonly unknown[]).includes(value)
  );
}

/**
 * Structural validation of a pinned execution result envelope (fail-closed,
 * mirrors the mirrored constructors' laws):
 * - CONFIRMED requires at least one provider reference;
 * - FAILED carries failure metadata, never an ambiguity reason of record;
 * - UNKNOWN carries an ambiguity reason;
 * - timestamps are present ISO-8601 strings.
 */
export function validatePinnedExecutionResultEnvelope(
  envelope: PinnedExecutionResultEnvelope,
): void {
  if (envelope === null || typeof envelope !== "object") {
    throw new Error(
      "validatePinnedExecutionResultEnvelope: envelope must be an ExecutionResultEnvelope object",
    );
  }
  if (!isPinnedExternalEffectOutcome(envelope.outcome)) {
    throw new Error(
      "validatePinnedExecutionResultEnvelope: outcome must be CONFIRMED, UNKNOWN or FAILED",
    );
  }
  if (envelope.outcome === "CONFIRMED" && envelope.providerReferences.length === 0) {
    throw new Error(
      "validatePinnedExecutionResultEnvelope: a CONFIRMED envelope requires at least one provider reference",
    );
  }
  if (envelope.outcome === "UNKNOWN" && envelope.ambiguityReason === undefined) {
    throw new Error(
      "validatePinnedExecutionResultEnvelope: an UNKNOWN envelope carries its ambiguity reason",
    );
  }
  if (envelope.outcome === "FAILED" && envelope.providerFailure === undefined) {
    throw new Error(
      "validatePinnedExecutionResultEnvelope: a FAILED envelope carries provider failure metadata",
    );
  }
  if (typeof envelope.dispatchedAt !== "string" || envelope.dispatchedAt.length === 0) {
    throw new Error(
      "validatePinnedExecutionResultEnvelope: dispatchedAt must be a non-empty ISO-8601 string",
    );
  }
  if (typeof envelope.completedAt !== "string" || envelope.completedAt.length === 0) {
    throw new Error(
      "validatePinnedExecutionResultEnvelope: completedAt must be a non-empty ISO-8601 string",
    );
  }
}
