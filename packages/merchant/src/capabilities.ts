/**
 * @payswap/merchant — settlement capability declarations (P5-W3, lane
 * R3-W3; ADAPT of old packages/merchant-crypto/src/capabilities.ts @
 * 8a735bf: the connector-lane `validateCapabilityDefinition` is
 * replaced by a LOCAL structural descriptor + validation over the
 * PINNED capability vocabulary — the leaf-in-flight law).
 *
 * Two DISTINCT capability families, never conflated: native Stripe
 * crypto settlement (PASS_THROUGH_NATIVE only — the provider's
 * incumbent path, the INV-15 baseline; provider-verified only, never
 * synthesized) and PaySwap external conversion/off-ramp settlement
 * (COMPOSED_PAYSWAP/OPTIMIZED_MULTI_PROVIDER only — never
 * PASS_THROUGH_NATIVE). Neither declaration can bypass protocol
 * authorization. The execution-mode vocabulary is CREDITED to the
 * capability lane (pins/capability.ts, byte-identical).
 */

import { ValidationError } from "./errors.ts";
import { deepFreeze } from "./kernel.ts";
import {
  PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID,
  STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID,
  nativeStripeCryptoEligibility,
} from "./settlement-routes.ts";
import type { NativeStripeCryptoSettlementRoute, MerchantCryptoSettlementRoute } from "./settlement-routes.ts";
import { PINNED_EXECUTION_MODES } from "./pins/capability.ts";
import type { PinnedExecutionMode } from "./pins/capability.ts";
import type { PinnedConnectedInstance } from "./pins/capability.ts";

// ---------------------------------------------------------------------------
// The local capability descriptor (a structural pin of the seam)
// ---------------------------------------------------------------------------

/** The capability kinds a merchant settlement capability declares. */
export const MERCHANT_CAPABILITY_KINDS = Object.freeze(["ACTION"] as const);

/**
 * STRUCTURAL PIN — the merchant settlement capability descriptor
 * (SUBSET of the capability-lane `CapabilityDefinition` the merchant
 * flow needs: identity, summary, kind, required permissions, execution
 * modes, semantics, preconditions, authorization, side effects,
 * idempotency, compensation, provider-state mapping, evidence and
 * economics surface). The FULL definition shape is owned by the
 * capability lane; the TL wires it at integration.
 */
export interface MerchantCapabilityDescriptor {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly summary: string;
  readonly kind: "ACTION";
  readonly requiredPermissions: readonly string[];
  /** EXECUTION MODES (CREDITED to the capability lane — pinned vocabulary). */
  readonly executionModes: readonly PinnedExecutionMode[];
  readonly semantics: {
    readonly operation: string;
    readonly stateMachine: { readonly documentRef: string; readonly version: string };
    readonly description: string;
  };
  readonly preconditions: readonly string[];
  readonly authorization: {
    readonly protocolAuthorization: true;
    readonly requiredScopes: readonly string[];
    readonly customerConsent: "IMPLICIT" | "EXPLICIT";
  };
  readonly sideEffects: readonly {
    readonly effect: string;
    readonly financialEffect: "SETTLES_VALUE" | "MOVES_VALUE";
    readonly reversible: false;
  }[];
  readonly idempotency: {
    readonly idempotent: true;
    readonly keyScope: "PROVIDER_ACCOUNT" | "CONNECTED_INSTANCE";
    readonly duplicateBehavior: "PROVIDER_DEFINED" | "REJECTED";
    readonly retryPolicy: "REQUIRES_RECONCILIATION";
  };
  readonly compensation: {
    readonly compensable: false;
    readonly cancellation: "NOT_SUPPORTED" | "BEFORE_EXECUTION";
    readonly partialExecution: {
      readonly possible: false;
      readonly granularity: "ATOMIC";
      readonly onPartial: "DISCLOSED" | "MANUAL_RECONCILIATION";
    };
  };
  readonly providerVocabulary: {
    readonly actions: readonly { readonly action: string; readonly description: string }[];
    readonly states: readonly {
      readonly providerState: string;
      readonly canonicalState: "PROCESSING" | "SUCCEEDED" | "FAILED" | "OUTCOME_UNKNOWN";
      readonly requiresCustomerAction: boolean;
      readonly isTerminal: boolean;
    }[];
  };
  readonly externalObjects: readonly {
    readonly objectType: string;
    readonly idFormat: string;
    readonly revisioned: boolean;
    readonly revisionFormat?: "monotonic";
  }[];
  readonly evidence: {
    readonly produced: readonly string[];
    readonly required: readonly string[];
  };
  readonly economics: {
    readonly feeModel: "PROVIDER_SCHEDULE" | "HYBRID";
    readonly limits: readonly { readonly dimension: string; readonly description: string }[];
    readonly settlementImplications: string;
  };
  readonly constraints: readonly { readonly kind: "JURISDICTION" | "COMMERCIAL"; readonly description: string }[];
}

/** Fail-closed validation of a merchant capability descriptor. */
export function validateMerchantCapabilityDescriptor(
  descriptor: MerchantCapabilityDescriptor,
): MerchantCapabilityDescriptor {
  if (descriptor === null || typeof descriptor !== "object") {
    throw new ValidationError("a capability descriptor must be an object");
  }
  if (typeof descriptor.capabilityId !== "string" || descriptor.capabilityId.length === 0) {
    throw new ValidationError("a capability descriptor requires a capabilityId");
  }
  if (typeof descriptor.capabilityVersion !== "string" || descriptor.capabilityVersion.length === 0) {
    throw new ValidationError("a capability descriptor requires a capabilityVersion");
  }
  if (descriptor.authorization.protocolAuthorization !== true) {
    throw new ValidationError(
      "a merchant capability cannot bypass protocol authorization (the authorization law)",
      { capabilityId: descriptor.capabilityId },
    );
  }
  if (descriptor.executionModes.length === 0) {
    throw new ValidationError("a capability descriptor must declare execution modes", {
      capabilityId: descriptor.capabilityId,
    });
  }
  for (const mode of descriptor.executionModes) {
    if (!(PINNED_EXECUTION_MODES as readonly string[]).includes(mode)) {
      throw new ValidationError(
        "a capability descriptor declares an execution mode outside the pinned vocabulary",
        { capabilityId: descriptor.capabilityId, mode },
      );
    }
  }
  if (descriptor.idempotency.idempotent !== true) {
    throw new ValidationError("a merchant capability must be idempotent (INV-6)", {
      capabilityId: descriptor.capabilityId,
    });
  }
  if (descriptor.idempotency.retryPolicy !== "REQUIRES_RECONCILIATION") {
    throw new ValidationError(
      "a merchant capability retry requires reconciliation (UNKNOWN is never blindly retried)",
      { capabilityId: descriptor.capabilityId },
    );
  }
  for (const effect of descriptor.sideEffects) {
    if (effect.reversible !== false) {
      throw new ValidationError("merchant settlement side effects are irreversible", {
        capabilityId: descriptor.capabilityId,
      });
    }
  }
  return deepFreeze(descriptor);
}

// ---------------------------------------------------------------------------
// The two settlement capability declarations
// ---------------------------------------------------------------------------

/**
 * The native Stripe crypto settlement capability: the CONNECTED Stripe
 * account settles accepted crypto itself (the incumbent baseline,
 * PASS_THROUGH_NATIVE only; provider-verified only, never
 * synthesized).
 */
export function stripeNativeCryptoSettlementCapabilityDefinition(): MerchantCapabilityDescriptor {
  const descriptor: MerchantCapabilityDescriptor = {
    capabilityId: STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID,
    capabilityVersion: "1.0.0",
    summary:
      "Native Stripe crypto settlement: the connected Stripe account settles accepted stablecoin/crypto itself; provider-verified only, never synthesized",
    kind: "ACTION",
    requiredPermissions: ["merchant:stripe:crypto-payments"],
    // The INV-15 baseline: the provider's incumbent path ONLY — never composed.
    executionModes: ["PASS_THROUGH_NATIVE"],
    semantics: {
      operation: "merchant.stripe.native-settle",
      stateMachine: {
        documentRef: "spec/architecture/PAYSWAP-3.0.md",
        version: "3.0-foundation-2026-10-08",
      },
      description:
        "Provider-native settlement of accepted crypto into the connected Stripe balance; PaySwap observes and records, never credits balances",
    },
    preconditions: [
      "connected Stripe account authorized for crypto payments (the pinned ConnectedCapabilityInstance, INV-13)",
      "provider observation confirms asset and chain support for the connected account",
      "settlement currency is supported by the connected account",
    ],
    authorization: {
      protocolAuthorization: true,
      requiredScopes: ["merchant:settlement:execute"],
      customerConsent: "IMPLICIT",
    },
    sideEffects: [
      {
        effect: "provider settles accepted crypto into the connected Stripe balance",
        financialEffect: "SETTLES_VALUE",
        reversible: false,
      },
    ],
    idempotency: {
      idempotent: true,
      keyScope: "PROVIDER_ACCOUNT",
      duplicateBehavior: "PROVIDER_DEFINED",
      retryPolicy: "REQUIRES_RECONCILIATION",
    },
    compensation: {
      compensable: false,
      cancellation: "NOT_SUPPORTED",
      partialExecution: { possible: false, granularity: "ATOMIC", onPartial: "DISCLOSED" },
    },
    providerVocabulary: {
      actions: [
        {
          action: "settle",
          description: "provider settles accepted crypto to the connected balance",
        },
      ],
      states: [
        { providerState: "pending", canonicalState: "PROCESSING", requiresCustomerAction: false, isTerminal: false },
        { providerState: "settled", canonicalState: "SUCCEEDED", requiresCustomerAction: false, isTerminal: true },
        { providerState: "unknown", canonicalState: "OUTCOME_UNKNOWN", requiresCustomerAction: false, isTerminal: false },
      ],
    },
    externalObjects: [
      {
        objectType: "stripe.balance_transaction",
        idFormat: "provider-prefixed opaque id",
        revisioned: false,
      },
    ],
    evidence: {
      produced: ["EXECUTION", "STATE_OBSERVATION", "RECEIPT"],
      required: ["STATE_OBSERVATION"],
    },
    economics: {
      feeModel: "PROVIDER_SCHEDULE",
      limits: [
        {
          dimension: "AMOUNT",
          description: "per-transaction cap imposed by the provider (observed, not assumed)",
        },
      ],
      settlementImplications:
        "crypto accepted → provider-settled funds in the connected Stripe balance; PaySwap never credits any balance itself",
    },
    constraints: [
      {
        kind: "JURISDICTION",
        description:
          "availability is provider-scoped: country/account gating observed through the connected instance and its observations",
      },
    ],
  };
  return validateMerchantCapabilityDescriptor(descriptor);
}

/**
 * The PaySwap external conversion/off-ramp settlement capability:
 * accepted crypto is converted through a selected capability chain and
 * settled to an EXTERNAL merchant destination (never PaySwap custody).
 * Composed modes ONLY — never PASS_THROUGH_NATIVE.
 */
export function payswapExternalConversionSettlementCapabilityDefinition(): MerchantCapabilityDescriptor {
  const descriptor: MerchantCapabilityDescriptor = {
    capabilityId: PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID,
    capabilityVersion: "1.0.0",
    summary:
      "PaySwap external conversion/off-ramp settlement: accepted crypto is converted through a selected capability chain and settled to an EXTERNAL merchant destination (never PaySwap custody)",
    kind: "ACTION",
    requiredPermissions: ["merchant:stripe:crypto-payments"],
    // NEVER PASS_THROUGH_NATIVE — this family is PaySwap-composed by design.
    executionModes: ["COMPOSED_PAYSWAP", "OPTIMIZED_MULTI_PROVIDER"],
    semantics: {
      operation: "merchant.payswap.external-conversion-settle",
      stateMachine: {
        documentRef: "spec/architecture/PAYSWAP-3.0.md",
        version: "3.0-foundation-2026-10-08",
      },
      description:
        "PaySwap-composed conversion and settlement executing as protocol SettlementInstruction/SettlementAttempt with protocol-owned finality (the money lifecycle is pinned, never owned here)",
    },
    preconditions: [
      "external merchant settlement destination configured (never PaySwap custody)",
      "exact quote covering the conversion terms (INV-2)",
      "conversion capability chain reachable and eligible",
    ],
    authorization: {
      protocolAuthorization: true,
      requiredScopes: ["merchant:settlement:execute"],
      customerConsent: "EXPLICIT",
    },
    sideEffects: [
      {
        effect: "convert accepted crypto through the selected capability chain",
        financialEffect: "SETTLES_VALUE",
        reversible: false,
      },
      {
        effect: "rail effects observed by the protocol (finality is protocol-owned)",
        financialEffect: "MOVES_VALUE",
        reversible: false,
      },
    ],
    idempotency: {
      idempotent: true,
      keyScope: "CONNECTED_INSTANCE",
      duplicateBehavior: "REJECTED",
      retryPolicy: "REQUIRES_RECONCILIATION",
    },
    compensation: {
      compensable: false,
      cancellation: "BEFORE_EXECUTION",
      partialExecution: { possible: false, granularity: "ATOMIC", onPartial: "MANUAL_RECONCILIATION" },
    },
    providerVocabulary: {
      actions: [
        {
          action: "convert-and-settle",
          description: "execute the conversion chain and settle to the external destination",
        },
      ],
      states: [
        { providerState: "pending", canonicalState: "PROCESSING", requiresCustomerAction: false, isTerminal: false },
        { providerState: "succeeded", canonicalState: "SUCCEEDED", requiresCustomerAction: false, isTerminal: true },
        { providerState: "failed", canonicalState: "FAILED", requiresCustomerAction: false, isTerminal: true },
        { providerState: "unknown", canonicalState: "OUTCOME_UNKNOWN", requiresCustomerAction: false, isTerminal: false },
      ],
    },
    externalObjects: [
      {
        objectType: "payswap.settlement_instruction",
        idFormat: "protocol settlement instruction id",
        revisioned: true,
        revisionFormat: "monotonic",
      },
    ],
    evidence: {
      produced: ["EXECUTION", "RECONCILIATION"],
      required: ["EXECUTION"],
    },
    economics: {
      feeModel: "HYBRID",
      limits: [],
      settlementImplications:
        "crypto → conversion chain → external destination; settlement executes through protocol settlement instructions and attempts (the pinned money lifecycle)",
    },
    constraints: [
      {
        kind: "COMMERCIAL",
        description:
          "route eligibility depends on reachable conversion capabilities and policy constraints at execution time",
      },
    ],
  };
  return validateMerchantCapabilityDescriptor(descriptor);
}

// ---------------------------------------------------------------------------
// Eligibility + routing
// ---------------------------------------------------------------------------

/** Deterministic eligibility view of a native Stripe crypto settlement route. */
export interface NativeStripeCryptoEligibilityView {
  readonly eligible: boolean;
  readonly reasons: readonly string[];
}

/**
 * Deterministically evaluate a connected instance against a native
 * Stripe crypto settlement route. Reasons are machine keys;
 * instance-level disqualification reasons are appended after
 * INSTANCE_NOT_ELIGIBLE.
 */
export function nativeStripeCryptoEligibilityForRoute(
  instance: PinnedConnectedInstance,
  route: NativeStripeCryptoSettlementRoute,
): NativeStripeCryptoEligibilityView {
  return nativeStripeCryptoEligibility(instance, route);
}

/** The capability id a settlement route executes through, by route family. */
export function settlementRouteCapabilityId(route: MerchantCryptoSettlementRoute): string {
  return route.routeFamily === "NATIVE_STRIPE_CRYPTO"
    ? STRIPE_NATIVE_CRYPTO_SETTLEMENT_CAPABILITY_ID
    : PAYSWAP_EXTERNAL_CONVERSION_SETTLEMENT_CAPABILITY_ID;
}
