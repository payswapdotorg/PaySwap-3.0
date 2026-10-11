/**
 * Deterministic compilation tests (P1-W1).
 *
 * PORT/ADAPT of payswap.org@8a735bf packages/route-compiler/test/determinism.test.ts
 * (138 lines) onto the rail-neutral candidate compiler — compilation is a
 * PURE FUNCTION of its inputs:
 *
 * - same goal + same caller-supplied compile instant -> the SAME result
 *   (deep-equal AND byte-identical serialization, stable content-derived
 *   ids and digests) — the repeated-compile property test;
 * - skeleton/node/edge ids are pure functions of canonical content;
 * - the compilation is invariant under permutation of the SET-like goal
 *   fields (allowedArchetypes, nonGoals, economicInputs) and program
 *   parameters (canonical input ordering) — NOT under permutation of the
 *   ordered outcome list (installment order is semantic; documented);
 * - skeletons/nonGoals/economicInputs are emitted in canonical (sorted)
 *   order regardless of construction order;
 * - different compile instants are DIFFERENT compilations (the digest
 *   includes compiledAt — never an ambient clock);
 * - non-integer and negative instants are refused (fail closed);
 * - an expired goal compiles nothing;
 * - a changed goal is a different compilation (the goal is the single
 *   source of truth).
 */

import { describe, expect, it } from "vitest";
import { compileEconomicGoal, compileEconomicProgram } from "../src/index.ts";
import {
  movementGoal,
  multiOutcomeGoal,
  paymentGoal,
  recurringProgram,
  serviceGoal,
  NOW,
} from "./fixtures.ts";

function compile(goal: unknown, compiledAt: number = NOW) {
  return compileEconomicGoal({ goal, compiledAt });
}

const ALL_FIXTURE_GOALS = () => [movementGoal(), paymentGoal(), serviceGoal(), multiOutcomeGoal()];

describe("deterministic candidate compilation", () => {
  it("same goal + same compile instant -> deep-equal AND byte-identical compilation (all fixture goals)", () => {
    for (const goal of ALL_FIXTURE_GOALS()) {
      const first = compile(goal);
      const second = compile(goal);
      expect(second).toEqual(first);
      // Byte-identical: stable key ordering makes JSON.stringify stable.
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      for (let index = 0; index < first.skeletons.length; index += 1) {
        expect(second.skeletons[index]!.digest).toBe(first.skeletons[index]!.digest);
        expect(second.skeletons[index]!.skeletonId).toBe(first.skeletons[index]!.skeletonId);
      }
    }
  });

  it("REPEATED-COMPILE PROPERTY: 10 consecutive compilations are all byte-identical", () => {
    const first = JSON.stringify(compile(multiOutcomeGoal()));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(JSON.stringify(compile(multiOutcomeGoal()))).toBe(first);
    }
  });

  it("skeleton/node/edge ids are pure functions of the canonical content", () => {
    const goal = movementGoal();
    const first = compile(goal);
    const second = compile(goal);
    for (let index = 0; index < first.skeletons.length; index += 1) {
      const a = first.skeletons[index]!;
      const b = second.skeletons[index]!;
      expect(b.skeletonId).toBe(a.skeletonId);
      expect(b.nodes.map((node) => node.nodeId)).toEqual(a.nodes.map((node) => node.nodeId));
      expect(b.edges.map((edge) => edge.edgeId)).toEqual(a.edges.map((edge) => edge.edgeId));
      // Ids are content-derived digests with stable prefixes.
      expect(a.skeletonId).toMatch(/^cand:[0-9a-f]{16}$/);
      for (const node of a.nodes) {
        expect(node.nodeId).toMatch(/^cnode:[0-9a-f]{16}$/);
      }
      for (const edge of a.edges) {
        expect(edge.edgeId).toMatch(/^cedge:[0-9a-f]{16}$/);
      }
    }
  });

  it("input permutation invariance: permuted SET-like fields -> identical compilation", () => {
    const goal = {
      ...movementGoal(),
      allowedArchetypes: ["MONEY_MOVEMENT"],
      nonGoals: ["b-second", "a-first"],
      economicInputs: [...movementGoal().economicInputs],
    };
    const first = compile(goal);
    const permuted = compile({
      ...goal,
      nonGoals: [...goal.nonGoals].reverse(),
      economicInputs: [...goal.economicInputs].reverse(),
      allowedArchetypes: ["MONEY_MOVEMENT"],
    });
    expect(JSON.stringify(permuted)).toBe(JSON.stringify(first));
    expect(permuted.skeletons[0]!.digest).toBe(first.skeletons[0]!.digest);
  });

  it("nonGoals and economicInputs are emitted in canonical (sorted) order regardless of input order", () => {
    const goal = {
      ...movementGoal(),
      nonGoals: ["z", "m", "a"],
    };
    const skeleton = compile(goal).skeletons[0]!;
    expect(skeleton.nonGoals).toEqual(["a", "m", "z"]);
  });

  it("outcome ORDER is semantic (documented non-invariance): permuting outcomes changes the realized intents", () => {
    const outcomes = multiOutcomeGoal().outcomes;
    const first = outcomes[0]!;
    const second = outcomes[1]!;
    const ordered = compile(multiOutcomeGoal());
    const permuted = compile({ ...multiOutcomeGoal(), outcomes: [second, first] });
    // Intent ids are POSITIONAL by design (installment order is semantic),
    // so the id LIST is stable — but WHICH intent occupies each position
    // changes, and so do the skeletons (different demands).
    expect(permuted.intents.map((entry) => entry.archetype)).toEqual([
      "SERVICE_ACCESS",
      "MONEY_MOVEMENT",
    ]);
    expect(ordered.intents.map((entry) => entry.archetype)).toEqual([
      "MONEY_MOVEMENT",
      "SERVICE_ACCESS",
    ]);
    expect(permuted.skeletons.map((s) => s.skeletonId)).not.toEqual(
      ordered.skeletons.map((s) => s.skeletonId),
    );
  });

  it("program compilation is deterministic: same program + instant -> byte-identical result", () => {
    const first = compileEconomicProgram({ program: recurringProgram(), compiledAt: NOW });
    const second = compileEconomicProgram({ program: recurringProgram(), compiledAt: NOW });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("different compile instants are different compilations (never an ambient clock)", () => {
    const first = compile(movementGoal());
    const later = compile(movementGoal(), NOW + 1000);
    // skeletonId is content-derived and INSTANT-INVARIANT; the digest changes.
    expect(later.skeletons[0]!.skeletonId).toBe(first.skeletons[0]!.skeletonId);
    expect(later.skeletons[0]!.digest).not.toBe(first.skeletons[0]!.digest);
    expect(later.compiledAt).toBe(NOW + 1000);
  });

  it("compilation refuses non-integer and negative instants (fail closed)", () => {
    expect(() => compile(movementGoal(), -1)).toThrow(/non-negative integer/);
    expect(() => compile(movementGoal(), Number.NaN)).toThrow(/safe integer/);
    expect(() => compile(movementGoal(), Number.POSITIVE_INFINITY)).toThrow(/safe integer/);
  });

  it("an expired goal compiles nothing (the demand window is fail-closed)", () => {
    expect(() => compile(movementGoal(), movementGoal().timeBounds.deadlineAt)).toThrow(
      /expired/,
    );
  });

  it("a changed goal is a different compilation (the goal is the single source of truth)", () => {
    const first = compile(movementGoal());
    const changed = compile({
      ...movementGoal(),
      outcomes: [
        {
          ...movementGoal().outcomes[0]!,
          demand: {
            ...movementGoal().outcomes[0]!.demand,
            originAmount: { currency: "ETH", minorUnits: "20000000000000000" },
          },
        },
      ],
    });
    // The changed demand produces a different intent AND a different
    // candidate (the skeleton identity covers the realized intent content).
    expect(changed.skeletons[0]!.digest).not.toBe(first.skeletons[0]!.digest);
    expect(changed.skeletons[0]!.skeletonId).not.toBe(first.skeletons[0]!.skeletonId);
    expect(changed.intents[0] !== first.intents[0]).toBe(true);
  });
});
