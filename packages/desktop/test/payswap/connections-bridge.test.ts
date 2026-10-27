/**
 * PaySwap Desktop (P21-A, ADR-0014 D6/D9) — the CONNECTION→CAPABILITY
 * BRIDGE battery (the derivation laws): the host-side bridge that
 * converts each ACTIVE connection + its probe evidence into capability
 * instances + observations feeding the gate environment.
 *
 * Machine-checks the D6/D9 derivation laws:
 * - INV-13 (catalogue never instance): the bridge derives ONLY from
 *   ACTIVE connections with CONFIRMED probe evidence — the REAL
 *   capability guard (imported at the test tier) still rejects a
 *   catalogue entry with CatalogueNotAuthorityError while ACCEPTING the
 *   bridge's derived instance (a structural mirror of
 *   ConnectedCapabilityInstance — never an advertisement).
 * - THE HONEST-EMPTY DEFAULT: zero ACTIVE connections → the honest
 *   empty gate environment, byte-identical (the current live truth
 *   stays the default; the declared-corridor composition lives in
 *   test/payswap/gate-environment-corridor.test.ts).
 * - F3: a Flutterwave probe proves balance-read ONLY — no send/transfer
 *   capability is derived (no CREATE_EXTERNAL_EFFECT scope), while the
 *   wallet OBSERVATION stays honest (the accounts are observed, never
 *   hidden).
 * - THE RESTRICTED-KEY LAW: a RESTRICTED_TEST Stripe key derives NO
 *   execution scope (the grant law — restricted keys never derive
 *   execution grants from the key alone).
 */

import { describe, expect, it } from "vitest";

import {
  assertConnectedInstance,
  isProviderCatalogueEntry,
  CatalogueNotAuthorityError,
} from "../../../capability/src/index.js";
import type { DesktopConnectionStatusView } from "../../src/host/payswap/connections/contracts.js";
import type { ProbeEvidenceRecord } from "../../src/host/payswap/connections/probe-evidence.js";
import {
  deriveConnectionCapabilityBridge,
} from "../../src/host/payswap/connections/capability-bridge.js";
import {
  createGateEnvironmentFromConnections,
} from "../../src/host/payswap/connections/gate-environment.js";
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

describe("the honest-empty default (zero ACTIVE connections — the current live truth stays)", () => {
  /** Field-wise identity with the honest-empty environment (the projection function compares by BEHAVIOR — closures never compare by reference). */
  function expectHonestEmpty(env: ReturnType<typeof createGateEnvironmentFromConnections>): void {
    const empty = createHonestEmptyGateEnvironment(NOW);
    expect(env.observedFundingSources).toEqual(empty.observedFundingSources);
    expect(env.observedDestinations).toEqual(empty.observedDestinations);
    expect(env.freshQuote).toBeUndefined();
    expect(env.declaredLimits).toBeUndefined();
    expect(env.connectedScopes).toEqual(empty.connectedScopes);
    expect(env.policyDecisions).toEqual(empty.policyDecisions);
    expect(env.now).toBe(empty.now);
    // The no-observation projection behaves identically (the typed
    // exclusion, verbatim — never a fabricated corridor fact).
    const query = {
      sourceCountry: "US",
      destinationCountry: "US",
      sourceCurrency: "USD",
      destinationCurrency: "USD",
      customerType: "PERSONAL" as const,
      sendAmount: { currency: "USD", minorUnits: "1500" },
      asOf: NOW,
    };
    expect(env.corridorProjection.projectCorridor(query)).toEqual(
      empty.corridorProjection.projectCorridor(query),
    );
  }

  it("zero connections → the honest empty gate environment, byte-identical", () => {
    const env = createGateEnvironmentFromConnections({ now: NOW, statuses: [], evidence: [] });
    expectHonestEmpty(env);
  });

  it("a non-ACTIVE connection derives NOTHING (PENDING_VERIFICATION with confirmed-shaped evidence stays empty)", () => {
    const env = createGateEnvironmentFromConnections({
      now: NOW,
      statuses: [status({ state: "PENDING_VERIFICATION" })],
      evidence: [evidence({})],
    });
    expectHonestEmpty(env);
  });

  it("an ACTIVE connection with NO confirmed probe evidence derives NOTHING (a catalogue-shaped record is never an instance)", () => {
    const env = createGateEnvironmentFromConnections({
      now: NOW,
      statuses: [status({})],
      evidence: [evidence({ outcome: "UNKNOWN" })],
    });
    expectHonestEmpty(env);
  });

  it("the derivation itself yields nothing without ACTIVE+CONFIRMED inputs (the bridge's own law, independent of the environment)", () => {
    expect(
      deriveConnectionCapabilityBridge({
        statuses: [status({ state: "PENDING_VERIFICATION" })],
        evidence: [evidence({})],
      }).instances,
    ).toHaveLength(0);
    expect(deriveConnectionCapabilityBridge({ statuses: [], evidence: [evidence({})] }).instances).toHaveLength(0);
  });
});

describe("the ACTIVE Stripe derivation (the probe evidence becomes real capability facts)", () => {
  const statuses = [status({})];
  const records = [evidence({})];

  it("derives the instance + observation + funding source + scope, all labeled PROVIDER_OBSERVATION", () => {
    const bridge = deriveConnectionCapabilityBridge({ statuses, evidence: records });
    expect(bridge.instances).toHaveLength(1);
    const instance = bridge.instances[0]!;
    expect(instance.connectionRef).toBe("conn:stripe-1");
    expect(instance.providerName).toBe("Stripe");
    expect(instance.evidenceTier).toBe("PROVIDER_OBSERVATION");
    expect(instance.accountRefs).toEqual(["acct_FAKE0001"]);
    expect(instance.operationClasses).toContain("CREATE_EXTERNAL_EFFECT");
    expect(instance.observedAt).toBe("2026-10-27T11:30:00.000Z");
    expect(instance.observationVersion).toBe(1);

    expect(bridge.observations).toHaveLength(1);
    const observation = bridge.observations[0]!;
    expect(observation.availability).toBe("AVAILABLE");
    expect(observation.probedOperation).toBe("stripe.balance.read + stripe.account.read");
    expect(observation.providerReferences).toEqual(["acct_FAKE0001", "balance"]);
    expect(observation.evidenceTier).toBe("PROVIDER_OBSERVATION");
    expect(observation.freshness.maxAgeSeconds).toBeGreaterThan(0);
    expect(observation.observedAt).toBe("2026-10-27T11:30:00.000Z");

    // The probed-account funding source (PROVIDER_OBSERVATION tier).
    const probed = bridge.fundingSources.find(
      (source) => source.displayName === "Stripe test account acct_FAKE0001",
    );
    expect(probed).toBeDefined();
    expect(probed!.locationRef).toBe("acct_FAKE0001");
    expect(probed!.currency).toBe("USD");
    expect(probed!.observationRef).toBe("probe:acct_FAKE0001");

    // The execution scope (the FULL_TEST grant derivation input).
    expect(bridge.connectedScopes).toHaveLength(1);
    expect(bridge.connectedScopes[0]!.connectedInstanceId).toBe("conn:stripe-1");
    expect(bridge.connectedScopes[0]!.providerName).toBe("Stripe");
    expect(bridge.connectedScopes[0]!.operationClasses).toContain("CREATE_EXTERNAL_EFFECT");
  });

  it("INV-13 stays machine-enforced: the REAL capability guard rejects a catalogue entry and accepts the bridge instance", () => {
    const bridge = deriveConnectionCapabilityBridge({ statuses, evidence: records });
    const instance = bridge.instances[0]! as unknown;
    // A provider catalogue entry is an ADVERTISEMENT and can never
    // authorize execution — the real typed guard still fires.
    const catalogueEntry = {
      catalogueEntryId: "cat:stripe-platform",
      providerName: "Stripe",
      providerVersion: "1.0.0",
      capabilityId: "cap:payment-intent",
      summary: "advertisement",
      advertisedScope: { platformWide: true, advertisedGeographies: ["US"], advertisedCurrencies: ["USD"] },
    };
    expect(isProviderCatalogueEntry(catalogueEntry)).toBe(true);
    expect(() => assertConnectedInstance(catalogueEntry)).toThrow(CatalogueNotAuthorityError);
    // The bridge's derived instance is NOT a catalogue entry, and the
    // real guard ACCEPTS it (a structurally complete instance — never
    // an advertisement).
    expect(isProviderCatalogueEntry(instance)).toBe(false);
    expect(() => assertConnectedInstance(instance)).not.toThrow();
  });

  it("the restricted-key law: a RESTRICTED_TEST key derives NO execution scope", () => {
    const bridge = deriveConnectionCapabilityBridge({
      statuses,
      evidence: [evidence({ keyClass: "RESTRICTED_TEST" })],
    });
    expect(bridge.instances[0]!.operationClasses).not.toContain("CREATE_EXTERNAL_EFFECT");
    expect(bridge.connectedScopes[0]!.operationClasses).not.toContain("CREATE_EXTERNAL_EFFECT");
  });
});

describe("the F3 law (a Flutterwave probe proves balance-read ONLY — never send capability)", () => {
  const flwStatuses = [
    status({
      connectionId: "conn:flw-1",
      providerId: "flutterwave",
      credentialKind: "API_KEY",
    }),
  ];
  const flwEvidence = [
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
  ];

  it("the FLW instance carries NO send/transfer capability (read-only scope, no execution classes)", () => {
    const bridge = deriveConnectionCapabilityBridge({ statuses: flwStatuses, evidence: flwEvidence });
    const instance = bridge.instances[0]!;
    expect(instance.providerName).toBe("Flutterwave");
    expect(instance.operationClasses).not.toContain("CREATE_EXTERNAL_EFFECT");
    expect(instance.operationClasses).not.toContain("CANCEL_OR_REVERSE_EFFECT");
    expect(bridge.connectedScopes[0]!.operationClasses).not.toContain("CREATE_EXTERNAL_EFFECT");
  });

  it("the wallet OBSERVATION stays honest (the accounts are observed, never hidden) with no send eligibility", () => {
    const bridge = deriveConnectionCapabilityBridge({ statuses: flwStatuses, evidence: flwEvidence });
    const ngn = bridge.fundingSources.find(
      (source) => source.displayName === "Flutterwave NGN wallet (test)",
    );
    expect(ngn).toBeDefined();
    expect(ngn!.currency).toBe("NGN");
    expect(ngn!.observationRef).toBe("probe:conn:flw-1:NGN");
    // No destinations and no scopes derive from an FLW-only world.
    expect(bridge.destinations).toHaveLength(0);
    expect(bridge.connectedScopes).toHaveLength(1);
  });
});
