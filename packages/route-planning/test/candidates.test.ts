import { describe, expect, it } from "vitest";
import {
  enumerateRouteCandidates,
  mergedCorridorView,
  movementViewOfIntent,
  routePlanningPermitsExecution,
} from "../src/candidates.ts";
import type { RouteCandidateEnumerationInput } from "../src/candidates.ts";
import {
  CandidateEnumerationError,
  PortUnboundError,
} from "../src/errors.ts";
import { unboundRouteCompilationPort } from "../src/ports.ts";
import type { RouteCompilationPort } from "../src/ports.ts";
import type { PinnedRouteCompilationResult, PinnedRoutePlan, PinnedRouteShapeId } from "../src/pins/route-compiler.ts";
import {
  movementCorridorQuery,
  movementIntentFixture,
  NOW,
  paymentIntentFixture,
  realCorridorProjectionPort,
  recipientChain,
  senderChain,
} from "./fixtures.ts";
import {
  planningEvidenceBundle,
  realRouteCompilationPort,
} from "./compiler-evidence.ts";
import { deriveRailSnapshotPair } from "../src/rail-snapshot.ts";

/**
 * THE CANDIDATE-ENUMERATION LAWS (ROUTINE-CONTRACT stage 4): the REAL
 * compiler composed through the injected port over the merged corridor
 * view, the compiler's exclusions preserved VERBATIM, the enumeration
 * bounded by the count-based search budget with TRUE-count truncation
 * receipts, and the discovery tier NEVER permitting execution.
 */

function realPair() {
  return deriveRailSnapshotPair({
    sender: {
      side: "SENDER",
      query: movementCorridorQuery(),
      freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [senderChain()],
      corridorPort: realCorridorProjectionPort(),
    },
    recipient: {
      side: "RECIPIENT",
      query: movementCorridorQuery(),
      freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [recipientChain()],
      corridorPort: realCorridorProjectionPort(),
    },
  });
}

function enumerationInput(overrides?: Partial<RouteCandidateEnumerationInput>): RouteCandidateEnumerationInput {
  const pair = realPair();
  return {
    intent: movementIntentFixture(),
    at: NOW,
    senderSnapshot: pair.sender,
    recipientSnapshot: pair.recipient,
    corridorQuery: movementCorridorQuery(),
    evidence: planningEvidenceBundle(),
    budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
    compilationPort: realRouteCompilationPort(),
    ...overrides,
  };
}

describe("routePlanningPermitsExecution — THE DISCOVERY LAW", () => {
  it("is the literal false, never a derived value", () => {
    expect(routePlanningPermitsExecution()).toBe(false);
    expect(routePlanningPermitsExecution()).not.toBe(true);
  });
});

describe("movementViewOfIntent — the intent projection", () => {
  it("a movement intent passes through unchanged", () => {
    const intent = movementIntentFixture();
    expect(movementViewOfIntent(intent)).toBe(intent);
  });

  it("a payment intent projects onto the 10-key movement shape (commerceRef stripped)", () => {
    const payment = paymentIntentFixture();
    const movement = movementViewOfIntent(payment);
    expect(Object.keys(movement).sort()).toEqual([
      "arrivalCurrency",
      "constraints",
      "declaredAt",
      "destination",
      "expiresAt",
      "intentAuthorizationRef",
      "intentId",
      "origin",
      "originAmount",
      "principalRef",
    ]);
    expect(movement.intentId).toBe(payment.intentId);
    expect(Object.isFrozen(movement)).toBe(true);
  });

  it("prose or a malformed record NEVER constructs an enumeration (fail closed)", () => {
    expect(() => movementViewOfIntent("pay alice some money" as never)).toThrow(
      CandidateEnumerationError,
    );
    expect(() => movementViewOfIntent({ intentId: "x" } as never)).toThrow(
      CandidateEnumerationError,
    );
    expect(() => movementViewOfIntent(null as never)).toThrow(CandidateEnumerationError);
  });
});

describe("mergedCorridorView — the canonical merged view", () => {
  it("unions both snapshots' evaluations, deduplicated by routeId in canonical order", () => {
    const pair = realPair();
    const view = mergedCorridorView(pair.sender, pair.recipient, movementCorridorQuery());
    expect(view.projectionVersion).toBe("1.0.0");
    expect(view.routes).toHaveLength(2);
    const ids = view.routes.map((route) => route.routeId);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(2);
    expect(view.eligibleRoutes).toHaveLength(2);
    expect(Object.isFrozen(view)).toBe(true);
  });

  it("deduplicates by routeId: both sides seeing the same rail yields ONE route", () => {
    const pair = deriveRailSnapshotPair({
      sender: {
        side: "SENDER",
        query: movementCorridorQuery(),
        freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [senderChain()],
        corridorPort: realCorridorProjectionPort(),
      },
      recipient: {
        side: "RECIPIENT",
        query: movementCorridorQuery(),
        freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [senderChain()],
        corridorPort: realCorridorProjectionPort(),
      },
    });
    const view = mergedCorridorView(pair.sender, pair.recipient, movementCorridorQuery());
    expect(view.routes).toHaveLength(1);
  });
});

describe("enumerateRouteCandidates — the REAL compiler through the port", () => {
  it("compiles the movement corridor into bounded candidates with verbatim exclusions", () => {
    const enumeration = enumerateRouteCandidates(enumerationInput());
    expect(enumeration.compilerStatus).toBe("ROUTES_COMPILED");
    expect(enumeration.intentRef).toBe("intent:planning:001");
    expect(enumeration.compiledAt).toBe(NOW);
    expect(enumeration.candidates.length).toBeGreaterThan(0);
    expect(enumeration.candidates.length).toBeLessThanOrEqual(10);
    const planIds = enumeration.candidates.map((plan) => plan.planId);
    expect(planIds).toEqual([...planIds].sort());
    expect(enumeration.exclusions).toEqual([]);
    expect(enumeration.observationVersionPins.length).toBeGreaterThan(0);
    expect(
      enumeration.observationVersionPins.every((pin) =>
        pin.instanceId.length > 0 && pin.observationVersion >= 1 && pin.pinnedDigest.length > 0,
      ),
    ).toBe(true);
    expect(enumeration.budgetedSelection.coverage).toBe("COMPLETE");
    expect(enumeration.budgetedSelection.receipts).toEqual([]);
    expect(enumeration.compilationDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(enumeration.enumerationDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(enumeration.discoveryPermitsExecution).toBe(false);
    expect(Object.isFrozen(enumeration)).toBe(true);
  });

  it("the provider-native baseline is EMITTED like any candidate (INV-C08)", () => {
    const enumeration = enumerateRouteCandidates(enumerationInput());
    const baseline = enumeration.candidates.find((plan) => plan.isProviderNativeBaseline);
    expect(baseline).toBeDefined();
    expect(baseline?.candidateStatus).toBe("PROVIDER_NATIVE_BASELINE");
    expect(baseline?.shapeId).toBe("provider-native-offramp");
  });

  it("a payment intent enumerates IDENTICALLY to its movement projection", () => {
    const movement = enumerateRouteCandidates(enumerationInput());
    const payment = enumerateRouteCandidates(enumerationInput({ intent: paymentIntentFixture() }));
    expect(payment.enumerationDigest).toBe(movement.enumerationDigest);
    expect(payment.compilationDigest).toBe(movement.compilationDigest);
    expect(payment.candidates.map((plan) => plan.planId)).toEqual(
      movement.candidates.map((plan) => plan.planId),
    );
  });

  it("the snapshot digests are carried on the enumeration (provenance)", () => {
    const pair = realPair();
    const enumeration = enumerateRouteCandidates(enumerationInput({
      senderSnapshot: pair.sender,
      recipientSnapshot: pair.recipient,
    }));
    expect(enumeration.senderSnapshotDigest).toBe(pair.sender.snapshotDigest);
    expect(enumeration.recipientSnapshotDigest).toBe(pair.recipient.snapshotDigest);
  });

  it("byte-identical replays under identical inputs (determinism)", () => {
    const first = enumerateRouteCandidates(enumerationInput());
    const second = enumerateRouteCandidates(enumerationInput());
    expect(first.enumerationDigest).toBe(second.enumerationDigest);
    expect(first.compilationDigest).toBe(second.compilationDigest);
  });

  it("a different compile instant changes the enumeration digest", () => {
    const first = enumerateRouteCandidates(enumerationInput());
    const second = enumerateRouteCandidates(enumerationInput({ at: NOW + 1000 }));
    expect(first.enumerationDigest).not.toBe(second.enumerationDigest);
    expect(second.compiledAt).toBe(NOW + 1000);
  });
});

describe("the bounded-search composition (shape-level bounding)", () => {
  function fakePort(result: PinnedRouteCompilationResult): RouteCompilationPort {
    return { compile: () => result };
  }

  function planOf(planId: string, shapeId: PinnedRouteShapeId): PinnedRoutePlan {
    return {
      planId,
      shapeId,
      intentRef: "intent:planning:001",
      compositionClass: "COMPOSED",
      executionMode: "COMPOSED_PAYSWAP",
      isProviderNativeBaseline: false,
      candidateStatus: "EXECUTABLE_CANDIDATE",
      comparability: { comparable: true },
      ineligibilityReasons: [],
      legs: [],
      evidenceRefs: [],
      planDigest: `fnv1a64:${planId.length.toString(16).padStart(16, "0")}`,
      railCrossings: { crossings: 0, legs: [] },
      environmentClasses: [],
    };
  }

  it("the budget truncates compiled plans with TRUE pre-cut receipts", () => {
    const result: PinnedRouteCompilationResult = {
      status: "ROUTES_COMPILED",
      intentRef: "intent:planning:001",
      compiledAt: NOW,
      plans: [planOf("p1", "onchain-direct-transfer"), planOf("p2", "mixed-dex-bridge"), planOf("p3", "mixed-dex-offramp")],
      exclusions: [],
      observationVersionPins: [],
      discoveryPermitsExecution: false,
      compilationDigest: "fnv1a64:0000000000000001",
    };
    const enumeration = enumerateRouteCandidates(enumerationInput({
      budget: { maxCandidates: 2, maxShapes: 9, maxCandidatesPerShape: 9 },
      compilationPort: fakePort(result),
    }));
    expect(enumeration.candidates.map((plan) => plan.planId)).toEqual(["p1", "p2"]);
    expect(enumeration.budgetedSelection.coverage).toBe("TRUNCATED");
    expect(enumeration.budgetedSelection.receipts[0]?.actualCount).toBe(3);
    expect(enumeration.budgetedSelection.receipts[0]?.limit).toBe(2);
    expect(enumeration.exclusions).toEqual([]);
  });

  it("the compiler's ExcludedRouteShape list is preserved VERBATIM", () => {
    const result: PinnedRouteCompilationResult = {
      status: "NO_COMPILABLE_ROUTE",
      intentRef: "intent:planning:001",
      compiledAt: NOW,
      plans: [],
      exclusions: [
        { shapeId: "merchant-native-settlement", reasons: ["no merchant evidence grounds the shape", "second verbatim reason"] },
      ],
      observationVersionPins: [],
      discoveryPermitsExecution: false,
      compilationDigest: "fnv1a64:0000000000000002",
    };
    const enumeration = enumerateRouteCandidates(enumerationInput({ compilationPort: fakePort(result) }));
    expect(enumeration.compilerStatus).toBe("NO_COMPILABLE_ROUTE");
    expect(enumeration.candidates).toEqual([]);
    expect(enumeration.exclusions).toEqual(result.exclusions);
    expect(enumeration.exclusions[0]?.reasons).toHaveLength(2);
    expect(enumeration.budgetedSelection.coverage).toBe("COMPLETE");
  });
});

describe("fail-closed composition laws", () => {
  it("an unbound compilation port fails CLOSED naming stage-4 exactly", () => {
    let stage = "";
    try {
      enumerateRouteCandidates(enumerationInput({ compilationPort: unboundRouteCompilationPort() }));
      expect.unreachable("the unbound port must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage).toBe("stage-4:compile-available-routes");
  });

  it("a side snapshot grounded on a DIFFERENT corridor never composes", () => {
    const pair = realPair();
    const foreign = { ...movementCorridorQuery(), sourceCountry: "US" };
    expect(() =>
      enumerateRouteCandidates(enumerationInput({ corridorQuery: foreign })),
    ).toThrow(CandidateEnumerationError);
    const foreignSnapshot = {
      ...pair.sender,
      query: foreign,
    };
    expect(() =>
      enumerateRouteCandidates(enumerationInput({ senderSnapshot: foreignSnapshot })),
    ).toThrow(CandidateEnumerationError);
  });

  it("the enumeration requires the SENDER snapshot first and the RECIPIENT second", () => {
    const pair = realPair();
    expect(() =>
      enumerateRouteCandidates(enumerationInput({
        senderSnapshot: pair.recipient,
        recipientSnapshot: pair.sender,
      })),
    ).toThrow(CandidateEnumerationError);
  });

  it("the compile instant must be a caller-supplied non-negative integer (no ambient clock)", () => {
    expect(() => enumerateRouteCandidates(enumerationInput({ at: -1 }))).toThrow(
      CandidateEnumerationError,
    );
    expect(() => enumerateRouteCandidates(enumerationInput({ at: 1.5 }))).toThrow(
      CandidateEnumerationError,
    );
  });

  it("a malformed budget fails closed before any compilation", () => {
    expect(() =>
      enumerateRouteCandidates(enumerationInput({ budget: { maxCandidates: 0, maxShapes: 1, maxCandidatesPerShape: 1 } })),
    ).toThrow();
  });
});
