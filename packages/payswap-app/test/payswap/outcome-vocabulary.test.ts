/**
 * @payswap/app — outcome vocabulary oracle (ADAPT of the P7-W1 share
 * of payswap.org@8a735bf packages/ux/test/outcome-vocabulary.test.ts,
 * MMP-35 behavioral oracle).
 *
 * The old suite's law: the EIGHT-state outcome vocabulary is exactly
 * `succeeded · processing · failed · refunded · partially_refunded ·
 * disputed · blocked · dropped` in contract order; ONLY failure states
 * render as failure; UNKNOWN-outcome NEVER renders as failure (it
 * projects to processing/dropped — never failed). The eight-state chip
 * vocabulary lives in the DESIGN LAYER (@zcode/ui/payswap state-tokens);
 * the five ACTION vocabulary lives in the pinned surface registry. This
 * oracle asserts both vocabularies and the projection law over the
 * canonical pinned vocabulary.
 */
import { describe, expect, it } from "vitest";
import {
  OUTCOME_STATES,
  stateLabel,
  stateBorderStyle,
} from "@zcode/ui/payswap";
import { OUTCOME_REGISTRY_MIRROR } from "../../src/lib/outcome-registry.js";
import { foldOutcomeBoard } from "../../src/lib/outcome-board.js";
import { HONEST_DEPLOYMENT_CONTEXT } from "../../src/contracts/harness.js";

describe("the eight-state chip vocabulary (design layer, contract order)", () => {
  it("is exactly the eight contract states, in contract order", () => {
    expect(OUTCOME_STATES).toEqual([
      "succeeded",
      "processing",
      "failed",
      "refunded",
      "partially_refunded",
      "disputed",
      "blocked",
      "dropped",
    ]);
  });

  it("every state carries a word label (words, never codes)", () => {
    for (const state of OUTCOME_STATES) {
      expect(stateLabel[state].length).toBeGreaterThan(0);
    }
    expect(stateLabel["partially_refunded"]).toBe("Partially refunded");
    expect(stateLabel.dropped).toBe("Dropped");
  });

  it("ONLY the failure states may render with failure semantics; UNKNOWN-outcome (dropped) never does", () => {
    // dropped = the unknown/timeout chip: amber outline, never red.
    expect(stateBorderStyle.dropped).toBe("solid");
    // processing (in-flight) is the only dashed chip — never final, never red.
    expect(OUTCOME_STATES.filter((s) => stateBorderStyle[s] === "dashed")).toEqual([
      "processing",
    ]);
  });
});

describe("the five-action vocabulary (the pinned surface registry)", () => {
  it("is exactly the five canonical outcome actions, in registry order", () => {
    expect(OUTCOME_REGISTRY_MIRROR.map((action) => action.id)).toEqual([
      "pay",
      "receive",
      "move",
      "convert",
      "checkout",
    ]);
  });

  it("every action carries a label, an outcome line, disclosures and a dispatch authority", () => {
    for (const action of OUTCOME_REGISTRY_MIRROR) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.outcomeLine.length).toBeGreaterThan(0);
      expect(action.advancedDisclosure.length).toBeGreaterThan(0);
      expect(["economic-intent-plane", "quote-projection-plane", "merchant-checkout-plane"])
        .toContain(action.dispatch.authority);
      expect(["MoneyMovementIntent", "PaymentIntent", "ServiceAccessIntent"]).toContain(
        action.dispatch.intentKind,
      );
    }
  });

  it("the board projects UNKNOWN-outcome facts without ever rendering failure", () => {
    const board = foldOutcomeBoard(HONEST_DEPLOYMENT_CONTEXT);
    // Nothing dispatchable: honest attention facts, never failure tones.
    expect(board.nothingDispatchable).toBe(true);
    for (const row of board.rows) {
      expect(row.capability.dispatchable).toBe(false);
      expect(row.capability.missingPrerequisite).toBeDefined();
    }
  });

  it("a configured deployment flips exactly the planes that are configured", () => {
    const board = foldOutcomeBoard({
      economicIntakeConfigured: true,
      capabilityObservationsAvailable: false,
      merchantCheckoutContextBound: false,
    });
    const byId = new Map(board.rows.map((row) => [row.actionId, row.capability.dispatchable]));
    expect(byId.get("pay")).toBe(true);
    expect(byId.get("receive")).toBe(true);
    expect(byId.get("move")).toBe(true);
    expect(byId.get("convert")).toBe(false); // needs capability observations
    expect(byId.get("checkout")).toBe(false); // needs the merchant plane
    expect(board.nothingDispatchable).toBe(false);
  });
});
