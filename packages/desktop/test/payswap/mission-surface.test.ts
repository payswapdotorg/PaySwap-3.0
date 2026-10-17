/**
 * Mission-surface composition laws (P7-W2): the mission board fold composes
 * the pinned outcome registry over deployment facts with honest
 * dispatchability, the no-dead-buttons affordance law, and the honest
 * empty state.
 */

import { describe, expect, it } from "vitest";

import { foldDesktopMissionBoard } from "../../src/host/payswap/index.js";
import type { PaySwapDesktopDeploymentFacts } from "../../src/host/payswap/index.js";

const FULLY_CONFIGURED: PaySwapDesktopDeploymentFacts = {
  economicIntakeConfigured: true,
  capabilityObservationsAvailable: true,
  merchantCheckoutContextBound: true,
  providerObservationsAvailable: true,
  delegationPlaneReachable: true,
};

const NOTHING_CONFIGURED: PaySwapDesktopDeploymentFacts = {
  economicIntakeConfigured: false,
  capabilityObservationsAvailable: false,
  merchantCheckoutContextBound: false,
  providerObservationsAvailable: false,
  delegationPlaneReachable: false,
};

describe("mission board composition laws (P7-W2)", () => {
  it("folds all five pinned outcome actions in the pinned registry order", () => {
    const board = foldDesktopMissionBoard(FULLY_CONFIGURED);
    expect(board.rows.map((row) => row.actionId)).toEqual([
      "pay",
      "receive",
      "move",
      "convert",
      "checkout",
    ]);
  });

  it("every row carries an affordance (no dead buttons: DELEGATE_JOURNEY or the typed prerequisite)", () => {
    for (const facts of [FULLY_CONFIGURED, NOTHING_CONFIGURED]) {
      const board = foldDesktopMissionBoard(facts);
      for (const row of board.rows) {
        if (row.affordance.kind === "DELEGATE_JOURNEY") {
          expect(row.affordance.journeyId.length).toBeGreaterThan(0);
          expect(row.capability.dispatchable).toBe(true);
        } else {
          expect(row.affordance.missingPrerequisite.length).toBeGreaterThan(40);
        }
      }
    }
  });

  it("honest dispatchability: pay/receive/move fold the economic intake plane; convert folds observations; checkout folds the merchant plane", () => {
    const intakeOnly: PaySwapDesktopDeploymentFacts = {
      ...FULLY_CONFIGURED,
      capabilityObservationsAvailable: false,
      merchantCheckoutContextBound: false,
    };
    const board = foldDesktopMissionBoard(intakeOnly);
    const byId = new Map(board.rows.map((row) => [row.actionId, row] as const));
    expect(byId.get("pay")?.capability.dispatchable).toBe(true);
    expect(byId.get("receive")?.capability.dispatchable).toBe(true);
    expect(byId.get("move")?.capability.dispatchable).toBe(true);
    expect(byId.get("convert")?.capability.dispatchable).toBe(false);
    expect(byId.get("convert")?.capability.missingPrerequisite).toContain(
      "capability observations",
    );
    expect(byId.get("checkout")?.capability.dispatchable).toBe(false);
    expect(byId.get("checkout")?.capability.missingPrerequisite).toContain("P5-W3");
  });

  it("the delegation-plane prerequisite is honest: configured authority without a reachable delegation plane renders UNAVAILABLE with the typed reason", () => {
    const unreachable: PaySwapDesktopDeploymentFacts = {
      ...FULLY_CONFIGURED,
      delegationPlaneReachable: false,
    };
    const board = foldDesktopMissionBoard(unreachable);
    for (const row of board.rows) {
      expect(row.capability.dispatchable).toBe(true);
      expect(row.affordance.kind).toBe("UNAVAILABLE");
      if (row.affordance.kind === "UNAVAILABLE") {
        expect(row.affordance.missingPrerequisite).toContain("delegation plane");
      }
    }
  });

  it("the honest empty state: no provider observations renders the designed empty-state note, never an exception", () => {
    const empty = foldDesktopMissionBoard(NOTHING_CONFIGURED);
    expect(empty.emptyStateNote).toBeDefined();
    expect(empty.emptyStateNote).toContain("No provider observations");
    const observed = foldDesktopMissionBoard(FULLY_CONFIGURED);
    expect(observed.emptyStateNote).toBeUndefined();
  });

  it("pure fold: same facts, same board (deterministic; no clock, no environment)", () => {
    expect(foldDesktopMissionBoard(NOTHING_CONFIGURED)).toEqual(
      foldDesktopMissionBoard(NOTHING_CONFIGURED),
    );
  });

  it("every view carries the desktop pin provenance (versioned, canonical)", () => {
    const board = foldDesktopMissionBoard(FULLY_CONFIGURED);
    expect(board.pin.pinSetVersion).toBe("1.0.0");
    expect(board.pin.sourceCommit).toBe("2999bbb1658443b72ce9644f32cabbebdbecaa37");
    expect(board.pin.workOrder).toBe("P7-W2");
  });
});
