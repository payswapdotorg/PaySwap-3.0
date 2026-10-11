/**
 * @payswap/economic — recourse and proof requirements (P1-W1, net-new).
 *
 * NET-NEW vocabulary for the net-new EconomicGoal (GAP-01: the old
 * repository has NO EconomicGoal implementation — spec text only). The
 * concept reference is payswap.org@8a735bf spec/architecture/DOMAIN-MODEL.md
 * §intent ("recourse/proof requirements") and FROZEN-ARCHITECTURE.md §1
 * ("EconomicGoal — what the principal wants economically"), re-authored
 * under the PaySwap 3.0 authority model:
 *
 * - recourse/proof requirements are DEMANDS the principal declares; they
 *   create no entitlement, no authorization and no finality — enforcement
 *   lives in the trust (policy/security) and protocol (finality/recourse
 *   accounting) lanes;
 * - vocabularies are CLOSED and bounded (fail-closed: unknown kinds are
 *   rejected, never guessed);
 * - maxCost-style ceilings and dispute windows are DECLARATIONS carried in
 *   wire shape only — no comparison semantics here (no money arithmetic,
 *   INV-01).
 */

import { InvalidEconomicGoalError } from "./errors.ts";
import {
  LIMITS,
  deepFreeze,
  requireBoolean,
  requireBoundedString,
  requireExactKeys,
  requireNonNegativeSafeInteger,
  requireObject,
  type Fail,
} from "./validate.ts";

const fail: Fail = (message: string) => new InvalidEconomicGoalError(message);

/** Closed vocabulary of proof kinds an EconomicGoal may demand. */
export const PROOF_KINDS = [
  "SETTLEMENT_FINALITY",
  "DELIVERY_CONFIRMATION",
  "RECEIPT",
  "RECOURSE_ARTIFACT",
] as const;

/** The kind of proof a goal demands from any execution that satisfies it. */
export type ProofKind = (typeof PROOF_KINDS)[number];

const RECOURSE_KEYS = ["minDisputeWindowMs", "policyStatement", "requiresReversibility"] as const;
const PROOF_KEYS = ["description", "kind"] as const;

/**
 * Recourse requirements: what must be recoverable/provable when an
 * execution goes wrong. A DEMAND declaration — never an entitlement.
 */
export interface RecourseRequirements {
  /** Whether the goal demands a reversible/recoverable path where the rail supports it. */
  readonly requiresReversibility: boolean;
  /** Required dispute window in ms (0 = none declared). */
  readonly minDisputeWindowMs: number;
  /** Human/agent-legible recourse policy statement (required when reversibility is demanded). */
  readonly policyStatement: string;
}

/** Fail-closed validation of RecourseRequirements. */
export function validateRecourseRequirements(candidate: unknown): RecourseRequirements {
  const record = requireObject(candidate, "RecourseRequirements", fail);
  requireExactKeys(record, RECOURSE_KEYS, "RecourseRequirements", fail);
  const requiresReversibility = requireBoolean(
    record["requiresReversibility"],
    "RecourseRequirements.requiresReversibility",
    fail,
  );
  const minDisputeWindowMs = requireNonNegativeSafeInteger(
    record["minDisputeWindowMs"],
    "RecourseRequirements.minDisputeWindowMs",
    fail,
  );
  const rawStatement = record["policyStatement"];
  if (typeof rawStatement !== "string" || rawStatement.length > LIMITS.policyStatementMaxLength) {
    throw new InvalidEconomicGoalError(
      `RecourseRequirements.policyStatement must be a string of at most ${LIMITS.policyStatementMaxLength} characters`,
    );
  }
  // Cross-field law: a reversibility demand must be explained (legibility);
  // without the demand an empty statement is acceptable.
  if (requiresReversibility && rawStatement.length === 0) {
    throw new InvalidEconomicGoalError(
      "RecourseRequirements.policyStatement must be stated when requiresReversibility is true — an unexplained reversibility demand is not legible",
    );
  }
  return deepFreeze({
    requiresReversibility,
    minDisputeWindowMs,
    policyStatement: rawStatement,
  });
}

/** One proof a goal demands from any execution that satisfies it. */
export interface ProofRequirement {
  /** The kind of proof (closed vocabulary). */
  readonly kind: ProofKind;
  /** Human/agent-legible elaboration of what must be evidenced. */
  readonly description: string;
}

/** Fail-closed validation of a single ProofRequirement. */
export function validateProofRequirement(candidate: unknown): ProofRequirement {
  const record = requireObject(candidate, "a ProofRequirement", fail);
  requireExactKeys(record, PROOF_KEYS, "ProofRequirement", fail);
  const kind = record["kind"];
  if (typeof kind !== "string" || !(PROOF_KINDS as readonly string[]).includes(kind)) {
    throw new InvalidEconomicGoalError(
      `ProofRequirement.kind must be one of [${PROOF_KINDS.join(", ")}] (got: ${String(kind)})`,
    );
  }
  const description = requireBoundedString(
    record["description"],
    "ProofRequirement.description",
    LIMITS.descriptionMaxLength,
    fail,
  );
  return deepFreeze({ kind, description } as ProofRequirement);
}

/**
 * Fail-closed validation of a goal's proof list: non-empty (a consequential
 * economic demand always requires at least one proof), bounded, no
 * duplicate kinds (a kind is the requirement; the description elaborates).
 */
export function validateProofRequirements(candidate: unknown): readonly ProofRequirement[] {
  if (!Array.isArray(candidate)) {
    throw new InvalidEconomicGoalError("EconomicGoal.proofs must be an array");
  }
  if (candidate.length === 0) {
    throw new InvalidEconomicGoalError(
      "EconomicGoal.proofs must not be empty — a consequential economic demand always requires proof",
    );
  }
  if (candidate.length > LIMITS.maxProofs) {
    throw new InvalidEconomicGoalError(
      `EconomicGoal.proofs must carry at most ${LIMITS.maxProofs} entries`,
    );
  }
  const proofs = candidate.map((entry, index) => {
    try {
      return validateProofRequirement(entry);
    } catch (error) {
      if (error instanceof Error) {
        throw new InvalidEconomicGoalError(`EconomicGoal.proofs[${index}]: ${error.message}`);
      }
      throw error;
    }
  });
  const seen = new Set<string>();
  for (const proof of proofs) {
    if (seen.has(proof.kind)) {
      throw new InvalidEconomicGoalError(
        `EconomicGoal.proofs must not contain duplicate kinds ('${proof.kind}')`,
      );
    }
    seen.add(proof.kind);
  }
  return deepFreeze(proofs);
}
