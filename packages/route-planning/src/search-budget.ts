/**
 * @payswap/route-planning — the bounded route-candidate search law
 * (P16-A, ADR-0009 D6).
 *
 * Every bounded enumeration is COUNT-BASED ONLY (no wall clock): positive
 * integer dimensions, fail-closed validation of every candidate BEFORE
 * admission, greedy admission in a canonical order while ALL dimension
 * counters fit, and ONE truncation receipt per truncating dimension
 * carrying the TRUE pre-cut candidate count with disclosedAs
 * "TRUNCATED". The coverage verdict is COMPLETE only when NO receipt
 * exists — structurally, a receipt implies an exclusion, so completeness
 * is never claimed when capped. The selection digest covers
 * budget + selection + receipts + coverage and is input-order
 * independent (candidates are canonically ordered before admission).
 */

import { RouteSearchBudgetError } from "./errors.ts";
import { contentDigest, deepFreeze, isNonEmptyString, requireObject } from "./canonical.ts";
import { PINNED_ROUTE_SHAPE_IDS } from "./pins/route-compiler.ts";

/** The bounded search dimensions (all positive integers; count-based only). */
export interface RouteSearchBudget {
  /** Maximum number of candidates admitted into the selection. */
  readonly maxCandidates: number;
  /** Maximum number of DISTINCT route shapes represented in the selection. */
  readonly maxShapes: number;
  /** Maximum number of admitted candidates per single route shape. */
  readonly maxCandidatesPerShape: number;
}

/** The budget dimension names (frozen; the receipt vocabulary). */
export const ROUTE_SEARCH_BUDGET_DIMENSIONS = Object.freeze([
  "maxCandidates",
  "maxShapes",
  "maxCandidatesPerShape",
] as const);

export type RouteSearchBudgetDimension = (typeof ROUTE_SEARCH_BUDGET_DIMENSIONS)[number];

/**
 * Fail-closed validation of a search budget: every dimension must be a
 * positive safe integer (a zero or fractional budget is refused; a
 * wall-clock dimension is unrepresentable — counts only).
 */
export function validateRouteSearchBudget(candidate: unknown): RouteSearchBudget {
  const record = requireObject(candidate, "a RouteSearchBudget");
  const errors: string[] = [];
  const dimensions: RouteSearchBudgetDimension[] = [...ROUTE_SEARCH_BUDGET_DIMENSIONS];
  const validated: Partial<Record<RouteSearchBudgetDimension, number>> = {};
  for (const dimension of dimensions) {
    const value = record[dimension];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
      errors.push(`${dimension} must be a positive integer (count-based budgets only — no wall clock)`);
    } else {
      validated[dimension] = value;
    }
  }
  if (errors.length > 0) {
    throw new RouteSearchBudgetError(
      `the route search budget failed validation: ${errors.join("; ")}`,
      { errors: Object.freeze(errors) },
    );
  }
  return deepFreeze({
    maxCandidates: validated.maxCandidates as number,
    maxShapes: validated.maxShapes as number,
    maxCandidatesPerShape: validated.maxCandidatesPerShape as number,
  });
}

/** One admission candidate: the plan identity + its route shape. */
export interface RouteCandidateAdmissionRecord {
  readonly planId: string;
  readonly shapeId: string;
}

/**
 * Fail-closed validation of ONE admission candidate (unconstructible
 * candidates never enter the search — D6: validate BEFORE admission).
 */
export function validateRouteCandidateAdmission(
  candidate: unknown,
): RouteCandidateAdmissionRecord {
  const record = requireObject(candidate, "a route candidate admission record");
  const planId = record["planId"];
  if (!isNonEmptyString(planId)) {
    throw new RouteSearchBudgetError("a route candidate must carry a non-empty planId");
  }
  const shapeId = record["shapeId"];
  if (!isNonEmptyString(shapeId)) {
    throw new RouteSearchBudgetError(`candidate '${planId}' must carry a non-empty shapeId`);
  }
  if (!(PINNED_ROUTE_SHAPE_IDS as readonly unknown[]).includes(shapeId)) {
    throw new RouteSearchBudgetError(
      `candidate '${planId}' carries shapeId '${shapeId}' which is not a member of the closed route-shape vocabulary — an unknown shape never enters the search`,
      { planId, shapeId },
    );
  }
  return deepFreeze({ planId, shapeId });
}

/** One truncation receipt: the TRUE pre-cut count, never the post-cut count. */
export interface RouteTruncationReceipt {
  readonly dimension: RouteSearchBudgetDimension;
  readonly limit: number;
  /** The TRUE candidate total BEFORE the cut (never the post-cut count). */
  readonly actualCount: number;
  readonly disclosedAs: "TRUNCATED";
}

/** The budgeted selection (the bounded-search output contract). */
export interface BudgetedRouteCandidateSelection {
  readonly budget: RouteSearchBudget;
  /** The admitted candidates, canonically ordered by planId. */
  readonly admitted: readonly RouteCandidateAdmissionRecord[];
  /** One receipt per truncating dimension, in the frozen dimension order. */
  readonly receipts: readonly RouteTruncationReceipt[];
  /** COMPLETE only when NO receipt exists (a receipt implies an exclusion). */
  readonly coverage: "COMPLETE" | "TRUNCATED";
  /** Digest over budget + selection + receipts + coverage (order-independent). */
  readonly selectionDigest: string;
}

/**
 * Admit route candidates under the budget: validate EVERY candidate
 * fail-closed, order canonically by planId (input-order independence),
 * then admit greedily while every dimension counter still fits. A
 * candidate that would overflow any dimension STOPS admission (greedy
 * canonical-order admission) and contributes to that dimension's TRUE
 * pre-cut count receipt.
 */
export function admitRouteCandidatesWithinBudget(input: {
  readonly budget: RouteSearchBudget;
  readonly candidates: readonly RouteCandidateAdmissionRecord[];
}): BudgetedRouteCandidateSelection {
  const budget = validateRouteSearchBudget(input.budget);
  const validated = input.candidates.map((candidate) =>
    validateRouteCandidateAdmission(candidate),
  );
  const duplicates = new Set<string>();
  const seen = new Set<string>();
  const canonical = [...validated].sort((left, right) =>
    left.planId < right.planId ? -1 : left.planId > right.planId ? 1 : 0,
  );
  for (const candidate of canonical) {
    if (seen.has(candidate.planId)) {
      duplicates.add(candidate.planId);
    }
    seen.add(candidate.planId);
  }
  if (duplicates.size > 0) {
    throw new RouteSearchBudgetError(
      `duplicate planIds are rejected (the candidate identity is unique): ${[...duplicates].sort().join(", ")}`,
      { duplicates: Object.freeze([...duplicates].sort()) },
    );
  }

  const admitted: RouteCandidateAdmissionRecord[] = [];
  const perShape = new Map<string, number>();
  const distinctShapes = new Set<string>();
  for (const candidate of canonical) {
    const shapeCount = perShape.get(candidate.shapeId) ?? 0;
    const shapeWouldBeNew = !distinctShapes.has(candidate.shapeId);
    const fits =
      admitted.length < budget.maxCandidates &&
      distinctShapes.size + (shapeWouldBeNew ? 1 : 0) <= budget.maxShapes &&
      shapeCount < budget.maxCandidatesPerShape;
    if (fits) {
      admitted.push(candidate);
      perShape.set(candidate.shapeId, shapeCount + 1);
      distinctShapes.add(candidate.shapeId);
    } else {
      break;
    }
  }

  // The TRUE pre-cut totals per dimension (never the post-cut counts): a
  // receipt is emitted for every dimension whose TRUE total exceeds its
  // limit — that dimension genuinely truncated the search.
  const totalCandidates = canonical.length;
  const allShapeCounts = new Map<string, number>();
  for (const candidate of canonical) {
    allShapeCounts.set(candidate.shapeId, (allShapeCounts.get(candidate.shapeId) ?? 0) + 1);
  }
  const totalDistinctShapes = allShapeCounts.size;
  let totalMaxPerShape = 0;
  for (const count of allShapeCounts.values()) {
    totalMaxPerShape = Math.max(totalMaxPerShape, count);
  }
  const receipts: RouteTruncationReceipt[] = [];
  if (totalCandidates > budget.maxCandidates) {
    receipts.push({
      dimension: "maxCandidates",
      limit: budget.maxCandidates,
      actualCount: totalCandidates,
      disclosedAs: "TRUNCATED",
    });
  }
  if (totalDistinctShapes > budget.maxShapes) {
    receipts.push({
      dimension: "maxShapes",
      limit: budget.maxShapes,
      actualCount: totalDistinctShapes,
      disclosedAs: "TRUNCATED",
    });
  }
  if (totalMaxPerShape > budget.maxCandidatesPerShape) {
    receipts.push({
      dimension: "maxCandidatesPerShape",
      limit: budget.maxCandidatesPerShape,
      actualCount: totalMaxPerShape,
      disclosedAs: "TRUNCATED",
    });
  }

  const coverage: "COMPLETE" | "TRUNCATED" = receipts.length > 0 ? "TRUNCATED" : "COMPLETE";
  const selectionDigest = contentDigest({
    budget,
    admitted: admitted.map((candidate) => candidate.planId),
    receipts,
    coverage,
  });
  return deepFreeze({
    budget,
    admitted: Object.freeze(admitted),
    receipts: Object.freeze(receipts),
    coverage,
    selectionDigest,
  });
}
