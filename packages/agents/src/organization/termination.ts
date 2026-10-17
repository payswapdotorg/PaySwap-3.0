/**
 * Organization termination and safety-policy contracts (P3-W1 net-new;
 * FROZEN §7 "termination and safety policy").
 *
 * The released organization declares WHEN a run must stop (termination
 * conditions) and WHAT hard constraints gate every action (safety policy).
 * Evaluation is deterministic and fail-closed:
 * - a safety policy citing an UNREGISTERED hard-constraint check blocks
 *   every action (an unverifiable policy is not a policy);
 * - a termination condition that cannot be evaluated from the run state
 *   fails closed (unknown condition => must-terminate assessment);
 * - when `requiresHumanApproval` is true, termination is never effective
 *   without an explicit approval artifact reference.
 *
 * The evaluators are the deterministic reference implementation (the
 * policy types live in src/organization.ts).
 */

import type { ReleasedOrganization } from "../organization.ts";

/** A recorded safety-policy violation (append-only evidence). */
export interface SafetyViolation {
  readonly violationId: string;
  readonly constraintId: string;
  readonly instanceId: string;
  readonly detail: string;
  readonly occurredAt: number;
}

/**
 * The run-state snapshot termination is evaluated against. All fields are
 * caller-supplied evidence — the assessment never reads ambient state.
 */
export interface OrganizationRunState {
  readonly orgId: string;
  readonly orgVersion: number;
  readonly exhaustedBudgetIds: readonly string[];
  readonly violations: readonly SafetyViolation[];
  readonly recordedAt: number;
  /** Optional declared deadline instant ("deadline-elapsed" condition). */
  readonly deadlineElapsedAt?: number;
}

/** Deterministic termination assessment of one run state. */
export interface TerminationAssessment {
  readonly orgId: string;
  readonly orgVersion: number;
  /** True when any declared termination condition holds. */
  readonly shouldTerminate: boolean;
  /** The triggered conditions, in declared order. */
  readonly triggeredConditions: readonly string[];
  /** True when termination additionally requires a human approval. */
  readonly humanApprovalRequired: boolean;
  /**
   * The approval artifact reference that made an approval-required
   * termination effective (present only after the approval was presented).
   */
  readonly approvalArtifactRef?: string;
}

/** Raised when termination/safety evaluation fails closed. */
export class TerminationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerminationError";
  }
}

/**
 * Built-in termination-condition evaluators (deterministic; the vocabulary
 * is extensible by the composition root, every extension must stay pure):
 * - "budget-exhausted"  — any declared budget id is fully consumed.
 * - "safety-violation"  — any safety violation is recorded.
 * - "deadline-elapsed"  — the run state is stamped past a declared deadline
 *   (the deadline instant is carried on the run state).
 */
export const BUILTIN_TERMINATION_CONDITIONS: Readonly<
  Record<string, (state: OrganizationRunState) => boolean>
> = Object.freeze({
  "budget-exhausted": (state) => state.exhaustedBudgetIds.length > 0,
  "safety-violation": (state) => state.violations.length > 0,
  "deadline-elapsed": (state) =>
    state.deadlineElapsedAt !== undefined && state.recordedAt >= state.deadlineElapsedAt,
});

/**
 * Assess one run state against a released organization's termination
 * policy (deterministic, fail closed):
 * - an UNREGISTERED condition fails closed: an organization whose
 *   termination policy cannot be fully evaluated must terminate;
 * - when the policy requires human approval, the assessment is not
 *   effective until an approval artifact reference is presented
 *   (applyTerminationApproval).
 */
export function assessTermination(
  org: ReleasedOrganization,
  state: OrganizationRunState,
  extraConditions: Readonly<Record<string, (state: OrganizationRunState) => boolean>> = {},
): TerminationAssessment {
  if (state.orgId !== org.id || state.orgVersion !== org.version) {
    throw new TerminationError(
      `run state belongs to ${state.orgId}@${state.orgVersion}, not to ${org.id}@${org.version}: termination never crosses organization versions`,
    );
  }
  const evaluators: Readonly<Record<string, (state: OrganizationRunState) => boolean>> = {
    ...BUILTIN_TERMINATION_CONDITIONS,
    ...extraConditions,
  };
  const unknown = org.termination.conditions.filter(
    (condition) => evaluators[condition] === undefined,
  );
  if (unknown.length > 0) {
    // Fail closed: an unevaluable termination policy terminates the run.
    return {
      orgId: org.id,
      orgVersion: org.version,
      shouldTerminate: true,
      triggeredConditions: unknown.map(
        (condition) => `unknown-condition:${condition}`,
      ),
      humanApprovalRequired: org.termination.requiresHumanApproval,
    };
  }
  const triggered = org.termination.conditions.filter((condition) => {
    const evaluator = evaluators[condition];
    return evaluator !== undefined && evaluator(state);
  });
  return {
    orgId: org.id,
    orgVersion: org.version,
    shouldTerminate: triggered.length > 0,
    triggeredConditions: triggered,
    humanApprovalRequired:
      triggered.length > 0 ? org.termination.requiresHumanApproval : false,
  };
}

/**
 * Make an approval-required termination effective by presenting the
 * approval artifact reference. An assessment that does not require approval
 * or is not terminating rejects the presentation.
 */
export function applyTerminationApproval(
  assessment: TerminationAssessment,
  approvalArtifactRef: string,
): TerminationAssessment {
  if (!assessment.shouldTerminate) {
    throw new TerminationError(
      "cannot apply a termination approval to a non-terminating assessment",
    );
  }
  if (!assessment.humanApprovalRequired) {
    throw new TerminationError(
      "cannot apply a termination approval to an assessment that does not require one",
    );
  }
  if (approvalArtifactRef.length === 0) {
    throw new TerminationError("approvalArtifactRef must not be empty");
  }
  return {
    ...assessment,
    approvalArtifactRef,
  };
}

/**
 * The safety-policy gate (deterministic, fail closed):
 * - the composition root REGISTERS a concrete check per hard-constraint id;
 * - an action is gated through EVERY declared hard constraint of the
 *   organization's safety policy;
 * - a policy citing an UNREGISTERED constraint blocks every action (an
 *   unverifiable safety policy is not a policy).
 */
export class SafetyPolicyGate {
  readonly #org: ReleasedOrganization;
  readonly #checks: Readonly<Record<string, (action: string) => boolean>>;

  constructor(
    org: ReleasedOrganization,
    checks: Readonly<Record<string, (action: string) => boolean>>,
  ) {
    this.#org = org;
    this.#checks = { ...checks };
  }

  /** The constraint ids declared by the policy but not backed by a check. */
  unresolvedConstraints(): readonly string[] {
    return this.#org.safetyPolicy.hardConstraints.filter(
      (constraint) => this.#checks[constraint] === undefined,
    );
  }

  /**
   * Gate one action through the full declared safety policy. Returns the
   * violated constraint ids (empty = permitted). An unresolved policy fails
   * closed: every declared constraint is reported as violated.
   */
  checkAction(action: string): readonly string[] {
    const unresolved = this.unresolvedConstraints();
    if (unresolved.length > 0) {
      return [...this.#org.safetyPolicy.hardConstraints];
    }
    const violated: string[] = [];
    for (const constraint of this.#org.safetyPolicy.hardConstraints) {
      const check = this.#checks[constraint];
      if (check !== undefined && !check(action)) {
        violated.push(constraint);
      }
    }
    return violated;
  }
}
