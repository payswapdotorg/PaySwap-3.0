import { describe, expect, it } from 'vitest';
import {
  defineExecutionPlan,
  isExecutionPlan,
  planCompensationProfile,
  planPartialExecutionProfile,
} from '../src/index.ts';
import type { ExecutionPlanInput, ExecutionPlanStep } from '../src/index.ts';
import {
  makeCompensationPolicy,
  makeInstance,
  makeObservation,
  makePartialExecutionPolicy,
  makeSecondInstance,
  NOW,
  PIN_V1,
  PIN_V1_ALT_INSTANCE,
} from './fixtures.ts';
import { pinObservation } from '../src/index.ts';

/**
 * ExecutionPlan (P3-W2; ADAPT of payswap.org@8a735bf
 * packages/execution/test/plans.test.ts, W3-003 — 10 tests ported/adapted +
 * 1 net-new projection-linkage test). 3.0 adaptations: the protocol
 * authorization link is the authorization PROJECTION reference; the
 * settlement destination is the minimal external shape; every step pins
 * its observation version (LAW 1).
 */
const PROJECTION_REF = {
  projectionId: 'proj_1',
  termsDigest: 'digest:terms:1',
  projectedAt: NOW,
  validUntil: NOW + 600_000n,
};

function step(
  order: number,
  instance: ReturnType<typeof makeInstance>,
  pin = PIN_V1,
): ExecutionPlanStep {
  return {
    stepId: `step_${order}`,
    order,
    role: 'collect',
    capabilityId: instance.capabilityId,
    instance,
    pinnedObservation: pin,
    providerRequest: { amount: 10_000n },
  };
}

function baseInput(): ExecutionPlanInput {
  return {
    planId: 'plan_1',
    goalRef: 'goal_1',
    intentRef: 'intent_1',
    skeletonRef: 'skeleton_1',
    executionMode: 'COMPOSED_PAYSWAP',
    modeDetail: { kind: 'COMPOSED_PAYSWAP', composedWith: ['payswap.fx.convert'] },
    steps: [step(1, makeInstance())],
    settlementDestination: {
      destinationId: 'dest_bank_1',
      kind: 'BANK_ACCOUNT',
      currency: 'USD',
      externalRef: 'bank://external/1',
    },
    remittance: [{ documentKind: 'INVOICE', documentId: 'invoice_9' }],
    authorizationProjection: PROJECTION_REF,
  };
}

describe('ExecutionPlan (P3-W2)', () => {
  it('builds a valid plan with remittance and explicit external settlement preserved', () => {
    const plan = defineExecutionPlan(baseInput());
    expect(plan.executionMode).toBe('COMPOSED_PAYSWAP');
    expect(plan.steps).toHaveLength(1);
    expect(plan.remittance[0]).toEqual({ documentKind: 'INVOICE', documentId: 'invoice_9' });
    expect(plan.settlementDestination.destinationId).toBe('dest_bank_1');
    expect(plan.authorizationProjection.projectionId).toBe('proj_1');
    expect(isExecutionPlan(plan)).toBe(true);
  });

  it('the execution mode is explicit and the authorization projection is mandatory — no mode bypasses it', () => {
    const input = baseInput();
    expect(() =>
      defineExecutionPlan({
        ...input,
        executionMode: 'AUTO' as never,
        modeDetail: { kind: 'AUTO' } as never,
      }),
    ).toThrow(/PASS_THROUGH_NATIVE \| COMPOSED_PAYSWAP \| OPTIMIZED_MULTI_PROVIDER/);

    // Missing projection is rejected in every mode (no bypass).
    const noProjection = baseInput();
    expect(() =>
      defineExecutionPlan({ ...noProjection, authorizationProjection: undefined as never }),
    ).toThrow(/authorizationProjection is required/);

    // Degenerate validity windows are rejected (fail closed).
    expect(() =>
      defineExecutionPlan({
        ...baseInput(),
        authorizationProjection: { ...PROJECTION_REF, validUntil: PROJECTION_REF.projectedAt },
      }),
    ).toThrow(/strictly after/);
  });

  it('INV-13: a provider catalogue entry can never be an execution step', () => {
    const input = baseInput();
    const catalogueStep = {
      ...input.steps[0]!,
      instance: {
        // an advertisement where an instance is required: no instanceId,
        // no authorization, no permission state — not an execution surface
        catalogueEntryId: 'cat-1',
        providerName: 'test-psp',
        capabilityId: 'cap.mobile_money.collect',
        summary: 'Advertised platform-wide',
      } as never,
    };
    expect(() => defineExecutionPlan({ ...input, steps: [catalogueStep] })).toThrow(
      /genuinely connected instance/,
    );
  });

  it('INV-13: instances that are not authorized, eligible or fully permitted are rejected', () => {
    const input = baseInput();
    const unauthorized = makeInstance({ authorization: { status: 'REVOKED' } });
    expect(() =>
      defineExecutionPlan({
        ...input,
        steps: [step(1, unauthorized, pinObservation(makeObservation()))],
      }),
    ).toThrow(/ACTIVE/);

    const ineligible = makeInstance({ eligibility: { eligible: false, reasons: ['geo'] } });
    expect(() =>
      defineExecutionPlan({
        ...input,
        steps: [step(1, ineligible, pinObservation(makeObservation()))],
      }),
    ).toThrow(/not eligible/);

    const missingPermissions = makeInstance({
      permissionState: { granted: [], requested: ['payments:write'], missing: ['payments:write'] },
    });
    expect(() =>
      defineExecutionPlan({
        ...input,
        steps: [step(1, missingPermissions, pinObservation(makeObservation()))],
      }),
    ).toThrow(/missing permissions/);
  });

  it('LAW 1: a step whose observation pin belongs to another instance is rejected', () => {
    const input = baseInput();
    // The pin is for a different instance than the step executes through.
    expect(() =>
      defineExecutionPlan({ ...input, steps: [step(1, makeInstance(), PIN_V1_ALT_INSTANCE)] }),
    ).toThrow(/the pin must belong to the step's instance/);
    // A malformed pin (version 0) is rejected fail-closed.
    expect(() =>
      defineExecutionPlan({
        ...input,
        steps: [
          step(1, makeInstance(), {
            ...PIN_V1,
            observationVersion: 0,
          }),
        ],
      }),
    ).toThrow(/positive integer/);
  });

  it('PASS_THROUGH_NATIVE preserves exactly ONE incumbent provider step while traversing the projection boundary', () => {
    const input = baseInput();
    const plan = defineExecutionPlan({
      ...input,
      executionMode: 'PASS_THROUGH_NATIVE',
      modeDetail: {
        kind: 'PASS_THROUGH_NATIVE',
        incumbentProviderName: 'test-psp',
        preservesNativeFlow: true,
      },
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.modeDetail.kind).toBe('PASS_THROUGH_NATIVE');
    // The incumbent provider flow is preserved semantically...
    expect(plan.steps[0]!.instance.providerName).toBe('test-psp');
    // ...while the authorization-projection boundary is still traversed.
    expect(plan.authorizationProjection.projectionId).toBe('proj_1');

    // Mismatched incumbent provider name is rejected.
    expect(() =>
      defineExecutionPlan({
        ...input,
        executionMode: 'PASS_THROUGH_NATIVE',
        modeDetail: {
          kind: 'PASS_THROUGH_NATIVE',
          incumbentProviderName: 'someone-else',
          preservesNativeFlow: true,
        },
      }),
    ).toThrow(/incumbent provider flow is preserved/);

    // More than one step is not pass-through of one incumbent flow.
    const secondPin = pinObservation(makeObservation({ instanceId: 'inst-usdc-1' }));
    expect(() =>
      defineExecutionPlan({
        ...baseInput(),
        executionMode: 'PASS_THROUGH_NATIVE',
        modeDetail: {
          kind: 'PASS_THROUGH_NATIVE',
          incumbentProviderName: 'test-psp',
          preservesNativeFlow: true,
        },
        steps: [step(1, makeInstance()), step(2, makeSecondInstance(), secondPin)],
      }),
    ).toThrow(/exactly one step/);
  });

  it('OPTIMIZED_MULTI_PROVIDER orchestrates at least two steps', () => {
    const secondPin = pinObservation(makeObservation({ instanceId: 'inst-usdc-1' }));
    const plan = defineExecutionPlan({
      ...baseInput(),
      executionMode: 'OPTIMIZED_MULTI_PROVIDER',
      modeDetail: {
        kind: 'OPTIMIZED_MULTI_PROVIDER',
        comparedProviders: ['test-psp', 'test-psp-2'],
      },
      steps: [step(1, makeInstance()), step(2, makeSecondInstance(), secondPin)],
    });
    expect(plan.steps).toHaveLength(2);
    expect(() =>
      defineExecutionPlan({
        ...baseInput(),
        executionMode: 'OPTIMIZED_MULTI_PROVIDER',
        modeDetail: { kind: 'OPTIMIZED_MULTI_PROVIDER', comparedProviders: ['test-psp'] },
      }),
    ).toThrow(/at least two steps/);
  });

  it('INV-15: the provider-native incumbent baseline remains executable as a PASS_THROUGH_NATIVE step', () => {
    const nativeBaseline = makeInstance({
      configuration: { nativeRoutingBaseline: true, simulatedRailId: 'rail-a' },
    });
    const plan = defineExecutionPlan({
      planId: 'plan_native',
      goalRef: 'goal_1',
      intentRef: 'intent_1',
      skeletonRef: 'skeleton_1',
      executionMode: 'PASS_THROUGH_NATIVE',
      modeDetail: {
        kind: 'PASS_THROUGH_NATIVE',
        incumbentProviderName: 'test-psp',
        preservesNativeFlow: true,
      },
      steps: [step(1, nativeBaseline, pinObservation(makeObservation()))],
      settlementDestination: {
        destinationId: 'dest_bank_1',
        kind: 'BANK_ACCOUNT',
        currency: 'USD',
        externalRef: 'bank://external/1',
      },
      authorizationProjection: PROJECTION_REF,
    });
    expect(plan.steps[0]!.instance.configuration['nativeRoutingBaseline']).toBe(true);
    expect(plan.executionMode).toBe('PASS_THROUGH_NATIVE');
  });

  it('derives compensation and partial-execution profiles from the consumed declarations', () => {
    const plan = defineExecutionPlan(baseInput());
    void plan;
    const profile = planCompensationProfile([
      {
        stepId: 'step_1',
        compensation: makeCompensationPolicy(), // fixture default: NOT cancellable
        partialExecution: makePartialExecutionPolicy(),
      },
    ]);
    expect(profile.compensable).toBe(false); // fixture capability is non-compensable
    const partial = planPartialExecutionProfile([
      {
        stepId: 'step_1',
        compensation: makeCompensationPolicy(),
        partialExecution: makePartialExecutionPolicy(),
      },
    ]);
    expect(partial.possible).toBe(true);
    expect(partial.semantics).toContain('fraction');

    // Conservative reading: one non-partial step makes the plan atomic.
    const mixed = planPartialExecutionProfile([
      {
        stepId: 'step_1',
        compensation: makeCompensationPolicy(),
        partialExecution: makePartialExecutionPolicy({ supported: false, semantics: 'atomic' }),
      },
      {
        stepId: 'step_2',
        compensation: makeCompensationPolicy(),
        partialExecution: makePartialExecutionPolicy(),
      },
    ]);
    expect(mixed.possible).toBe(false);
  });

  it('preserves payment-to-invoice/order/project remittance references', () => {
    const plan = defineExecutionPlan({
      ...baseInput(),
      remittance: [
        { documentKind: 'INVOICE', documentId: 'inv_1' },
        { documentKind: 'ORDER', documentId: 'ord_1' },
        { documentKind: 'PROJECT_MILESTONE', documentId: 'pm_1' },
      ],
    });
    expect(plan.remittance.map((ref) => ref.documentKind)).toEqual([
      'INVOICE',
      'ORDER',
      'PROJECT_MILESTONE',
    ]);
  });

  it('carries economic lineage (goal -> intent -> skeleton) and the strategy advisory lineage is optional', () => {
    const plan = defineExecutionPlan({
      ...baseInput(),
      strategyDirectiveRef: 'directive:1:SETTLE_NOW',
    });
    expect(plan.goalRef).toBe('goal_1');
    expect(plan.intentRef).toBe('intent_1');
    expect(plan.skeletonRef).toBe('skeleton_1');
    expect(plan.strategyDirectiveRef).toBe('directive:1:SETTLE_NOW');
    // And absent when not supplied (an operator-supplied plan may carry none).
    expect(defineExecutionPlan(baseInput()).strategyDirectiveRef).toBeUndefined();
  });
});
