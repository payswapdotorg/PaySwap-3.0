/**
 * @payswap/operations — provider rollout: progressive exposure gates
 * (P8-W3, hard law 6, part 2).
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/
 * provider-rollout.ts (the rollout-gate half) onto the canonical
 * architecture. The laws:
 *
 * - PROGRESSIVE EXPOSURE: a rollout walks a ladder of stages with
 *   STRICTLY INCREASING exposure (0 -> 1 -> 10 -> 50 -> 100 percent);
 *   there is no skip-ahead stage and no silent full exposure.
 * - HOLD/ROLLBACK CRITERIA ARE DATA: every stage declares its hold
 *   criteria (ALL must hold to advance) and its rollback criteria (ANY
 *   tripping forces ROLLBACK). A stage without criteria cannot exist.
 * - THE EXACT PROVIDER ENVIRONMENT IS RECORDED PER STEP: every stage
 *   verdict carries the ProviderEnvironmentRecord digest it ran under
 *   (tier, execution mode, transport class, credential handle).
 * - PARITY IS EXPLICIT: preview/production provider bindings must match
 *   on activation record and config key; ONLY the per-environment
 *   credential handle may differ.
 * - VERDICTS ARE DIGEST-CHAINED and byte-deterministic: the same
 *   (stage, observation) pair always produces the identical verdict.
 *
 * Deterministic only: pure evaluation; executing a rollout step is the
 * operator console's job (law 9).
 */

import { contentDigest, deepFreeze } from "./digest.js";
import type { EvidenceCounterKind } from "./health.js";
import { EVIDENCE_COUNTER_KINDS } from "./health.js";
import type { ProviderEnvironmentRecord } from "./provider-environment.js";

/** Raised when the rollout contract is violated. */
export class RolloutContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RolloutContractError";
  }
}

// ---------------------------------------------------------------------------
// The progressive exposure ladder
// ---------------------------------------------------------------------------

/** The canonical exposure ladder (strictly increasing percentages). */
export const ROLLOUT_STAGE_LADDER = [
  { stageId: "observe", exposurePercent: 0 },
  { stageId: "canary-1", exposurePercent: 1 },
  { stageId: "percent-10", exposurePercent: 10 },
  { stageId: "percent-50", exposurePercent: 50 },
  { stageId: "full", exposurePercent: 100 },
] as const;
export type RolloutStageId = (typeof ROLLOUT_STAGE_LADDER)[number]["stageId"];

export function exposureOf(stageId: RolloutStageId): number {
  const stage = ROLLOUT_STAGE_LADDER.find((s) => s.stageId === stageId);
  if (stage === undefined) {
    throw new RolloutContractError(`unknown rollout stage '${String(stageId)}'`);
  }
  return stage.exposurePercent;
}

// ---------------------------------------------------------------------------
// Hold / rollback criteria — as data
// ---------------------------------------------------------------------------

/** A condition that must hold for the stage to ADVANCE (else HOLD). */
export type HoldCriterion =
  | { readonly kind: "PARITY_PASSED" }
  | { readonly kind: "HEALTH_CONTRACT_PASSED" }
  | { readonly kind: "CERTIFICATION_CONCLUSIVE" }
  | { readonly kind: "PROVIDER_ENABLED" }
  | { readonly kind: "COUNTER_BELOW"; readonly counter: EvidenceCounterKind; readonly limit: number };

/** A condition that forces ROLLBACK the moment it trips. */
export type RollbackCriterion =
  | { readonly kind: "PARITY_FAILED" }
  | { readonly kind: "HEALTH_CONTRACT_FAILED" }
  | { readonly kind: "SECRET_EXPOSURE_DETECTED" }
  | { readonly kind: "COUNTER_ABOVE"; readonly counter: EvidenceCounterKind; readonly limit: number };

/** What the gates observe (pure inputs — no ambient anything). */
export interface RolloutObservation {
  readonly parityPassed: boolean;
  readonly healthContractPassed: boolean;
  readonly certificationConclusive: boolean;
  readonly providerEnabled: boolean;
  readonly secretExposureDetected: boolean;
  readonly counters: Readonly<Partial<Record<EvidenceCounterKind, number>>>;
}

/** One stage of a rollout plan: exposure + its gate criteria. */
export interface RolloutStageSpec {
  readonly stageId: RolloutStageId;
  readonly holdCriteria: readonly HoldCriterion[];
  readonly rollbackCriteria: readonly RollbackCriterion[];
}

// ---------------------------------------------------------------------------
// The rollout plan
// ---------------------------------------------------------------------------

export interface ProviderRolloutPlan {
  readonly planId: string;
  readonly providerName: string;
  /** The EXACT provider environment this rollout runs in (by record). */
  readonly environment: ProviderEnvironmentRecord;
  /** The stages this plan walks (a contiguous, increasing ladder prefix->full). */
  readonly stages: readonly RolloutStageSpec[];
  readonly plannedBy: string;
}

/**
 * Check a rollout plan: the environment is exact (already validated by
 * defineProviderEnvironment), the stages walk the canonical ladder in
 * order ending at `full`, exposure strictly increases, and EVERY stage
 * declares >= 1 hold criterion and >= 1 rollback criterion.
 */
export function checkProviderRolloutPlan(
  plan: ProviderRolloutPlan,
): { readonly ok: boolean; readonly problems: readonly string[] } {
  const problems: string[] = [];
  if (plan.planId.length < 3) {
    problems.push("planId must be a non-trivial string");
  }
  if (plan.providerName !== plan.environment.providerName) {
    problems.push(
      `plan provider '${plan.providerName}' does not match its environment record provider '${plan.environment.providerName}'`,
    );
  }
  if (plan.plannedBy.length < 2) {
    problems.push("plannedBy is required (lineage)");
  }
  if (plan.stages.length === 0) {
    problems.push("a rollout plan walks at least one stage");
  }
  let previousExposure = -1;
  plan.stages.forEach((stage, index) => {
    const ladderIndex = ROLLOUT_STAGE_LADDER.findIndex(
      (s) => s.stageId === stage.stageId,
    );
    const ladderStage =
      ladderIndex >= 0 ? ROLLOUT_STAGE_LADDER[ladderIndex] : undefined;
    if (ladderStage === undefined) {
      problems.push(`stage '${String(stage.stageId)}' is not on the canonical ladder`);
      return;
    }
    if (ladderIndex !== index) {
      problems.push(
        `stage '${stage.stageId}' is out of ladder order at position ${String(index)}`,
      );
    }
    const exposure = ladderStage.exposurePercent;
    if (exposure <= previousExposure) {
      problems.push(`exposure does not strictly increase at '${stage.stageId}'`);
    }
    previousExposure = exposure;
    if (stage.holdCriteria.length === 0) {
      problems.push(`stage '${stage.stageId}' declares no hold criteria`);
    }
    if (stage.rollbackCriteria.length === 0) {
      problems.push(`stage '${stage.stageId}' declares no rollback criteria`);
    }
    for (const criterion of [...stage.holdCriteria, ...stage.rollbackCriteria]) {
      if ("counter" in criterion) {
        if (!EVIDENCE_COUNTER_KINDS.includes(criterion.counter)) {
          problems.push(
            `stage '${stage.stageId}' references unknown counter '${String(criterion.counter)}'`,
          );
        }
        if (!Number.isInteger(criterion.limit) || criterion.limit < 0) {
          problems.push(
            `stage '${stage.stageId}' has a non-integer/negative counter limit`,
          );
        }
      }
    }
  });
  const last = plan.stages[plan.stages.length - 1];
  if (last === undefined || last.stageId !== "full") {
    problems.push("a rollout plan ends at the 'full' stage");
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// Stage-gate evaluation (pure, digest-chained)
// ---------------------------------------------------------------------------

export type RolloutVerdictKind = "ADVANCE" | "HOLD" | "ROLLBACK";

/** One stage-gate verdict — byte-deterministic, digest-chained. */
export interface RolloutStageVerdict {
  readonly planId: string;
  readonly stageId: RolloutStageId;
  readonly verdict: RolloutVerdictKind;
  /** The exact provider environment digest the verdict ran under. */
  readonly environmentDigest: string;
  /** Which rollback criteria tripped (ROLLBACK only). */
  readonly trippedRollbackCriteria: readonly string[];
  /** Which hold criteria were unmet (HOLD only). */
  readonly unmetHoldCriteria: readonly string[];
  readonly digest: string;
}

function holdCriterionHolds(
  criterion: HoldCriterion,
  observation: RolloutObservation,
): boolean {
  switch (criterion.kind) {
    case "PARITY_PASSED":
      return observation.parityPassed;
    case "HEALTH_CONTRACT_PASSED":
      return observation.healthContractPassed;
    case "CERTIFICATION_CONCLUSIVE":
      return observation.certificationConclusive;
    case "PROVIDER_ENABLED":
      return observation.providerEnabled;
    case "COUNTER_BELOW":
      return (observation.counters[criterion.counter] ?? 0) < criterion.limit;
  }
}

function rollbackCriterionTripped(
  criterion: RollbackCriterion,
  observation: RolloutObservation,
): boolean {
  switch (criterion.kind) {
    case "PARITY_FAILED":
      return !observation.parityPassed;
    case "HEALTH_CONTRACT_FAILED":
      return !observation.healthContractPassed;
    case "SECRET_EXPOSURE_DETECTED":
      return observation.secretExposureDetected;
    case "COUNTER_ABOVE":
      return (observation.counters[criterion.counter] ?? 0) > criterion.limit;
  }
}

function describeCriterion(criterion: HoldCriterion | RollbackCriterion): string {
  if ("counter" in criterion) {
    return `${criterion.kind}:${criterion.counter}:${String(criterion.limit)}`;
  }
  return criterion.kind;
}

/**
 * Evaluate one stage gate against an observation. Pure and
 * byte-deterministic: ROLLBACK wins over HOLD wins over ADVANCE —
 * any tripped rollback criterion forces ROLLBACK; otherwise all hold
 * criteria must hold to ADVANCE; otherwise HOLD.
 */
export function evaluateRolloutStage(
  plan: ProviderRolloutPlan,
  stage: RolloutStageSpec,
  observation: RolloutObservation,
): RolloutStageVerdict {
  const tripped = stage.rollbackCriteria
    .filter((criterion) => rollbackCriterionTripped(criterion, observation))
    .map(describeCriterion)
    .sort((left, right) => left.localeCompare(right, "en"));
  const unmet = stage.holdCriteria
    .filter((criterion) => !holdCriterionHolds(criterion, observation))
    .map(describeCriterion)
    .sort((left, right) => left.localeCompare(right, "en"));
  const verdict: RolloutVerdictKind =
    tripped.length > 0 ? "ROLLBACK" : unmet.length > 0 ? "HOLD" : "ADVANCE";
  const body = {
    planId: plan.planId,
    stageId: stage.stageId,
    verdict,
    environmentDigest: plan.environment.digest,
    trippedRollbackCriteria: tripped,
    unmetHoldCriteria: unmet,
  };
  return deepFreeze({ ...body, digest: contentDigest(body) });
}

// ---------------------------------------------------------------------------
// Provider parity (preview/production bindings — explicit differences)
// ---------------------------------------------------------------------------

/** The ONLY legitimate difference between two tiers' provider bindings. */
export const PROVIDER_PARITY_ALLOWED_DIFFERENCES: readonly string[] =
  Object.freeze(["credentialHandle"]);

export interface ProviderParityReport {
  readonly passed: boolean;
  readonly unexpectedDifferences: readonly string[];
  readonly digest: string;
}

/**
 * Deterministic parity diff over two provider environment records (the
 * same provider, two tiers): provider, tier-appropriate mode/transport
 * law aside, the records must match on execution discipline — the ONLY
 * allowed difference is the per-environment credential handle.
 */
export function verifyProviderParity(
  lower: ProviderEnvironmentRecord,
  higher: ProviderEnvironmentRecord,
): ProviderParityReport {
  const unexpected: string[] = [];
  if (lower.providerName !== higher.providerName) {
    unexpected.push("providerName");
  }
  if (lower.credentialConfigKey !== higher.credentialConfigKey) {
    unexpected.push("credentialConfigKey");
  }
  if (lower.executionMode !== higher.executionMode) {
    unexpected.push("executionMode");
  }
  if (lower.transportClass !== higher.transportClass) {
    unexpected.push("transportClass");
  }
  if (lower.credentialHandle !== higher.credentialHandle) {
    unexpected.push("credentialHandle");
  }
  const notAllowed = unexpected.filter(
    (difference) => !PROVIDER_PARITY_ALLOWED_DIFFERENCES.includes(difference),
  );
  const body = {
    lowerTier: lower.tier,
    higherTier: higher.tier,
    provider: lower.providerName,
    unexpectedDifferences: notAllowed,
  };
  return {
    ...body,
    passed: notAllowed.length === 0,
    digest: contentDigest(body),
  };
}
