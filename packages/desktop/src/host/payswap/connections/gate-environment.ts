/**
 * PaySwap Desktop (P21-A, ADR-0014 D6/D8/D9) — the GATE-ENVIRONMENT
 * COMPOSITION over the connection→capability bridge (split from
 * ./capability-bridge.ts at the ≤400-line file law): the labeled
 * DECLARED TEST CORRIDOR (the scripts/p14/a1 declared-test-corridor
 * precedent, mirrored as a typed composition input) +
 * createGateEnvironmentFromConnections — the composition seam the shell
 * wires (when connections are ACTIVE with confirmed probe evidence it
 * builds the REAL environment; otherwise the honest-empty one stays the
 * default, byte-identical — the P13-C live truth).
 *
 * THE TIER LAW (D9): the tiers never mix — the probe-derived facts ride
 * through the bridge as PROVIDER_OBSERVATION; the declared test
 * corridor, its quote, its limits, its policy decision, the declared
 * test funding instrument and the merchant-directory destinations are
 * TEST_DATA (labeled in their provenance text; F4: a Stripe test PM is
 * never FLW-funded — the instrument's observationRef is the
 * declared-test-corridor namespace, never a probe namespace).
 */

import {
  deriveConnectionCapabilityBridge,
  type BridgeConnectedInstance,
  type BridgeDerivation,
} from "./capability-bridge.js";
import type { DesktopConnectionStatusView } from "./contracts.js";
import type { ProbeEvidenceRecord } from "./probe-evidence.js";
import type { ObservedFundingSource } from "../payments/intent-compiler.js";
import {
  createHonestEmptyGateEnvironment,
  type PaymentGateEnvironment,
} from "../payments/validation-gates.js";
import type { PinnedQuoteTermsSource } from "../pins/index.js";

/** The labeled DECLARED TEST CORRIDOR input (TEST_DATA — never a provider fact). */
export interface DeclaredTestCorridorInput {
  readonly evidenceTier: "TEST_DATA";
  readonly label: string;
  readonly routeId: string;
  readonly sourceCountry: string;
  readonly destinationCountry: string;
  readonly currency: string;
  /** The declared test funding instrument (the revise-path origin — F4: never an FLW claim). */
  readonly fundingInstrument: {
    readonly paymentMethodToken: string;
    readonly displayName: string;
  };
  readonly quoteId: string;
  readonly quoteVersion: string;
  readonly rateProvenance: string;
  readonly quoteLifetimeMs: number;
  readonly limits: { readonly minimum: string; readonly maximum: string };
  readonly policyReason: string;
}

/**
 * The declared Stripe test corridor (the scripts/p14/a1 precedent):
 * US→US USD, the published test payment method as the declared test
 * funding instrument, rate 1, the honest TEST_DATA provenance on every
 * fact. SANDBOX-only (INV-25); never presented as a live corridor.
 */
export const DECLARED_STRIPE_TEST_CORRIDOR: DeclaredTestCorridorInput = Object.freeze({
  evidenceTier: "TEST_DATA",
  label:
    "the declared Stripe test corridor (the P14 declared-test-corridor precedent: the published test payment method, SANDBOX-only)",
  routeId: "route:declared-us-us-test",
  sourceCountry: "US",
  destinationCountry: "US",
  currency: "USD",
  fundingInstrument: Object.freeze({
    paymentMethodToken: "pm_card_visa",
    displayName: "Published Stripe test payment method (pm_card_visa)",
  }),
  quoteId: "quote:declared-test-1",
  quoteVersion: "v1",
  rateProvenance: "declared test-corridor quote (TEST_DATA — never a provider fact)",
  quoteLifetimeMs: 3_600_000,
  limits: Object.freeze({ minimum: "1", maximum: "1000000" }),
  policyReason:
    "declared test-corridor policy (TEST_DATA — the SANDBOX-only merchant-native settlement test corridor; never a live-corridor certification)",
});

/** The merchant executing rail: the first stripe FULL_TEST instance (the grant law). */
function merchantRailOf(bridge: BridgeDerivation): BridgeConnectedInstance | undefined {
  return bridge.instances.find(
    (instance) =>
      instance.providerId === "stripe" &&
      instance.keyClass === "FULL_TEST" &&
      instance.operationClasses.includes("CREATE_EXTERNAL_EFFECT"),
  );
}

/** The D7 honest no-route text (rendered verbatim in the exclusion — the
 * P22-D six-fact separation: the IMPLEMENTATION fact names what PaySwap's
 * adapter implements; the provider's documented transfer API is disclosed
 * as a capability input this deployment has not implemented, entitled or
 * observed — never a claim about the provider's own nature). */
const NO_ROUTE_FOR_CORRIDOR_MESSAGE =
  "No route composes this corridor in this deployment: the declared test corridor covers US→US USD only, and no frozen route shape composes a cross-provider fiat payment — a Flutterwave-funded send has no send operation in this deployment (PaySwap's adapter implements read-only balance access only, so a successful read-only probe never establishes send capability; Flutterwave's documented API offers secret-key transfers including test-mode bank and mobile-money destinations — a provider-capability input this deployment has not implemented, entitled or observed — and no Flutterwave→Stripe route exists here).";

const NO_CONNECTED_MERCHANT_RAIL_MESSAGE =
  "No connected merchant receiving rail exists — the merchant directory's receiving context maps onto a connected Stripe test account, and no ACTIVE Stripe connection with confirmed probe evidence exists. The merchant's receiving rail is never fabricated.";

const NO_DECLARED_CORRIDOR_MESSAGE =
  "No route is declared for this deployment — corridor facts require a declared corridor over connected instances with fresh observations. No corridor fact is invented.";

/** Build the corridor projection over the declared corridor + the merchant rail. */
function createBridgeCorridorProjection(
  corridor: DeclaredTestCorridorInput | undefined,
  merchantRail: BridgeConnectedInstance | undefined,
): PaymentGateEnvironment["corridorProjection"] {
  return {
    projectCorridor(query: {
      readonly sourceCountry: string;
      readonly destinationCountry: string;
      readonly sourceCurrency: string;
      readonly destinationCurrency: string;
      readonly asOf: string;
    }) {
      const exclusions: { code: string; message: string }[] = [];
      if (corridor === undefined) {
        exclusions.push({ code: "NO_DECLARED_CORRIDOR", message: NO_DECLARED_CORRIDOR_MESSAGE });
      } else {
        if (merchantRail === undefined) {
          exclusions.push({
            code: "NO_CONNECTED_MERCHANT_RAIL",
            message: NO_CONNECTED_MERCHANT_RAIL_MESSAGE,
          });
        }
        const matches =
          query.sourceCountry === corridor.sourceCountry &&
          query.destinationCountry === corridor.destinationCountry &&
          query.sourceCurrency === corridor.currency &&
          query.destinationCurrency === corridor.currency;
        if (!matches) {
          exclusions.push({ code: "NO_ROUTE_FOR_CORRIDOR", message: NO_ROUTE_FOR_CORRIDOR_MESSAGE });
        }
      }
      const eligible =
        corridor !== undefined && merchantRail !== undefined
          ? query.sourceCountry === corridor.sourceCountry &&
            query.destinationCountry === corridor.destinationCountry &&
            query.sourceCurrency === corridor.currency &&
            query.destinationCurrency === corridor.currency
          : false;
      return Object.freeze({
        evaluatedAsOf: query.asOf,
        routeIds: eligible ? Object.freeze([corridor!.routeId]) : Object.freeze([]),
        eligibleRouteIds: eligible ? Object.freeze([corridor!.routeId]) : Object.freeze([]),
        exclusions: Object.freeze(exclusions),
      });
    },
  };
}

/** Build the declared test-corridor quote (TEST_DATA provenance; the a1 shape). */
function declaredQuoteOf(
  corridor: DeclaredTestCorridorInput,
  now: string,
  missionAmount: { readonly currency: string; readonly minorUnits: string } | undefined,
): PinnedQuoteTermsSource {
  const amount = missionAmount ?? { currency: corridor.currency, minorUnits: "0" };
  const expiresAt = new Date(Date.parse(now) + corridor.quoteLifetimeMs).toISOString();
  return Object.freeze({
    quoteId: corridor.quoteId,
    quoteVersion: corridor.quoteVersion,
    sourceAmount: Object.freeze({ ...amount }),
    targetAmount: Object.freeze({ ...amount }),
    feeLines: Object.freeze([]),
    rate: Object.freeze({
      value: "1",
      provenance: corridor.rateProvenance,
      asOf: now,
    }),
    expiry: Object.freeze({ at: expiresAt, onExpiry: "REVALIDATE_REQUIRED" as const }),
    delivery: Object.freeze({
      kind: "ESTIMATE" as const,
      estimateLabel: "immediate (the declared test corridor)",
    }),
    conditions: Object.freeze({
      rateLocked: true,
      refreshAvailable: false,
      materialChangePolicy: "revalidate" as const,
    }),
  });
}

/**
 * The composition seam (D6/D8): build the gate environment from the
 * connections. When connections are ACTIVE with confirmed probe
 * evidence it builds the REAL environment (the bridge's PROVIDER_
 * OBSERVATION facts + the declared test corridor's TEST_DATA facts);
 * otherwise the honest-empty one stays the default (byte-identical —
 * the P13-C live truth).
 */
export function createGateEnvironmentFromConnections(input: {
  readonly now: string;
  readonly statuses: readonly DesktopConnectionStatusView[];
  readonly evidence: readonly ProbeEvidenceRecord[];
  readonly declaredTestCorridor?: DeclaredTestCorridorInput;
  /** The mission's captured amount (the declared quote's denominations; nominal when absent). */
  readonly missionAmount?: { readonly currency: string; readonly minorUnits: string };
}): PaymentGateEnvironment {
  const bridge = deriveConnectionCapabilityBridge({
    statuses: input.statuses,
    evidence: input.evidence,
  });
  if (bridge.instances.length === 0) {
    // The honest-empty default: byte-identical to the P13-C truth (zero
    // ACTIVE connections with confirmed probe evidence derive nothing —
    // a declared corridor never fabricates an instance or a rail).
    return createHonestEmptyGateEnvironment(input.now);
  }
  const corridor = input.declaredTestCorridor;
  const merchantRail = merchantRailOf(bridge);
  const corridorActive = corridor !== undefined && merchantRail !== undefined;

  const fundingSources: ObservedFundingSource[] = [...bridge.fundingSources];
  if (corridorActive) {
    // The DECLARED TEST FUNDING INSTRUMENT (TEST_DATA — the revise-path
    // origin; F4: a Stripe test PM is never FLW-funded).
    fundingSources.push(
      Object.freeze({
        locationRef: corridor.fundingInstrument.paymentMethodToken,
        currency: corridor.currency,
        observationRef: `declared:test-funding-instrument:${corridor.fundingInstrument.paymentMethodToken}`,
        displayName: corridor.fundingInstrument.displayName,
      }),
    );
  }

  return {
    observedFundingSources: Object.freeze(fundingSources),
    observedDestinations: bridge.destinations,
    corridorProjection: createBridgeCorridorProjection(corridor, merchantRail),
    freshQuote: corridorActive
      ? declaredQuoteOf(corridor, input.now, input.missionAmount)
      : undefined,
    declaredLimits: corridorActive
      ? Object.freeze({
          minimum: Object.freeze({ currency: corridor.currency, minorUnits: corridor.limits.minimum }),
          maximum: Object.freeze({ currency: corridor.currency, minorUnits: corridor.limits.maximum }),
        })
      : undefined,
    connectedScopes: bridge.connectedScopes,
    policyDecisions: corridorActive
      ? Object.freeze([Object.freeze({ decision: "ALLOW" as const, reason: corridor.policyReason })])
      : Object.freeze([]),
    now: input.now,
  };
}
