/**
 * PaySwap Desktop (P21-D Gap A, ADR-0014 D6/D8/D12) — the
 * CHAIN-FROM-BRIDGE derivation battery: the host-side conversion of the
 * connection→capability bridge's instances into the four-layer corridor
 * route chains the route-planning engine's stages 2/3 consume — the
 * named follow-on from the 147-a bridge battery (the PRODUCT path now
 * derives the corridor chains from the REAL bridge; the test tier stops
 * substituting the P21-C fixtures).
 *
 * Machine-checks the derivation laws (the work order's own list):
 * - FAIL-CLOSED: an empty bridge derives the empty chain set; an
 *   unknown provider or an unknown (provider, keyClass) combination
 *   derives NO chain — never a guessed definition.
 * - THE GRANT LAW (never widened): flutterwave/paystack (READ_ONLY_TEST)
 *   and stripe RESTRICTED_TEST chains carry the honest read-only
 *   NON-executable definition with the exact read-only reason; ONLY a
 *   stripe FULL_TEST chain carries the sandbox-executable definition
 *   (CREATE_EXTERNAL_EFFECT, the execution state machine, idempotency,
 *   compensation).
 * - THE REAL VALIDATORS: every derived chain's four layers pass the
 *   REAL capability validators (validateCapabilityDefinition /
 *   validateProviderImplementation / validateConnectedCapabilityInstance
 *   / validateCapabilityObservation) AND the REAL corridor projection
 *   (projectCorridor + evaluateCorridorRoute) AND route-planning's own
 *   deriveRailSnapshotPair through the engine adapter's realCorridorPort
 *   (the EXACT path the product engine runs at stages 2/3).
 * - IDS ALIGN BY CONSTRUCTION: the chain's instance/definition/
 *   implementation ids align with the bridge instance's OWN ids (never
 *   id surgery against the P21-C fixtures).
 * - DETERMINISM: the same bridge twice → deep-equal chains.
 * - THE WIRE LAW: no secret material anywhere in the derived chains
 *   (the credential scope carries the OPAQUE connection reference only).
 */

import { describe, expect, it } from "vitest";

import type { DesktopConnectionStatusView } from "../../src/host/payswap/connections/contracts.js";
import type { ProbeEvidenceRecord } from "../../src/host/payswap/connections/probe-evidence.js";
import {
  deriveConnectionCapabilityBridge,
  type BridgeDerivation,
} from "../../src/host/payswap/connections/capability-bridge.js";
import {
  chainsFromBridge,
} from "../../src/host/payswap/connections/chain-from-bridge.js";
// The REAL capability + route-planning machinery (the test-tier alias
// triplet — the connections-bridge battery's own pattern).
import {
  evaluateCorridorRoute,
  projectCorridor,
  validateCapabilityDefinition,
  validateCapabilityObservation,
  validateConnectedCapabilityInstance,
  validateProviderImplementation,
} from "@payswap/capability";
import { deriveRailSnapshotPair } from "@payswap/route-planning";
import { realCorridorPort } from "../../src/renderer/src/routePlanningEngineAdapter.js";

const NOW = "2026-10-27T12:00:00.000Z";

/** A connection status view factory (the registry's own read-model shape). */
function status(overrides: Partial<DesktopConnectionStatusView>): DesktopConnectionStatusView {
  return {
    connectionId: "conn:stripe-full-1",
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

/** A probe-evidence record factory (the ledger's own shape). */
function evidence(overrides: Partial<ProbeEvidenceRecord>): ProbeEvidenceRecord {
  return {
    connectionId: "conn:stripe-full-1",
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

/** The four-provider bridge: FLW + Paystack read-only, Stripe RESTRICTED + FULL_TEST. */
function fourProviderBridge(): BridgeDerivation {
  return deriveConnectionCapabilityBridge({
    statuses: [
      status({
        connectionId: "conn:flw-1",
        providerId: "flutterwave",
        createdAt: "2026-10-27T10:01:00.000Z",
      }),
      status({
        connectionId: "conn:paystack-1",
        providerId: "paystack",
        createdAt: "2026-10-27T10:02:00.000Z",
      }),
      status({
        connectionId: "conn:stripe-restricted-1",
        providerId: "stripe",
        createdAt: "2026-10-27T10:03:00.000Z",
      }),
      status({
        connectionId: "conn:stripe-full-1",
        providerId: "stripe",
        createdAt: "2026-10-27T10:04:00.000Z",
      }),
    ],
    evidence: [
      evidence({
        connectionId: "conn:flw-1",
        providerId: "flutterwave",
        probedOperation: "flutterwave.balances.read",
        providerReferences: ["wallet:ngn", "wallet:kes"],
        accountRef: null,
        keyClass: "READ_ONLY_TEST",
        balanceCurrencies: ["NGN", "KES"],
        observedAt: "2026-10-27T11:31:00.000Z",
        observationVersion: 3,
      }),
      evidence({
        connectionId: "conn:paystack-1",
        providerId: "paystack",
        probedOperation: "paystack.transactions.read",
        providerReferences: ["transaction:list"],
        accountRef: null,
        keyClass: "READ_ONLY_TEST",
        balanceCurrencies: ["NGN"],
        observedAt: "2026-10-27T11:32:00.000Z",
        observationVersion: 2,
      }),
      evidence({
        connectionId: "conn:stripe-restricted-1",
        providerId: "stripe",
        keyClass: "RESTRICTED_TEST",
        providerReferences: ["acct_FAKE0002", "balance"],
        accountRef: "acct_FAKE0002",
        observedAt: "2026-10-27T11:33:00.000Z",
        observationVersion: 4,
      }),
      evidence({
        connectionId: "conn:stripe-full-1",
        providerId: "stripe",
        keyClass: "FULL_TEST",
        providerReferences: ["acct_FAKE0001", "balance"],
        accountRef: "acct_FAKE0001",
        observedAt: "2026-10-27T11:34:00.000Z",
        observationVersion: 5,
      }),
    ],
  });
}

/** The corridor query the engine's own adapter derives (the P21 corridor shape). */
function corridorQuery() {
  return {
    sourceCountry: "NG",
    destinationCountry: "US",
    sourceCurrency: "NGN",
    destinationCurrency: "USD",
    customerType: "PERSONAL" as const,
    sendAmount: { currency: "NGN", minorUnits: "50000000" },
    asOf: NOW,
  };
}

describe("the chain-from-bridge derivation laws (P21-D Gap A)", () => {
  it("an EMPTY bridge derives the honest EMPTY chain set (fail-closed, never a guessed chain)", () => {
    const empty = deriveConnectionCapabilityBridge({ statuses: [], evidence: [] });
    expect(chainsFromBridge(empty)).toEqual([]);
  });

  it("every bridge instance derives exactly one chain; the ids align BY CONSTRUCTION with the bridge's OWN ids", () => {
    const bridge = fourProviderBridge();
    expect(bridge.instances).toHaveLength(4);
    const chains = chainsFromBridge(bridge);
    expect(chains).toHaveLength(4);
    for (const chain of chains) {
      // The lineage law the REAL projection validates — aligned by
      // construction here (the definition catalog keys on the bridge
      // instance's own providerId, the implementation on its own
      // implementationId, the observation on its own instanceId).
      expect(chain.observation.instanceId).toBe(chain.instance.instanceId);
      expect(chain.instance.capabilityId).toBe(chain.definition.id);
      expect(chain.instance.implementationId).toBe(chain.implementation.implementationId);
      expect(chain.implementation.capabilityId).toBe(chain.definition.id);
      expect(chain.implementation.capabilityVersion).toBe(chain.definition.version);
      // The ids are the BRIDGE's own — never the P21-C fixtures' ids.
      expect(chain.instance.instanceId).toMatch(/^instance:conn:/);
      expect(chain.instance.capabilityId).toMatch(/^capability:connected-account:(stripe|flutterwave|paystack)$/);
      expect(chain.instance.implementationId).toMatch(/^implementation:https:(stripe|flutterwave|paystack)$/);
    }
  });

  it("THE GRANT LAW: FLW/Paystack/RESTRICTED-stripe chains are NON-executable with the exact read-only reason; ONLY the FULL_TEST stripe chain is executable", () => {
    const chains = chainsFromBridge(fourProviderBridge());
    const byInstance = new Map(chains.map((chain) => [chain.instance.connectionRef, chain]));
    const flw = byInstance.get("conn:flw-1")!;
    const paystack = byInstance.get("conn:paystack-1")!;
    const restricted = byInstance.get("conn:stripe-restricted-1")!;
    const fullTest = byInstance.get("conn:stripe-full-1")!;

    expect((flw.definition as { executable?: unknown }).executable).toBe(false);
    expect((flw.definition as { nonExecutableReason?: unknown }).nonExecutableReason).toBe(
      "flutterwave test-mode secret keys are read-only: no send operation exists in the capability model",
    );
    expect((paystack.definition as { executable?: unknown }).executable).toBe(false);
    expect((paystack.definition as { nonExecutableReason?: unknown }).nonExecutableReason).toBe(
      "paystack test-mode secret keys are read-only: no send operation exists in the capability model",
    );
    expect((restricted.definition as { executable?: unknown }).executable).toBe(false);
    expect((restricted.definition as { nonExecutableReason?: unknown }).nonExecutableReason).toBe(
      "stripe test-mode restricted keys never derive an execution grant from the key alone: restricted-key grants derive only from their declared scopes — no send operation exists in the capability model",
    );
    // ONLY the FULL_TEST stripe definition is executable — the SANDBOX
    // execution grant (CREATE_EXTERNAL_EFFECT, the execution state
    // machine, idempotency, compensation).
    expect((fullTest.definition as { executable?: unknown }).executable).toBe(true);
    const execution = (fullTest.definition as { execution?: Record<string, unknown> }).execution!;
    expect(execution.financialEffectClass).toBe("CONSEQUENTIAL_EXTERNAL_EFFECT");
    expect((execution.authorizationRequirements as Record<string, unknown>).requiredScopes).toEqual(["payments:write"]);
    expect((execution.idempotency as Record<string, unknown>).retryPolicy).toBe("NEVER_RETRY_AFTER_AMBIGUITY");
    expect((execution.compensation as Record<string, unknown>).refundable).toBe(true);
    const machine = execution.stateMachine as { initial: string; states: { name: string; isTerminal: boolean }[] };
    expect(machine.initial).toBe("CREATED");
    expect(machine.states.map((state) => state.name)).toEqual(["CREATED", "SETTLED"]);
    // The two-sided agreement (the 147-a law, now at the chain tier): the
    // bridge's own operation classes agree with the definition's grant.
    expect(flw.instance.operationClasses).not.toContain("CREATE_EXTERNAL_EFFECT");
    expect(restricted.instance.operationClasses).not.toContain("CREATE_EXTERNAL_EFFECT");
    expect(fullTest.instance.operationClasses).toContain("CREATE_EXTERNAL_EFFECT");
  });

  it("every derived chain passes the REAL capability validators (all four layers)", () => {
    for (const chain of chainsFromBridge(fourProviderBridge())) {
      expect(() => validateCapabilityDefinition(chain.definition)).not.toThrow();
      expect(() => validateProviderImplementation(chain.implementation)).not.toThrow();
      expect(() => validateConnectedCapabilityInstance(chain.instance)).not.toThrow();
      expect(() => validateCapabilityObservation(chain.observation)).not.toThrow();
    }
  });

  it("every derived chain passes the REAL corridor projection (projectCorridor + evaluateCorridorRoute) with the honest typed exclusions", () => {
    const chains = chainsFromBridge(fourProviderBridge());
    const query = corridorQuery();
    const freshnessPolicy = { maxAgeSeconds: 3600 };
    const view = projectCorridor({ routes: chains as never, query, freshnessPolicy });
    expect(view.routes).toHaveLength(4);
    expect(view.eligibleRoutes).toEqual([]);
    for (const route of view.routes) {
      const exclusions = evaluateCorridorRoute(
        chains.find((chain) => chain.instance.instanceId === route.routeId)! as never,
        query,
        freshnessPolicy,
      ).exclusions;
      expect(exclusions.length).toBeGreaterThan(0);
      // The bridge observes NO geography facts — every derived rail is
      // honestly geography-excluded (never a guessed country scope).
      expect(exclusions.some((exclusion) => exclusion.code === "INSTANCE_GEOGRAPHY_NOT_SERVED")).toBe(true);
    }
    // The read-only rails carry the typed non-executable exclusion; the
    // FULL_TEST stripe rail does NOT (its definition is executable).
    for (const route of view.routes) {
      const codes = route.exclusionReasons.map((exclusion) => exclusion.code);
      expect(codes.includes("NOT_EXECUTABLE_CAPABILITY")).toBe(route.routeId !== "instance:conn:stripe-full-1");
    }
  });

  it("the EXACT engine path: deriveRailSnapshotPair through the adapter's realCorridorPort derives the rails over the derived chains", () => {
    const chains = chainsFromBridge(fourProviderBridge());
    const query = corridorQuery();
    const pair = deriveRailSnapshotPair({
      sender: { side: "SENDER", query, freshnessPolicy: { maxAgeSeconds: 3600 }, chains: chains as never, corridorPort: realCorridorPort() },
      recipient: { side: "RECIPIENT", query, freshnessPolicy: { maxAgeSeconds: 3600 }, chains: chains as never, corridorPort: realCorridorPort() },
    });
    expect(pair.sender.rails).toHaveLength(4);
    expect(pair.recipient.rails).toHaveLength(4);
    expect(pair.sender.eligibleRouteIds).toEqual([]);
    expect(pair.recipient.eligibleRouteIds).toEqual([]);
    expect(pair.sender.railsPermitExecution).toBe(false);
    expect(pair.recipient.railsPermitExecution).toBe(false);
    // The snapshot records carry the bridge instances' own provider names
    // (the lineage surface the conditional derivation grounds on).
    expect(pair.sender.rails.some((rail) => rail.lineage.providerName === "Stripe")).toBe(true);
    expect(pair.recipient.rails.some((rail) => rail.lineage.providerName === "Flutterwave")).toBe(true);
  });

  it("the observation is freshness-stamped + versioned from the bridge's OWN evidence (the two-axis derivation)", () => {
    const chains = chainsFromBridge(fourProviderBridge());
    const flw = chains.find((chain) => chain.instance.connectionRef === "conn:flw-1")!;
    expect(flw.observation.instanceId).toBe("instance:conn:flw-1");
    expect(flw.observation.observedAt).toBe("2026-10-27T11:31:00.000Z");
    expect(flw.observation.observationVersion).toBe(3);
    expect(flw.observation.capabilityState).toBe("AVAILABLE");
    expect(flw.observation.sourceAvailability).toBe("REACHABLE");
    expect(flw.observation.availability).toBe("AVAILABLE");
    expect(flw.observation.eligibility).toBe("ELIGIBLE");
    expect(flw.observation.health).toEqual({ status: "HEALTHY", lastCheckedAt: "2026-10-27T11:31:00.000Z" });
    expect(flw.observation.provenance.providerName).toBe("Flutterwave");
    expect(flw.observation.provenance.source).toBe("PROVIDER_API");
    expect(flw.observation.provenance.capturedAt).toBe("2026-10-27T11:31:00.000Z");
  });

  it("the implementation derives from the bridge instance's OWN fields (corridors from its currencies, the pinned adapter ref)", () => {
    const chains = chainsFromBridge(fourProviderBridge());
    const flw = chains.find((chain) => chain.instance.connectionRef === "conn:flw-1")!;
    expect(flw.implementation.implementationId).toBe("implementation:https:flutterwave");
    expect(flw.implementation.providerName).toBe("Flutterwave");
    expect(flw.implementation.providerVersion).toBe("p21");
    expect(flw.implementation.adapterRef).toBe("adapter:flutterwave/balances@1");
    // The corridor scope claims ONLY the observed currencies — the bridge
    // observes no geography, so no country is ever claimed.
    expect(flw.implementation.corridors).toEqual([{ currencies: ["NGN", "KES"] }]);
    const stripe = chains.find((chain) => chain.instance.connectionRef === "conn:stripe-full-1")!;
    expect(stripe.implementation.adapterRef).toBe("adapter:stripe/payment-intent@1");
    expect(stripe.implementation.corridors).toEqual([{ currencies: ["USD"] }]);
  });

  it("DETERMINISM: the same bridge derives byte-identical chains (deep-equal, frozen)", () => {
    const bridge = fourProviderBridge();
    const first = chainsFromBridge(bridge);
    const second = chainsFromBridge(bridge);
    // bigint-aware serialization (the canonical bps cost component is a bigint).
    const serialize = (value: unknown) => JSON.stringify(value, (_, item) => (typeof item === "bigint" ? `${item}n` : item));
    expect(serialize(second)).toBe(serialize(first));
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("FAIL-CLOSED: an unknown provider or an unknown (provider, keyClass) combination derives NO chain (never a guessed definition)", () => {
    const base = deriveConnectionCapabilityBridge({
      statuses: [status({ connectionId: "conn:flw-1", providerId: "flutterwave", createdAt: "2026-10-27T10:01:00.000Z" })],
      evidence: [evidence({ connectionId: "conn:flw-1", providerId: "flutterwave", keyClass: "READ_ONLY_TEST", balanceCurrencies: ["NGN"] })],
    });
    expect(base.instances).toHaveLength(1);
    const handBuilt = (instance: Partial<BridgeDerivation["instances"][number]>): BridgeDerivation => ({
      instances: [{ ...base.instances[0]!, ...instance }],
      observations: [{ ...base.observations[0]!, instanceId: instance.instanceId ?? base.instances[0]!.instanceId }],
      fundingSources: [],
      destinations: [],
      connectedScopes: [],
    });
    // A FOREIGN provider id derives NO chain — the derivation never
    // guesses a definition for a provider outside the pinned catalog
    // (the bridge itself only derives the three probe providers).
    expect(chainsFromBridge(handBuilt({
      providerId: "wise" as never,
      instanceId: "instance:conn:wise-1",
      capabilityId: "capability:connected-account:wise",
      implementationId: "implementation:https:wise",
    }))).toEqual([]);
    // A key class OUTSIDE the pinned catalog (flutterwave FULL_TEST,
    // stripe READ_ONLY_TEST) derives NO chain — explicit, never a default.
    expect(chainsFromBridge(handBuilt({
      keyClass: "FULL_TEST" as never,
      configuration: { executionMode: "SANDBOX", keyClass: "FULL_TEST", transportId: "flutterwave-https" },
    }))).toEqual([]);
    const stripeReadOnly = deriveConnectionCapabilityBridge({
      statuses: [status({ connectionId: "conn:stripe-ro-1", createdAt: "2026-10-27T10:05:00.000Z" })],
      evidence: [evidence({ connectionId: "conn:stripe-ro-1", keyClass: "READ_ONLY_TEST" as never, balanceCurrencies: ["USD"] })],
    });
    expect(stripeReadOnly.instances).toHaveLength(1);
    expect(chainsFromBridge(stripeReadOnly)).toEqual([]);
  });

  it("THE WIRE LAW: the derived chains carry NO secret material (the credential scope is the OPAQUE connection reference)", () => {
    const chains = chainsFromBridge(fourProviderBridge());
    const serialized = JSON.stringify(chains, (_, item) => (typeof item === "bigint" ? `${item}n` : item));
    expect(serialized).not.toMatch(/sk_test_|sk_live_|FLWSECK|whsec_|Bearer /i);
    for (const chain of chains) {
      expect(chain.instance.credentialScope.credentialRef).toBe(chain.instance.connectionRef);
      expect(chain.instance.credentialScope.credentialKind).toBe("API_KEY");
    }
  });
});
