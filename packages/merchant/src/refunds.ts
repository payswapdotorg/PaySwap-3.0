/**
 * @payswap/merchant — refunds (P5-W3, lane R3-W3; PORT of old
 * packages/merchant-checkout/src/refunds.ts @ 8a735bf, connected-
 * instance guard re-based onto the pinned capability shapes).
 *
 * Refund initiation ONLY where the underlying rail supports refunds:
 * the support fact arrives as a TYPED RAIL CAPABILITY OBSERVATION
 * scoped to the actual rail — for the native Stripe family, to the
 * ACTUAL connected instance; for the external family, to the reachable
 * conversion chain. Unsupported rails answer with the typed
 * NOT_SUPPORTED outcome — never a silent rejection, never an implied
 * future support.
 *
 * Refund lifecycle mirrors the payment lifecycle laws:
 * evidence-mandatory definitive outcomes, UNKNOWN preserved with
 * reconciliation the only exit, terminal monotonicity, and IMMUTABLE
 * ORIGINALS — a refund references its original attempt by id and never
 * rewrites it; the recourse vocabulary is the payment plane's own,
 * consumed verbatim through the pins.
 *
 * The native-family refund semantics follow the Stripe research law:
 * refunds are returned as stablecoins to the customer's original
 * wallet (never fiat), partial refunds are supported, and there is no
 * chargeback/dispute path to inherit.
 */

import { ValidationError } from "./errors.ts";
import { defineStateMachine } from "./kernel.ts";
import type { StateMachine } from "./kernel.ts";
import { asRefundId } from "./identifiers.ts";
import type { RefundId } from "./identifiers.ts";
import type { PinnedMoney, PinnedTimestampMs, PinnedUnknownOutcomeResolution } from "./pins/protocol.ts";
import type { PinnedRecoursePolicyKind } from "./pins/payment.ts";
import { assertConnectedInstance } from "./connectivity.ts";
import type { PinnedConnectedInstance } from "./pins/capability.ts";
import type { CryptoAmount } from "./assets.ts";
import type { CheckoutPaymentAttempt } from "./lifecycle.ts";
import { assertNoSecretMaterial } from "./secrets.ts";

/** Refund lifecycle states. */
export type RefundState = "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED" | "OUTCOME_UNKNOWN";

/** Events the refund machine declares. */
export type RefundEvent =
  | "SUBMIT"
  | "CONFIRM_SUCCEEDED"
  | "CONFIRM_FAILED"
  | "REPORT_UNKNOWN"
  | "RESOLVE_SUCCEEDED"
  | "RESOLVE_FAILED";

/**
 * The deterministic refund lifecycle machine — the payment-attempt law
 * mirrored: SUBMITTED only from PENDING; definitive outcomes only from
 * SUBMITTED; OUTCOME_UNKNOWN is first-class NON-TERMINAL with
 * reconciliation resolutions as its ONLY exits; terminal states
 * monotonic.
 */
export const refundStateMachine: StateMachine<RefundState, RefundEvent, unknown> =
  defineStateMachine<RefundState, RefundEvent, unknown>({
    name: "merchant-refund",
    initial: "PENDING",
    states: ["PENDING", "SUBMITTED", "CONFIRMED", "FAILED", "OUTCOME_UNKNOWN"],
    events: [
      "SUBMIT",
      "CONFIRM_SUCCEEDED",
      "CONFIRM_FAILED",
      "REPORT_UNKNOWN",
      "RESOLVE_SUCCEEDED",
      "RESOLVE_FAILED",
    ],
    transitions: [
      { from: "PENDING", on: "SUBMIT", to: "SUBMITTED", description: "submitted to the rail" },
      { from: "SUBMITTED", on: "CONFIRM_SUCCEEDED", to: "CONFIRMED", description: "definitive success observed with evidence" },
      { from: "SUBMITTED", on: "CONFIRM_FAILED", to: "FAILED", description: "definitive failure observed with evidence" },
      { from: "SUBMITTED", on: "REPORT_UNKNOWN", to: "OUTCOME_UNKNOWN", description: "ambiguous outcome — UNKNOWN preserved" },
      { from: "OUTCOME_UNKNOWN", on: "RESOLVE_SUCCEEDED", to: "CONFIRMED", description: "reconciliation resolved as success" },
      { from: "OUTCOME_UNKNOWN", on: "RESOLVE_FAILED", to: "FAILED", description: "reconciliation resolved as failure" },
    ],
    terminalStates: ["CONFIRMED", "FAILED"],
  });

/**
 * A TYPED rail capability observation of refund support, scoped to the
 * actual rail. For the native Stripe family the observation is bound
 * to a genuinely connected instance (INV-13) and carries the
 * research-pinned semantics: stablecoins to the original wallet,
 * partial supported, no chargeback path.
 */
export interface RailRefundSupportObservation {
  readonly observationId: string;
  readonly routeFamily: "NATIVE_STRIPE_CRYPTO" | "EXTERNAL_PAYSWAP_CONVERSION";
  readonly supportsRefunds: boolean;
  readonly partialRefunds: boolean;
  /** How refunds return value (typed per family; present when supported). */
  readonly refundMedium?: "STABLECOIN_TO_ORIGINAL_WALLET" | "EXTERNAL_CONVERSION_RETURN";
  /** The research law: no chargeback/dispute path on native crypto acceptance. */
  readonly chargebackPathAvailable: boolean;
  readonly observedAt: PinnedTimestampMs;
  readonly evidenceRefs: readonly string[];
}

/** One refund of a confirmed payment attempt (originals are never mutated). */
export interface RefundRecord {
  readonly id: RefundId;
  readonly originalAttemptId: string;
  readonly intentId: string;
  /** Exact fiat refund amount (≤ the original payment, same currency). */
  readonly amount: PinnedMoney;
  /** The exact refunded crypto amount, observed at submission when the rail reports it. */
  readonly refundedCryptoAmount?: CryptoAmount;
  readonly routeFamily: "NATIVE_STRIPE_CRYPTO" | "EXTERNAL_PAYSWAP_CONVERSION";
  readonly refundMedium: "STABLECOIN_TO_ORIGINAL_WALLET" | "EXTERNAL_CONVERSION_RETURN";
  /** The customer's original wallet (where value returns on the native family). */
  readonly destinationRef: string;
  /** The recourse vocabulary from the payment plane, frozen at initiation. */
  readonly recourse: PinnedRecoursePolicyKind;
  readonly railObservationId: string;
  readonly state: RefundState;
  readonly evidenceIds: readonly string[];
  readonly createdAt: PinnedTimestampMs;
  readonly updatedAt: PinnedTimestampMs;
}

/** The typed result of a refund initiation. */
export type RefundInitiationResult =
  | { readonly outcome: "REFUND_STARTED"; readonly refund: RefundRecord }
  | {
      readonly outcome: "NOT_SUPPORTED";
      readonly routeFamily: "NATIVE_STRIPE_CRYPTO" | "EXTERNAL_PAYSWAP_CONVERSION";
      readonly reason: string;
    };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function requireEvidenceIds(evidenceIds: readonly string[], label: string): void {
  if (
    !Array.isArray(evidenceIds) ||
    evidenceIds.length === 0 ||
    !evidenceIds.every((id) => isNonEmptyString(id))
  ) {
    throw new ValidationError(label);
  }
}

/**
 * Observe refund support on the NATIVE Stripe crypto rail, scoped to
 * the ACTUAL connected instance: a catalogue-shaped value throws
 * (INV-13); an ineligible or inactive instance is an honest
 * NOT_SUPPORTED observation, never an error. The semantics are pinned
 * by the research: refunds always return as stablecoins to the
 * customer's original wallet; partial refunds supported; no chargeback
 * path.
 */
export function observeNativeStripeRefundSupport(input: {
  readonly observationId: string;
  readonly connectedInstance: PinnedConnectedInstance;
  readonly evidenceRefs: readonly string[];
  readonly observedAt: PinnedTimestampMs;
}): RailRefundSupportObservation {
  if (!isNonEmptyString(input.observationId)) {
    throw new ValidationError("an observation requires an observationId");
  }
  // INV-13: only a genuinely connected instance, never a catalogue entry.
  assertConnectedInstance(input.connectedInstance);
  requireEvidenceIds(
    input.evidenceRefs,
    "a refund-support observation requires non-empty evidence refs",
  );
  if (typeof input.observedAt !== "bigint") {
    throw new ValidationError("observedAt must be a bigint TimestampMs");
  }
  const instance = input.connectedInstance;
  const eligible =
    instance.authorization.status === "ACTIVE" && instance.eligibility.eligible === true;
  const observation: RailRefundSupportObservation = Object.freeze({
    observationId: input.observationId,
    routeFamily: "NATIVE_STRIPE_CRYPTO",
    supportsRefunds: eligible,
    partialRefunds: eligible,
    ...(eligible ? { refundMedium: "STABLECOIN_TO_ORIGINAL_WALLET" as const } : {}),
    chargebackPathAvailable: false,
    observedAt: input.observedAt,
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
  });
  assertNoSecretMaterial(observation, "native stripe refund support observation");
  return observation;
}

/**
 * Observe refund support on the EXTERNAL PaySwap conversion family:
 * supported exactly when the reachable conversion chain declares a
 * return path; the observation is evidence-backed and typed, never
 * assumed.
 */
export function observeExternalConversionRefundSupport(input: {
  readonly observationId: string;
  readonly conversionChain: readonly string[];
  readonly supportsRefunds: boolean;
  readonly partialRefunds: boolean;
  readonly evidenceRefs: readonly string[];
  readonly observedAt: PinnedTimestampMs;
}): RailRefundSupportObservation {
  if (!isNonEmptyString(input.observationId)) {
    throw new ValidationError("an observation requires an observationId");
  }
  if (
    !Array.isArray(input.conversionChain) ||
    input.conversionChain.length === 0 ||
    !input.conversionChain.every((ref) => isNonEmptyString(ref))
  ) {
    throw new ValidationError(
      "the external-family observation must reference its conversion chain",
    );
  }
  requireEvidenceIds(
    input.evidenceRefs,
    "a refund-support observation requires non-empty evidence refs",
  );
  if (typeof input.observedAt !== "bigint") {
    throw new ValidationError("observedAt must be a bigint TimestampMs");
  }
  const observation: RailRefundSupportObservation = Object.freeze({
    observationId: input.observationId,
    routeFamily: "EXTERNAL_PAYSWAP_CONVERSION",
    supportsRefunds: input.supportsRefunds,
    partialRefunds: input.partialRefunds,
    ...(input.supportsRefunds ? { refundMedium: "EXTERNAL_CONVERSION_RETURN" as const } : {}),
    chargebackPathAvailable: false,
    observedAt: input.observedAt,
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
  });
  assertNoSecretMaterial(observation, "external conversion refund support observation");
  return observation;
}


export { initiateRefund, submitRefund, observeRefundOutcome, resolveRefundUnknown, refundStatusView } from "./refunds-flow.ts";
export type { RefundOutcomeObservation } from "./refunds-flow.ts";
