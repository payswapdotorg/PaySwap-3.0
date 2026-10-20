/**
 * @payswap/adversarial — expert qualification, matching and the task
 * board (P6-W3, lane r4-w3; PORT+ADAPT of payswap.org@8a735bf
 * packages/security/src/experts.ts, split for the ≤400-line file law —
 * the versioned resolution ledger + the evidence artifacts live in
 * ./expert-resolutions.ts).
 *
 * The human-fallback flow this module implements:
 *   CapabilityCase → requirements → qualified match → ExpertTask →
 *   ExpertResolution version (./expert-resolutions.ts) → evidence
 *   artifact → learning.
 *
 * EVIDENCE, NEVER HIDDEN AUTHORITY: an expert resolution carries
 * findings, a recommendation and evidence refs ONLY — there is no
 * mandate, grant, approval, epoch authorization or ledger write
 * anywhere in its shape; the ONLY consumable form is
 * `resolutionToEvidenceArtifact` (./expert-resolutions.ts), a branded
 * immutable evidence artifact. The module exposes no API that turns a
 * resolution into an authorization, a trust mutation or a financial
 * effect. Any protocol decision built on expert output happens on the
 * protocol authority path, outside this package, with the artifact as
 * evidence.
 *
 * Deterministic only: no ambient clock, no randomness; expert ordering
 * is a total deterministic order.
 */

import type { CapabilityCase } from "./capability-cases.ts";

// ---------------------------------------------------------------------------
// Qualification contracts
// ---------------------------------------------------------------------------

/** Ordered expertise levels (index order = strength order). */
export const EXPERT_LEVELS = ["practitioner", "expert", "senior"] as const;
export type ExpertLevel = (typeof EXPERT_LEVELS)[number];

export function isExpertLevel(value: unknown): value is ExpertLevel {
  return (
    typeof value === "string" &&
    (EXPERT_LEVELS as readonly unknown[]).includes(value)
  );
}

function levelRank(level: ExpertLevel): number {
  return EXPERT_LEVELS.indexOf(level);
}

/**
 * One qualification an expert holds. A qualification is itself evidence
 * (certification artifact) — an expert without qualification provenance
 * is not qualified, whatever they claim (no unrecorded authority).
 */
export interface ExpertQualification {
  readonly skillId: string;
  readonly level: ExpertLevel;
  readonly qualificationEvidence: {
    readonly evidenceId: string;
    readonly artifactRef: string;
    readonly contentDigest: string;
  };
}

/** A registered expert (the human-fallback tier). */
export interface ExpertProfile {
  readonly expertId: string;
  readonly displayName: string;
  readonly qualifications: readonly ExpertQualification[];
  /** Jurisdictions the expert may serve (ISO-3166 alpha-2 style codes). */
  readonly jurisdictions: readonly string[];
  /** An inactive expert never matches. */
  readonly active: boolean;
}

/** One requirement the human-fallback bridge demands from a resolving expert. */
export interface ExpertRequirement {
  readonly skillId: string;
  readonly minLevel: ExpertLevel;
  /** When set, the expert must serve this jurisdiction. */
  readonly jurisdiction?: string;
}

/** Raised for invalid expert-bridge operations. */
export class ExpertBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpertBridgeError";
  }
}

// ---------------------------------------------------------------------------
// Deterministic matching (requirements → qualified match)
// ---------------------------------------------------------------------------

/** The deterministic match of one expert against a requirement set. */
export interface ExpertMatch {
  readonly expertId: string;
  readonly qualified: boolean;
  /** Skill requirements satisfied (skillId + the level that satisfied it). */
  readonly satisfied: readonly { readonly skillId: string; readonly viaLevel: ExpertLevel }[];
  /** Unmet requirements, in requirement order, with the deterministic reason. */
  readonly unmet: readonly {
    readonly skillId: string;
    readonly reason:
      | "skill_missing"
      | "level_insufficient"
      | "jurisdiction_not_served"
      | "expert_inactive";
  }[];
}

function satisfiesRequirement(
  qualification: ExpertQualification,
  requirement: ExpertRequirement,
): boolean {
  return (
    qualification.skillId === requirement.skillId &&
    levelRank(qualification.level) >= levelRank(requirement.minLevel)
  );
}

/**
 * Match one expert against the requirements. Qualified iff ACTIVE,
 * every skill is held at >= minLevel, and every jurisdiction
 * requirement is served. Fail-closed: missing skill, insufficient
 * level, unserved jurisdiction and inactive experts are all
 * unqualified.
 */
export function matchExpert(
  expert: ExpertProfile,
  requirements: readonly ExpertRequirement[],
): ExpertMatch {
  const satisfied: { skillId: string; viaLevel: ExpertLevel }[] = [];
  const unmet: {
    skillId: string;
    reason:
      | "skill_missing"
      | "level_insufficient"
      | "jurisdiction_not_served"
      | "expert_inactive";
  }[] = [];
  if (!expert.active) {
    for (const requirement of requirements) {
      unmet.push({ skillId: requirement.skillId, reason: "expert_inactive" });
    }
    return { expertId: expert.expertId, qualified: false, satisfied, unmet };
  }
  for (const requirement of requirements) {
    if (
      requirement.jurisdiction !== undefined &&
      !expert.jurisdictions.includes(requirement.jurisdiction)
    ) {
      unmet.push({
        skillId: requirement.skillId,
        reason: "jurisdiction_not_served",
      });
      continue;
    }
    let best: ExpertQualification | undefined;
    for (const qualification of expert.qualifications) {
      if (qualification.skillId !== requirement.skillId) {
        continue;
      }
      if (
        best === undefined ||
        levelRank(qualification.level) > levelRank(best.level)
      ) {
        best = qualification;
      }
    }
    if (best === undefined) {
      unmet.push({ skillId: requirement.skillId, reason: "skill_missing" });
      continue;
    }
    if (levelRank(best.level) < levelRank(requirement.minLevel)) {
      unmet.push({ skillId: requirement.skillId, reason: "level_insufficient" });
      continue;
    }
    satisfied.push({ skillId: requirement.skillId, viaLevel: best.level });
  }
  return {
    expertId: expert.expertId,
    qualified: unmet.length === 0,
    satisfied,
    unmet,
  };
}

/**
 * Match every expert against the requirements. Deterministic order:
 * qualified experts first; within each class, by (satisfied count DESC,
 * expertId ASC) — a total order with no ties.
 */
export function matchExperts(
  experts: readonly ExpertProfile[],
  requirements: readonly ExpertRequirement[],
): readonly ExpertMatch[] {
  const matches = experts.map((expert) => matchExpert(expert, requirements));
  return Object.freeze(
    matches.sort((left, right) => {
      const leftQualified = left.qualified ? 1 : 0;
      const rightQualified = right.qualified ? 1 : 0;
      if (leftQualified !== rightQualified) {
        return rightQualified - leftQualified;
      }
      if (left.satisfied.length !== right.satisfied.length) {
        return right.satisfied.length - left.satisfied.length;
      }
      return left.expertId < right.expertId
        ? -1
        : left.expertId > right.expertId
          ? 1
          : 0;
    }),
  );
}

// ---------------------------------------------------------------------------
// Expert tasks (qualified match → ExpertTask)
// ---------------------------------------------------------------------------

export type ExpertTaskStatus = "dispatched" | "resolved";

/**
 * One dispatched expert task: a capability case handed to the
 * deterministically-selected qualified expert under explicit
 * requirements.
 */
export interface ExpertTask {
  readonly taskId: string;
  readonly caseId: string;
  readonly component: { readonly kind: string; readonly id: string };
  readonly requirements: readonly ExpertRequirement[];
  readonly matchedExpertId: string;
  readonly dispatchedAt: number;
  readonly status: ExpertTaskStatus;
}

/**
 * The expert task board (human-fallback dispatch). Deterministic: the
 * dispatched expert is always the first qualified match in
 * `matchExperts` order.
 */
export class ExpertTaskBoard {
  readonly #tasksById = new Map<string, ExpertTask>();
  readonly #order: string[] = [];

  /**
   * Dispatches a task for a capability case. Throws ExpertBridgeError
   * when no active expert satisfies the requirements — the bridge fails
   * closed instead of dispatching to an unqualified expert (a
   * resolution from an unqualified expert would be evidence with no
   * provenance).
   */
  dispatch(input: {
    taskId: string;
    case: CapabilityCase;
    requirements: readonly ExpertRequirement[];
    experts: readonly ExpertProfile[];
    at: number;
  }): ExpertTask {
    if (input.taskId.length === 0) {
      throw new ExpertBridgeError("taskId must not be empty");
    }
    if (input.requirements.length === 0) {
      throw new ExpertBridgeError(
        "a dispatched task requires at least one qualification requirement",
      );
    }
    for (const requirement of input.requirements) {
      if (requirement.skillId.length === 0) {
        throw new ExpertBridgeError("requirement skillId must not be empty");
      }
      if (!isExpertLevel(requirement.minLevel)) {
        throw new ExpertBridgeError(
          `unknown expert level '${String(requirement.minLevel)}'`,
        );
      }
    }
    if (this.#tasksById.has(input.taskId)) {
      throw new ExpertBridgeError(`task '${input.taskId}' already exists`);
    }
    const ranked = matchExperts(input.experts, input.requirements);
    const first = ranked[0];
    if (first === undefined || !first.qualified) {
      throw new ExpertBridgeError(
        `no qualified expert for task '${input.taskId}' (${input.requirements
          .map((requirement) => `${requirement.skillId}>=${requirement.minLevel}`)
          .join(", ")}); the human-fallback bridge does not dispatch to unqualified experts`,
      );
    }
    const task: ExpertTask = Object.freeze({
      taskId: input.taskId,
      caseId: input.case.caseId,
      component: Object.freeze({
        kind: input.case.component.kind,
        id: input.case.component.id,
      }),
      requirements: Object.freeze([...input.requirements]),
      matchedExpertId: first.expertId,
      dispatchedAt: input.at,
      status: "dispatched",
    });
    this.#tasksById.set(task.taskId, task);
    this.#order.push(task.taskId);
    return task;
  }

  byId(taskId: string): ExpertTask | undefined {
    return this.#tasksById.get(taskId);
  }

  /** All tasks in dispatch order. */
  list(): readonly ExpertTask[] {
    return this.#order.map((id) => this.#tasksById.get(id) as ExpertTask);
  }
}
