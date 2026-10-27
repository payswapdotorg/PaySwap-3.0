/**
 * PaySwap Desktop (P21-A, ADR-0014 D6/D8/D9) — the GATE-ENVIRONMENT
 * CORRIDOR battery (split from connections-bridge.test.ts at the
 * ≤400-line file law): the labeled TEST_DATA merchant directory + the
 * DECLARED TEST CORRIDOR + createGateEnvironmentFromConnections — the
 * composition seam where the PROVIDER_OBSERVATION probe facts and the
 * TEST_DATA declared-corridor facts meet (the tiers compose, they never
 * mix).
 *
 * Machine-checks:
 * - THE LABEL LAW: the directory's facts are TEST_DATA, never provider
 *   observations; the destination derives ONLY when the receiving rail
 *   is ACTIVE (the connection reference maps it) — the intake asks,
 *   never invents.
 * - THE TIER COMPOSITION: the environment carries BOTH tiers — the
 *   probe facts (PROVIDER_OBSERVATION) and the declared test corridor
 *   facts (TEST_DATA) — with distinct provenance namespaces (a merchant
 *   destination's observationRef is the DIRECTORY ref, never a probe
 *   ref; the declared test funding instrument's ref is the
 *   declared-corridor namespace, never an FLW claim — F4).
 * - THE HONEST-EMPTY LAW: zero ACTIVE connections keep the byte-
 *   identical honest-empty environment EVEN when a declared corridor is
 *   supplied (a declared corridor never fabricates an instance).
 * - THE MISSING-RAIL LAW: an FLW-active world (no Stripe merchant rail)
 *   surfaces the typed NO_CONNECTED_MERCHANT_RAIL exclusion for the
 *   declared corridor's query — never a hidden fact; the FLW→Stripe
 *   corridor surfaces the honest NO_ROUTE (D7).
 */

import { describe, expect, it } from "vitest";

import type { DesktopConnectionStatusView } from "../../src/host/payswap/connections/contracts.js";
import type { ProbeEvidenceRecord } from "../../src/host/payswap/connections/probe-evidence.js";
import {
  DECLARED_STRIPE_TEST_CORRIDOR,
  createGateEnvironmentFromConnections,
} from "../../src/host/payswap/connections/gate-environment.js";
import {
  deriveConnectionCapabilityBridge,
} from "../../src/host/payswap/connections/capability-bridge.js";
import {
  MERCHANT_DIRECTORY_EVIDENCE_TIER,
  findMerchantDirectoryEntry,
  listMerchantDirectoryEntries,
} from "../../src/host/payswap/payments/merchant-directory.js";
import { createHonestEmptyGateEnvironment } from "../../src/host/payswap/payments/validation-gates.js";

const NOW = "2026-10-27T12:00:00.000Z";

/** A connection status view factory (the registry's own read-model shape). */
function status(overrides: Partial<DesktopConnectionStatusView>): DesktopConnectionStatusView {
  return {
    connectionId: "conn:stripe-1",
    providerId: "stripe",
    useCaseRef: "own-store-test-mode",
    form: "SCOPED_API_CREDENTIAL",
    credentialKind: "API_KEY",
    executionMode: "SANDBOX",
    state: "ACTIVE",
    credentialHandleRef: "handle:opaque",
    createdAt: "2026-10-27T10:00:00.000Z",
    lastTransitionAt: "2026-10-27T11:00:00.000Z",
    transitionHistory: [],
    ...overrides,
  };
}

/** A probe-evidence record factory. */
function evidence(overrides: Partial<ProbeEvidenceRecord>): ProbeEvidenceRecord {
  return {
    connectionId: "conn:stripe-1",
    providerId: "stripe",
    probedOperation: "stripe.balance.read + stripe.account.read",
    outcome: "CONFIRMED",
    providerReferences: ["acct_FAKE0001", "balance"],
    accountRef: "acct_FAKE0001",
    providerLiveMode: false,
    keyClass: "FULL_TEST",
    balanceCurrencies: ["USD"],
    transportId: "stripe-https",
    executionMode: "SANDBOX",
    observedAt: "2026-10-27T11:30:00.000Z",
    evidenceTier: "PROVIDER_OBSERVATION",
    observationVersion: 1,
    ...overrides,
  };
}

const DECLARED_QUERY = {
  sourceCountry: "US",
  destinationCountry: "US",
  sourceCurrency: "USD",
  destinationCurrency: "USD",
  customerType: "PERSONAL" as const,
  sendAmount: { currency: "USD", minorUnits: "1500" },
  asOf: NOW,
};

describe("the merchant directory (labeled TEST_DATA — the destination provider)", () => {
  it("ships exactly merchant:stripe-only-test with the stable identifier + display name + TEST_DATA tier", () => {
    const entries = listMerchantDirectoryEntries();
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.merchantId).toBe("merchant:stripe-only-test");
    expect(entry.displayName).toBe("Merchant X (Stripe-only test)");
    expect(entry.evidenceTier).toBe(MERCHANT_DIRECTORY_EVIDENCE_TIER);
    expect(MERCHANT_DIRECTORY_EVIDENCE_TIER).toBe("TEST_DATA");
    expect(entry.receivingContext.providerId).toBe("stripe");
    expect(entry.receivingContext.receivingCurrency).toBe("USD");
    // The directory's facts are TEST_DATA, never provider observations.
    expect(JSON.stringify(entry)).not.toContain("PROVIDER_OBSERVATION");
    expect(findMerchantDirectoryEntry("Merchant X (Stripe-only test)")).toBe(entry);
    expect(findMerchantDirectoryEntry("someone else")).toBeNull();
    // The directory never answers a PARTIAL name (the exactness law).
    expect(findMerchantDirectoryEntry("Merchant X")).toBeNull();
  });

  it("the destination derives ONLY when the receiving rail is ACTIVE (the connection reference maps it)", () => {
    // Without an ACTIVE stripe connection: no destination (the intake
    // asks, never invents).
    const empty = deriveConnectionCapabilityBridge({ statuses: [], evidence: [] });
    expect(empty.destinations).toHaveLength(0);

    const bridge = deriveConnectionCapabilityBridge({
      statuses: [status({})],
      evidence: [evidence({})],
    });
    expect(bridge.destinations).toHaveLength(1);
    const destination = bridge.destinations[0]!;
    expect(destination.displayName).toBe("Merchant X (Stripe-only test)");
    expect(destination.currency).toBe("USD");
    // The tiers never mix: the merchant destination's provenance is the
    // DIRECTORY ref (TEST_DATA), never a probe ref.
    expect(destination.observationRef).toBe("merchant-directory:merchant:stripe-only-test");
    expect(destination.observationRef).not.toMatch(/^probe:/);
    expect(destination.locationRef).toContain("merchant:stripe-only-test");
    expect(destination.locationRef).toContain("acct_FAKE0001");
  });
});

describe("the declared test corridor (the a1 precedent, a labeled typed composition input)", () => {
  it("carries the TEST_DATA tier + the published test payment method as the declared funding instrument", () => {
    expect(DECLARED_STRIPE_TEST_CORRIDOR.evidenceTier).toBe("TEST_DATA");
    expect(DECLARED_STRIPE_TEST_CORRIDOR.fundingInstrument.paymentMethodToken).toBe("pm_card_visa");
    expect(DECLARED_STRIPE_TEST_CORRIDOR.routeId).toBe("route:declared-us-us-test");
    expect(DECLARED_STRIPE_TEST_CORRIDOR.label).toContain("test");
  });

  it("the gate environment composes BOTH tiers: the probe facts + the declared test corridor facts", () => {
    const env = createGateEnvironmentFromConnections({
      now: NOW,
      statuses: [status({})],
      evidence: [evidence({})],
      declaredTestCorridor: DECLARED_STRIPE_TEST_CORRIDOR,
    });
    // The PROVIDER_OBSERVATION funding source (the probed account)…
    expect(
      env.observedFundingSources.some(
        (source) => source.observationRef === "probe:acct_FAKE0001",
      ),
    ).toBe(true);
    // …and the DECLARED TEST FUNDING INSTRUMENT (TEST_DATA — the
    // revise-path origin; F4: a Stripe test PM is never FLW-funded).
    const instrument = env.observedFundingSources.find(
      (source) => source.observationRef === "declared:test-funding-instrument:pm_card_visa",
    );
    expect(instrument).toBeDefined();
    expect(instrument!.displayName).toContain("pm_card_visa");
    expect(instrument!.currency).toBe("USD");
    // The declared corridor facts (quote/limits/policy) are present and
    // carry the TEST_DATA provenance in their text.
    expect(env.freshQuote).toBeDefined();
    expect(env.freshQuote!.rate.provenance).toContain("TEST_DATA");
    expect(env.declaredLimits).toBeDefined();
    expect(env.policyDecisions).toHaveLength(1);
    expect(env.policyDecisions[0]!.reason).toContain("TEST_DATA");
    // The merchant destination is on the environment.
    expect(
      env.observedDestinations.some(
        (destination) => destination.displayName === "Merchant X (Stripe-only test)",
      ),
    ).toBe(true);
  });

  it("the corridor projection is eligible exactly for the declared test corridor when the merchant rail is ACTIVE", () => {
    const env = createGateEnvironmentFromConnections({
      now: NOW,
      statuses: [status({})],
      evidence: [evidence({})],
      declaredTestCorridor: DECLARED_STRIPE_TEST_CORRIDOR,
    });
    const match = env.corridorProjection.projectCorridor(DECLARED_QUERY);
    expect(match.eligibleRouteIds).toEqual(["route:declared-us-us-test"]);
    expect(match.exclusions).toEqual([]);
    // A different corridor is excluded with the typed reason.
    const other = env.corridorProjection.projectCorridor({
      ...DECLARED_QUERY,
      sourceCurrency: "EUR",
      sendAmount: { currency: "EUR", minorUnits: "1500" },
    });
    expect(other.eligibleRouteIds).toEqual([]);
    expect(other.exclusions.length).toBeGreaterThan(0);
  });

  it("zero ACTIVE connections keep the byte-identical honest-empty environment EVEN with a declared corridor (a declared corridor never fabricates an instance)", () => {
    const env = createGateEnvironmentFromConnections({
      now: NOW,
      statuses: [status({ state: "PENDING_VERIFICATION" })],
      evidence: [evidence({})],
      declaredTestCorridor: DECLARED_STRIPE_TEST_CORRIDOR,
    });
    const empty = createHonestEmptyGateEnvironment(NOW);
    // The honest-empty truth: the typed no-observation exclusion names
    // the strongest honest fact (no connected instance at all).
    const view = env.corridorProjection.projectCorridor(DECLARED_QUERY);
    expect(view.eligibleRouteIds).toEqual([]);
    expect(view.exclusions.some((exclusion) => exclusion.code === "NO_CONNECTED_INSTANCE")).toBe(true);
    expect(env.observedFundingSources).toEqual(empty.observedFundingSources);
    expect(env.freshQuote).toBeUndefined();
    expect(env.declaredLimits).toBeUndefined();
  });

  it("without the merchant rail (an FLW-active world) the corridor exclusion names the missing receiving rail (never a hidden fact)", () => {
    const env = createGateEnvironmentFromConnections({
      now: NOW,
      statuses: [
        status({
          connectionId: "conn:flw-1",
          providerId: "flutterwave",
        }),
      ],
      evidence: [
        evidence({
          connectionId: "conn:flw-1",
          providerId: "flutterwave",
          probedOperation: "flutterwave.balances.read",
          providerReferences: ["NGN", "KES"],
          accountRef: null,
          providerLiveMode: null,
          keyClass: "READ_ONLY_TEST",
          balanceCurrencies: ["NGN", "KES"],
        }),
      ],
      declaredTestCorridor: DECLARED_STRIPE_TEST_CORRIDOR,
    });
    const view = env.corridorProjection.projectCorridor(DECLARED_QUERY);
    expect(view.eligibleRouteIds).toEqual([]);
    expect(view.exclusions.some((exclusion) => exclusion.code === "NO_CONNECTED_MERCHANT_RAIL")).toBe(
      true,
    );
  });

  it("the corridor projection explains the honest NO_ROUTE for the FLW→Stripe corridor (typed exclusion, D7)", () => {
    const env = createGateEnvironmentFromConnections({
      now: NOW,
      statuses: [
        status({
          connectionId: "conn:flw-1",
          providerId: "flutterwave",
        }),
      ],
      evidence: [
        evidence({
          connectionId: "conn:flw-1",
          providerId: "flutterwave",
          probedOperation: "flutterwave.balances.read",
          providerReferences: ["NGN", "KES"],
          accountRef: null,
          providerLiveMode: null,
          keyClass: "READ_ONLY_TEST",
          balanceCurrencies: ["NGN", "KES"],
        }),
      ],
      declaredTestCorridor: DECLARED_STRIPE_TEST_CORRIDOR,
    });
    const view = env.corridorProjection.projectCorridor({
      sourceCountry: "NG",
      destinationCountry: "US",
      sourceCurrency: "NGN",
      destinationCurrency: "USD",
      customerType: "PERSONAL",
      sendAmount: { currency: "NGN", minorUnits: "1000000" },
      asOf: NOW,
    });
    expect(view.eligibleRouteIds).toEqual([]);
    expect(view.exclusions.length).toBeGreaterThan(0);
    const text = view.exclusions.map((exclusion) => `${exclusion.code}: ${exclusion.message}`).join(" | ");
    expect(text).toMatch(/no route/i);
    expect(text).toContain("Flutterwave");
    expect(text).toMatch(/no send operation/i);
  });

  it("the declared quote expires in the future and the limits bound the corridor", () => {
    const env = createGateEnvironmentFromConnections({
      now: NOW,
      statuses: [status({})],
      evidence: [evidence({})],
      declaredTestCorridor: DECLARED_STRIPE_TEST_CORRIDOR,
    });
    expect(env.freshQuote!.expiry.at > NOW).toBe(true);
    expect(env.declaredLimits!.minimum!.minorUnits).toBe("1");
    expect(env.declaredLimits!.maximum!.minorUnits).toBe("1000000");
  });

  it("the declared quote denominations carry the mission's captured amount when supplied (never an invented amount)", () => {
    const env = createGateEnvironmentFromConnections({
      now: NOW,
      statuses: [status({})],
      evidence: [evidence({})],
      declaredTestCorridor: DECLARED_STRIPE_TEST_CORRIDOR,
      missionAmount: { currency: "USD", minorUnits: "1500" },
    });
    expect(env.freshQuote!.sourceAmount).toEqual({ currency: "USD", minorUnits: "1500" });
    expect(env.freshQuote!.targetAmount).toEqual({ currency: "USD", minorUnits: "1500" });
  });
});
