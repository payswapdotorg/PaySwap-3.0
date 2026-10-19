/**
 * @payswap/merchant — merchant crypto settlement route families (P5-W3,
 * lane R3-W3; PORT of old packages/merchant-crypto/src/settlement.ts @
 * 8a735bf, connected-instance guard re-based onto the pinned
 * capability shapes).
 *
 * TWO structurally distinct route families, never conflated:
 * NATIVE_STRIPE_CRYPTO (the connected Stripe account settles accepted
 * crypto itself — provider-verified only) and
 * EXTERNAL_PAYSWAP_CONVERSION (PaySwap-orchestrated conversion/
 * off-ramp to an EXTERNAL merchant destination through the capability
 * plane). No type in this module can represent a PaySwap-held or
 * synthesized balance: a Stripe settlement confirmation exists only
 * with provider evidence (SyntheticStripeBalanceError otherwise).
 */

import { ValidationError } from "./errors.ts";
import { SyntheticStripeBalanceError } from "./errors.ts";
import { asCryptoAssetId } from "./identifiers.ts";
import type { CryptoAssetId } from "./identifiers.ts";
import type { PinnedMerchantSettlementDestination } from "./pins/payment.ts";
import { assertConnectedInstance, connectedInstanceEligibilityReasons } from "./connectivity.ts";
import type { PinnedConnectedInstance } from "./pins/capability.ts";
import { requireNonEmptyString } from "./secrets.ts";

// ---------------------------------------------------------------------------
// Capability-id constants
// ---------------------------------------------------------------------------
// These live HERE (not in capabilities.ts) so capabilities.ts can import
// them without creating a circular settlement ↔ capabilities import
// edge; the ids are part of the settlement-route contract itself.

/** Capability id of the native Stripe crypto settlement capability. */
export const STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID =
  "cap.merchant.stripe.native-crypto-settlement" as const;

/** Capability id of the PaySwap external conversion settlement capability. */
export const PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID =
  "cap.merchant.payswap.external-conversion-settlement" as const;

// ---------------------------------------------------------------------------
// Route families
// ---------------------------------------------------------------------------

/** The two settlement route families — structurally distinct, never conflated. */
export type MerchantCryptoSettlementRouteFamily =
  | "NATIVE_STRIPE_CRYPTO"
  | "EXTERNAL_PAYSWAP_CONVERSION";

/** Declared route families (frozen). */
export const SETTLEMENT_ROUTE_FAMILIES: readonly MerchantCryptoSettlementRouteFamily[] =
  Object.freeze(["NATIVE_STRIPE_CRYPTO", "EXTERNAL_PAYSWAP_CONVERSION"]);

/**
 * Native Stripe crypto settlement route: the CONNECTED Stripe account
 * settles accepted crypto itself. Provider-verified ONLY — the route
 * cannot be constructed without provider evidence.
 */
export interface NativeStripeCryptoSettlementRoute {
  readonly routeFamily: "NATIVE_STRIPE_CRYPTO";
  readonly connectedInstanceId: string;
  readonly stripeAccountRef: string;
  readonly settlementCurrency: string;
  readonly supportedAssets: readonly CryptoAssetId[];
  readonly providerVerified: true;
  readonly evidenceRefs: readonly string[];
  readonly capabilityId: string;
}

/**
 * PaySwap external conversion settlement route: accepted crypto is
 * converted through a capability chain and settled to an EXTERNAL
 * merchant destination (never PaySwap custody).
 */
export interface ExternalConversionSettlementRoute {
  readonly routeFamily: "EXTERNAL_PAYSWAP_CONVERSION";
  readonly destination: PinnedMerchantSettlementDestination;
  readonly conversionChain: readonly string[];
  readonly capabilityId: string;
}

/** Either settlement route family — discriminated by `routeFamily`. */
export type MerchantCryptoSettlementRoute =
  | NativeStripeCryptoSettlementRoute
  | ExternalConversionSettlementRoute;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function asSettlementCurrencyCode(value: string): string {
  if (typeof value !== "string" || value.length !== 3) {
    throw new ValidationError("settlement currency must be a 3-character ISO-style code", {
      currency: value,
    });
  }
  return value;
}

/**
 * Construct a validated, frozen NATIVE_STRIPE_CRYPTO settlement route.
 *
 * The connected instance is asserted FIRST (a catalogue-shaped value
 * throws — INV-13); provider evidence is checked immediately after so
 * a synthetic-balance probe fails with `SyntheticStripeBalanceError`
 * rather than a plain validation error. `providerVerified` and
 * `capabilityId` are set by this constructor — the input deliberately
 * cannot supply them.
 */
export function defineNativeStripeCryptoSettlementRoute(
  input: {
    readonly connectedInstanceId: string;
    readonly stripeAccountRef: string;
    readonly settlementCurrency: string;
    readonly supportedAssets: readonly string[];
    readonly evidenceRefs: readonly string[];
  },
  connectedInstance: PinnedConnectedInstance,
): NativeStripeCryptoSettlementRoute {
  // INV-13: only a genuinely connected instance, never a catalogue entry.
  assertConnectedInstance(connectedInstance);

  // Provider evidence FIRST: a native route without evidence would be a
  // synthetic Stripe balance effect.
  if (
    !Array.isArray(input.evidenceRefs) ||
    input.evidenceRefs.length === 0 ||
    !input.evidenceRefs.every((ref) => isNonEmptyString(ref))
  ) {
    throw new SyntheticStripeBalanceError(
      "native Stripe crypto settlement requires non-empty provider evidence refs — without provider evidence the route would describe a synthetic Stripe balance",
      { connectedInstanceId: input.connectedInstanceId },
    );
  }

  if (input.connectedInstanceId !== connectedInstance.instanceId) {
    throw new ValidationError(
      "native settlement route must reference the same connected instance it is derived from",
      {
        routeConnectedInstanceId: input.connectedInstanceId,
        instanceId: connectedInstance.instanceId,
      },
    );
  }

  if (connectedInstance.authorization.status !== "ACTIVE") {
    throw new ValidationError(
      "native Stripe crypto settlement requires an ACTIVE connected instance authorization",
      { instanceId: connectedInstance.instanceId, status: connectedInstance.authorization.status },
    );
  }

  if (connectedInstance.eligibility.eligible !== true) {
    throw new ValidationError(
      "native Stripe crypto settlement requires an eligible connected instance" +
        (connectedInstance.eligibility.reasons.length > 0
          ? ` (reasons: ${connectedInstance.eligibility.reasons.join(", ")})`
          : ""),
      {
        instanceId: connectedInstance.instanceId,
        reasons: [...connectedInstance.eligibility.reasons],
      },
    );
  }

  const settlementCurrency = asSettlementCurrencyCode(input.settlementCurrency);
  if (!connectedInstance.currencies.includes(settlementCurrency)) {
    throw new ValidationError(
      "settlement currency is not in the connected instance currency scope",
      { settlementCurrency, instanceCurrencies: [...connectedInstance.currencies] },
    );
  }

  const stripeAccountRef = requireNonEmptyString(input.stripeAccountRef, "stripeAccountRef");
  if (stripeAccountRef.length > 256) {
    throw new ValidationError("stripeAccountRef exceeds 256 characters", { stripeAccountRef });
  }

  if (!Array.isArray(input.supportedAssets) || input.supportedAssets.length === 0) {
    throw new ValidationError(
      "native settlement route must declare at least one supported asset",
      { connectedInstanceId: input.connectedInstanceId },
    );
  }
  const supportedAssets = input.supportedAssets.map((asset) => asCryptoAssetId(asset));
  if (new Set<string>(supportedAssets).size !== supportedAssets.length) {
    throw new ValidationError("supported assets must not repeat", {
      supportedAssets: [...supportedAssets],
    });
  }

  const route: NativeStripeCryptoSettlementRoute = {
    routeFamily: "NATIVE_STRIPE_CRYPTO",
    connectedInstanceId: input.connectedInstanceId,
    stripeAccountRef,
    settlementCurrency,
    supportedAssets: Object.freeze([...supportedAssets]),
    providerVerified: true,
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    capabilityId: STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID,
  };
  return Object.freeze(route);
}

/**
 * The typed eligibility view of a connected instance against a native
 * route's settlement currency (reasons are machine keys;
 * instance-level disqualification reasons are appended after
 * INSTANCE_NOT_ELIGIBLE).
 */
export function nativeStripeCryptoEligibility(
  instance: PinnedConnectedInstance,
  route: Pick<NativeStripeCryptoSettlementRoute, "settlementCurrency">,
): { readonly eligible: boolean; readonly reasons: readonly string[] } {
  assertConnectedInstance(instance);
  const reasons = connectedInstanceEligibilityReasons(instance, route.settlementCurrency);
  return Object.freeze({ eligible: reasons.length === 0, reasons: Object.freeze([...reasons]) });
}

/**
 * Construct a validated, frozen EXTERNAL_PAYSWAP_CONVERSION settlement
 * route. The destination is checked STRUCTURALLY only (shape +
 * non-empty id and fields): it is constructed upstream through the
 * payment plane's own `defineSettlementDestination`, so re-deriving
 * its provenance here would duplicate the canonical validation without
 * adding authority. `capabilityId` is set by this constructor.
 */
export function defineExternalConversionSettlementRoute(input: {
  readonly destination: PinnedMerchantSettlementDestination;
  readonly conversionChain: readonly string[];
}): ExternalConversionSettlementRoute {
  const destination = input.destination;
  if (destination === null || typeof destination !== "object") {
    throw new ValidationError(
      "external conversion settlement requires a MerchantSettlementDestination",
    );
  }
  if (!isNonEmptyString(destination.id)) {
    throw new ValidationError("settlement destination id must be a non-empty string");
  }
  if (!isNonEmptyString(destination.kind)) {
    throw new ValidationError("settlement destination kind must be declared");
  }
  if (typeof destination.currency !== "string" || destination.currency.length !== 3) {
    throw new ValidationError("settlement destination currency must be an ISO-style code");
  }
  if (!isNonEmptyString(destination.externalRef)) {
    throw new ValidationError("settlement destination externalRef must be a non-empty string");
  }
  const provenance = destination.provenance;
  if (
    provenance === null ||
    typeof provenance !== "object" ||
    !isNonEmptyString(provenance.source) ||
    !isNonEmptyString(provenance.reference) ||
    typeof provenance.recordedAt !== "bigint"
  ) {
    throw new ValidationError(
      "settlement destination provenance must carry source, reference, recordedAt",
    );
  }

  if (!Array.isArray(input.conversionChain) || input.conversionChain.length === 0) {
    throw new ValidationError(
      "external conversion settlement requires a non-empty conversion capability chain",
    );
  }
  const conversionChain = input.conversionChain.map((ref) => {
    if (!isNonEmptyString(ref)) {
      throw new ValidationError("conversion chain references must be non-empty strings");
    }
    return ref;
  });
  if (new Set<string>(conversionChain).size !== conversionChain.length) {
    throw new ValidationError("conversion chain capability references must not repeat", {
      conversionChain: [...conversionChain],
    });
  }

  const route: ExternalConversionSettlementRoute = {
    routeFamily: "EXTERNAL_PAYSWAP_CONVERSION",
    destination,
    conversionChain: Object.freeze(conversionChain),
    capabilityId: PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID,
  };
  return Object.freeze(route);
}

/** Whether the route is a native Stripe crypto settlement route. */
export function isNativeStripeCryptoRoute(
  route: MerchantCryptoSettlementRoute,
): route is NativeStripeCryptoSettlementRoute {
  return route.routeFamily === "NATIVE_STRIPE_CRYPTO";
}

/** Whether the route is a PaySwap external conversion settlement route. */
export function isExternalConversionRoute(
  route: MerchantCryptoSettlementRoute,
): route is ExternalConversionSettlementRoute {
  return route.routeFamily === "EXTERNAL_PAYSWAP_CONVERSION";
}

export { assertRouteFamilyDiscriminated } from "./settlement-confirmations.ts";
export type { StripeSettlementConfirmation, ObservedAt } from "./settlement-confirmations.ts";
export {
  recordStripeSettlementConfirmation,
  isProviderVerifiedStripeSettlement,
} from "./settlement-confirmations.ts";
