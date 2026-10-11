/**
 * Outcome-area alias tests (P2-W3): PORTED/ADAPTED from
 * payswap.org@8a735bf packages/surface/test/outcome-aliases.test.ts (11
 * tests). The old table reconciled the five actions onto @payswap/ux
 * command verbs + sidebar anchors (single OLD-product vocabularies); the
 * PaySwap 3.0 reconciliation maps onto the ELEVEN-AREA IA — the canonical
 * navigation vocabulary (mapped to the handoff's product law). Drift fails
 * here; the certified registry stays untouched (additive-only proof).
 */

import { describe, expect, it } from "vitest";

import {
  OUTCOME_AREA_ALIASES,
  OUTCOME_REGISTRY,
  UNIVERSAL_AREA_IDS,
  outcomeActionById,
  outcomeAreaAlias,
  outcomeCapabilityBoard,
} from "../src/index.ts";

describe("outcome-action aliases reconcile onto the areas navigation IA", () => {
  it("the REAL area registry equals the eleven-area IA (drift fails here)", () => {
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
  });

  it("covers exactly the five certified outcome actions", () => {
    expect(Object.keys(OUTCOME_AREA_ALIASES).sort()).toEqual(
      ["pay", "receive", "move", "convert", "checkout"].sort(),
    );
  });

  it("pay/receive live in the payments lane; move spans payments+accounts (work-order mapping)", () => {
    expect(OUTCOME_AREA_ALIASES.pay.navAreas).toEqual(["payments"]);
    expect(OUTCOME_AREA_ALIASES.receive.navAreas).toEqual(["payments"]);
    expect(OUTCOME_AREA_ALIASES.move.navAreas).toEqual(["payments", "accounts"]);
  });

  it("convert anchors on accounts+capabilities; checkout on payments+connections (the honest lane map)", () => {
    expect(OUTCOME_AREA_ALIASES.convert.navAreas).toEqual(["accounts", "capabilities"]);
    expect(OUTCOME_AREA_ALIASES.checkout.navAreas).toEqual(["payments", "connections"]);
  });

  it("every mapped nav area is a REAL area of the eleven-area IA (single navigation vocabulary, typed)", () => {
    for (const alias of Object.values(OUTCOME_AREA_ALIASES)) {
      expect(alias.navAreas.length).toBeGreaterThan(0);
      for (const area of alias.navAreas) {
        expect(UNIVERSAL_AREA_IDS).toContain(area);
      }
    }
  });

  it("no alias maps onto overview (overview is the home view, never an action lane)", () => {
    for (const alias of Object.values(OUTCOME_AREA_ALIASES)) {
      expect(alias.navAreas).not.toContain("overview");
    }
  });

  it("every alias carries an auditable note; lookups fail closed on unknown ids", () => {
    for (const alias of Object.values(OUTCOME_AREA_ALIASES)) {
      expect(alias.note.length).toBeGreaterThan(20);
      expect(alias.actionId).toBeDefined();
    }
    expect(() => outcomeAreaAlias("borrow" as never)).toThrow();
  });
});

describe("the certified outcome registry keeps its P2-W3 shape (additive-only)", () => {
  it("still carries exactly the five actions in the certified order", () => {
    expect(OUTCOME_REGISTRY.map((action) => action.id)).toEqual([
      "pay",
      "receive",
      "move",
      "convert",
      "checkout",
    ]);
  });

  it("the canonical dispatch intents are unchanged", () => {
    expect(outcomeActionById("pay").dispatch.intentKind).toBe("PaymentIntent");
    expect(outcomeActionById("receive").dispatch.intentKind).toBe("PaymentIntent");
    expect(outcomeActionById("move").dispatch.intentKind).toBe("MoneyMovementIntent");
  });

  it("the capability folds still work exactly as before (no alias leakage into the registry)", () => {
    const nothing = {
      economicIntakeConfigured: false,
      capabilityObservationsAvailable: false,
      merchantCheckoutContextBound: false,
    };
    const board = outcomeCapabilityBoard(nothing);
    expect(board).toHaveLength(5);
    for (const { state } of board) {
      expect(state.dispatchable).toBe(false);
      expect(state.missingPrerequisite).toBeDefined();
    }
    expect(
      outcomeActionById("pay").capability({ ...nothing, economicIntakeConfigured: true }).dispatchable,
    ).toBe(true);
  });

  it("the aliases add no fields to the OutcomeAction objects themselves", () => {
    for (const action of OUTCOME_REGISTRY) {
      expect(Object.keys(action).sort()).toEqual(
        [
          "advancedDisclosure",
          "capability",
          "dispatch",
          "id",
          "label",
          "outcomeLine",
          "provenance",
        ].sort(),
      );
    }
  });
});
