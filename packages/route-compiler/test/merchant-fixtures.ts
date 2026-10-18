/**
 * @payswap/route-compiler test fixtures — merchant, payout and settlement
 * evidence (P5-W1; the old suites' merchant/payout discipline, the REAL
 * wire types carried verbatim — F-1).
 */

import type { PayoutGateReport } from "../src/authorization.ts";
import type { PayoutDestination, SettlementDestination } from "../src/payout-gate.ts";
import type { MerchantSettlementEligibilityEvidence } from "../src/merchant-legs.ts";
import type { LiquidityEstimate } from "../src/liquidity.ts";
import {
  CHAIN,
  MERCHANT_ACCOUNT_REF,
  MERCHANT_BANK_IBAN,
  MERCHANT_PROVIDER,
  NOW_ISO,
} from "./fixtures.ts";

/** The REAL payout gate report (all six gates, passing — F-1: the real wire type). */
export function passingPayoutGateReport(): PayoutGateReport {
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
    evidenceRefs: ["fixture:payout-gate:001"],
  };
}

/** The failing payout gate report (connection scope alone never passes). */
export function failingPayoutGateReport(): PayoutGateReport {
  return {
    allowed: false,
    checks: [
      { gate: "TRANSFER_OUT_GRANT_EXISTS", pass: false, reason: "no transfer-out grant exists for this instance (connection scope alone never grants transfer-out)" },
      { gate: "CURRENCY_SCOPE", pass: true, reason: "the payout currency is within the scope" },
      { gate: "LIMITS", pass: true, reason: "the amount is within the limits" },
      { gate: "NOT_EXPIRED", pass: true, reason: "nothing to expire" },
      { gate: "DESTINATION_EXPLICIT_EXTERNAL", pass: true, reason: "the destination is explicit and external" },
      { gate: "PROVIDER_STEP_UP", pass: true, reason: "no step-up required" },
    ],
    evidenceRefs: ["fixture:payout-gate:failed"],
  };
}

/** The payout destination (explicit + external by construction). */
export function payoutDestinationFixture(): PayoutDestination {
  return { kind: "PROVIDER_BANK_INSTRUMENT", providerDestinationRef: MERCHANT_BANK_IBAN };
}

/** The external settlement destination (the bank arrival). */
export function merchantBankEuroDestination(): SettlementDestination {
  return {
    destinationId: "dest:merchant-bank-eur",
    kind: "BANK_ACCOUNT",
    currency: "EUR",
    externalRef: MERCHANT_BANK_IBAN,
    provenance: { source: "route-compiler-fixtures", reference: "dest:merchant-bank-eur", recordedAt: 1_000_000_000_000n },
  };
}

/** The USD bank destination (the merchant Mode-B arrival). */
export function merchantBankUsdDestination(): SettlementDestination {
  return {
    destinationId: "dest:merchant-bank-usd",
    kind: "BANK_ACCOUNT",
    currency: "USD",
    externalRef: MERCHANT_BANK_IBAN,
    provenance: { source: "route-compiler-fixtures", reference: "dest:merchant-bank-usd", recordedAt: 1_000_000_000_000n },
  };
}

/** The provider-verified merchant settlement eligibility evidence (rule 30). */
export function merchantEligibilityEvidence(options?: {
  currency?: string;
  asOf?: string;
  maxAgeSeconds?: number;
  providerVerified?: boolean;
  eligible?: boolean;
}): MerchantSettlementEligibilityEvidence {
  const evidence = {
    evidenceId: "merchant-eligibility:001",
    providerName: MERCHANT_PROVIDER,
    merchantAccountRef: MERCHANT_ACCOUNT_REF,
    currency: options?.currency ?? "USD",
    eligible: (options?.eligible ?? true) as true,
    providerVerified: (options?.providerVerified ?? true) as true,
    verificationRef: "merchant-verify:eligibility-001",
    observedAt: NOW_ISO,
    freshness: { asOf: options?.asOf ?? NOW_ISO, maxAgeSeconds: options?.maxAgeSeconds ?? 3600 },
    awaitingAuthority: "P5-W3" as const,
  };
  return evidence as MerchantSettlementEligibilityEvidence;
}

/** The advisory liquidity estimate (the advisory-only law). */
export function liquidityEstimateFixture(options?: {
  estimateId?: string;
  declaredImpactBasisPoints?: number;
  asOf?: string;
}): LiquidityEstimate {
  return {
    estimateId: options?.estimateId ?? "liquidity:fixture:001",
    model: "POOL_STATE",
    venueId: "fixture-dex-alpha",
    assetPair: { inputSymbol: "ETH", outputSymbol: "USC" },
    declaredDepthMinorUnits: "1000000000",
    declaredImpactBasisPoints: options?.declaredImpactBasisPoints ?? 30,
    advisoryOnly: true,
    observedAt: NOW_ISO,
    freshness: { asOf: options?.asOf ?? NOW_ISO, maxAgeSeconds: 60 },
    evidenceRefs: ["fixture:liquidity:001"],
  };
}

/** The payout constraint pair (routeId + destination + the REAL report). */
export function payoutConstraintFixture(routeId: string): {
  routeId: string;
  destination: PayoutDestination;
  gateReport: PayoutGateReport;
} {
  return {
    routeId,
    destination: payoutDestinationFixture(),
    gateReport: passingPayoutGateReport(),
  };
}

export { CHAIN };
