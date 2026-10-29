/**
 * @payswap/opportunities — the GROUNDED EXCLUSION FACTS (P23-A, lane A;
 * ADR-0015 D2/D3): the verbatim typed corridor exclusions every repair
 * lookup, platform work item and model proposal consumes. Split from
 * ./repair-operators.ts under the 400-line file law (the
 * ./conditional-validation.ts precedent): the fact projection is the
 * shared input surface of the whole repair-discovery tier.
 *
 * LAWS: the side is the closed two-member corridor-side vocabulary; the
 * code is one of the PINNED 26 (./pins/capability.ts — authority
 * @payswap/capability corridor-types.ts; fail-closed, never guessed); the
 * message is the verbatim exclusion message; the optional funding-method
 * detail is preserved verbatim. Validation is deterministic, aggregate
 * and typed — an unknown vocabulary member NEVER constructs.
 */

import { ValidationError } from "./errors.ts";
import { isPinnedCorridorExclusionCode } from "./pins/capability.ts";
import type { PinnedCorridorExclusionCode } from "./pins/capability.ts";

/** Raised when a grounded exclusion fact set is malformed (fail-closed). */
export class RepairCatalogueError extends ValidationError {
  constructor(message: string, options?: { errors: readonly string[] }) {
    super(message, options);
    this.name = "RepairCatalogueError";
  }
}

/**
 * The corridor sides a fact may be grounded on (the snapshot side that
 * surfaced the exclusion — SENDER or RECIPIENT; the THIRD_PARTY actor of
 * a party change is named by the party-change vocabulary, never here).
 */
export const REPAIR_FACT_SIDES = Object.freeze(["SENDER", "RECIPIENT"] as const);
export type RepairFactSide = (typeof REPAIR_FACT_SIDES)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/route-planning
 * src/conditional-stage.ts `GroundedExclusionFact` (the stage-7 projection
 * of a corridor's VERBATIM typed exclusions): side, route, code, message
 * and the optional funding-method detail. Re-declared locally under the
 * leaf-in-flight law; the code is a member of the pinned 26.
 */
export interface RepairExclusionFact {
  readonly side: RepairFactSide;
  readonly routeId: string;
  readonly code: PinnedCorridorExclusionCode;
  readonly message: string;
  readonly fundingMethod?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Fail-closed validation of one grounded exclusion fact (typed, aggregate). */
function validateRepairExclusionFact(candidate: unknown, index: number, errors: string[]): RepairExclusionFact | null {
  if (candidate === null || typeof candidate !== "object") {
    errors.push(`facts[${String(index)}] must be a grounded exclusion fact { side, routeId, code, message }`);
    return null;
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  if (!(REPAIR_FACT_SIDES as readonly unknown[]).includes(record["side"])) {
    errors.push(`facts[${String(index)}].side must be one of [SENDER, RECIPIENT]`);
    return null;
  }
  if (!isNonEmptyString(record["routeId"])) {
    errors.push(`facts[${String(index)}].routeId must be a non-empty string`);
    return null;
  }
  if (!isPinnedCorridorExclusionCode(record["code"])) {
    errors.push(`facts[${String(index)}].code '${String(record["code"])}' is not one of the pinned 26 corridor exclusion codes`);
    return null;
  }
  if (!isNonEmptyString(record["message"])) {
    errors.push(`facts[${String(index)}].message must be a non-empty string (the verbatim exclusion message)`);
    return null;
  }
  const fundingMethod = record["fundingMethod"];
  if (fundingMethod !== undefined && !isNonEmptyString(fundingMethod)) {
    errors.push(`facts[${String(index)}].fundingMethod, when present, must be a non-empty string`);
    return null;
  }
  return {
    side: record["side"] as RepairFactSide,
    routeId: record["routeId"] as string,
    code: record["code"] as PinnedCorridorExclusionCode,
    message: record["message"] as string,
    ...(fundingMethod !== undefined ? { fundingMethod } : {}),
  };
}

/**
 * Fail-closed validation of the grounded exclusion facts (the shared
 * projection of the corridor's VERBATIM typed exclusions): each entry must
 * carry a closed-vocabulary side, a non-empty routeId, one of the pinned
 * 26 codes and the verbatim non-empty message. Returns a NEW frozen array
 * (the caller's original is never trusted). An EMPTY array is valid — the
 * honest no-facts input.
 */
export function validateRepairExclusionFacts(candidate: unknown): readonly RepairExclusionFact[] {
  if (!Array.isArray(candidate)) {
    throw new RepairCatalogueError("the grounded exclusion facts must be an array");
  }
  const errors: string[] = [];
  const validated: RepairExclusionFact[] = [];
  for (let index = 0; index < candidate.length; index += 1) {
    const fact = validateRepairExclusionFact(candidate[index], index, errors);
    if (fact !== null) {
      validated.push(fact);
    }
  }
  if (errors.length > 0) {
    throw new RepairCatalogueError(`Invalid grounded exclusion facts: ${errors.join("; ")}`, { errors: [...errors] });
  }
  return Object.freeze(validated);
}
