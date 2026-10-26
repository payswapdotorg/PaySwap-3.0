import { describe, expect, it } from "vitest";
import {
  admitRouteCandidatesWithinBudget,
  ROUTE_SEARCH_BUDGET_DIMENSIONS,
  validateRouteCandidateAdmission,
  validateRouteSearchBudget,
} from "../src/search-budget.ts";
import type { RouteCandidateAdmissionRecord } from "../src/search-budget.ts";
import { RouteSearchBudgetError } from "../src/errors.ts";
import { PINNED_ROUTE_SHAPE_IDS } from "../src/pins/route-compiler.ts";

/**
 * THE BOUNDED-SEARCH LAWS (ADR-0009 D6): count-based budgets only, every
 * candidate validated BEFORE admission, greedy canonical-order admission,
 * ONE truncation receipt per truncating dimension carrying the TRUE
 * pre-cut count, coverage COMPLETE only when NO receipt exists, and an
 * input-order-independent selection digest.
 */

const SHAPES = [...PINNED_ROUTE_SHAPE_IDS];
const SHAPE_A = SHAPES[0] as string;
const SHAPE_B = SHAPES[1] as string;
const SHAPE_C = SHAPES[2] as string;

function candidates(...specs: readonly [string, string][]): RouteCandidateAdmissionRecord[] {
  return specs.map(([planId, shapeId]) => ({ planId, shapeId }));
}

describe("validateRouteSearchBudget — count-based only (no wall clock)", () => {
  it("accepts a positive-integer budget and freezes it", () => {
    const budget = validateRouteSearchBudget({ maxCandidates: 5, maxShapes: 3, maxCandidatesPerShape: 2 });
    expect(budget.maxCandidates).toBe(5);
    expect(Object.isFrozen(budget)).toBe(true);
  });

  it("rejects zero, fractional, negative and non-number dimensions", () => {
    for (const bad of [0, -1, 1.5, "3", null, undefined]) {
      expect(() =>
        validateRouteSearchBudget({
          maxCandidates: bad as never,
          maxShapes: 3,
          maxCandidatesPerShape: 2,
        }),
      ).toThrow(RouteSearchBudgetError);
    }
  });

  it("every dimension is required (unknown fields never fill in)", () => {
    expect(() =>
      validateRouteSearchBudget({ maxCandidates: 5, maxShapes: 3 }),
    ).toThrow(RouteSearchBudgetError);
    expect(() => validateRouteSearchBudget("not a budget")).toThrow();
  });

  it("the dimension vocabulary is frozen in the frozen order", () => {
    expect(Object.isFrozen(ROUTE_SEARCH_BUDGET_DIMENSIONS)).toBe(true);
    expect([...ROUTE_SEARCH_BUDGET_DIMENSIONS]).toEqual([
      "maxCandidates",
      "maxShapes",
      "maxCandidatesPerShape",
    ]);
  });
});

describe("validateRouteCandidateAdmission — validate BEFORE admission", () => {
  it("accepts a closed-vocabulary candidate and freezes it", () => {
    const record = validateRouteCandidateAdmission({ planId: "p1", shapeId: SHAPE_A });
    expect(record.planId).toBe("p1");
    expect(Object.isFrozen(record)).toBe(true);
  });

  it("rejects an unknown shape (an unknown shape never enters the search)", () => {
    expect(() => validateRouteCandidateAdmission({ planId: "p1", shapeId: "not-a-shape" })).toThrow(
      RouteSearchBudgetError,
    );
  });

  it("rejects empty/missing planId and non-object candidates", () => {
    expect(() => validateRouteCandidateAdmission({ planId: "", shapeId: SHAPE_A })).toThrow(
      RouteSearchBudgetError,
    );
    expect(() => validateRouteCandidateAdmission({ shapeId: SHAPE_A })).toThrow(
      RouteSearchBudgetError,
    );
    expect(() => validateRouteCandidateAdmission(null)).toThrow();
  });
});

describe("admitRouteCandidatesWithinBudget — the bounded search", () => {
  it("admits everything under a generous budget and declares COMPLETE coverage", () => {
    const selection = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
      candidates: candidates(["p2", SHAPE_B], ["p1", SHAPE_A], ["p3", SHAPE_C]),
    });
    expect(selection.admitted.map((record) => record.planId)).toEqual(["p1", "p2", "p3"]);
    expect(selection.receipts).toEqual([]);
    expect(selection.coverage).toBe("COMPLETE");
  });

  it("duplicate planIds are rejected (the candidate identity is unique)", () => {
    expect(() =>
      admitRouteCandidatesWithinBudget({
        budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
        candidates: candidates(["p1", SHAPE_A], ["p1", SHAPE_A]),
      }),
    ).toThrow(RouteSearchBudgetError);
  });

  it("maxCandidates truncation carries the TRUE pre-cut count, not the post-cut count", () => {
    const selection = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 2, maxShapes: 9, maxCandidatesPerShape: 10 },
      candidates: candidates(["p1", SHAPE_A], ["p2", SHAPE_B], ["p3", SHAPE_C], ["p4", SHAPE_A]),
    });
    expect(selection.admitted.map((record) => record.planId)).toEqual(["p1", "p2"]);
    expect(selection.receipts).toHaveLength(1);
    const receipt = selection.receipts[0];
    expect(receipt?.dimension).toBe("maxCandidates");
    expect(receipt?.limit).toBe(2);
    expect(receipt?.actualCount).toBe(4);
    expect(receipt?.disclosedAs).toBe("TRUNCATED");
    expect(selection.coverage).toBe("TRUNCATED");
  });

  it("maxShapes truncation carries the TRUE distinct-shape count", () => {
    const selection = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 10, maxShapes: 2, maxCandidatesPerShape: 10 },
      candidates: candidates(["p1", SHAPE_A], ["p2", SHAPE_B], ["p3", SHAPE_C]),
    });
    expect(selection.admitted.map((record) => record.planId)).toEqual(["p1", "p2"]);
    expect(selection.receipts).toHaveLength(1);
    expect(selection.receipts[0]?.dimension).toBe("maxShapes");
    expect(selection.receipts[0]?.actualCount).toBe(3);
    expect(selection.coverage).toBe("TRUNCATED");
  });

  it("maxCandidatesPerShape truncation carries the TRUE per-shape maximum", () => {
    const selection = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 2 },
      candidates: candidates(
        ["p1", SHAPE_A], ["p2", SHAPE_A], ["p3", SHAPE_A],
        ["p4", SHAPE_B], ["p5", SHAPE_B],
      ),
    });
    expect(selection.admitted.map((record) => record.planId)).toEqual(["p1", "p2"]);
    expect(selection.receipts).toHaveLength(1);
    expect(selection.receipts[0]?.dimension).toBe("maxCandidatesPerShape");
    expect(selection.receipts[0]?.actualCount).toBe(3);
    expect(selection.coverage).toBe("TRUNCATED");
  });

  it("multiple truncating dimensions emit one receipt each, in the frozen dimension order", () => {
    const selection = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 1, maxShapes: 1, maxCandidatesPerShape: 1 },
      candidates: candidates(["p1", SHAPE_A], ["p2", SHAPE_A], ["p3", SHAPE_B]),
    });
    expect(selection.admitted.map((record) => record.planId)).toEqual(["p1"]);
    expect(selection.receipts.map((receipt) => receipt.dimension)).toEqual([
      "maxCandidates",
      "maxShapes",
      "maxCandidatesPerShape",
    ]);
    expect(selection.coverage).toBe("TRUNCATED");
  });

  it("STRUCTURAL LAW: a receipt implies TRUNCATED coverage (completeness is never claimed when capped)", () => {
    const tight = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 1, maxShapes: 1, maxCandidatesPerShape: 1 },
      candidates: candidates(["p1", SHAPE_A], ["p2", SHAPE_B]),
    });
    expect(tight.receipts.length).toBeGreaterThan(0);
    expect(tight.coverage).toBe("TRUNCATED");
    const loose = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
      candidates: candidates(["p1", SHAPE_A]),
    });
    expect(loose.receipts.length).toBe(0);
    expect(loose.coverage).toBe("COMPLETE");
  });

  it("input-order independence: permuted candidates admit identically with identical digests", () => {
    const forward = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 3, maxShapes: 3, maxCandidatesPerShape: 3 },
      candidates: candidates(["p1", SHAPE_A], ["p2", SHAPE_B], ["p3", SHAPE_C]),
    });
    const permuted = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 3, maxShapes: 3, maxCandidatesPerShape: 3 },
      candidates: candidates(["p3", SHAPE_C], ["p1", SHAPE_A], ["p2", SHAPE_B]),
    });
    expect(permuted.selectionDigest).toBe(forward.selectionDigest);
    expect(permuted.admitted.map((record) => record.planId)).toEqual(["p1", "p2", "p3"]);
    const truncatedForward = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 1, maxShapes: 9, maxCandidatesPerShape: 9 },
      candidates: candidates(["p1", SHAPE_A], ["p2", SHAPE_B]),
    });
    const truncatedPermuted = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 1, maxShapes: 9, maxCandidatesPerShape: 9 },
      candidates: candidates(["p2", SHAPE_B], ["p1", SHAPE_A]),
    });
    expect(truncatedPermuted.selectionDigest).toBe(truncatedForward.selectionDigest);
  });

  it("greedy canonical-order admission: the canonical-first candidates are the ones admitted", () => {
    const selection = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 2, maxShapes: 9, maxCandidatesPerShape: 9 },
      candidates: candidates(["z-plan", SHAPE_A], ["a-plan", SHAPE_B], ["m-plan", SHAPE_C]),
    });
    expect(selection.admitted.map((record) => record.planId)).toEqual(["a-plan", "m-plan"]);
  });

  it("the selection digest covers budget + selection + receipts + coverage (tamper-evident)", () => {
    const base = candidates(["p1", SHAPE_A], ["p2", SHAPE_B]);
    const one = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 1, maxShapes: 9, maxCandidatesPerShape: 9 },
      candidates: base,
    });
    const two = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 2, maxShapes: 9, maxCandidatesPerShape: 9 },
      candidates: base,
    });
    expect(one.selectionDigest).not.toBe(two.selectionDigest);
    expect(one.selectionDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("the outputs are frozen (the immutability law)", () => {
    const selection = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
      candidates: candidates(["p1", SHAPE_A]),
    });
    expect(Object.isFrozen(selection)).toBe(true);
    expect(Object.isFrozen(selection.admitted)).toBe(true);
    expect(Object.isFrozen(selection.receipts)).toBe(true);
    expect(Object.isFrozen(selection.budget)).toBe(true);
  });

  it("an empty candidate set is a COMPLETE empty selection (never an error)", () => {
    const selection = admitRouteCandidatesWithinBudget({
      budget: { maxCandidates: 3, maxShapes: 3, maxCandidatesPerShape: 3 },
      candidates: [],
    });
    expect(selection.admitted).toEqual([]);
    expect(selection.receipts).toEqual([]);
    expect(selection.coverage).toBe("COMPLETE");
  });
});
