/**
 * EconomicProgram tests (P1-W1, net-new): the recurring/parameterized goal
 * envelope. Laws: valid embedded goal template; bounded recurrence rule
 * with safe-integer derived instants; bounded unique parameters; every
 * `${name}` placeholder declared (fail-closed, no escaping in v1); and
 * deterministic expansion — same program -> byte-identical expanded goals,
 * each re-validated fail-closed (a substitution that would break a goal law
 * rejects the expansion, never silently repairs).
 */

import { describe, expect, it } from "vitest";
import {
  InvalidEconomicProgramError,
  expandEconomicProgram,
  validateEconomicProgram,
  validateRecurrenceRule,
} from "../src/index.ts";
import {
  movementGoal,
  parameterizedProgram,
  recurringProgram,
  NOW,
} from "./fixtures.ts";

function expectReject(candidate: unknown, message: RegExp): void {
  expect(() => validateEconomicProgram(candidate)).toThrow(InvalidEconomicProgramError);
  expect(() => validateEconomicProgram(candidate)).toThrow(message);
}

describe("EconomicProgram validation (fail closed)", () => {
  it("rejects null and non-object candidates", () => {
    expectReject(null, /an EconomicProgram is required/);
    expectReject("program", /an EconomicProgram is required/);
  });

  it("requires a valid goal template (embedded goal law enforced)", () => {
    expectReject(
      { ...recurringProgram(), goalTemplate: { ...movementGoal(), objective: "" } },
      /goalTemplate/,
    );
  });

  it("rejects malformed recurrence rules (bounded occurrences, safe arithmetic)", () => {
    expectReject(
      { ...recurringProgram(), recurrence: { anchorAt: 0, intervalMs: 0, occurrences: 3, occurrenceWindowMs: 1 } },
      /intervalMs must be a positive integer/,
    );
    expectReject(
      { ...recurringProgram(), recurrence: { anchorAt: 0, intervalMs: 1, occurrences: 65, occurrenceWindowMs: 1 } },
      /occurrences must be an integer in \[1, 64\]/,
    );
    expectReject(
      { ...recurringProgram(), recurrence: { anchorAt: -1, intervalMs: 1, occurrences: 3, occurrenceWindowMs: 1 } },
      /anchorAt must be a non-negative instant/,
    );
    // Derived instants outside the safe-integer range are REJECTED, never clamped.
    expectReject(
      {
        ...recurringProgram(),
        recurrence: {
          anchorAt: Number.MAX_SAFE_INTEGER - 10,
          intervalMs: 1000,
          occurrences: 64,
          occurrenceWindowMs: 1000,
        },
      },
      /safe-integer range/,
    );
    expect(
      validateRecurrenceRule({ anchorAt: 0, intervalMs: 1, occurrences: 1, occurrenceWindowMs: 1 })
        .occurrences,
    ).toBe(1);
  });

  it("rejects duplicate/ill-formed parameters and undeclared placeholders (no escaping in v1)", () => {
    expectReject(
      { ...parameterizedProgram(), parameters: [{ name: "region", value: "EU" }, { name: "region", value: "US" }] },
      /duplicate names/,
    );
    expectReject(
      { ...parameterizedProgram(), parameters: [{ name: "9bad", value: "x" }] },
      /must match \/\^\[A-Za-z\]/,
    );
    expectReject(
      { ...parameterizedProgram(), parameters: [] },
      /undeclared parameter/,
    );
    expectReject(
      { ...parameterizedProgram(), goalTemplate: { ...movementGoal(), objective: "Pay ${currency} now" } },
      /undeclared parameter/,
    );
  });

  it("accepts the fixture programs, frozen, with the exact key sets", () => {
    const recurring = validateEconomicProgram(recurringProgram());
    expect(Object.isFrozen(recurring)).toBe(true);
    expect(Object.keys(recurring).sort()).toEqual([
      "goalTemplate",
      "parameters",
      "programId",
      "recurrence",
    ]);
    const oneShot = validateEconomicProgram(parameterizedProgram());
    expect(Object.keys(oneShot).sort()).toEqual(["goalTemplate", "parameters", "programId"]);
  });
});

describe("expandEconomicProgram (deterministic expansion)", () => {
  it("expands a recurring program into exactly `occurrences` valid goals with derived ids and bounds", () => {
    const goals = expandEconomicProgram(recurringProgram());
    expect(goals).toHaveLength(3);
    const interval = 30 * 24 * 3_600_000;
    goals.forEach((goal, index) => {
      expect(goal.goalId).toBe(`program:monthly-payroll-001:goal:${index}`);
      expect(goal.timeBounds.declaredAt).toBe(NOW + index * interval);
      expect(goal.timeBounds.deadlineAt).toBe(NOW + index * interval + 24 * 3_600_000);
    });
  });

  it("expands a parameterized one-shot program into ONE goal with prose substituted", () => {
    const goals = expandEconomicProgram(parameterizedProgram());
    expect(goals).toHaveLength(1);
    expect(goals[0]!.objective).toBe("Settle EU payroll from treasury ETH by Friday");
    expect(goals[0]!.nonGoals).toEqual(["Do not touch the EU cold-storage wallet"]);
    // Structured fields are NEVER text-substituted.
    expect(goals[0]!.goalId).toBe("program:payroll-params-001:goal:0");
    expect(goals[0]!.outcomes).toEqual(movementGoal().outcomes);
  });

  it("substitution is order-independent (parameters canonicalized by name)", () => {
    const program = {
      ...parameterizedProgram(),
      parameters: [...parameterizedProgram().parameters].reverse(),
    };
    expect(expandEconomicProgram(program)).toEqual(expandEconomicProgram(parameterizedProgram()));
  });

  it("rejects an expansion whose substitution would break a goal law (fail-closed, never repairs)", () => {
    const program = {
      ...parameterizedProgram(),
      parameters: [{ name: "region", value: "x".repeat(1024) }],
      goalTemplate: {
        ...movementGoal(),
        objective: `${"y".repeat(4000)} $${"{"}region}`, // valid template (< 4096) whose substitution overflows
      },
    };
    expect(() => expandEconomicProgram(program)).toThrow(InvalidEconomicProgramError);
    expect(() => expandEconomicProgram(program)).toThrow(/expansion occurrence 0 is invalid/);
  });

  it("same program -> deep-equal expansion (pure function of the input)", () => {
    expect(expandEconomicProgram(recurringProgram())).toEqual(
      expandEconomicProgram(recurringProgram()),
    );
  });
});
