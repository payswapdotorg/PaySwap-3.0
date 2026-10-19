/**
 * @payswap/merchant — the two explicit Stripe settlement paths (P5-W3,
 * lane R3-W3; PORT+ADAPT of the old §3.9 half @ 8a735bf; the honest
 * notice is consumed from the PINNED R3-W1 seam, byte-identical).
 *
 * THE HONEST-UNAVAILABILITY LAW: wherever the native path is not
 * eligible, the external-route selection CARRIES the mandated verbatim
 * notice with a typed reason — and NEVER implies Stripe balance
 * settlement. Settlement executes ONLY on a CONFIRMED attempt; the
 * native family requires the provider-verified confirmation (a
 * synthetic balance effect is unconstructible); the external family
 * carries the protocol settlement-instruction TYPED REFERENCES.
 */

import { ValidationError } from "./errors.ts";
import { SettlementModeConflationError } from "./errors.ts";
import type { PinnedMoney, PinnedTimestampMs } from "./pins/protocol.ts";
import type { PinnedConnectedInstance } from "./pins/capability.ts";
import { PINNED_MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE } from "./pins/route-compiler.ts";
import { assertConnectedInstance } from "./connectivity.ts";
import{ defineExternalConversionSettlementRoute, defineNativeStripeCryptoSettlementRoute, nativeStripeCryptoEligibility, recordStripeSettlementConfirmation } from "./settlement-routes.ts";
import type{ ExternalConversionSettlementRoute, NativeStripeCryptoSettlementRoute, StripeSettlementConfirmation } from "./settlement-routes.ts";
import type { MerchantStripeSettlementMode } from "./settlement-config.ts";
import { MERCHANT_STRIPE_SETTLEMENT_MODES } from "./settlement-config.ts";
import type { CheckoutPaymentAttempt } from "./lifecycle.ts";
import { attachAttemptSettlement } from "./lifecycle.ts";
import { assertNoSecretMaterial } from "./secrets.ts";
import { requireNonEmptyString } from "./secrets.ts";

/** The mandated honest-unavailability notice (pinned byte-identical to the R3-W1 seam). */
export const NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE =
  PINNED_MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE;

/** The honest-unavailability notice record. */
export interface NativeSettlementUnavailableNotice {
  readonly notice: typeof PINNED_MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE;
  readonly reason: NativeUnavailableReason;
}

/** Typed reasons the native path is unavailable at decision time. */
export type NativeUnavailableReason =
  | "NO_CONNECTED_INSTANCE"
  | "AUTHORIZATION_NOT_ACTIVE"
  | "INSTANCE_NOT_ELIGIBLE"
  | "SETTLEMENT_CURRENCY_NOT_IN_SCOPE"
  | "MERCHANT_CONFIGURED_EXTERNAL";

/** The result of a settlement-route selection at decision time. */
export type SettlementRouteSelection =
  | {
      readonly selected: "NATIVE_STRIPE_CRYPTO";
      readonly route: NativeStripeCryptoSettlementRoute;
      readonly eligibility: { readonly eligible: boolean; readonly reasons: readonly string[] };
    }
  | {
      readonly selected: "PAYSWAP_EXTERNAL_SETTLEMENT";
      readonly route: ExternalConversionSettlementRoute;
      /** Present wherever the native path is not eligible (the honest-unavailability law). */
      readonly nativeUnavailable: NativeSettlementUnavailableNotice;
    };

/**
 * A typed eligibility observation of the native Stripe crypto settlement
 * capability, scoped to the ACTUAL connected instance (INV-13: catalogue
 * presence is never connection). Derived through the deterministic view.
 */
export interface StripeCryptoSettlementEligibilityObservation {
  readonly observationId: string;
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly eligible: boolean;
  readonly reasons: readonly string[];
  readonly observedAt: PinnedTimestampMs;
  readonly evidenceRefs: readonly string[];
}

/**
 * Observe native Stripe crypto settlement eligibility for one ACTUAL
 * connected instance against one settlement currency. The instance is
 * asserted FIRST (a catalogue-shaped value throws, INV-13).
 */
export function observeStripeCryptoSettlementEligibility(input: {
  readonly observationId: string;
  readonly connectedInstance: PinnedConnectedInstance;
  readonly settlementCurrency: string;
  readonly supportedAssets: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly observedAt: PinnedTimestampMs;
}): StripeCryptoSettlementEligibilityObservation {
  requireNonEmptyString(input.observationId, "an eligibility observation requires an observationId");
  assertConnectedInstance(input.connectedInstance);
  if (typeof input.settlementCurrency !== "string" || input.settlementCurrency.length !== 3) {
    throw new ValidationError("the settlement currency must be a 3-character code");
  }
  if (!Array.isArray(input.supportedAssets) || input.supportedAssets.length === 0) throw new ValidationError("an eligibility observation requires supported assets");
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length === 0 ||
    !input.evidenceRefs.every((ref) => typeof ref === "string" && ref.length > 0)) {
    throw new ValidationError(
      "an eligibility observation requires non-empty evidence refs (INV-13: catalogue presence is never connection)",
    );
  }
  if (typeof input.observedAt !== "bigint")     throw new ValidationError("observedAt must be a bigint TimestampMs");
  // The view is route-shaped; evaluate against a provider-verified
  // native route bound to this instance (fails closed when not
  // ACTIVE/eligible; the observation records it).
  const route = defineNativeStripeCryptoSettlementRoute(
    {
      connectedInstanceId: input.connectedInstance.instanceId,
      stripeAccountRef: input.connectedInstance.accountRef,
      settlementCurrency: input.settlementCurrency,
      supportedAssets: input.supportedAssets,
      evidenceRefs: input.evidenceRefs,
    },
    input.connectedInstance,
  );
  const view = nativeStripeCryptoEligibility(input.connectedInstance, route);
  const observation: StripeCryptoSettlementEligibilityObservation = Object.freeze({
    observationId: input.observationId,
    instanceId: input.connectedInstance.instanceId,
    capabilityId: route.capabilityId,
    eligible: view.eligible,
    reasons: Object.freeze([...view.reasons]),
    observedAt: input.observedAt,
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
  });
  assertNoSecretMaterial(observation, "stripe crypto settlement eligibility observation");
  return observation;
}

/**
 * Select the settlement route at DECISION TIME. NATIVE_STRIPE_CRYPTO is
 * available ONLY when the actual connected capability is eligible; any
 * failing axis falls back to the external route CARRYING THE MANDATED
 * NOTICE with the typed reason (never a synthesized native route,
 * never silence). PAYSWAP_EXTERNAL_SETTLEMENT selects the external
 * route with the notice (MERCHANT_CONFIGURED_EXTERNAL). The external
 * destination is ALWAYS required (the honest fallback — fail-closed).
 */
export function selectSettlementRoute(input: {
  readonly desiredMode: MerchantStripeSettlementMode;
  readonly native?: {
    readonly connectedInstance: PinnedConnectedInstance;
    /** The merchant's Stripe account ref; defaults to the instance's accountRef. */
    readonly stripeAccountRef?: string;
    readonly settlementCurrency: string;
    readonly supportedAssets: readonly string[];
    readonly evidenceRefs: readonly string[];
  };
  readonly external: {
    readonly destinationId: string;
    readonly destinationKind: string;
    readonly destinationCurrency: string;
    readonly externalRef: string;
    readonly provenance: { readonly source: string; readonly reference: string; readonly recordedAt: bigint };
    readonly conversionChain: readonly string[];
  };
}): SettlementRouteSelection {
  if (!(MERCHANT_STRIPE_SETTLEMENT_MODES as readonly string[]).includes(input.desiredMode)) {
    throw new ValidationError("desiredMode must be a declared settlement mode");
  }
  if (input.external === null || typeof input.external !== "object") {
    throw new ValidationError(
      "an external settlement configuration is always required (the honest fallback destination)",
    );
  }
  const externalRoute = defineExternalConversionSettlementRoute({
    destination: {
      id: input.external.destinationId,
      kind: input.external.destinationKind,
      currency: input.external.destinationCurrency,
      externalRef: input.external.externalRef,
      provenance: input.external.provenance,
    },
    conversionChain: [...input.external.conversionChain],
  });

  if (input.desiredMode === "PAYSWAP_EXTERNAL_SETTLEMENT") {
    return Object.freeze({
      selected: "PAYSWAP_EXTERNAL_SETTLEMENT" as const,
      route: externalRoute,
      nativeUnavailable: Object.freeze({
        notice: PINNED_MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE,
        reason: "MERCHANT_CONFIGURED_EXTERNAL" as const,
      }),
    });
  }

  // NATIVE_STRIPE_CRYPTO — evaluate the actual instance.
  if (
    input.native === undefined ||
    input.native === null ||
    typeof input.native !== "object"
  ) {
    return Object.freeze({
      selected: "PAYSWAP_EXTERNAL_SETTLEMENT" as const,
      route: externalRoute,
      nativeUnavailable: Object.freeze({
        notice: PINNED_MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE,
        reason: "NO_CONNECTED_INSTANCE" as const,
      }),
    });
  }
  const instance = input.native.connectedInstance;
  assertConnectedInstance(instance);
  const settlementCurrency = input.native.settlementCurrency;
  if (typeof settlementCurrency !== "string" || settlementCurrency.length !== 3) {
    throw new ValidationError("the native settlement currency must be a 3-character code");
  }

  // Decision-time eligibility axes (the constructor re-verifies —
  // defense in depth; this pre-check yields TYPED reasons).
  let reason: NativeUnavailableReason | undefined;
  if (instance.authorization.status !== "ACTIVE") {
    reason = "AUTHORIZATION_NOT_ACTIVE";
  } else if (instance.eligibility.eligible !== true) {
    reason = "INSTANCE_NOT_ELIGIBLE";
  } else if (!instance.currencies.includes(settlementCurrency)) {
    reason = "SETTLEMENT_CURRENCY_NOT_IN_SCOPE";
  }
  if (reason !== undefined) {
    return Object.freeze({
      selected: "PAYSWAP_EXTERNAL_SETTLEMENT" as const,
      route: externalRoute,
      nativeUnavailable: Object.freeze({
        notice: PINNED_MERCHANT_NATIVE_SETTLEMENT_UNAVAILABLE_NOTICE,
        reason,
      }),
    });
  }

  const route = defineNativeStripeCryptoSettlementRoute(
    {
      connectedInstanceId: instance.instanceId,
      stripeAccountRef:
        input.native.stripeAccountRef !== undefined
          ? input.native.stripeAccountRef
          : instance.accountRef,
      settlementCurrency,
      supportedAssets: [...input.native.supportedAssets],
      evidenceRefs: [...input.native.evidenceRefs],
    },
    instance,
  );
  const eligibility = nativeStripeCryptoEligibility(instance, route);
  return Object.freeze({
    selected: "NATIVE_STRIPE_CRYPTO" as const,
    route,
    eligibility,
  });
}

// ---------------------------------------------------------------------------
// Settlement execution (provider-verified effects only)
// ---------------------------------------------------------------------------

/**
 * The durable settlement record for one CONFIRMED attempt, discriminated
 * by the LANDED route-family literal with DISJOINT fields: the native
 * variant carries the provider-verified confirmation (unconstructible
 * without provider evidence); the external variant carries the protocol
 * settlement-instruction TYPED REFERENCES and the external destination —
 * structurally CANNOT imply a Stripe balance settlement.
 */
export type MerchantSettlementRecord =
  | {
      readonly settlementId: string;
      readonly attemptId: string;
      readonly routeFamily: "NATIVE_STRIPE_CRYPTO";
      readonly settlementMode: "NATIVE_STRIPE_CRYPTO";
      readonly confirmation: StripeSettlementConfirmation;
      readonly recordedAt: PinnedTimestampMs;
      readonly evidenceIds: readonly string[];
    }
  | {
      readonly settlementId: string;
      readonly attemptId: string;
      readonly routeFamily: "EXTERNAL_PAYSWAP_CONVERSION";
      readonly settlementMode: "PAYSWAP_EXTERNAL_SETTLEMENT";
      /** The protocol settlement-instruction TYPED REFERENCE (delegated money movement). */
      readonly instructionId: string;
      readonly settlementAttemptIds: readonly string[];
      readonly destinationId: string;
      readonly recordedAt: PinnedTimestampMs;
      readonly evidenceIds: readonly string[];
    };

/**
 * Settle a CONFIRMED attempt through the selected route. The attempt
 * MUST be CONFIRMED; NATIVE requires the provider-verified confirmation
 * (SyntheticStripeBalanceError without evidence); EXTERNAL forbids a
 * confirmation input (disjointness) and attaches the protocol
 * settlement-instruction typed references. The mapping is attached to
 * the attempt through the canonical SettlementInstructionId linkage.
 */
export function settleConfirmedAttempt(input: {
  readonly settlementId: string;
  readonly attempt: CheckoutPaymentAttempt;
  readonly selection: SettlementRouteSelection;
  readonly confirmationInput?: {
    readonly confirmationId: string;
    readonly connectedInstanceId: string;
    readonly stripeBalanceTxRef: string;
    readonly amount: PinnedMoney;
    readonly providerStateEnvelopeRef: string;
    readonly evidenceIds: readonly string[];
  };
  readonly protocolInstructionId: string;
  readonly protocolSettlementAttemptIds: readonly string[];
  readonly now: PinnedTimestampMs;
}): { readonly attempt: CheckoutPaymentAttempt; readonly settlement: MerchantSettlementRecord } {
  requireNonEmptyString(input.settlementId, "a settlement requires a settlementId");
  if (input.attempt === null || typeof input.attempt !== "object") {
    throw new ValidationError("settleConfirmedAttempt requires a CheckoutPaymentAttempt");
  }
  if (input.attempt.attempt.state !== "CONFIRMED") {
    throw new ValidationError(
      "settlement executes only on a CONFIRMED attempt (no financial mutation bypasses the lifecycle rules)",
      { attemptId: input.attempt.attempt.id, state: input.attempt.attempt.state },
    );
  }
  requireNonEmptyString(
    input.protocolInstructionId,
    "a settlement requires the protocol settlement instruction id",
  );
  if (
    !Array.isArray(input.protocolSettlementAttemptIds) ||
    input.protocolSettlementAttemptIds.length === 0 ||
    !input.protocolSettlementAttemptIds.every((id) => typeof id === "string" && id.length > 0)
  ) {
    throw new ValidationError("a settlement requires non-empty protocol settlement attempt ids");
  }
  if (typeof input.now !== "bigint")     throw new ValidationError("now must be a bigint TimestampMs");
  const attempt = attachAttemptSettlement(input.attempt, {
    settlementInstructionId: input.protocolInstructionId,
    settlementAttemptIds: input.protocolSettlementAttemptIds,
    now: input.now,
  });

  if (input.selection.selected === "NATIVE_STRIPE_CRYPTO") {
    if (input.confirmationInput === undefined) {
      throw new ValidationError(
        "NATIVE_STRIPE_CRYPTO settlement requires a provider-verified confirmation input (the honest-unavailability law: never imply Stripe balance settlement without the provider's own confirmation)",
        { attemptId: input.attempt.attempt.id },
      );
    }
    const confirmation = recordStripeSettlementConfirmation(input.confirmationInput);
    if (confirmation.connectedInstanceId !== input.selection.route.connectedInstanceId) {
      throw new ValidationError(
        "the settlement confirmation must come from the same connected instance the route was selected on",
        {
          confirmationInstanceId: confirmation.connectedInstanceId,
          routeInstanceId: input.selection.route.connectedInstanceId,
        },
      );
    }
    const settlement: MerchantSettlementRecord = Object.freeze({
      settlementId: input.settlementId,
      attemptId: input.attempt.attempt.id,
      routeFamily: "NATIVE_STRIPE_CRYPTO",
      settlementMode: "NATIVE_STRIPE_CRYPTO",
      confirmation,
      recordedAt: input.now,
      evidenceIds: Object.freeze([...confirmation.evidenceIds]),
    });
    return Object.freeze({ attempt, settlement });
  }

  // EXTERNAL path: a native confirmation input is FORBIDDEN (disjointness).
  if (input.confirmationInput !== undefined) {
    throw new SettlementModeConflationError(
      "a PAYSWAP_EXTERNAL_SETTLEMENT settlement must not carry a NATIVE_STRIPE_CRYPTO confirmation input (disjoint fields both directions)",
    );
  }
  const settlement: MerchantSettlementRecord = Object.freeze({
    settlementId: input.settlementId,
    attemptId: input.attempt.attempt.id,
    routeFamily: "EXTERNAL_PAYSWAP_CONVERSION",
    settlementMode: "PAYSWAP_EXTERNAL_SETTLEMENT",
    instructionId: input.protocolInstructionId,
    settlementAttemptIds: Object.freeze([...input.protocolSettlementAttemptIds]),
    destinationId: input.selection.route.destination.id,
    recordedAt: input.now,
    evidenceIds: Object.freeze([
      `instruction:${input.protocolInstructionId}`,
      ...input.protocolSettlementAttemptIds.map((id) => `settlement-attempt:${id}`),
    ]),
  });
  return Object.freeze({ attempt, settlement });
}

/** Whether a settlement record implies a provider-verified Stripe balance effect. */
export function isProviderVerifiedStripeSettlementRecord(
  settlement: MerchantSettlementRecord,
): boolean {
  return (
    settlement.routeFamily === "NATIVE_STRIPE_CRYPTO" &&
    settlement.confirmation.confirmedByProvider === true
  );
}
