/**
 * @payswap/route-compiler test fixtures — the P22-C CROSS-PROVIDER CORRIDOR
 * fixture world (ADR-0016 D5): GHS (a Flutterwave provider account) ->
 * USDC(Stellar) -> KES (a Kenyan bank instrument), compiled through the
 * `cross-provider-corridor` shape ONLY when an ONCHAIN position is OBSERVED
 * in the middle (the relay account's issuer-scoped USDC position on
 * `stellar:testnet` — never a fabricated middle).
 *
 * Every literal here is the ADR-0016 appendix pin contract, byte-identical:
 * - chain key `stellar:testnet` (the rail key of the ONCHAIN rail);
 * - the issuer-scoped asset `stellar:testnet/asset:USDC:<issuerG>` (D3:
 *   two issuers of the same code are two assets);
 * - the StrKey `G…` account shapes (D9: ^G[A-Z2-7]{55}$ — accounts are
 *   G-shaped; key MATERIAL never appears here, only account refs).
 *
 * Fixed constants only — every instant caller-supplied (the fixtures
 * discipline of ./fixtures.ts, unchanged).
 */

import type { MoneyMovementIntent } from "../src/intent.ts";
import type { FundsLocationObservation } from "../src/grounding.ts";
import type { RoutingHints } from "../src/routing-hints.ts";
import type { PinnedCorridorView } from "../src/pins/capability.ts";
import type { FiatConversionRule } from "../src/conversion.ts";
import type {
  PayoutDestination,
  SettlementDestination,
} from "../src/payout-gate.ts";
import type { PayoutGateReport } from "../src/authorization.ts";
import type { RouteCompilerInput } from "../src/compiler-input.ts";
import { rationalOf } from "../src/exact-math.ts";
import { NOW, NOW_ISO } from "./fixtures.ts";
import { allowAllGate, baseBestExecutionPolicy, baseSecurity } from "./venue-fixtures.ts";

// ---------------------------------------------------------------------------
// The ADR-0016 appendix literals (the pin contract — byte-identical)
// ---------------------------------------------------------------------------

/** The corridor's chain key (the rail key of the ONCHAIN rail — the appendix pin). */
export const STELLAR_CHAIN_KEY = "stellar:testnet" as const;

/** The StrKey account shape law (D9): ^G[A-Z2-7]{55}$ — public accounts only. */
export const STRKEY_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;

/** The corridor USDC issuer (a TESTNET issuer account, evidence-shaped). */
export const CORRIDOR_USDC_ISSUER_G =
  "GDSTRKEYISSUERFIXTUREUSDCSTELLARTESTNETP22LANEPINAAAAAAA" as const;

/** The issuer-scoped USDC asset identity (D3: the issuer disambiguates the code). */
export const CORRIDOR_USDC_ASSET_ID =
  `${STELLAR_CHAIN_KEY}/asset:USDC:${CORRIDOR_USDC_ISSUER_G}` as const;

/** The corridor relay wallet (the on-ramp delivery account — the observed middle). */
export const CORRIDOR_RELAY_ACCOUNT_G =
  "GRELAYACCOUNTFIXTURESTELLARTESTNETP22CORRIDORPINAAAAAAAA" as const;

/** The off-ramp provider's onchain receiving account on `stellar:testnet`. */
export const CORRIDOR_PAYSTACK_RECEIVING_G =
  "GPAYSTACKRECEIVINGSTELLARTESTNETP22CORRIDORPINBBBBBBBBBB" as const;

// ---------------------------------------------------------------------------
// The corridor's three providers (the 3-provider 4-leg execution)
// ---------------------------------------------------------------------------

/** The GHS on-ramp provider (the collect + issuance legs' lane). */
export const CORRIDOR_ONRAMP_PROVIDER = "flutterwave" as const;

/** The KES off-ramp provider (the payout leg's lane). */
export const CORRIDOR_OFFRAMP_PROVIDER = "paystack" as const;

/** The off-ramp payout corridor route (the Paystack payouts instance). */
export const CORRIDOR_PAYOUT_ROUTE_ID = "instance:paystack-payouts:001" as const;

/** The KES bank instrument (the corridor's fiat destination). */
export const CORRIDOR_KES_BANK_EXTERNAL_REF = "iban:KE00123456789012345678" as const;

// ---------------------------------------------------------------------------
// The corridor intent (GHS -> KES over the observed stellar middle)
// ---------------------------------------------------------------------------

export const ROUTE5_INTENT_ID = "intent:route-5:cross-provider-corridor";

/** The corridor demand: 1,000.00 GHS arriving as KES at a Kenyan bank. */
export function route5Intent(): MoneyMovementIntent {
  return {
    intentId: ROUTE5_INTENT_ID,
    principalRef: "principal:route-5",
    origin: {
      locationRef: "fundsloc:route-5-origin-account",
      currency: "GHS",
      observationRef: "obs:route-5-origin",
    },
    destination: {
      locationRef: "fundsloc:route-5-destination-bank",
      currency: "KES",
      observationRef: "obs:route-5-destination",
    },
    originAmount: { currency: "GHS", minorUnits: "100000" },
    arrivalCurrency: "KES",
    constraints: { maxRouteHops: 6, maxSettlementMs: 600000 },
    intentAuthorizationRef: "authz:intent:route-5",
    declaredAt: NOW - 3_600_000,
    expiresAt: NOW + 3_600_000,
  };
}

// ---------------------------------------------------------------------------
// The observed middle (the relay account's issuer-scoped USDC position)
// ---------------------------------------------------------------------------

/**
 * THE OBSERVED MIDDLE: the relay wallet's issuer-scoped USDC position on
 * `stellar:testnet`. The corridor compiles ONLY through this observation —
 * the chain hop is grounded in the onchain plane's observations (ADR-0016
 * D5), never a fabricated middle.
 */
export function corridorRelayObservation(options?: {
  observationVersion?: number;
  asOf?: string;
}): FundsLocationObservation {
  return {
    observationKind: "ONCHAIN_POSITION",
    observationRef: "obs:route-5-relay",
    observationVersion: options?.observationVersion ?? 3,
    locationRef: "fundsloc:route-5-relay-wallet",
    chainKey: STELLAR_CHAIN_KEY,
    accountRef: CORRIDOR_RELAY_ACCOUNT_G,
    assetId: CORRIDOR_USDC_ASSET_ID,
    symbol: "USDC",
    observedAmount: { currency: "USDC", minorUnits: "125000000" },
    freshness: { asOf: options?.asOf ?? NOW_ISO, maxAgeSeconds: 3600 },
  };
}

/** The corridor location observations (origin + destination + the middle). */
export function corridorLocationObservations(options?: {
  withoutMiddle?: boolean;
}): FundsLocationObservation[] {
  const observations: FundsLocationObservation[] = [
    {
      observationKind: "PROVIDER_ACCOUNT",
      observationRef: "obs:route-5-origin",
      observationVersion: 1,
      locationRef: "fundsloc:route-5-origin-account",
      providerName: CORRIDOR_ONRAMP_PROVIDER,
      accountRef: "acct-flw-ghs-001",
      currency: "GHS",
      observedAmount: { currency: "GHS", minorUnits: "5000000" },
      freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
    },
    {
      observationKind: "BANK_INSTRUMENT",
      observationRef: "obs:route-5-destination",
      observationVersion: 1,
      locationRef: "fundsloc:route-5-destination-bank",
      externalRef: CORRIDOR_KES_BANK_EXTERNAL_REF,
      currency: "KES",
      freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
    },
  ];
  if (options?.withoutMiddle !== true) {
    observations.push(corridorRelayObservation());
  }
  return observations;
}

// ---------------------------------------------------------------------------
// The corridor routing hints (explicit, never inferred)
// ---------------------------------------------------------------------------

/**
 * The corridor hints: the relay account (the on-ramp delivery account — the
 * observed middle's identity, matched against the location observations)
 * and the off-ramp provider's onchain receiving account + payout route.
 */
export function corridorRoutingHints(): RoutingHints {
  return {
    onrampDeliveryAccount: { chainKey: STELLAR_CHAIN_KEY, accountRef: CORRIDOR_RELAY_ACCOUNT_G },
    offRampDeposit: {
      providerName: CORRIDOR_OFFRAMP_PROVIDER,
      chainKey: STELLAR_CHAIN_KEY,
      accountRef: CORRIDOR_PAYSTACK_RECEIVING_G,
    },
    offRampPayoutRouteId: CORRIDOR_PAYOUT_ROUTE_ID,
  };
}

// ---------------------------------------------------------------------------
// The corridor evidence (conversion rules, corridor view, payout constraint)
// ---------------------------------------------------------------------------

/**
 * The corridor's declared conversion rules (never invented by the
 * compiler): GHS -> USDC (the issuance grounding) and USDC -> KES (the
 * payout grounding). 1,000.00 GHS = 125 USDC = 16,125.00 KES exactly.
 */
export function corridorConversionRules(): FiatConversionRule[] {
  return [
    {
      ruleId: "rule:ghs-usdc",
      fromCurrency: "GHS",
      toCurrency: "USDC",
      rate: rationalOf(1250, 1),
      declaredBy: "fixture:corridor-peg-declaration",
    },
    {
      ruleId: "rule:usdc-kes",
      fromCurrency: "USDC",
      toCurrency: "KES",
      rate: rationalOf(129, 10000),
      declaredBy: "fixture:corridor-peg-declaration",
    },
  ];
}

/** The corridor view: the Paystack payouts route (the off-ramp corridor). */
export function corridorViewFixture(): PinnedCorridorView {
  return {
    projectionVersion: "1.0.0",
    query: {
      sourceCountry: "GH",
      destinationCountry: "KE",
      sourceCurrency: "GHS",
      destinationCurrency: "KES",
      asOf: NOW_ISO,
    },
    routes: [
      {
        routeId: CORRIDOR_PAYOUT_ROUTE_ID,
        eligible: true,
        exclusionReasons: [],
        effectiveAvailability: "AVAILABLE",
        lineage: {
          capabilityDefinitionId: "psp.payouts",
          capabilityDefinitionVersion: "1.0.0",
          providerImplementationId: "impl:paystack-payouts",
          implementationVersion: "1.0.0",
          connectedInstanceId: CORRIDOR_PAYOUT_ROUTE_ID,
          providerName: CORRIDOR_OFFRAMP_PROVIDER,
          providerVersion: "1.0.0",
          observationVersion: 2,
          observedAt: NOW_ISO,
          restrictionSetIds: [],
        },
        offeredExecutionModes: ["OPTIMIZED_MULTI_PROVIDER"],
        termsRefs: [{ termsRef: "terms:paystack-payouts", termsVersion: "1.0.0", deliveryEstimateLabel: "INDICATIVE" }],
      },
    ],
    eligibleRoutes: [],
  };
}

/** The REAL passing payout gate report (the six gates — F-1 wire type). */
export function corridorPayoutGateReport(): PayoutGateReport {
  return {
    allowed: true,
    checks: [
      { gate: "TRANSFER_OUT_GRANT_EXISTS", pass: true, reason: "the transfer-out grant exists and is unexpired" },
      { gate: "CURRENCY_SCOPE", pass: true, reason: "the payout currency is within the grant's scope" },
      { gate: "LIMITS", pass: true, reason: "the payout amount is within the grant's limits" },
      { gate: "NOT_EXPIRED", pass: true, reason: "the grant has not expired at the evaluation instant" },
      { gate: "DESTINATION_EXPLICIT_EXTERNAL", pass: true, reason: "the destination is an explicit external bank instrument" },
      { gate: "PROVIDER_STEP_UP", pass: true, reason: "no provider step-up is required for this payout" },
    ],
    evidenceRefs: ["fixture:corridor-payout-gate:001"],
  };
}

/** The KES payout destination (explicit + external by construction). */
export function corridorPayoutDestination(): PayoutDestination {
  return { kind: "PROVIDER_BANK_INSTRUMENT", providerDestinationRef: CORRIDOR_KES_BANK_EXTERNAL_REF };
}

/** The corridor payout constraint (routeId + destination + the REAL report). */
export function corridorPayoutConstraint(): {
  routeId: string;
  destination: PayoutDestination;
  gateReport: PayoutGateReport;
} {
  return {
    routeId: CORRIDOR_PAYOUT_ROUTE_ID,
    destination: corridorPayoutDestination(),
    gateReport: corridorPayoutGateReport(),
  };
}

/** The KES settlement destination (the bank arrival evidence). */
export function corridorKesSettlementDestination(): SettlementDestination {
  return {
    destinationId: "dest:corridor-kes-bank",
    kind: "BANK_ACCOUNT",
    currency: "KES",
    externalRef: CORRIDOR_KES_BANK_EXTERNAL_REF,
    provenance: { source: "route-compiler-corridor-fixtures", reference: "dest:corridor-kes-bank", recordedAt: 1_000_000_000_000n },
  };
}

// ---------------------------------------------------------------------------
// The corridor compiler input (the complete evidence surface)
// ---------------------------------------------------------------------------

/**
 * The corridor compiler input: the FLW GHS origin, the KES bank destination,
 * the observed stellar middle, the corridor's conversion rules, the Paystack
 * payout constraint and the explicit routing hints. No DEX venue is
 * registered (the corridor has no swap leg — the four legs are collect,
 * issuance, transfer, payout).
 */
export function corridorCompilerInput(
  intent: MoneyMovementIntent,
  overrides?: {
    locationObservations?: FundsLocationObservation[];
    conversionRules?: FiatConversionRule[];
    routingHints?: RoutingHints;
    corridorView?: PinnedCorridorView;
  },
): RouteCompilerInput {
  const security = baseSecurity();
  return {
    intent,
    at: NOW,
    corridorView: overrides?.corridorView ?? corridorViewFixture(),
    venues: [],
    onchain: {
      policy: baseBestExecutionPolicy(),
      security: { ...security, evaluateGate: allowAllGate() },
      instances: [],
      owner: CORRIDOR_RELAY_ACCOUNT_G,
      requestedBy: "requester:corridor-fixtures",
      routeExpiryMs: NOW + 3_600_000,
    },
    locationObservations: overrides?.locationObservations ?? corridorLocationObservations(),
    assetObservations: overrides?.locationObservations ?? corridorLocationObservations(),
    conversionRules: overrides?.conversionRules ?? corridorConversionRules(),
    payoutConstraints: [corridorPayoutConstraint()],
    settlementDestinations: [corridorKesSettlementDestination()],
    merchantEligibility: [],
    liquidityEstimates: [],
    routingHints: overrides?.routingHints ?? corridorRoutingHints(),
    scoringPolicy: baseBestExecutionPolicy(),
  };
}
