/**
 * @payswap/merchant — crypto acceptance activation (P5-W3, lane
 * R3-W3; PORT of old packages/merchant-checkout/src/acceptance.ts @
 * 8a735bf, unified-package rename activation.ts).
 *
 * The merchant-facing acceptance layer: an ACTIVATION record that
 * COMPOSES the crypto acceptance policy (assets/chains/constraints/
 * expiry) — a typed view over it, never a copy. Every evaluation goes
 * through the deterministic matchers.
 *
 * Laws:
 * - activation requires a VERIFIED merchant (or one already ACTIVE);
 * - deactivation preserves historical policy snapshots (immutable
 *   history law): the activation record is frozen, deactivation
 *   returns a NEW record, and open checkout sessions keep their own
 *   snapshot;
 * - this layer NEVER widens acceptance: it can only narrow to the
 *   composed crypto policy over the base policy.
 */

import { ValidationError } from "./errors.ts";
import { asCryptoAcceptanceActivationId } from "./identifiers.ts";
import type {
  CryptoAcceptanceActivationId,
  MerchantCryptoAcceptancePolicyId,
} from "./identifiers.ts";
import type { PinnedTimestampMs } from "./pins/protocol.ts";
import type {
  PinnedAcceptanceRequest,
  PinnedPaymentAcceptancePolicy,
} from "./pins/payment.ts";
import {
  defineMerchantCryptoAcceptancePolicy,
  offeredAssets,
} from "./acceptance-policy.ts";
import type {
  CryptoAcceptanceDecision,
  CryptoAcceptanceRejectionReason,
  CryptoAcceptanceRequest,
  CryptoAssetAcceptance,
  MerchantCryptoAcceptancePolicy,
} from "./acceptance-policy.ts";
import { evaluateCryptoAcceptance, matchesCryptoAcceptance } from "./acceptance-evaluate.ts";
import { merchantMayActivateCryptoAcceptance } from "./onboarding.ts";
import type { MerchantProfile } from "./onboarding.ts";

/** Activation lifecycle states. */
export type CryptoAcceptanceActivationState = "ACTIVE" | "DEACTIVATED";

/** Typed rejection reasons at the activation layer. */
export type AcceptanceActivationRejectionReason = "MERCHANT_NOT_VERIFIED" | "ACTIVATION_INACTIVE";

/** The activation record: merchant + the COMPOSED crypto acceptance policy. */
export interface CryptoAcceptanceActivation {
  readonly id: CryptoAcceptanceActivationId;
  readonly merchantId: string;
  readonly state: CryptoAcceptanceActivationState;
  /** The composed crypto acceptance policy — the single source of acceptance truth. */
  readonly policy: MerchantCryptoAcceptancePolicy;
  readonly activatedAt: PinnedTimestampMs;
  /** Present iff deactivated. The original activation record stays immutable. */
  readonly deactivatedAt?: PinnedTimestampMs;
  readonly deactivationReason?: string;
}

/**
 * The checkout-facing typed VIEW over the composed policy: offered
 * assets (a fresh frozen snapshot), quote validity and the base policy
 * reference. Derived only through the deterministic snapshot law —
 * this layer adds no acceptance vocabulary.
 */
export interface AcceptanceOfferView {
  readonly policyId: MerchantCryptoAcceptancePolicyId;
  readonly basePolicyId: string;
  readonly assets: readonly CryptoAssetAcceptance[];
  readonly quoteValidityMs: bigint;
}

/**
 * Activate crypto acceptance for a merchant: composes the crypto
 * acceptance policy (constructed through
 * `defineMerchantCryptoAcceptancePolicy` — which enforces that the
 * base canonical policy already declares STABLECOIN_CRYPTO) and
 * requires the merchant to be verified (VERIFIED or ACTIVE onboarding
 * state). Fail-closed.
 */
export function activateCryptoAcceptance(input: {
  readonly id: string;
  readonly merchant: MerchantProfile;
  readonly policyInput: {
    readonly id: string;
    readonly merchantRef: string;
    readonly basePolicyId: string;
    readonly assets: readonly CryptoAssetAcceptance[];
    readonly quoteValidityMs: bigint;
  };
  readonly basePolicy: PinnedPaymentAcceptancePolicy;
  readonly now: PinnedTimestampMs;
}): CryptoAcceptanceActivation {
  const id = asCryptoAcceptanceActivationId(input.id);
  if (input.merchant === null || typeof input.merchant !== "object") {
    throw new ValidationError("activation requires a MerchantProfile", { id });
  }
  if (input.merchant.id !== input.policyInput.merchantRef) {
    throw new ValidationError(
      "the composed policy must reference the activating merchant exactly",
      { id, merchantId: input.merchant.id, policyMerchantRef: input.policyInput.merchantRef },
    );
  }
  if (!merchantMayActivateCryptoAcceptance(input.merchant)) {
    throw new ValidationError(
      "crypto acceptance activation requires a verified merchant (onboarding state VERIFIED or ACTIVE)",
      { id, merchantId: input.merchant.id, onboardingState: input.merchant.state },
    );
  }
  if (typeof input.now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { id });
  }
  const policy = defineMerchantCryptoAcceptancePolicy(input.policyInput, input.basePolicy);
  return Object.freeze({
    id,
    merchantId: input.merchant.id,
    state: "ACTIVE",
    policy,
    activatedAt: input.now,
  });
}

/**
 * Deactivate crypto acceptance. Returns a NEW frozen record in the
 * DEACTIVATED state; the supplied original is never mutated (immutable
 * history: the historical policy snapshot — the composed policy record
 * — is preserved verbatim inside both records, and previously opened
 * checkout sessions keep their own offered-assets snapshot from open
 * time). Only legal on an ACTIVE activation.
 */
export function deactivateCryptoAcceptance(
  activation: CryptoAcceptanceActivation,
  input: { readonly reason: string; readonly now: PinnedTimestampMs },
): CryptoAcceptanceActivation {
  if (
    activation === null ||
    typeof activation !== "object" ||
    typeof activation.id !== "string" ||
    activation.id.length === 0
  ) {
    throw new ValidationError("deactivation requires a CryptoAcceptanceActivation");
  }
  if (typeof input.reason !== "string" || input.reason.length === 0) {
    throw new ValidationError("deactivation requires a non-empty reason", {
      activationId: activation.id,
    });
  }
  if (typeof input.now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", {
      activationId: activation.id,
    });
  }
  if (activation.state !== "ACTIVE") {
    throw new ValidationError(
      "only an ACTIVE crypto acceptance activation can be deactivated",
      { activationId: activation.id, state: activation.state },
    );
  }
  return Object.freeze({
    ...activation,
    state: "DEACTIVATED",
    deactivatedAt: input.now,
    deactivationReason: input.reason,
  });
}

/**
 * The checkout-facing typed view over the composed policy. Offered
 * assets are re-snapshotted (fresh frozen copies) so the view can
 * never alias a mutable list.
 */
export function acceptanceOfferView(activation: CryptoAcceptanceActivation): AcceptanceOfferView {
  if (
    activation === null ||
    typeof activation !== "object" ||
    typeof activation.policy?.id !== "string"
  ) {
    throw new ValidationError("acceptanceOfferView requires a CryptoAcceptanceActivation");
  }
  const view: AcceptanceOfferView = Object.freeze({
    policyId: activation.policy.id,
    basePolicyId: activation.policy.basePolicyId,
    assets: offeredAssets(activation.policy),
    quoteValidityMs: activation.policy.quoteValidityMs,
  });
  return view;
}

/**
 * Deterministically evaluate a crypto acceptance request against the
 * activation. A DEACTIVATED activation rejects with the typed reason
 * ACTIVATION_INACTIVE (never an exception — a policy decision); an
 * ACTIVE activation delegates to `matchesCryptoAcceptance` (the
 * deterministic rejection reasons pass through verbatim).
 */
export function activationMatches(
  activation: CryptoAcceptanceActivation,
  request: CryptoAcceptanceRequest,
  now: PinnedTimestampMs,
): {
  readonly accepted: boolean;
  readonly reasons: readonly (CryptoAcceptanceRejectionReason | AcceptanceActivationRejectionReason)[];
} {
  if (
    activation === null ||
    typeof activation !== "object" ||
    typeof activation.id !== "string"
  ) {
    throw new ValidationError("activationMatches requires a CryptoAcceptanceActivation");
  }
  if (activation.state !== "ACTIVE") {
    return Object.freeze({
      accepted: false,
      reasons: Object.freeze(["ACTIVATION_INACTIVE"] as const),
    });
  }
  const decision: CryptoAcceptanceDecision = matchesCryptoAcceptance(
    activation.policy,
    request,
    now,
  );
  return Object.freeze({
    accepted: decision.accepted,
    reasons: Object.freeze([...decision.reasons]),
  });
}

/**
 * Evaluate a request against BOTH planes through
 * `evaluateCryptoAcceptance` (base policy first, then the crypto
 * policy). Requires an ACTIVE activation; a deactivated activation
 * rejects with ACTIVATION_INACTIVE merged with whatever the crypto
 * plane says.
 */
export function activationEvaluate(
  activation: CryptoAcceptanceActivation,
  basePolicy: PinnedPaymentAcceptancePolicy,
  request: CryptoAcceptanceRequest,
  baseRequest: PinnedAcceptanceRequest,
  now: PinnedTimestampMs,
): {
  readonly accepted: boolean;
  readonly reasons: readonly (CryptoAcceptanceRejectionReason | AcceptanceActivationRejectionReason)[];
} {
  if (
    activation === null ||
    typeof activation !== "object" ||
    typeof activation.id !== "string"
  ) {
    throw new ValidationError("activationEvaluate requires a CryptoAcceptanceActivation");
  }
  if (activation.state !== "ACTIVE") {
    return Object.freeze({
      accepted: false,
      reasons: Object.freeze(["ACTIVATION_INACTIVE"] as const),
    });
  }
  const decision: CryptoAcceptanceDecision = evaluateCryptoAcceptance(
    activation.policy,
    basePolicy,
    request,
    baseRequest,
    now,
  );
  return Object.freeze({
    accepted: decision.accepted,
    reasons: Object.freeze([...decision.reasons]),
  });
}
