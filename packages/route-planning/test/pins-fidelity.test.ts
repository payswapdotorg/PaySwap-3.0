import { describe, expect, it } from "vitest";
import { MONEY_MOVEMENT_INTENT_KEYS, validateMoneyMovementIntent } from "../../economic/src/intent.ts";
import { PAYMENT_INTENT_KEYS, validatePaymentIntent } from "../../economic/src/payment-intent.ts";
import { LIMITS as ECONOMIC_LIMITS } from "../../economic/src/validate.ts";
import { EXECUTION_MODES } from "../../capability/src/execution-modes.ts";
import { CAPABILITY_STATES, SOURCE_AVAILABILITIES, type EffectiveAvailability } from "../../capability/src/availability.ts";
import { CORRIDOR_EXCLUSION_CODES, CORRIDOR_PROJECTION_VERSION } from "../../capability/src/corridor-types.ts";
import { ROUTE_SHAPE_IDS, ROUTE_PLAN_CANDIDATE_STATUSES } from "../../route-compiler/src/shapes.ts";
import { projectCorridor } from "../../capability/src/corridor.ts";
import type { CorridorView } from "../../capability/src/corridor-types.ts";
import {
  PINNED_MONEY_MOVEMENT_INTENT_KEYS,
  PINNED_PAYMENT_INTENT_KEYS,
  PINNED_MAX_ROUTE_HOPS,
  hasPinnedIntentKeySet,
  hasPinnedPaymentIntentKeySet,
} from "../src/pins/economic.ts";
import {
  PINNED_EXECUTION_MODES,
  PINNED_CAPABILITY_STATES,
  PINNED_SOURCE_AVAILABILITIES,
  PINNED_EFFECTIVE_AVAILABILITIES,
  PINNED_CORRIDOR_PROJECTION_VERSION,
  PINNED_STALE_OBSERVATION_CODE,
  PINNED_AUTHORIZATION_ACTIVE,
} from "../src/pins/capability.ts";
import type { PinnedCorridorView } from "../src/pins/capability.ts";
import { PINNED_ROUTE_SHAPE_IDS, PINNED_ROUTE_PLAN_CANDIDATE_STATUSES } from "../src/pins/route-compiler.ts";
import type { PinnedRouteShapeId, PinnedRoutePlanCandidateStatus } from "../src/pins/route-compiler.ts";
import { movementCorridorQuery, recipientCorridorRouteInput, senderCorridorRouteInput } from "./fixtures.ts";

/**
 * PIN FIDELITY (value pinning, never value imports): every pinned
 * vocabulary equals the REAL authority module's byte-identically, and
 * REAL authority values remain structurally assignable to every pin (a
 * pin can never widen an authority law). The real modules are imported
 * from the TEST tier only.
 */

describe("economic pins (authority: @payswap/economic)", () => {
  it("the 10-key movement vocabulary is byte-identical", () => {
    expect([...PINNED_MONEY_MOVEMENT_INTENT_KEYS]).toEqual([...MONEY_MOVEMENT_INTENT_KEYS]);
    expect(Object.isFrozen(PINNED_MONEY_MOVEMENT_INTENT_KEYS)).toBe(true);
  });

  it("the 11-key payment vocabulary is byte-identical in the authority's order", () => {
    expect([...PINNED_PAYMENT_INTENT_KEYS]).toEqual([...PAYMENT_INTENT_KEYS]);
    expect(PINNED_PAYMENT_INTENT_KEYS).toHaveLength(11);
    expect(PINNED_PAYMENT_INTENT_KEYS[10]).toBe("commerceRef");
  });

  it("the hop bound is the economic lane's LIMITS.maxRouteHops", () => {
    expect(PINNED_MAX_ROUTE_HOPS).toBe(ECONOMIC_LIMITS.maxRouteHops);
    expect(PINNED_MAX_ROUTE_HOPS).toBe(8);
  });

  it("a REAL validated movement intent satisfies the pinned key set (and vice versa)", () => {
    const real = validateMoneyMovementIntent({
      intentId: "intent:pins-fidelity:001",
      principalRef: "principal:pins-fidelity",
      origin: { locationRef: "fundsloc:pf-origin", currency: "ETH", observationRef: "obs:pf-origin" },
      destination: { locationRef: "fundsloc:pf-dest", currency: "EUR", observationRef: "obs:pf-dest" },
      originAmount: { currency: "ETH", minorUnits: "1000000" },
      arrivalCurrency: "EUR",
      constraints: { maxRouteHops: 4, maxSettlementMs: 600000 },
      intentAuthorizationRef: "authz:intent:pf-1",
      declaredAt: 1,
      expiresAt: 2,
    });
    expect(hasPinnedIntentKeySet(real)).toBe(true);
    expect(hasPinnedPaymentIntentKeySet(real)).toBe(false);
    expect(hasPinnedIntentKeySet({ intentId: "x" })).toBe(false);
    expect(hasPinnedIntentKeySet(null)).toBe(false);
    expect(hasPinnedIntentKeySet([1, 2])).toBe(false);
  });

  it("a REAL validated payment intent satisfies the pinned payment key set (the fail-closed split)", () => {
    const real = validatePaymentIntent({
      intentId: "intent:pins-fidelity:002",
      principalRef: "principal:pins-fidelity",
      origin: { locationRef: "fundsloc:pf-origin", currency: "ETH", observationRef: "obs:pf-origin" },
      destination: { locationRef: "fundsloc:pf-dest", currency: "EUR", observationRef: "obs:pf-dest" },
      originAmount: { currency: "ETH", minorUnits: "1000000" },
      arrivalCurrency: "EUR",
      constraints: { maxRouteHops: 4, maxSettlementMs: 600000 },
      intentAuthorizationRef: "authz:intent:pf-2",
      declaredAt: 1,
      expiresAt: 2,
      commerceRef: "checkout:pf-order-1",
    });
    expect(hasPinnedPaymentIntentKeySet(real)).toBe(true);
    expect(hasPinnedIntentKeySet(real)).toBe(false);
    expect(hasPinnedPaymentIntentKeySet({ nope: true })).toBe(false);
  });
});

describe("capability pins (authority: @payswap/capability)", () => {
  it("the execution-mode vocabulary is byte-identical (INV-15: no priority)", () => {
    expect([...PINNED_EXECUTION_MODES]).toEqual([...EXECUTION_MODES]);
    expect(PINNED_EXECUTION_MODES[0]).toBe("PASS_THROUGH_NATIVE");
  });

  it("the two-axis availability vocabularies are byte-identical", () => {
    expect([...PINNED_CAPABILITY_STATES]).toEqual([...CAPABILITY_STATES]);
    expect([...PINNED_SOURCE_AVAILABILITIES]).toEqual([...SOURCE_AVAILABILITIES]);
    const effectiveMembers: readonly EffectiveAvailability[] = [...PINNED_EFFECTIVE_AVAILABILITIES];
    expect(effectiveMembers).toEqual(["AVAILABLE", "DEGRADED", "UNAVAILABLE", "UNKNOWN"]);
  });

  it("the corridor projection version and the consulted exclusion codes are byte-identical members", () => {
    expect(PINNED_CORRIDOR_PROJECTION_VERSION).toBe(CORRIDOR_PROJECTION_VERSION);
    expect([...CORRIDOR_EXCLUSION_CODES]).toContain(PINNED_STALE_OBSERVATION_CODE);
    expect(PINNED_STALE_OBSERVATION_CODE).toBe("STALE_OBSERVATION");
    expect(PINNED_AUTHORIZATION_ACTIVE).toBe("ACTIVE");
  });

  it("a REAL corridor view remains structurally assignable to the pinned view (subset law)", () => {
    const realView: CorridorView = projectCorridor({
      routes: [senderCorridorRouteInput(), recipientCorridorRouteInput()],
      query: movementCorridorQuery(),
      freshnessPolicy: { maxAgeSeconds: 3600 },
    });
    const pinned: PinnedCorridorView = realView;
    expect(pinned.projectionVersion).toBe(PINNED_CORRIDOR_PROJECTION_VERSION);
    expect(pinned.routes).toHaveLength(2);
    expect(pinned.eligibleRoutes).toHaveLength(2);
    expect(pinned.routes.every((route) => route.eligible)).toBe(true);
  });
});

describe("route-compiler pins (authority: @payswap/route-compiler)", () => {
  it("the ten-shape vocabulary is byte-identical in the authority's order", () => {
    expect([...PINNED_ROUTE_SHAPE_IDS]).toEqual([...ROUTE_SHAPE_IDS]);
    // DISCLOSED RE-PIN (P22-C, ADR-0016 D5): the authority's frozen shape
    // vocabulary grew its TENTH member — `cross-provider-corridor` — and
    // this pin mirrors it byte-identically (the pin-fidelity law).
    expect(PINNED_ROUTE_SHAPE_IDS).toHaveLength(10);
    expect(Object.isFrozen(PINNED_ROUTE_SHAPE_IDS)).toBe(true);
    const shapes: readonly PinnedRouteShapeId[] = [...ROUTE_SHAPE_IDS];
    expect(shapes).toHaveLength(10);
    expect(shapes).toContain("cross-provider-corridor");
  });

  it("the candidate-status vocabulary is byte-identical", () => {
    expect([...PINNED_ROUTE_PLAN_CANDIDATE_STATUSES]).toEqual([...ROUTE_PLAN_CANDIDATE_STATUSES]);
    const statuses: readonly PinnedRoutePlanCandidateStatus[] = [...ROUTE_PLAN_CANDIDATE_STATUSES];
    expect(statuses).toContain("EXECUTABLE_CANDIDATE");
    expect(statuses).toContain("PROVIDER_NATIVE_BASELINE");
    expect(statuses).toContain("INELIGIBLE_CANDIDATE");
    expect(statuses).toContain("NOT_COMPARABLE");
  });
});
