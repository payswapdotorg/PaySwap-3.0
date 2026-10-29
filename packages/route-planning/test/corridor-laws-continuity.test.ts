import { describe, expect, it } from "vitest";
import {
  CorridorPlanLawError,
  corridorChainState,
  corridorDemandHopBound,
  corridorHopCount,
  corridorLegDispatchVerdict,
  assertCorridorLegDispatchPermitted,
} from "../src/index.ts";
import {
  PINNED_CORRIDOR_LEG_SKELETON,
} from "../src/pins/corridor.ts";

/**
 * P22-C (ADR-0016 D6/D11): the corridor plan-level laws, part 2 — the
 * CUSTODY-CONTINUITY law (a later leg NEVER dispatches after an earlier
 * leg's non-CONFIRMED outcome; legs never silently skip) + the HOP-BOUND
 * law (MOVE/CONVERT ride the corridor; PAY stays max-hops-1
 * byte-identically). Split from corridor-laws.test.ts under the 400-line
 * file law. Pure plan-level LAWS the H lane's composite dispatch runtime
 * implements against — nothing here dispatches, authorizes or executes
 * (the advisory-plan law).
 */

describe("the custody-continuity law (ADR-0016 D6 — a later leg NEVER dispatches after a non-CONFIRMED outcome)", () => {
  it("a leg dispatches when every earlier leg is CONFIRMED", () => {
    expect(corridorLegDispatchVerdict(2, ["CONFIRMED", "CONFIRMED"])).toEqual({
      permitted: true,
      legIndex: 2,
    });
  });

  it("an earlier UNKNOWN blocks (the mission goes OUTCOME_UNKNOWN, the attempt pending reconciliation)", () => {
    const verdict = corridorLegDispatchVerdict(1, ["UNKNOWN"]);
    expect(verdict.permitted).toBe(false);
    if (!verdict.permitted) {
      expect(verdict.block).toEqual({ blockingLegIndex: 0, blockingOutcome: "UNKNOWN" });
      expect(verdict.reason).toContain("pending reconciliation");
    }
  });

  it("an earlier FAILED blocks (the mission stays open; the chain stops honestly)", () => {
    const verdict = corridorLegDispatchVerdict(3, ["CONFIRMED", "CONFIRMED", "FAILED"]);
    expect(verdict.permitted).toBe(false);
    if (!verdict.permitted) {
      expect(verdict.block).toEqual({ blockingLegIndex: 2, blockingOutcome: "FAILED" });
      expect(verdict.reason).toContain("the chain stops honestly");
    }
  });

  it("an UNRECORDED earlier leg blocks (legs never silently skip)", () => {
    const verdict = corridorLegDispatchVerdict(3, ["CONFIRMED", undefined, "CONFIRMED"]);
    expect(verdict.permitted).toBe(false);
    if (!verdict.permitted) {
      expect(verdict.block).toEqual({ blockingLegIndex: 1, blockingOutcome: "UNRECORDED" });
      expect(verdict.reason).toContain("never silently skip");
    }
  });

  it("the FIRST blocking leg is named (the lowest index — never a vague refusal)", () => {
    const verdict = corridorLegDispatchVerdict(3, ["FAILED", "UNKNOWN", "CONFIRMED"]);
    expect(verdict.permitted).toBe(false);
    if (!verdict.permitted) {
      expect(verdict.block.blockingLegIndex).toBe(0);
    }
  });

  it("the leg-index domain is [1, 3] and the outcome vector is index-aligned (typed domain errors)", () => {
    expect(() => corridorLegDispatchVerdict(0, [])).toThrow(CorridorPlanLawError);
    expect(() => corridorLegDispatchVerdict(4, [])).toThrow(/leg index in \[1, 3\]/);
    expect(() => corridorLegDispatchVerdict(2, ["CONFIRMED"])).toThrow(
      /requires exactly 2 prior leg outcomes/,
    );
  });

  it("a foreign outcome value is a typed refusal (the outcome vocabulary is closed)", () => {
    expect(() => corridorLegDispatchVerdict(1, ["CONFIRMED-ish" as never])).toThrow(
      /not one of the pinned corridor leg outcomes/,
    );
  });

  it("the THROWING form: a refused dispatch is the typed CorridorPlanLawError", () => {
    expect(() => assertCorridorLegDispatchPermitted(1, ["FAILED"])).toThrow(CorridorPlanLawError);
    expect(() => assertCorridorLegDispatchPermitted(1, ["FAILED"])).toThrow(
      /dispatch refused: leg 0's outcome is FAILED/,
    );
    expect(() => assertCorridorLegDispatchPermitted(1, ["CONFIRMED"])).not.toThrow();
  });

  it("the whole-chain states: ALL_LEGS_CONFIRMED, STOPPED_AFTER_LEG, PENDING at the next leg", () => {
    expect(corridorChainState(["CONFIRMED", "CONFIRMED", "CONFIRMED", "CONFIRMED"])).toEqual({
      state: "ALL_LEGS_CONFIRMED",
    });
    expect(corridorChainState(["CONFIRMED", "UNKNOWN", undefined, undefined])).toEqual({
      state: "STOPPED_AFTER_LEG",
      legIndex: 1,
      outcome: "UNKNOWN",
    });
    expect(corridorChainState(["CONFIRMED", "FAILED", undefined, undefined])).toEqual({
      state: "STOPPED_AFTER_LEG",
      legIndex: 1,
      outcome: "FAILED",
    });
    expect(corridorChainState(["CONFIRMED", "CONFIRMED", undefined, undefined])).toEqual({
      state: "PENDING",
      nextLegIndex: 2,
    });
  });

  it("a vector recording ANYTHING after a non-CONFIRMED leg is a typed violation (a dispatched past a stopped chain)", () => {
    expect(() => corridorChainState(["CONFIRMED", "FAILED", "CONFIRMED", undefined])).toThrow(
      /never silently skip/,
    );
    expect(() => corridorChainState(["CONFIRMED", "UNKNOWN", undefined, "FAILED"])).toThrow(
      CorridorPlanLawError,
    );
    expect(() => corridorChainState(["CONFIRMED"])).toThrow(/exactly 4 entries/);
  });
});

// ---------------------------------------------------------------------------
// The hop-bound law (D11)
// ---------------------------------------------------------------------------

describe("the hop-bound law (ADR-0016 D11 — MOVE/CONVERT ride; PAY stays max-hops-1)", () => {
  it("a MOVE/CONVERT demand with a satisfying hop bound rides the corridor", () => {
    for (const direction of ["MOVE", "CONVERT"] as const) {
      expect(corridorDemandHopBound(direction, 4)).toEqual({
        permitted: true,
        direction,
        hopCount: 4,
      });
      expect(corridorDemandHopBound(direction, 8).permitted).toBe(true);
    }
  });

  it("a PAY-classed demand NEVER silently widens onto the corridor (max-hops-1 byte-identical)", () => {
    const verdict = corridorDemandHopBound("PAY", 4);
    expect(verdict.permitted).toBe(false);
    if (!verdict.permitted) {
      expect(verdict.reason).toContain("DIRECT_PAYMENT_MAX_ROUTE_HOPS = 1");
      expect(verdict.reason).toContain("never silently widens onto the corridor");
    }
  });

  it("a RECEIVE-classed demand is the counterparty's view, never the corridor ask", () => {
    const verdict = corridorDemandHopBound("RECEIVE", 4);
    expect(verdict.permitted).toBe(false);
    if (!verdict.permitted) {
      expect(verdict.reason).toContain("MOVE/CONVERT direction classes only");
    }
  });

  it("an out-of-vocabulary direction class is refused (the vocabulary is closed)", () => {
    const verdict = corridorDemandHopBound("SEND", 4);
    expect(verdict.permitted).toBe(false);
    if (!verdict.permitted) {
      expect(verdict.reason).toContain("vocabulary is closed");
    }
  });

  it("the corridor's four-leg hop count must satisfy the intent's maxRouteHops constraint", () => {
    const verdict = corridorDemandHopBound("MOVE", 3);
    expect(verdict.permitted).toBe(false);
    if (!verdict.permitted) {
      expect(verdict.reason).toContain("hop count (4 legs) exceeds the intent's maxRouteHops constraint (3)");
    }
  });

  it("a malformed maxRouteHops constraint is refused (the canonical 1..max surface)", () => {
    expect(corridorDemandHopBound("MOVE", 0).permitted).toBe(false);
    expect(corridorDemandHopBound("MOVE", 9).permitted).toBe(false);
    expect(corridorDemandHopBound("MOVE", 4.5).permitted).toBe(false);
    expect(corridorDemandHopBound("MOVE", "four").permitted).toBe(false);
  });
});
