/**
 * @payswap/app — STRUCTURAL PINS of the accepted @payswap/
 * provider-runtime observation vocabulary (packages/provider-runtime/src,
 * P2-W2 ACCEPTED).
 *
 * LAYER LAW (MODULE-OWNERSHIP.yaml): packages/web is a ZCode-substrate
 * PLATFORM package and depends on @zcode/* workspace packages ONLY — a
 * substrate package NEVER imports @payswap/*. The provider-verified
 * observation vocabulary the UI renders is pinned STRUCTURALLY here
 * (field-for-field, same literals, same unions) from:
 *
 * - packages/provider-runtime/src/result-envelope.ts —
 *   EXTERNAL_EFFECT_OUTCOMES, AMBIGUITY_REASONS, ProviderFailureMetadata,
 *   ExecutionResultEnvelope.
 *
 * PRODUCT LAW (P7-W1): the UI never fabricates financial state — every
 * money/execution state rendered comes from provider-verified observations
 * in exactly this vocabulary; UNKNOWN renders as UNKNOWN (never as failure
 * or success — INV-04 at the UX boundary). The mirror is verified against
 * the source by test/payswap/pin-mirror.test.ts.
 */

/* ====================================================================
 * result-envelope.ts pins
 * ==================================================================== */

/** The three-value external-effect outcome (INV-04) — same literals, same order. */
export const EXTERNAL_EFFECT_OUTCOMES_PIN = ["CONFIRMED", "UNKNOWN", "FAILED"] as const;

export type ExternalEffectOutcomePin = (typeof EXTERNAL_EFFECT_OUTCOMES_PIN)[number];

/** Mirrors provider-runtime ProviderFailureMetadata. */
export interface ProviderFailureMetadataPin {
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly retryable: boolean;
  readonly ambiguity: "NONE" | "OUTCOME_UNKNOWN";
}

/**
 * Why an outcome is UNKNOWN (mirrors AMBIGUITY_REASONS — same literals,
 * same order; recorded on every ambiguous attempt).
 */
export const AMBIGUITY_REASONS_PIN = [
  "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
  "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH",
  "MALFORMED_RESPONSE_AFTER_DISPATCH",
] as const;

export type AmbiguityReasonPin = (typeof AMBIGUITY_REASONS_PIN)[number];

/**
 * The execution result envelope (mirrors ExecutionResultEnvelope
 * field-for-field): exactly one of CONFIRMED / UNKNOWN / FAILED, with the
 * provider references, failure metadata, ambiguity reason, retained
 * raw-state pointer and the dispatch/complete times. The envelope is a
 * provider-verified OBSERVATION — the UI renders it; it never constructs
 * or upgrades it.
 */
export interface ExecutionResultEnvelopePin {
  readonly outcome: ExternalEffectOutcomePin;
  readonly providerReferences: readonly string[];
  /** Present for FAILED (and never for CONFIRMED). */
  readonly providerFailure?: ProviderFailureMetadataPin;
  /** Present for UNKNOWN — the recorded ambiguity reason. */
  readonly ambiguityReason?: AmbiguityReasonPin;
  readonly rawStateRecordId?: string;
  readonly dispatchedAt: number;
  readonly completedAt: number;
}
