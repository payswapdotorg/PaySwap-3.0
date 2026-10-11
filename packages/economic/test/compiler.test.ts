/**
 * Candidate compiler tests (P1-W1, net-new): deterministic compilation of
 * EconomicGoal -> validated intent set -> typed candidate skeletons.
 *
 * Proves: goal->intent derivation with lineage propagation (principal,
 * authorization ref, constraints, time bounds); archetype-correct intent
 * types (MoneyMovementIntent / PaymentIntent / ServiceAccessIntent);
 * rail-agnostic demand-graph skeletons (movement: origin->movement->
 * destination with VALUE_FROM/VALUE_TO edges; service: single provision
 * node); content-derived stable ids; constraint propagation; declared
 * NON-goals and versioned economic inputs carried in canonical order; the
 * advisory-demand-only law (no authorization or finality vocabulary); and
 * the fail-closed compilation laws (bad input, bad instants, expired goal).
 */

import { describe, expect, it } from "vitest";
import {
  CANDIDATE_SKELETON_FORMAT_VERSION,
  CANDIDATE_SKELETON_KEYS,
  COMPILER_VERSION,
  InvalidEconomicCompilationError,
  compileEconomicGoal,
  compileEconomicProgram,
} from "../src/index.ts";
import {
  movementGoal,
  paymentGoal,
  serviceGoal,
  multiOutcomeGoal,
  recurringProgram,
  parameterizedProgram,
  NOW,
} from "./fixtures.ts";

function compile(goal: unknown, compiledAt: number = NOW) {
  return compileEconomicGoal({ goal, compiledAt });
}

describe("goal compilation (goal -> validated intents -> candidate skeletons)", () => {
  it("compiles a movement goal into ONE validated MoneyMovementIntent with propagated lineage", () => {
    const result = compile(movementGoal());
    expect(result.compilerVersion).toBe(COMPILER_VERSION);
    expect(result.compiledAt).toBe(NOW);
    expect(result.goalId).toBe(movementGoal().goalId);
    expect(result.intents).toHaveLength(1);
    const compiled = result.intents[0]!;
    expect(compiled.archetype).toBe("MONEY_MOVEMENT");
    if (compiled.archetype !== "MONEY_MOVEMENT") {
      throw new Error("expected a movement intent");
    }
    expect(compiled.intent.intentId).toBe("goal:payroll-eu-001:intent:0");
    expect(compiled.intent.principalRef).toBe(movementGoal().principalRef);
    expect(compiled.intent.intentAuthorizationRef).toBe(movementGoal().authorizationRef);
    expect(compiled.intent.constraints).toEqual(movementGoal().constraints);
    expect(compiled.intent.declaredAt).toBe(movementGoal().timeBounds.declaredAt);
    expect(compiled.intent.expiresAt).toBe(movementGoal().timeBounds.deadlineAt);
    expect(compiled.intent.arrivalCurrency).toBe("EUR");
    // Result is frozen.
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.intents[0])).toBe(true);
  });

  it("compiles a payment goal into a PaymentIntent (commerceRef propagated)", () => {
    const result = compile(paymentGoal());
    const compiled = result.intents[0]!;
    expect(compiled.archetype).toBe("PAYMENT");
    if (compiled.archetype !== "PAYMENT") {
      throw new Error("expected a payment intent");
    }
    expect(compiled.intent.commerceRef).toBe("checkout:merchant-001:cart-9");
    expect(compiled.intent.originAmount.currency).toBe("ETH");
  });

  it("compiles a service goal into a ServiceAccessIntent (maxCost propagated)", () => {
    const result = compile(serviceGoal());
    const compiled = result.intents[0]!;
    expect(compiled.archetype).toBe("SERVICE_ACCESS");
    if (compiled.archetype !== "SERVICE_ACCESS") {
      throw new Error("expected a service intent");
    }
    expect(compiled.intent.serviceRef).toBe("service:video:standard-plan");
    expect(compiled.intent.maxCost).toEqual({ currency: "USD", minorUnits: "1599" });
  });

  it("compiles a multi-outcome goal into intents+skeletons in GOAL-OUTCOME ORDER", () => {
    const result = compile(multiOutcomeGoal());
    expect(result.intents.map((entry) => entry.archetype)).toEqual([
      "MONEY_MOVEMENT",
      "SERVICE_ACCESS",
    ]);
    expect(result.intents[1]!.intent.intentId).toBe("goal:payroll-and-tools-001:intent:1");
    expect(result.skeletons).toHaveLength(2);
  });

  it("movement skeleton is the rail-agnostic demand graph: origin -> movement -> destination", () => {
    const result = compile(movementGoal());
    const skeleton = result.skeletons[0]!;
    expect(Object.keys(skeleton).sort()).toEqual([...CANDIDATE_SKELETON_KEYS].sort());
    expect(skeleton.formatVersion).toBe(CANDIDATE_SKELETON_FORMAT_VERSION);
    expect(skeleton.nodes.map((node) => node.kind)).toEqual([
      "VALUE_ORIGIN",
      "VALUE_MOVEMENT",
      "VALUE_DESTINATION",
    ]);
    expect(skeleton.edges.map((edge) => edge.kind)).toEqual(["VALUE_FROM", "VALUE_TO"]);
    // Edge endpoints reference the node ids (a coherent graph).
    expect(skeleton.edges[0]!.fromNodeId).toBe(skeleton.nodes[0]!.nodeId);
    expect(skeleton.edges[0]!.toNodeId).toBe(skeleton.nodes[1]!.nodeId);
    expect(skeleton.edges[1]!.fromNodeId).toBe(skeleton.nodes[1]!.nodeId);
    expect(skeleton.edges[1]!.toNodeId).toBe(skeleton.nodes[2]!.nodeId);
    // Intent lineage everywhere.
    for (const node of skeleton.nodes) {
      expect(node.intentRef).toBe(result.intents[0]!.intent.intentId);
    }
    expect(skeleton.intentRef).toBe(result.intents[0]!.intent.intentId);
    expect(skeleton.goalId).toBe(movementGoal().goalId);
    expect(skeleton.authorizationRef).toBe(movementGoal().authorizationRef);
  });

  it("service skeleton is a single SERVICE_PROVISION node with no edges", () => {
    const skeleton = compile(serviceGoal()).skeletons[0]!;
    expect(skeleton.nodes.map((node) => node.kind)).toEqual(["SERVICE_PROVISION"]);
    expect(skeleton.edges).toEqual([]);
  });

  it("carries constraint propagation, sorted NON-goals and sorted versioned economic inputs", () => {
    const goal = {
      ...movementGoal(),
      nonGoals: ["zzz-last", "aaa-first"],
      economicInputs: [
        ...movementGoal().economicInputs,
        {
          kind: "FX_RATE",
          version: 1,
          sourceRef: "obs:fx:eth-eur:0",
          content: '{"pair":"ETH/EUR"}',
        },
      ],
    };
    const skeleton = compile(goal).skeletons[0]!;
    expect(skeleton.constraints).toEqual(goal.constraints);
    expect(skeleton.nonGoals).toEqual(["aaa-first", "zzz-last"]);
    expect(skeleton.economicInputs.map((input) => input.kind)).toEqual([
      "CORRIDOR",
      "FX_RATE",
      "QUOTE",
    ]);
  });

  it("ADVISORY DEMAND ONLY: skeletons and results carry no authorization/finality vocabulary", () => {
    const serialized = JSON.stringify(compile(multiOutcomeGoal())).toLowerCase();
    for (const forbidden of [
      "\"approved\"",
      "\"final\":",
      "finalityrecord",
      "settlementattempt",
      "\"signature\"",
      "\"secret\"",
    ]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });

  it("fail-closed: rejects malformed compilation inputs, bad instants and expired goals", () => {
    expect(() => compileEconomicGoal(null as unknown as { goal: unknown; compiledAt: number })).toThrow(
      InvalidEconomicCompilationError,
    );
    expect(() => compile(movementGoal(), -1)).toThrow(/non-negative integer/);
    expect(() => compile(movementGoal(), Number.NaN)).toThrow(/safe integer/);
    expect(() => compile(movementGoal(), 1.5)).toThrow(/safe integer/);
    // compiledAt === deadlineAt is already expired (the old law: an expired
    // window compiles NOTHING).
    expect(() => compile(movementGoal(), movementGoal().timeBounds.deadlineAt)).toThrow(
      /expired at the compile instant/,
    );
    expect(() => compile(movementGoal(), movementGoal().timeBounds.deadlineAt + 1)).toThrow(
      /expired/,
    );
    // An invalid goal fails through the compiler fail-closed, surfacing the
    // precise goal-contract violation (field-path discipline).
    expect(() => compile({ ...movementGoal(), objective: "" })).toThrow(/objective/);
  });
});

describe("program compilation (expansion + per-goal compilation)", () => {
  it("compiles every expanded occurrence, in occurrence order, with per-occurrence intent ids", () => {
    const result = compileEconomicProgram({ program: recurringProgram(), compiledAt: NOW });
    expect(result.programId).toBe("program:monthly-payroll-001");
    expect(result.goals).toHaveLength(3);
    expect(result.intents).toHaveLength(3);
    expect(result.skeletons).toHaveLength(3);
    expect(result.intents.map((entry) => entry.intent.intentId)).toEqual([
      "program:monthly-payroll-001:goal:0:intent:0",
      "program:monthly-payroll-001:goal:1:intent:0",
      "program:monthly-payroll-001:goal:2:intent:0",
    ]);
    expect(result.compilerVersion).toBe(COMPILER_VERSION);
  });

  it("compiles a parameterized one-shot program into one goal's compilation", () => {
    const result = compileEconomicProgram({ program: parameterizedProgram(), compiledAt: NOW });
    expect(result.goals).toHaveLength(1);
    expect(result.goals[0]!.objective).toBe("Settle EU payroll from treasury ETH by Friday");
    expect(result.intents).toHaveLength(1);
  });

  it("fail-closed: a program whose occurrences are all expired compiles NOTHING", () => {
    const interval = 30 * 24 * 3_600_000;
    const allPast = {
      ...recurringProgram(),
      recurrence: {
        anchorAt: NOW - 4 * interval,
        intervalMs: interval,
        occurrences: 3,
        occurrenceWindowMs: 24 * 3_600_000,
      },
    };
    expect(() => compileEconomicProgram({ program: allPast, compiledAt: NOW })).toThrow(
      /expired/,
    );
  });
});
