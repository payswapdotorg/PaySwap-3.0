/**
 * @payswap/merchant — settlement configuration + the Stripe connection
 * lifecycle (P5-W3, lane R3-W3; PORT+ADAPT of the §3.8 half of old
 * packages/merchant-checkout/src/settlement.ts @ 8a735bf: the
 * provider-state envelope construction is re-based onto the PINNED
 * envelope shape).
 *
 * Settlement policy per destination (schedule, threshold, currency
 * denomination) is CONFIGURATION AS TYPED DATA: no function in this
 * module turns a policy into an effect; effects flow ONLY through the
 * settlement-paths module (which requires a CONFIRMED attempt plus a
 * selected route). The Stripe connection model is a
 * ProviderStateEnvelope-style lifecycle (connect/onboard/verify/
 * restrict) built over the pinned envelope shape (INV-14: raw provider
 * state preserved verbatim).
 *
 * The settlement-mode vocabulary reconciles onto the LANDED
 * route-family literals through a DOCUMENTED typed mapping (never a
 * silent renaming), with disjoint fields both directions on the mode
 * configs.
 */

import { ValidationError } from "./errors.ts";
import { SettlementModeConflationError } from "./errors.ts";
import type { PinnedMoney } from "./pins/protocol.ts";
import type { PinnedConnectedInstance } from "./pins/capability.ts";
import type { PinnedProviderStateEnvelope } from "./pins/envelope.ts";
import { PINNED_MERCHANT_SETTLEMENT_MODES } from "./pins/route-compiler.ts";
import type { PinnedMerchantSettlementMode } from "./pins/route-compiler.ts";
import { assertNoSecretMaterial } from "./secrets.ts";
import { requireNonEmptyString } from "./secrets.ts";

// ---------------------------------------------------------------------------
// Settlement policy (configuration as typed data)
// ---------------------------------------------------------------------------

/** When settled value is scheduled to move (schedule semantics only). */
export type MerchantSettlementSchedule = "MANUAL" | "DAILY" | "WEEKLY" | "MONTHLY";

const SETTLEMENT_SCHEDULES: readonly MerchantSettlementSchedule[] = [
  "MANUAL",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
];

/**
 * Settlement policy per destination: schedule, optional exact threshold
 * and the currency denomination. PURE CONFIGURATION — there is no
 * function from a policy to a settlement effect; effects only ever
 * flow through the settlement-paths module (which requires a CONFIRMED
 * attempt, a selected route, and on the native family a
 * provider-verified confirmation).
 */
export interface MerchantSettlementPolicy {
  readonly policyId: string;
  readonly merchantRef: string;
  readonly destinationId: string;
  readonly schedule: MerchantSettlementSchedule;
  /** Optional exact threshold that triggers a settlement run. */
  readonly thresholdAmount?: PinnedMoney;
  readonly currencyDenomination: string;
}

/** Construct a validated, frozen settlement policy (typed data, no effects). */
export function defineSettlementPolicy(input: {
  readonly policyId: string;
  readonly merchantRef: string;
  readonly destinationId: string;
  readonly schedule: MerchantSettlementSchedule;
  readonly thresholdAmount?: PinnedMoney;
  readonly currencyDenomination: string;
}): MerchantSettlementPolicy {
  requireNonEmptyString(input.policyId, "settlement policy id");
  requireNonEmptyString(input.merchantRef, "settlement policy merchantRef");
  requireNonEmptyString(input.destinationId, "settlement policy destinationId");
  if (!SETTLEMENT_SCHEDULES.includes(input.schedule)) {
    throw new ValidationError(`settlement schedule is not declared: ${String(input.schedule)}`);
  }
  if (
    typeof input.currencyDenomination !== "string" ||
    !/^[A-Z]{3}$/.test(input.currencyDenomination)
  ) {
    throw new ValidationError(
      "settlement policy currencyDenomination must be a 3-letter uppercase ISO-style code",
    );
  }
  if (input.thresholdAmount !== undefined) {
    const threshold = input.thresholdAmount;
    if (threshold === null || typeof threshold !== "object" || typeof threshold.value !== "bigint") {
      throw new ValidationError("settlement threshold must be exact Money");
    }
    if (threshold.value <= 0n) {
      throw new ValidationError("settlement threshold must be positive");
    }
    if (threshold.currency !== input.currencyDenomination) {
      throw new ValidationError(
        "settlement threshold must be denominated in the policy currency",
      );
    }
  }
  const policy: MerchantSettlementPolicy = Object.freeze({
    policyId: input.policyId,
    merchantRef: input.merchantRef,
    destinationId: input.destinationId,
    schedule: input.schedule,
    ...(input.thresholdAmount !== undefined ? { thresholdAmount: input.thresholdAmount } : {}),
    currencyDenomination: input.currencyDenomination,
  });
  assertNoSecretMaterial(policy, "settlement policy");
  return policy;
}

// ---------------------------------------------------------------------------
// Stripe connection (ProviderStateEnvelope-style lifecycle)
// ---------------------------------------------------------------------------

/** The Stripe connected-account lifecycle steps (connect/onboard/verify/restrict). */
export const STRIPE_CONNECTION_LIFECYCLE_STEPS = [
  "connect",
  "onboard",
  "verify",
  "restrict",
] as const;

export type StripeConnectionLifecycleStep = (typeof STRIPE_CONNECTION_LIFECYCLE_STEPS)[number];

/**
 * Record one Stripe connected-account state observation as a
 * provider-state envelope over the PINNED shape (family
 * `connected_account`): the RAW provider state passes through VERBATIM
 * (INV-14 — never flattened into a generic status), the lifecycle step
 * is one of connect/onboard/verify/restrict, and the observation
 * carries its provenance. This is an OBSERVATION of an external
 * account — never PaySwap custody and never connection authority by
 * itself (connection authority is the ConnectedCapabilityInstance).
 */
export function recordStripeConnectionObservation(input: {
  readonly stripeAccountRef: string;
  readonly revision: string;
  /** Raw provider-native state (preserved verbatim, INV-14). */
  readonly rawState: unknown;
  readonly lifecycleStep: StripeConnectionLifecycleStep;
  readonly isTerminal: boolean;
  readonly requiresCustomerAction: boolean;
  readonly actionRequired?: { readonly kind: string; readonly message: string };
  readonly observedAt: string;
}): PinnedProviderStateEnvelope {
  requireNonEmptyString(input.stripeAccountRef, "a connection observation requires a stripeAccountRef");
  requireNonEmptyString(input.revision, "a connection observation requires a revision");
  if (!(STRIPE_CONNECTION_LIFECYCLE_STEPS as readonly string[]).includes(input.lifecycleStep)) {
    throw new ValidationError(
      `a Stripe connection lifecycle step must be one of ${STRIPE_CONNECTION_LIFECYCLE_STEPS.join(", ")}`,
      { lifecycleStep: input.lifecycleStep },
    );
  }
  requireNonEmptyString(input.observedAt, "a connection observation requires an observedAt instant");
  if (input.actionRequired !== undefined) {
    requireNonEmptyString(input.actionRequired.kind, "actionRequired.kind");
    requireNonEmptyString(input.actionRequired.message, "actionRequired.message");
  }
  const envelope: PinnedProviderStateEnvelope = Object.freeze({
    provider: Object.freeze({ name: "stripe", version: "1" }),
    object: Object.freeze({
      objectType: "stripe.account",
      externalId: input.stripeAccountRef,
    }),
    revision: input.revision,
    state: input.rawState,
    classification: Object.freeze({
      family: "connected_account",
      lifecycleStep: input.lifecycleStep,
      isTerminal: input.isTerminal,
      requiresCustomerAction: input.requiresCustomerAction,
    }),
    timestamps: Object.freeze({ observedAt: input.observedAt }),
    provenance: Object.freeze({ source: "PROVIDER_API" as const }),
  });
  assertNoSecretMaterial(envelope, "stripe connection observation");
  return envelope;
}

// ---------------------------------------------------------------------------
// The settlement-mode vocabulary + the DOCUMENTED route-family mapping
// ---------------------------------------------------------------------------

/**
 * The work-item settlement-mode discriminator (the reconciliation
 * onto the LANDED route-family literals is DOCUMENTED below and
 * asserted by the settlement tests).
 */
export type MerchantStripeSettlementMode =
  | "NATIVE_STRIPE_CRYPTO"
  | "PAYSWAP_EXTERNAL_SETTLEMENT";

export const MERCHANT_STRIPE_SETTLEMENT_MODES: readonly MerchantStripeSettlementMode[] =
  Object.freeze(["NATIVE_STRIPE_CRYPTO", "PAYSWAP_EXTERNAL_SETTLEMENT"]);

/**
 * The LANDED route-family literals (the settlement-routes module's
 * discriminator — never renamed here).
 */
export type LandedSettlementRouteFamily = "NATIVE_STRIPE_CRYPTO" | "EXTERNAL_PAYSWAP_CONVERSION";

/**
 * The DOCUMENTED typed mapping settlement-mode → landed route-family
 * (the reconciliation; audit target):
 *
 *   settlementMode                     routeFamily (landed literal)
 *   NATIVE_STRIPE_CRYPTO          →   NATIVE_STRIPE_CRYPTO
 *   PAYSWAP_EXTERNAL_SETTLEMENT   →   EXTERNAL_PAYSWAP_CONVERSION
 *
 * and (through pins/route-compiler.ts) the accepted R3-W1 seam:
 *   NATIVE_MERCHANT_SETTLEMENT    ↔   NATIVE_STRIPE_CRYPTO (this lane)
 *   EXTERNAL_PAYSWAP_ROUTE        ↔   EXTERNAL_PAYSWAP_CONVERSION
 */
export function settlementModeRouteFamily(
  mode: MerchantStripeSettlementMode,
): LandedSettlementRouteFamily {
  switch (mode) {
    case "NATIVE_STRIPE_CRYPTO":
      return "NATIVE_STRIPE_CRYPTO";
    case "PAYSWAP_EXTERNAL_SETTLEMENT":
      return "EXTERNAL_PAYSWAP_CONVERSION";
    default:
      throw new ValidationError(`settlement mode is not declared: ${String(mode)}`);
  }
}

/** The inverse mapping landed route-family → settlement-mode. */
export function routeFamilySettlementMode(
  routeFamily: LandedSettlementRouteFamily,
): MerchantStripeSettlementMode {
  switch (routeFamily) {
    case "NATIVE_STRIPE_CRYPTO":
      return "NATIVE_STRIPE_CRYPTO";
    case "EXTERNAL_PAYSWAP_CONVERSION":
      return "PAYSWAP_EXTERNAL_SETTLEMENT";
    default:
      throw new ValidationError(
        `settlement route family is not declared: ${String(routeFamily)}`,
      );
  }
}

/**
 * The settlement-mode reconciliation onto the ACCEPTED R3-W1
 * route-compiler seam (pinned byte-identical in
 * pins/route-compiler.ts): this lane's mode vocabulary maps onto the
 * route-compiler's MERCHANT_SETTLEMENT_MODES without renaming either
 * side.
 */
export function settlementModeRouteCompilerMode(
  mode: MerchantStripeSettlementMode,
): PinnedMerchantSettlementMode {
  return mode === "NATIVE_STRIPE_CRYPTO"
    ? "NATIVE_MERCHANT_SETTLEMENT"
    : "EXTERNAL_PAYSWAP_ROUTE";
}

/** The declared route-compiler seam modes (pinned, for assertions). */
export const ROUTE_COMPILER_SEAM_MODES = PINNED_MERCHANT_SETTLEMENT_MODES;

/** Native-mode configuration (settlement through Stripe's own crypto settlement). */
export interface NativeStripeModeConfig {
  readonly mode: "NATIVE_STRIPE_CRYPTO";
  readonly connectedInstanceId: string;
  readonly stripeAccountRef: string;
  readonly settlementCurrency: string;
}

/** External-mode configuration (PaySwap converts/settles externally). */
export interface PayswapExternalModeConfig {
  readonly mode: "PAYSWAP_EXTERNAL_SETTLEMENT";
  readonly destinationId: string;
  readonly conversionChain: readonly string[];
}

/** Either mode configuration — discriminated by `mode`, disjoint fields. */
export type MerchantSettlementModeConfig = NativeStripeModeConfig | PayswapExternalModeConfig;

/**
 * Runtime anti-conflation guard for mode configurations: `mode` must be
 * one of the two declared modes and the config must not carry the
 * OTHER mode's fields (disjoint both directions).
 */
export function assertSettlementModeDiscriminated(
  config: unknown,
): asserts config is MerchantSettlementModeConfig {
  if (config === null || typeof config !== "object") {
    throw new ValidationError("a settlement mode config must be an object");
  }
  const record = config as Readonly<Record<string, unknown>>;
  const mode = record["mode"];
  if (mode === "NATIVE_STRIPE_CRYPTO") {
    if ("destinationId" in record || "conversionChain" in record) {
      throw new SettlementModeConflationError(
        "a NATIVE_STRIPE_CRYPTO mode config must not carry PAYSWAP_EXTERNAL_SETTLEMENT fields (destinationId/conversionChain)",
        { mode },
      );
    }
    if (
      typeof record["connectedInstanceId"] !== "string" ||
      (record["connectedInstanceId"] as string).length === 0 ||
      typeof record["stripeAccountRef"] !== "string" ||
      (record["stripeAccountRef"] as string).length === 0
    ) {
      throw new ValidationError(
        "a NATIVE_STRIPE_CRYPTO mode config requires connectedInstanceId and stripeAccountRef",
      );
    }
    return;
  }
  if (mode === "PAYSWAP_EXTERNAL_SETTLEMENT") {
    if (
      "connectedInstanceId" in record ||
      "stripeAccountRef" in record ||
      "settlementCurrency" in record
    ) {
      throw new SettlementModeConflationError(
        "a PAYSWAP_EXTERNAL_SETTLEMENT mode config must not carry NATIVE_STRIPE_CRYPTO fields (connectedInstanceId/stripeAccountRef/settlementCurrency)",
        { mode },
      );
    }
    if (typeof record["destinationId"] !== "string" || (record["destinationId"] as string).length === 0) {
      throw new ValidationError(
        "a PAYSWAP_EXTERNAL_SETTLEMENT mode config requires an external settlement destination id",
      );
    }
    if (
      !Array.isArray(record["conversionChain"]) ||
      record["conversionChain"].length === 0
    ) {
      throw new ValidationError(
        "a PAYSWAP_EXTERNAL_SETTLEMENT mode config requires a non-empty conversion chain",
      );
    }
    return;
  }
  throw new ValidationError(
    "settlement mode must be NATIVE_STRIPE_CRYPTO or PAYSWAP_EXTERNAL_SETTLEMENT",
    { mode },
  );
}

/** The connected instance a native mode config is bound to (typed lookup input). */
export interface NativeModeInstanceBinding {
  readonly config: NativeStripeModeConfig;
  readonly instance: PinnedConnectedInstance;
}

/**
 * Validate that a native mode config references the connected instance
 * it is bound to (fail-closed: the instance identity must match).
 */
export function assertNativeModeInstanceBinding(binding: NativeModeInstanceBinding): void {
  if (binding.config.connectedInstanceId !== binding.instance.instanceId) {
    throw new ValidationError(
      "a native mode config must reference the connected instance it is bound to",
      {
        configInstanceId: binding.config.connectedInstanceId,
        instanceId: binding.instance.instanceId,
      },
    );
  }
}
