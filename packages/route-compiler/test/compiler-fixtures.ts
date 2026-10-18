/**
 * @payswap/route-compiler test fixtures — the compiler input assembly and
 * the compile helpers (P5-W1; the old suites' baseCompilerInput +
 * compileBase discipline, adapted to the neutral-intent inputs).
 */

import type { RouteCompilerInput } from "../src/compiler-input.ts";
import type { MoneyMovementIntent } from "../src/intent.ts";
import type { RoutingHints } from "../src/routing-hints.ts";
import { compileMoneyMovementRoute } from "../src/compiler.ts";
import type { RouteCompilationResult } from "../src/compiler.ts";
import { ETH_ASSET, USC_ASSET, baseConversionRules, corridorViewFixture, routeLocationObservations } from "./fixtures.ts";
import { CHAIN, MERCHANT_ACCOUNT_REF, MERCHANT_PROVIDER, NOW, OFFRAMP_DEPOSIT_ADDRESS, ONRAMP_DELIVERY_ACCOUNT, PSP_PROVIDER, USC_ASSET_B } from "./fixtures.ts";
import { allowAllGate, baseBestExecutionPolicy, baseSecurity, fixtureVenue, onchainInstanceFixture } from "./venue-fixtures.ts";
import {
  liquidityEstimateFixture,
  merchantBankEuroDestination,
  merchantBankUsdDestination,
  merchantEligibilityEvidence,
  payoutConstraintFixture,
} from "./merchant-fixtures.ts";

/** The full routing-hints set (explicit, never inferred). */
export function baseRoutingHints(): RoutingHints {
  return {
    intermediateAsset: USC_ASSET,
    bridgeDepositAsset: USC_ASSET,
    bridgeProtocol: { protocolKey: "native-bridge", chainKey: CHAIN },
    offRampDeposit: { providerName: PSP_PROVIDER, chainKey: CHAIN, accountRef: OFFRAMP_DEPOSIT_ADDRESS },
    onrampDeliveryAccount: { chainKey: CHAIN, accountRef: ONRAMP_DELIVERY_ACCOUNT },
    offRampPayoutRouteId: "instance:psp-payouts:001",
    nativeBaselineRouteId: "instance:psp-native:001",
  };
}

/** The base compiler input for an intent (the full evidence surface). */
export function baseCompilerInput(
  intent: MoneyMovementIntent,
  overrides?: {
    routingHints?: RoutingHints;
    conversionRules?: ReturnType<typeof baseConversionRules>;
    merchantEligibility?: ReturnType<typeof merchantEligibilityEvidence>[];
    venues?: ReturnType<typeof fixtureVenue>[];
    payoutConstraints?: ReturnType<typeof payoutConstraintFixture>[];
    settlementDestinations?: ReturnType<typeof merchantBankEuroDestination>[];
    liquidityEstimates?: ReturnType<typeof liquidityEstimateFixture>[];
  },
): RouteCompilerInput {
  const security = baseSecurity();
  return {
    intent,
    at: NOW,
    corridorView: corridorViewFixture(),
    venues: overrides?.venues ?? [fixtureVenue()],
    onchain: {
      policy: baseBestExecutionPolicy(),
      security: { ...security, evaluateGate: allowAllGate() },
      instances: [onchainInstanceFixture()],
      owner: intent.intentId.includes("route-2") ? ONRAMP_DELIVERY_ACCOUNT : "0x1111111111111111111111111111111111111111",
      requestedBy: "requester:route-compiler-fixtures",
      routeExpiryMs: NOW + 3_600_000,
    },
    locationObservations: routeLocationObservations(intent),
    assetObservations: routeLocationObservations(intent),
    conversionRules: overrides?.conversionRules ?? baseConversionRules(),
    payoutConstraints:
      overrides?.payoutConstraints ?? [payoutConstraintFixture("instance:psp-payouts:001")],
    settlementDestinations:
      overrides?.settlementDestinations ??
      [merchantBankEuroDestination(), merchantBankUsdDestination()],
    merchantEligibility: overrides?.merchantEligibility ?? [merchantEligibilityEvidence()],
    liquidityEstimates: overrides?.liquidityEstimates ?? [liquidityEstimateFixture()],
    routingHints: overrides?.routingHints ?? baseRoutingHints(),
    scoringPolicy: baseBestExecutionPolicy(),
  };
}

/** Compile + throw when nothing compiled (fixtures never fabricate). */
export function compileBase(
  intent: MoneyMovementIntent,
  overrides?: Parameters<typeof baseCompilerInput>[1],
): RouteCompilationResult {
  const result = compileMoneyMovementRoute(baseCompilerInput(intent, overrides));
  if (result.status !== "ROUTES_COMPILED" || result.plans.length === 0) {
    throw new Error(
      `the fixture compilation produced no plans (status ${result.status}; exclusions: ${result.exclusions.map((exclusion) => `${exclusion.shapeId}: ${exclusion.reasons.join(" | ")}`).join(" ;; ")})`,
    );
  }
  return result;
}

/** Find a compiled plan by shapeId. */
export function planOf(result: RouteCompilationResult, shapeId: string) {
  const plan = result.plans.find((candidate) => candidate.shapeId === shapeId);
  if (plan === undefined) {
    throw new Error(`the fixture compilation produced no '${shapeId}' plan`);
  }
  return plan;
}

export { ETH_ASSET, USC_ASSET, USC_ASSET_B, MERCHANT_ACCOUNT_REF, MERCHANT_PROVIDER };
