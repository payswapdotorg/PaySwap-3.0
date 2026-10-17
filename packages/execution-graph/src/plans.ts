/**
 * @payswap/execution-graph — ExecutionPlan construction (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/execution/src/plans.ts, W3-003).
 *
 * A plan is the ordered set of connector capability steps realizing a
 * compiled economic demand. 3.0 adaptations: the merchant settlement
 * destination is the minimal EXTERNAL destination shape (payment plane is
 * P5-W3); the protocol-authorization link is the authorization PROJECTION
 * reference (this package never authorizes); every step pins its
 * observation version (LAW 1).
 */

import { ValidationError } from './errors.ts';
import { isExecutionMode } from './execution-modes.ts';
import { asExecutionPlanId } from './identifiers.ts';
import { validateObservationPin } from './observation-versions.ts';
import type { ExecutionPlan, ExecutionPlanInput, ExecutionPlanStep, PlanAuthorizationProjectionRef, PlanRemittanceDocumentRef } from './plan-contract.ts';
import type {
  PlanCompensationProfile,
  PlanPartialExecutionProfile,
  StepCompensationView,
} from './plan-contract.ts';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateAuthorizationProjectionRef(
  authorization: PlanAuthorizationProjectionRef,
): void {
  if (
    authorization === null ||
    typeof authorization !== 'object' ||
    !isNonEmptyString(authorization.projectionId) ||
    !isNonEmptyString(authorization.termsDigest) ||
    typeof authorization.projectedAt !== 'bigint' ||
    typeof authorization.validUntil !== 'bigint'
  ) {
    throw new ValidationError(
      'authorizationProjection is required on every execution plan: projection id, terms digest and an explicit validity window (no execution mode — including PASS_THROUGH_NATIVE — bypasses the projection boundary)',
    );
  }
  if (authorization.validUntil <= authorization.projectedAt) {
    throw new ValidationError(
      'the authorization projection validity window must end strictly after it starts (a degenerate window covers nothing)',
    );
  }
}

function validateSettlementDestination(destination: ExecutionPlanInput['settlementDestination']): void {
  if (
    destination === null ||
    typeof destination !== 'object' ||
    !isNonEmptyString(destination.destinationId) ||
    !isNonEmptyString(destination.kind) ||
    !isNonEmptyString(destination.currency) ||
    !isNonEmptyString(destination.externalRef)
  ) {
    throw new ValidationError(
      'settlementDestination must be an explicit external destination (never PaySwap custody)',
    );
  }
}

/**
 * Construct a validated, frozen execution plan.
 *
 * Enforces (in order):
 * - the explicit, valid execution mode + mode-detail consistency;
 * - INV-13: every step's instance is a genuinely connected, ACTIVE,
 *   eligible, fully-permitted instance implementing the step's capability;
 *   every step pins the observation version it was decided on, and the pin
 *   must belong to the step's instance (LAW 1);
 * - every referenced capability declares support for the plan's mode;
 * - PASS_THROUGH_NATIVE: exactly ONE provider step preserving the incumbent
 *   provider's flow (semantic preservation, not an authority bypass);
 * - OPTIMIZED_MULTI_PROVIDER: at least two orchestrated steps;
 * - the explicit external settlement destination, preserved remittance
 *   references and the mandatory authorization-projection link.
 */
export function defineExecutionPlan(input: ExecutionPlanInput): ExecutionPlan {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('execution plan input must be an object');
  }
  const planId = asExecutionPlanId(input.planId);

  if (!isExecutionMode(input.executionMode)) {
    throw new ValidationError(
      "executionMode is REQUIRED and must be explicit on every execution plan: PASS_THROUGH_NATIVE | COMPOSED_PAYSWAP | OPTIMIZED_MULTI_PROVIDER",
    );
  }
  const mode = input.executionMode;

  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new ValidationError('an execution plan requires at least one step');
  }

  const seenStepIds = new Set<string>();
  let expectedOrder = 1;
  for (const step of input.steps) {
    if (step === null || typeof step !== 'object') {
      throw new ValidationError('each plan step must be an ExecutionPlanStep');
    }
    if (!isNonEmptyString(step.stepId)) {
      throw new ValidationError('step.stepId must be a non-empty string');
    }
    if (seenStepIds.has(step.stepId)) {
      throw new ValidationError(`step ids must not repeat: ${step.stepId}`);
    }
    seenStepIds.add(step.stepId);
    if (step.order !== expectedOrder) {
      throw new ValidationError(
        `step order must be strictly 1..n; got ${String(step.order)} for step '${step.stepId}'`,
      );
    }
    expectedOrder += 1;
    if (!isNonEmptyString(step.role)) {
      throw new ValidationError(`step '${step.stepId}' must declare a role`);
    }
    if (!isNonEmptyString(step.capabilityId)) {
      throw new ValidationError(`step '${step.stepId}' must reference a capability id`);
    }
    // INV-13: a genuinely connected, ACTIVE, eligible, fully-permitted
    // instance is required for every step.
    const instance = step.instance;
    if (instance === null || typeof instance !== 'object' || !isNonEmptyString(instance.instanceId)) {
      throw new ValidationError(
        `step '${step.stepId}' must reference a genuinely connected instance (INV-13: a catalogue claim can never be a step)`,
      );
    }
    if (instance.capabilityId !== step.capabilityId) {
      throw new ValidationError(
        `step '${step.stepId}' references capability '${step.capabilityId}' but its instance implements '${instance.capabilityId}'`,
      );
    }
    if (instance.authorization.status !== 'ACTIVE') {
      throw new ValidationError(
        `step '${step.stepId}' references instance '${instance.instanceId}' whose authorization is '${instance.authorization.status}' — execution requires an ACTIVE connected instance (INV-13)`,
      );
    }
    if (instance.eligibility.eligible !== true) {
      throw new ValidationError(
        `step '${step.stepId}' references instance '${instance.instanceId}' which is not eligible (INV-13): ${instance.eligibility.reasons.join('; ')}`,
      );
    }
    if (instance.permissionState.missing.length > 0) {
      throw new ValidationError(
        `step '${step.stepId}' references instance '${instance.instanceId}' with missing permissions [${instance.permissionState.missing.join(', ')}] (INV-13)`,
      );
    }
    // LAW 1: the step pins the exact observation version it was decided on.
    validateObservationPin(step.pinnedObservation);
    if (step.pinnedObservation.instanceId !== instance.instanceId) {
      throw new ValidationError(
        `step '${step.stepId}' pins an observation for instance '${step.pinnedObservation.instanceId}' but executes through '${instance.instanceId}' (LAW 1: the pin must belong to the step's instance)`,
      );
    }
  }

  const detail = input.modeDetail;
  if (detail === null || typeof detail !== 'object' || detail.kind !== mode) {
    throw new ValidationError(
      'modeDetail.kind must equal the plan\'s executionMode (the mode is explicit AND consistent)',
    );
  }
  if (detail.kind === 'PASS_THROUGH_NATIVE') {
    const first = input.steps[0];
    if (input.steps.length !== 1 || first === undefined) {
      throw new ValidationError(
        'PASS_THROUGH_NATIVE preserves ONE incumbent provider flow: the plan must have exactly one step (semantic preservation of the provider-native flow/optimizer)',
      );
    }
    if (detail.incumbentProviderName !== first.instance.providerName) {
      throw new ValidationError(
        'PASS_THROUGH_NATIVE modeDetail.incumbentProviderName must match the single step\'s provider (the incumbent provider flow is preserved semantically)',
      );
    }
  } else if (detail.kind === 'COMPOSED_PAYSWAP') {
    if (!Array.isArray(detail.composedWith) || detail.composedWith.length === 0) {
      throw new ValidationError(
        'COMPOSED_PAYSWAP must declare the PaySwap capabilities composed with the provider steps',
      );
    }
  } else {
    if (!Array.isArray(detail.comparedProviders) || detail.comparedProviders.length === 0) {
      throw new ValidationError(
        'OPTIMIZED_MULTI_PROVIDER must declare the providers compared/orchestrated by the strategy',
      );
    }
    if (input.steps.length < 2) {
      throw new ValidationError(
        'OPTIMIZED_MULTI_PROVIDER orchestrates multiple reachable providers/capabilities: the plan must have at least two steps',
      );
    }
  }

  validateSettlementDestination(input.settlementDestination);
  validateAuthorizationProjectionRef(input.authorizationProjection);

  const remittance: PlanRemittanceDocumentRef[] = [];
  for (const ref of input.remittance ?? []) {
    if (
      ref === null ||
      typeof ref !== 'object' ||
      !isNonEmptyString(ref.documentKind) ||
      !isNonEmptyString(ref.documentId)
    ) {
      throw new ValidationError(
        'each remittance reference must carry a documentKind and non-empty documentId (payment-to-invoice/order/project links are preserved)',
      );
    }
    remittance.push(Object.freeze({ ...ref }));
  }

  const plan: ExecutionPlan = {
    planId,
    goalRef: input.goalRef,
    intentRef: input.intentRef,
    skeletonRef: input.skeletonRef,
    executionMode: mode,
    modeDetail: Object.freeze({ ...detail }) as ExecutionPlanInput['modeDetail'],
    steps: Object.freeze(
      input.steps.map((step) =>
        Object.freeze({
          ...step,
          pinnedObservation: step.pinnedObservation,
        }),
      ),
    ) as readonly ExecutionPlanStep[],
    settlementDestination: Object.freeze({ ...input.settlementDestination }),
    remittance: Object.freeze(remittance),
    authorizationProjection: Object.freeze({
      projectionId: input.authorizationProjection.projectionId,
      termsDigest: input.authorizationProjection.termsDigest,
      projectedAt: input.authorizationProjection.projectedAt,
      validUntil: input.authorizationProjection.validUntil,
    }),
    ...(input.strategyDirectiveRef !== undefined
      ? { strategyDirectiveRef: input.strategyDirectiveRef }
      : {}),
  };
  return Object.freeze(plan);
}

/** Structural guard for plans arriving from untyped sources. */
export function isExecutionPlan(value: unknown): value is ExecutionPlan {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<ExecutionPlan>;
  return (
    typeof candidate.planId === 'string' &&
    candidate.planId !== '' &&
    isExecutionMode(candidate.executionMode) &&
    candidate.modeDetail !== undefined &&
    candidate.modeDetail !== null &&
    typeof candidate.modeDetail.kind === 'string' &&
    candidate.modeDetail.kind === candidate.executionMode &&
    Array.isArray(candidate.steps) &&
    candidate.steps.length > 0 &&
    candidate.settlementDestination !== undefined &&
    candidate.settlementDestination !== null &&
    candidate.authorizationProjection !== undefined &&
    candidate.authorizationProjection !== null
  );
}

/** Derive the plan's compensation profile from the consumed declarations. */
export function planCompensationProfile(
  views: readonly StepCompensationView[],
): PlanCompensationProfile {
  const blocking: string[] = [];
  const requiringMechanism: string[] = [];
  for (const view of views) {
    if (!view.compensation.cancellable) {
      blocking.push(view.stepId);
    } else {
      requiringMechanism.push(view.stepId);
    }
  }
  if (blocking.length > 0) {
    return Object.freeze({
      compensable: false,
      reason: 'NON_COMPENSABLE_STEP',
      blockingStepIds: Object.freeze(blocking),
    });
  }
  return Object.freeze({
    compensable: true,
    stepsRequiringMechanism: Object.freeze(requiringMechanism),
  });
}

/**
 * Derive the plan's partial-execution profile (conservative): partial
 * execution is possible only when EVERY step's declaration supports it —
 * a single non-partial step makes the plan atomic.
 */
export function planPartialExecutionProfile(
  views: readonly StepCompensationView[],
): PlanPartialExecutionProfile {
  if (views.length === 0) {
    throw new ValidationError('a partial-execution profile requires at least one step view');
  }
  const possible = views.every((view) => view.partialExecution.supported);
  const semantics = views
    .map((view) => view.partialExecution.semantics)
    .filter((text) => text.length > 0)
    .sort()[0];
  return Object.freeze({
    possible,
    semantics: semantics ?? 'ATOMIC (no step declares partial-execution support)',
  });
}
