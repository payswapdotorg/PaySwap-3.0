/**
 * @payswap/route-compiler test fixtures — the deterministic core set
 * (P5-W1; PORT+ADAPT of the old suites' fixtures discipline: fixed
 * constants only — no clock, no randomness, every instant caller-supplied).
 */

import type { MoneyMovementIntent } from "../src/intent.ts";
import type { FundsLocationObservation } from "../src/grounding.ts";
import type { PinnedCorridorView } from "../src/pins/capability.ts";
import type { FiatConversionRule } from "../src/conversion.ts";
import { rationalOf } from "../src/exact-math.ts";

export const CHAIN = "ethereum:mainnet";
export const CHAIN_B = "solana:mainnet-beta";
export const NOW_ISO = "2026-10-03T00:00:00Z";
export const NOW = Date.parse(NOW_ISO);
export const NOW_PLUS_1H_ISO = "2026-10-03T01:00:00Z";

export const USC_ASSET = Object.freeze({
  chain: CHAIN,
  assetId: `${CHAIN}/asset:USC`,
  symbol: "USC",
});
export const ETH_ASSET = Object.freeze({
  chain: CHAIN,
  assetId: `${CHAIN}/asset:ETH`,
  symbol: "ETH",
});
export const USC_ASSET_B = Object.freeze({
  chain: CHAIN_B,
  assetId: `${CHAIN_B}/asset:USC`,
  symbol: "USC",
});

export const OWNER = "0x1111111111111111111111111111111111111111";
export const RECIPIENT = "0x2222222222222222222222222222222222222222";
export const OFFRAMP_DEPOSIT_ADDRESS = "0x5555555555555555555555555555555555555555";
export const ONRAMP_DELIVERY_ACCOUNT = "0x7777777777777777777777777777777777777777";
export const TENANT_REF = "tenant:route-compiler-fixtures";

export const PSP_PROVIDER = "psp-fixture";
export const MERCHANT_PROVIDER = "merchant-psp-fixture";
export const MERCHANT_ACCOUNT_REF = "acct-merchant-001";
export const MERCHANT_BANK_IBAN = "iban:DE89370400440532013000";

export const ORIGIN_ETH_MINOR = "10000000000000000";

export const ROUTE1_INTENT_ID = "intent:route-1:crypto-dex-offramp-bank";
export const ROUTE2_INTENT_ID = "intent:route-2:fiat-psp-chain";
export const ROUTE3_INTENT_ID = "intent:route-3:dex-bridge";
export const ROUTE4_INTENT_ID = "intent:route-4:merchant-settlement";

/** The four fixture intents (rail-NEUTRAL: opaque location references). */
export function route1Intent(): MoneyMovementIntent {
  return {
    intentId: ROUTE1_INTENT_ID,
    principalRef: "principal:route-1",
    origin: {
      locationRef: "fundsloc:route-1-origin-wallet",
      currency: "ETH",
      observationRef: "obs:route-1-origin",
    },
    destination: {
      locationRef: "fundsloc:route-1-destination-bank",
      currency: "EUR",
      observationRef: "obs:route-1-destination",
    },
    originAmount: { currency: "ETH", minorUnits: ORIGIN_ETH_MINOR },
    arrivalCurrency: "EUR",
    constraints: { maxRouteHops: 6, maxSettlementMs: 600000 },
    intentAuthorizationRef: "authz:intent:route-1",
    declaredAt: NOW - 3_600_000,
    expiresAt: NOW + 3_600_000,
  };
}

export function route2Intent(): MoneyMovementIntent {
  return {
    intentId: ROUTE2_INTENT_ID,
    principalRef: "principal:route-2",
    origin: {
      locationRef: "fundsloc:route-2-origin-account",
      currency: "EUR",
      observationRef: "obs:route-2-origin",
    },
    destination: {
      locationRef: "fundsloc:route-2-destination-wallet",
      currency: "USC",
      observationRef: "obs:route-2-destination",
    },
    originAmount: { currency: "EUR", minorUnits: "10000" },
    arrivalCurrency: "USC",
    constraints: { maxRouteHops: 6, maxSettlementMs: 600000 },
    intentAuthorizationRef: "authz:intent:route-2",
    declaredAt: NOW - 3_600_000,
    expiresAt: NOW + 3_600_000,
  };
}

export function route3Intent(): MoneyMovementIntent {
  return {
    intentId: ROUTE3_INTENT_ID,
    principalRef: "principal:route-3",
    origin: {
      locationRef: "fundsloc:route-3-origin-wallet",
      currency: "ETH",
      observationRef: "obs:route-3-origin",
    },
    destination: {
      locationRef: "fundsloc:route-3-destination-wallet",
      currency: "USC",
      observationRef: "obs:route-3-destination",
    },
    originAmount: { currency: "ETH", minorUnits: ORIGIN_ETH_MINOR },
    arrivalCurrency: "USC",
    constraints: { maxRouteHops: 6, maxSettlementMs: 600000 },
    intentAuthorizationRef: "authz:intent:route-3",
    declaredAt: NOW - 3_600_000,
    expiresAt: NOW + 3_600_000,
  };
}

export function route4Intent(): MoneyMovementIntent {
  return {
    intentId: ROUTE4_INTENT_ID,
    principalRef: "principal:route-4",
    origin: {
      locationRef: "fundsloc:route-4-origin-wallet",
      currency: "ETH",
      observationRef: "obs:route-4-origin",
    },
    destination: {
      locationRef: "fundsloc:route-4-destination-merchant",
      currency: "USD",
      observationRef: "obs:route-4-destination",
    },
    originAmount: { currency: "ETH", minorUnits: ORIGIN_ETH_MINOR },
    arrivalCurrency: "USD",
    constraints: { maxRouteHops: 6, maxSettlementMs: 600000 },
    intentAuthorizationRef: "authz:intent:route-4",
    declaredAt: NOW - 3_600_000,
    expiresAt: NOW + 3_600_000,
  };
}

/** The origin wallet observation (the lane's input-asset grounding). */
export function originWalletObservation(symbol = "ETH"): FundsLocationObservation {
  return {
    observationKind: "ONCHAIN_POSITION",
    observationRef: "obs:route-1-origin",
    observationVersion: 1,
    locationRef: "fundsloc:route-1-origin-wallet",
    chainKey: CHAIN,
    accountRef: OWNER,
    assetId: `${CHAIN}/asset:${symbol}`,
    symbol,
    observedAmount: { currency: symbol, minorUnits: "100000000000000000" },
    freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
  };
}

/** The location observations of one intent (the rail grounding). */
export function routeLocationObservations(intent: MoneyMovementIntent): FundsLocationObservation[] {
  switch (intent.intentId) {
    case ROUTE1_INTENT_ID:
      return [
        originWalletObservation("ETH"),
        {
          observationKind: "BANK_INSTRUMENT",
          observationRef: "obs:route-1-destination",
          observationVersion: 1,
          locationRef: "fundsloc:route-1-destination-bank",
          externalRef: MERCHANT_BANK_IBAN,
          currency: "EUR",
          freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
        },
      ];
    case ROUTE2_INTENT_ID:
      return [
        {
          observationKind: "PROVIDER_ACCOUNT",
          observationRef: "obs:route-2-origin",
          observationVersion: 1,
          locationRef: "fundsloc:route-2-origin-account",
          providerName: PSP_PROVIDER,
          accountRef: "acct-psp-123",
          currency: "EUR",
          observedAmount: { currency: "EUR", minorUnits: "500000" },
          freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
        },
        {
          observationKind: "ONCHAIN_POSITION",
          observationRef: "obs:route-2-destination",
          observationVersion: 1,
          locationRef: "fundsloc:route-2-destination-wallet",
          chainKey: CHAIN,
          accountRef: RECIPIENT,
          assetId: `${CHAIN}/asset:USC`,
          symbol: "USC",
          observedAmount: { currency: "USC", minorUnits: "0" },
          freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
        },
      ];
    case ROUTE3_INTENT_ID:
      return [
        {
          observationKind: "ONCHAIN_POSITION",
          observationRef: "obs:route-3-origin",
          observationVersion: 1,
          locationRef: "fundsloc:route-3-origin-wallet",
          chainKey: CHAIN,
          accountRef: OWNER,
          assetId: `${CHAIN}/asset:ETH`,
          symbol: "ETH",
          observedAmount: { currency: "ETH", minorUnits: "100000000000000000" },
          freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
        },
        {
          observationKind: "ONCHAIN_POSITION",
          observationRef: "obs:route-3-destination",
          observationVersion: 1,
          locationRef: "fundsloc:route-3-destination-wallet",
          chainKey: CHAIN_B,
          accountRef: RECIPIENT,
          assetId: `${CHAIN_B}/asset:USC`,
          symbol: "USC",
          observedAmount: { currency: "USC", minorUnits: "0" },
          freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
        },
      ];
    case ROUTE4_INTENT_ID:
      return [
        {
          observationKind: "ONCHAIN_POSITION",
          observationRef: "obs:route-4-origin",
          observationVersion: 1,
          locationRef: "fundsloc:route-4-origin-wallet",
          chainKey: CHAIN,
          accountRef: OWNER,
          assetId: `${CHAIN}/asset:ETH`,
          symbol: "ETH",
          observedAmount: { currency: "ETH", minorUnits: "100000000000000000" },
          freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
        },
        {
          observationKind: "MERCHANT_BALANCE",
          observationRef: "obs:route-4-destination",
          observationVersion: 1,
          locationRef: "fundsloc:route-4-destination-merchant",
          providerName: MERCHANT_PROVIDER,
          merchantAccountRef: MERCHANT_ACCOUNT_REF,
          currency: "USD",
          freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
        },
      ];
    default:
      return [];
  }
}

/** The corridor view fixture: the native baseline + the payout route. */
export function corridorViewFixture(): PinnedCorridorView {
  return {
    projectionVersion: "1.0.0",
    query: {
      sourceCountry: "DE",
      destinationCountry: "DE",
      sourceCurrency: "USC",
      destinationCurrency: "EUR",
      asOf: NOW_ISO,
    },
    routes: [
      {
        routeId: "instance:psp-native:001",
        eligible: true,
        exclusionReasons: [],
        effectiveAvailability: "AVAILABLE",
        lineage: {
          capabilityDefinitionId: "psp.native-routing",
          capabilityDefinitionVersion: "1.0.0",
          providerImplementationId: "impl:psp-native",
          implementationVersion: "1.0.0",
          connectedInstanceId: "instance:psp-native:001",
          providerName: PSP_PROVIDER,
          providerVersion: "1.0.0",
          observationVersion: 1,
          observedAt: NOW_ISO,
          restrictionSetIds: [],
        },
        offeredExecutionModes: ["PASS_THROUGH_NATIVE", "COMPOSED_PAYSWAP"],
        termsRefs: [{ termsRef: "terms:psp-native", termsVersion: "1.0.0", deliveryEstimateLabel: "INDICATIVE" }],
      },
      {
        routeId: "instance:psp-payouts:001",
        eligible: true,
        exclusionReasons: [],
        effectiveAvailability: "AVAILABLE",
        lineage: {
          capabilityDefinitionId: "psp.payouts",
          capabilityDefinitionVersion: "1.0.0",
          providerImplementationId: "impl:psp-payouts",
          implementationVersion: "1.0.0",
          connectedInstanceId: "instance:psp-payouts:001",
          providerName: PSP_PROVIDER,
          providerVersion: "1.0.0",
          observationVersion: 2,
          observedAt: NOW_ISO,
          restrictionSetIds: [],
        },
        offeredExecutionModes: ["OPTIMIZED_MULTI_PROVIDER"],
        termsRefs: [{ termsRef: "terms:psp-payouts", termsVersion: "1.0.0", deliveryEstimateLabel: "INDICATIVE" }],
      },
    ],
    eligibleRoutes: [],
  };
}

/** The declared conversion rules (never invented by the compiler). */
export function baseConversionRules(): FiatConversionRule[] {
  return [
    {
      ruleId: "rule:usc-eur",
      fromCurrency: "USC",
      toCurrency: "EUR",
      rate: rationalOf(92, 1_000_000),
      declaredBy: "fixture:peg-declaration",
    },
    {
      ruleId: "rule:usc-usd",
      fromCurrency: "USC",
      toCurrency: "USD",
      rate: rationalOf(1, 10_000),
      declaredBy: "fixture:peg-declaration",
    },
    {
      ruleId: "rule:eur-usc",
      fromCurrency: "EUR",
      toCurrency: "USC",
      rate: rationalOf(10_800, 1),
      declaredBy: "fixture:peg-declaration",
    },
    {
      ruleId: "rule:eth-eur",
      fromCurrency: "ETH",
      toCurrency: "EUR",
      rate: rationalOf(276, 1_000_000_000_000_000),
      declaredBy: "fixture:peg-declaration",
    },
  ];
}

/** Honest narrowing: the grounded planned amount or a throw. */
export function groundedPlannedAmount(planned: { basis: string }): { amount: { currency: string; minorUnits: string } } {
  if (planned.basis === "UNKNOWN") {
    throw new Error(`the planned amount is UNKNOWN — an unknown amount never coerces`);
  }
  return planned as unknown as { amount: { currency: string; minorUnits: string } };
}

/** Honest narrowing: the unknown reason or a throw. */
export function unknownPlannedReason(planned: { basis: string }): string {
  if (planned.basis !== "UNKNOWN") {
    throw new Error("the planned amount is grounded — there is no unknown reason");
  }
  return (planned as unknown as { reason: string }).reason;
}
