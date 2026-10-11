/**
 * Surface contract tests (P2-W3): PORTED/ADAPTED from
 * payswap.org@8a735bf packages/surface/test/surface-contract.test.ts (20
 * tests) — the money-display block (6 tests) moved to money-view.test.ts;
 * the remaining 14 are ported here. These are CONTRACT tests: they pin the
 * public surface shape, so an accidental breaking change fails here before
 * it fails a downstream consumer (INV-22).
 *
 * ADAPTATIONS (old -> PaySwap 3.0, evidence not authority):
 * - provenance workOrder P4-W4-002 -> P2-W3 (the canonical work order id).
 * - old dispatch commandTypes (old-repo @payswap/api certifications)
 *   retired -> the accepted P1-W1 intent vocabulary is asserted by value.
 * - old deployment facts (apiRuntimeConfigured etc.) -> canonical PaySwap
 *   authority-plane facts (economic intake / capability observations /
 *   merchant checkout plane).
 * - old researchCitations (old-repo Stripe UX corpus) -> canonical
 *   lawCitations (auditable paths in THIS repository).
 */

import { describe, expect, it } from "vitest";

import {
  OUTCOME_REGISTRY,
  SURFACE_API_VERSION,
  UNIVERSAL_AREAS,
  UNIVERSAL_AREA_IDS,
  outcomeActionById,
  outcomeCapabilityBoard,
  surfaceProvenance,
  universalAreaById,
} from "../src/index.ts";

describe("surface versioning contract", () => {
  it("exposes a semver surface version", () => {
    expect(SURFACE_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("tags provenance with the version and work order", () => {
    const p = surfaceProvenance("P2-W3");
    expect(p.surfaceApiVersion).toBe(SURFACE_API_VERSION);
    expect(p.workOrder).toBe("P2-W3");
    expect(p.stability).toBe("stable");
  });
});

describe("outcome registry contract", () => {
  it("carries exactly the five outcome actions in the work order's order", () => {
    expect(OUTCOME_REGISTRY.map((action) => action.id)).toEqual([
      "pay",
      "receive",
      "move",
      "convert",
      "checkout",
    ]);
  });

  it("every action has a real dispatch authority and provenance", () => {
    for (const action of OUTCOME_REGISTRY) {
      expect(action.outcomeLine.length).toBeGreaterThan(10);
      expect(action.advancedDisclosure.length).toBeGreaterThan(0);
      expect(
        ["economic-intent-plane", "quote-projection-plane", "merchant-checkout-plane"],
      ).toContain(action.dispatch.authority);
      expect(action.provenance.workOrder).toBe("P2-W3");
      expect(
        ["MoneyMovementIntent", "PaymentIntent", "ServiceAccessIntent"],
      ).toContain(action.dispatch.intentKind);
      expect(action.dispatch.topologyNote).toContain("Canonical path");
    }
  });

  it("pay/receive/move compile through the economic-intent plane (accepted P1-W1 vocabulary, by value)", () => {
    expect(outcomeActionById("pay").dispatch.intentKind).toBe("PaymentIntent");
    expect(outcomeActionById("receive").dispatch.intentKind).toBe("PaymentIntent");
    expect(outcomeActionById("move").dispatch.intentKind).toBe("MoneyMovementIntent");
    expect(outcomeActionById("convert").dispatch.intentKind).toBe("MoneyMovementIntent");
    expect(outcomeActionById("checkout").dispatch.intentKind).toBe("PaymentIntent");
  });

  it("unknown ids fail closed", () => {
    expect(() => outcomeActionById("borrow" as never)).toThrow();
  });
});

describe("outcome capability honesty (state machine)", () => {
  const nothing = {
    economicIntakeConfigured: false,
    capabilityObservationsAvailable: false,
    merchantCheckoutContextBound: false,
  };

  it("an empty deployment honestly reports every action as not dispatchable, with a typed prerequisite", () => {
    const board = outcomeCapabilityBoard(nothing);
    for (const { state } of board) {
      expect(state.dispatchable).toBe(false);
      expect(state.missingPrerequisite).toBeDefined();
      expect(state.missingPrerequisite?.length).toBeGreaterThan(20);
    }
  });

  it("pay becomes dispatchable ONLY with the economic intake plane configured", () => {
    expect(
      outcomeActionById("pay").capability({ ...nothing, economicIntakeConfigured: true }).dispatchable,
    ).toBe(true);
    expect(outcomeActionById("pay").capability(nothing).dispatchable).toBe(false);
  });

  it("convert is independent of the economic intake plane (quote-projection authority)", () => {
    const state = outcomeActionById("convert").capability({
      ...nothing,
      economicIntakeConfigured: true,
    });
    expect(state.dispatchable).toBe(false); // capability observations are the prerequisite, not the intake
  });

  it("checkout requires the merchant checkout plane, never the intake alone (P5-W3 pending is stated honestly)", () => {
    expect(
      outcomeActionById("checkout").capability({ ...nothing, economicIntakeConfigured: true })
        .dispatchable,
    ).toBe(false);
    expect(
      outcomeActionById("checkout").capability({ ...nothing, merchantCheckoutContextBound: true })
        .dispatchable,
    ).toBe(true);
    const honest = outcomeActionById("checkout").capability(nothing);
    expect(honest.missingPrerequisite).toContain("P5-W3");
  });
});

describe("universal areas contract", () => {
  it("carries exactly the eleven areas in the work order's order (the handoff product law)", () => {
    expect([...UNIVERSAL_AREA_IDS]).toEqual([
      "overview",
      "payments",
      "accounts",
      "activity",
      "opportunities",
      "connections",
      "capabilities",
      "security",
      "reports",
      "developers",
      "settings",
    ]);
    expect(UNIVERSAL_AREAS.length).toBe(11);
  });

  it("every area cites canonical law documents (auditable mapping)", () => {
    for (const area of UNIVERSAL_AREAS) {
      expect(area.lawCitations.length).toBeGreaterThan(0);
      for (const citation of area.lawCitations) {
        expect(citation).toMatch(/\.md($|#)/);
      }
    }
  });

  it("every area has a designed honest empty state with a real next action", () => {
    for (const area of UNIVERSAL_AREAS) {
      expect(area.emptyState.reason.length).toBeGreaterThan(20);
      expect(["route", "outcome"]).toContain(area.emptyState.nextAction.kind);
      expect(area.emptyState.nextAction.value.length).toBeGreaterThan(0);
    }
  });

  it("unknown area ids fail closed", () => {
    expect(() => universalAreaById("vault" as never)).toThrow();
  });
});
