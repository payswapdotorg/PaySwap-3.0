/**
 * EconomicGoal validation tests (P1-W1, NET-NEW per GAP-01 — the old
 * repository has NO EconomicGoal implementation or tests, only spec text;
 * the fail-closed discipline is the ported old intent law).
 *
 * Laws: exact 12-field key set; bounded legible objective; closed archetype
 * vocabulary with no duplicates; bounded ordered outcomes, each satisfying
 * an allowed archetype; bounded constraints; strict time bounds; recourse
 * cross-field law; non-empty bounded proof list with closed kind vocabulary
 * and no duplicate kinds; NON-goals well-formed and duplicate-free;
 * versioned economic inputs valid; opaque authorization lineage ref
 * present. Everything frozen. Advisory demand only.
 */

import { describe, expect, it } from "vitest";
import {
  ECONOMIC_GOAL_KEYS,
  InvalidEconomicGoalError,
  validateEconomicGoal,
  validateGoalTimeBounds,
} from "../src/index.ts";
import {
  movementGoal,
  paymentGoal,
  serviceGoal,
  multiOutcomeGoal,
  quoteInput,
  corridorInput,
} from "./fixtures.ts";

function expectReject(candidate: unknown, message: RegExp): void {
  expect(() => validateEconomicGoal(candidate)).toThrow(InvalidEconomicGoalError);
  expect(() => validateEconomicGoal(candidate)).toThrow(message);
}

describe("EconomicGoal validation (fail closed, never repairs)", () => {
  it("rejects null, undefined and non-object candidates", () => {
    expectReject(null, /an EconomicGoal is required/);
    expectReject(undefined, /an EconomicGoal is required/);
    expectReject("goal", /an EconomicGoal is required/);
    expect(() => validateEconomicGoal([])).toThrow(InvalidEconomicGoalError);
  });

  it("rejects unknown fields (closed 12-field key set)", () => {
    expectReject({ ...movementGoal(), secretField: "x" }, /must carry exactly the fields/);
    expectReject({ ...movementGoal(), rail: "SEPA" }, /must carry exactly the fields/);
  });

  it("rejects empty or over-long objectives (bounded legibility)", () => {
    expectReject({ ...movementGoal(), objective: "" }, /objective/);
    expectReject({ ...movementGoal(), objective: "x".repeat(4097) }, /at most 4096/);
  });

  it("rejects empty, duplicate or unknown archetypes (closed vocabulary)", () => {
    expectReject({ ...movementGoal(), allowedArchetypes: [] }, /allowedArchetypes must not be empty/);
    expectReject(
      { ...movementGoal(), allowedArchetypes: ["MONEY_MOVEMENT", "MONEY_MOVEMENT"] },
      /duplicates/,
    );
    expectReject(
      { ...movementGoal(), allowedArchetypes: ["MONEY_ROUTING"] },
      /not one of \[MONEY_MOVEMENT, PAYMENT, SERVICE_ACCESS\]/,
    );
  });

  it("rejects empty or over-long outcome lists (bounded: a recurring demand is a program)", () => {
    const outcome = movementGoal().outcomes[0]!;
    expectReject({ ...movementGoal(), outcomes: [] }, /outcomes must not be empty/);
    expectReject(
      { ...movementGoal(), outcomes: Array.from({ length: 9 }, () => outcome) },
      /at most 8 entries/,
    );
  });

  it("rejects outcomes whose kind is not satisfied by any allowed archetype", () => {
    // A bare movement does not satisfy a PAYMENT-only goal.
    expectReject(
      { ...movementGoal(), allowedArchetypes: ["PAYMENT"] },
      /outcomes\[0\]\.kind 'MONEY_MOVEMENT' is not satisfied/,
    );
    // A service outcome does not satisfy a movement-only goal.
    expectReject(
      { ...movementGoal(), allowedArchetypes: ["MONEY_MOVEMENT"], outcomes: serviceGoal().outcomes },
      /outcomes\[0\]\.kind 'SERVICE_ACCESS' is not satisfied/,
    );
  });

  it("accepts a PAYMENT outcome under a MONEY_MOVEMENT-allowing goal (specialization satisfies)", () => {
    const goal = validateEconomicGoal({
      ...movementGoal(),
      allowedArchetypes: ["MONEY_MOVEMENT"],
      outcomes: paymentGoal().outcomes,
    });
    expect(goal.outcomes[0]!.kind).toBe("PAYMENT");
  });

  it("rejects malformed outcomes fail-closed (per-kind exact fields)", () => {
    expectReject(
      { ...movementGoal(), outcomes: [{ kind: "MONEY_MOVEMENT" }] },
      /outcomes\[0\] must carry exactly the fields/,
    );
    expectReject(
      {
        ...movementGoal(),
        outcomes: [{ kind: "MAGIC", demand: {} }],
      },
      /outcomes\[0\]\.kind must be one of/,
    );
    expectReject(
      {
        ...movementGoal(),
        outcomes: [
          { kind: "PAYMENT", demand: movementGoal().outcomes[0]!.demand },
        ],
      },
      /commerceRef/,
    );
    expectReject(
      {
        ...movementGoal(),
        outcomes: [
          {
            kind: "SERVICE_ACCESS",
            demand: { serviceRef: "s", beneficiaryRef: "b", fundingRef: "f" },
          },
        ],
        allowedArchetypes: ["SERVICE_ACCESS"],
      },
      /exactly the fields/,
    );
  });

  it("rejects constraint and time-bound violations", () => {
    expectReject(
      { ...movementGoal(), constraints: { maxSettlementMs: 0, maxRouteHops: 4 } },
      /EconomicGoal\.constraints/,
    );
    expectReject(
      { ...movementGoal(), timeBounds: { declaredAt: 10, deadlineAt: 10 } },
      /deadlineAt must be strictly after declaredAt/,
    );
    expect(() =>
      validateGoalTimeBounds({ declaredAt: 10, deadlineAt: 11 }),
    ).not.toThrow();
  });

  it("recourse law: reversibility demands a policy statement", () => {
    expectReject(
      {
        ...movementGoal(),
        recourse: { requiresReversibility: true, minDisputeWindowMs: 1, policyStatement: "" },
      },
      /policyStatement must be stated when requiresReversibility is true/,
    );
    expectReject(
      {
        ...movementGoal(),
        recourse: { requiresReversibility: false, minDisputeWindowMs: -1, policyStatement: "p" },
      },
      /minDisputeWindowMs/,
    );
  });

  it("proof law: non-empty, closed kinds, no duplicates, bounded descriptions", () => {
    expectReject({ ...movementGoal(), proofs: [] }, /proofs must not be empty/);
    expectReject(
      { ...movementGoal(), proofs: [{ kind: "MAGIC_PROOF", description: "d" }] },
      /ProofRequirement\.kind must be one of/,
    );
    expectReject(
      {
        ...movementGoal(),
        proofs: [
          { kind: "RECEIPT", description: "a" },
          { kind: "RECEIPT", description: "b" },
        ],
      },
      /duplicate kinds/,
    );
    expectReject(
      { ...movementGoal(), proofs: [{ kind: "RECEIPT", description: "x".repeat(1025) }] },
      /at most 1024/,
    );
  });

  it("non-goal law: bounded, duplicate-free, well-formed (may be empty)", () => {
    expectReject({ ...movementGoal(), nonGoals: ["a", "a"] }, /nonGoals must not contain duplicates/);
    expectReject({ ...movementGoal(), nonGoals: "" }, /nonGoals must be an array/);
    const withNone = validateEconomicGoal({ ...movementGoal(), nonGoals: [] });
    expect(withNone.nonGoals).toEqual([]);
  });

  it("economic-input law: versioned envelope, canonical content, no exact duplicates", () => {
    expectReject(
      { ...movementGoal(), economicInputs: [quoteInput(), quoteInput()] },
      /must not contain exact duplicates/,
    );
    expectReject(
      {
        ...movementGoal(),
        economicInputs: [{ kind: "QUOTE", version: 1, sourceRef: "obs:q", content: "not json" }],
      },
      /content must be valid JSON text/,
    );
    expectReject(
      {
        ...movementGoal(),
        economicInputs: [
          { kind: "QUOTE", version: 1, sourceRef: "obs:q", content: '{"b":1,"a":2}' },
        ],
      },
      /must be CANONICAL JSON/,
    );
    expect(() =>
      validateEconomicGoal({ ...movementGoal(), economicInputs: [corridorInput()] }),
    ).not.toThrow();
  });

  it("accepts all fixture goals, frozen and value-faithful, with the exact 12-field key set", () => {
    for (const goal of [movementGoal(), paymentGoal(), serviceGoal(), multiOutcomeGoal()]) {
      const validated = validateEconomicGoal(goal);
      expect(validated).toEqual(goal);
      expect(Object.isFrozen(validated)).toBe(true);
      expect(Object.isFrozen(validated.outcomes[0])).toBe(true);
      expect(Object.keys(validated).sort()).toEqual([...ECONOMIC_GOAL_KEYS].sort());
      expect(Object.keys(validated)).toHaveLength(12);
    }
  });

  it("the goal carries authorization LINEAGE only — no authority vocabulary on the surface", () => {
    const serialized = JSON.stringify(validateEconomicGoal(movementGoal())).toLowerCase();
    for (const forbidden of ["\"approved\"", "\"mandate\":", "\"permission\"", "signature", "secret"]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });
});
