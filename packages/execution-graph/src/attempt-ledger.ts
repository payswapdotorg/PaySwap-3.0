/**
 * @payswap/execution-graph — the ExecutionAttemptLedger (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/execution/src/attempts.ts, second half).
 *
 * Idempotent, retry-safe, evidence-preserving, observation-version-pinned.
 * Deterministic reference implementation over the local kernel's idempotency
 * registrar; the storage-agnostic contract is the class shape itself
 * (production replaces persistence, not semantics).
 *
 * Laws enforced here:
 * - INV-06: one idempotency scope maps to one authoritative attempt; a
 *   conflicting re-use of a key throws; in-flight duplicates REPLAY;
 * - INV-03: terminal transitions are monotonic except the explicit RECOVER
 *   recovery; history and evidence are append-only and immutable;
 * - INV-05: every external-effect event REQUIRES linked provider evidence;
 * - INV-04: OUTCOME_UNKNOWN is left ONLY through a reconciliation resolution
 *   carrying provider evidence (the reconciliation authority is the only
 *   caller that can supply one); UNKNOWN external writes are never blindly
 *   retried;
 * - LAW 1: the attempt's pinned observation version is frozen at BEGIN and
 *   never rewritten by newer observations.
 */

import {
  AttemptIdempotencyConflictError,
  AttemptRetryForbiddenError,
  ValidationError,
} from './errors.ts';
import { InMemoryIdempotencyRegistrar } from './kernel.ts';
import type { IdempotencyRegistrar } from './kernel.ts';
import {
  attemptCommandHash,
  attemptResultHash,
  attemptStateMachine,
  buildTransitionRecord,
  eventRequiresProviderEvidence,
  stampEvidence,
  validateAttemptSemantics,
  validateBeginFields,
} from './attempts.ts';
import { asExecutionAttemptId } from './identifiers.ts';
import type { ExecutionAttemptId } from './identifiers.ts';
import type {
  AdvanceAttemptInput,
  BeginAttemptOutcome,
  BeginExecutionAttemptInput,
  ExecutionAttempt,
  ExecutionAttemptEvent,
  ProviderExecutionEvidence,
  ProviderExecutionEvidenceDraft,
} from './attempt-contract.ts';
import type { ProviderStateEnvelope } from '@payswap/capability';
import type { TimestampMs } from '@payswap/protocol';

/**
 * The execution attempt ledger. `advance` enforces the full transition
 * discipline; `requestRetry` re-arms ONLY definitively FAILED attempts
 * whose capability declared SAFE_TO_RETRY; `attachEvidence` appends
 * webhook-late evidence immutably.
 */
export class ExecutionAttemptLedger {
  readonly #registrar: IdempotencyRegistrar;
  readonly #attempts = new Map<string, ExecutionAttempt>();
  readonly #byPlan = new Map<string, ExecutionAttempt[]>();
  readonly #evidenceById = new Map<string, ProviderExecutionEvidence>();

  constructor(registrar?: IdempotencyRegistrar) {
    this.#registrar = registrar ?? new InMemoryIdempotencyRegistrar();
  }

  /**
   * Begin an attempt under INV-06 discipline: the (commandType, principal,
   * key) scope maps to one authoritative attempt. In-flight duplicates
   * REPLAY the recorded attempt; a different command under the same key
   * CONFLICTS. The command hash includes the LAW 1 observation pin, so the
   * same key decided on a DIFFERENT observation version is a conflict.
   */
  begin(input: BeginExecutionAttemptInput): BeginAttemptOutcome {
    validateBeginFields(input);
    const attemptId = asExecutionAttemptId(input.attemptId);
    if (this.#attempts.has(attemptId)) {
      throw new ValidationError(`attempt id '${attemptId}' is already recorded`);
    }
    const semantics = validateAttemptSemantics({
      cancellation: input.cancellation,
      compensation: input.compensation,
    });

    const scope = {
      commandType: 'execution.attempt',
      principal: input.principal,
      key: input.idempotencyKey,
    };
    const commandHash = attemptCommandHash({
      planId: input.planId,
      stepId: input.stepId,
      capabilityInstanceId: input.capabilityInstanceId,
      executionMode: input.executionMode,
      principal: input.principal,
      pinnedObservation: input.pinnedObservation,
    });
    const outcome = this.#registrar.begin(scope, commandHash);
    if (outcome.kind === 'CONFLICT') {
      throw new AttemptIdempotencyConflictError(
        `INV-06: idempotency key '${input.idempotencyKey}' is already bound to a different command`,
        { principal: input.principal.principalId, commandHash },
      );
    }
    if (outcome.kind === 'REPLAY') {
      const existing = this.#findAttemptByScope(scope, commandHash);
      if (existing !== undefined) {
        return { kind: 'REPLAY', attempt: existing, commandHash };
      }
      // The registrar knows the scope but this ledger never recorded it: a
      // different ledger instance shares the registrar. Fail closed.
      throw new AttemptIdempotencyConflictError(
        `INV-06: idempotency key '${input.idempotencyKey}' replays a command this ledger did not record`,
        { commandHash },
      );
    }

    const attempt: ExecutionAttempt = Object.freeze({
      attemptId,
      planId: input.planId,
      stepId: input.stepId,
      executionMode: input.executionMode,
      capabilityInstanceId: input.capabilityInstanceId,
      capabilityId: input.capabilityId,
      retryPolicy: input.retryPolicy,
      semantics,
      state: 'PENDING',
      idempotencyKey: input.idempotencyKey,
      principal: Object.freeze({ ...input.principal }),
      commandHash,
      pinnedObservation: input.pinnedObservation,
      createdAt: input.now,
      updatedAt: input.now,
      history: Object.freeze([]),
      evidence: Object.freeze([]),
    });
    this.#attempts.set(attemptId, attempt);
    const list = this.#byPlan.get(attempt.planId) ?? [];
    list.push(attempt);
    this.#byPlan.set(attempt.planId, list);
    return { kind: 'BEGIN', attempt };
  }

  /**
   * Advance an attempt by a declared event. Enforces the terminality law
   * (via the kernel machine), evidence gating for external effects, the
   * OUTCOME_UNKNOWN exit rule (reconciliation resolutions only) and
   * evidence immutability. The LAW 1 observation pin is carried verbatim.
   */
  advance(
    attemptId: string,
    event: ExecutionAttemptEvent,
    input: AdvanceAttemptInput,
  ): ExecutionAttempt {
    const current = this.#attempts.get(attemptId);
    if (current === undefined) {
      throw new ValidationError(`unknown execution attempt: ${attemptId}`);
    }
    if (input === null || typeof input !== 'object' || typeof input.now !== 'bigint') {
      throw new ValidationError('advance input must carry now: TimestampMs');
    }

    // INV-04: leaving OUTCOME_UNKNOWN is possible ONLY through a
    // reconciliation resolution carrying provider evidence.
    if (current.state === 'OUTCOME_UNKNOWN') {
      if (event !== 'RECONCILE_RESOLVED_SUCCEEDED' && event !== 'RECONCILE_RESOLVED_FAILED') {
        throw new ValidationError(
          'INV-04: an OUTCOME_UNKNOWN attempt can only leave its state through a reconciliation resolution (RECONCILE_RESOLVED_SUCCEEDED | RECONCILE_RESOLVED_FAILED)',
        );
      }
      const resolution = input.resolution;
      if (resolution === undefined || resolution === null) {
        throw new ValidationError(
          'INV-04: resolving an OUTCOME_UNKNOWN attempt requires a reconciliation resolution',
        );
      }
      if (resolution.evidence.length === 0) {
        throw new ValidationError(
          'INV-04: a reconciliation resolution must carry provider evidence',
        );
      }
      if (
        (event === 'RECONCILE_RESOLVED_SUCCEEDED' &&
          resolution.resolvedOutcome !== 'CONFIRMED_SUCCEEDED') ||
        (event === 'RECONCILE_RESOLVED_FAILED' &&
          resolution.resolvedOutcome !== 'CONFIRMED_FAILED')
      ) {
        throw new ValidationError(
          'INV-04: the resolution outcome must match the reconciliation event',
        );
      }
    } else if (event === 'RECONCILE_RESOLVED_SUCCEEDED' || event === 'RECONCILE_RESOLVED_FAILED') {
      throw new ValidationError(
        'reconciliation resolution events apply only to OUTCOME_UNKNOWN attempts',
      );
    }

    // INV-03: the kernel machine throws TerminalStateViolationError for any
    // non-recovery exit from a terminal state, and IllegalTransitionError
    // for undeclared moves.
    const transition = attemptStateMachine.transition(current.state, event);

    const drafts = input.evidence ?? [];
    const evidenceRequires = eventRequiresProviderEvidence(current.state, event);
    if (evidenceRequires && drafts.length === 0) {
      throw new ValidationError(
        `INV-05: event '${event}' on attempt state '${current.state}' represents an external effect and requires linked provider evidence`,
      );
    }
    const stamped = stampEvidence(current, drafts, this.#evidenceById);

    const record = buildTransitionRecord(
      transition.from,
      transition.on,
      transition.to,
      transition.viaRecovery,
      input.now,
      stamped.map((entry) => entry.evidenceId),
    );
    // INV-14: the latest observed provider state is preserved verbatim.
    const latestEvidenceState = [...stamped]
      .reverse()
      .find((entry) => entry.providerState !== undefined)?.providerState;
    const nextProviderState: ProviderStateEnvelope | undefined =
      latestEvidenceState ?? input.providerState ?? current.providerState;
    const next: ExecutionAttempt = Object.freeze({
      ...current,
      state: transition.to,
      updatedAt: input.now,
      history: Object.freeze([...current.history, record]),
      evidence: Object.freeze([...current.evidence, ...stamped]),
      ...(nextProviderState !== undefined ? { providerState: nextProviderState } : {}),
    });
    this.#attempts.set(attemptId, next);
    this.#replaceInPlanIndex(next);

    // INV-06 idempotency discipline at terminalization:
    // - the FIRST terminalization of a non-terminal attempt binds the scope:
    //   FAILED -> the registrar's FAILED status (retry re-arms), other
    //   terminals -> COMPLETED with a deterministic result hash;
    // - an explicit RECOVER out of a terminal state is a recorded recovery,
    //   not a new authoritative command result: the registrar is untouched.
    if (
      attemptStateMachine.isTerminal(transition.to) &&
      !attemptStateMachine.isTerminal(current.state)
    ) {
      const scope = {
        commandType: 'execution.attempt',
        principal: next.principal,
        key: next.idempotencyKey,
      };
      if (transition.to === 'FAILED') {
        this.#registrar.fail(scope);
      } else {
        this.#registrar.complete(scope, attemptResultHash(next));
      }
    }
    return next;
  }

  /**
   * INV-04: UNKNOWN external writes are never blindly retried. Retrying is
   * admissible ONLY for definitively FAILED attempts whose capability
   * declared SAFE_TO_RETRY; everything else — and above all
   * OUTCOME_UNKNOWN — fails closed.
   */
  requestRetry(attemptId: string, retryAttemptId: string, now: TimestampMs): ExecutionAttempt {
    const attempt = this.#attempts.get(attemptId);
    if (attempt === undefined) {
      throw new ValidationError(`unknown execution attempt: ${attemptId}`);
    }
    if (attempt.state === 'OUTCOME_UNKNOWN') {
      throw new AttemptRetryForbiddenError(
        'INV-04: the external write outcome is UNKNOWN — a blind retry is forbidden; reconciliation must resolve the ambiguity first',
        { attemptId, state: attempt.state },
      );
    }
    if (attempt.state !== 'FAILED') {
      throw new AttemptRetryForbiddenError(
        `only definitively FAILED attempts may be retried (attempt is '${attempt.state}')`,
        { attemptId, state: attempt.state },
      );
    }
    if (attempt.retryPolicy !== 'SAFE_TO_RETRY') {
      throw new AttemptRetryForbiddenError(
        'the capability declares REQUIRES_RECONCILIATION: this failure must be reconciled, not retried (INV-04)',
        { attemptId, retryPolicy: attempt.retryPolicy },
      );
    }
    // INV-06: the registrar re-arms the FAILED scope (BEGIN again), under
    // the SAME pinned observation version (LAW 1: a retry decided on a newer
    // observation is a different command and must not reuse the key).
    return this.begin({
      attemptId: retryAttemptId,
      planId: attempt.planId,
      stepId: attempt.stepId,
      executionMode: attempt.executionMode,
      capabilityInstanceId: attempt.capabilityInstanceId,
      capabilityId: attempt.capabilityId,
      retryPolicy: attempt.retryPolicy,
      cancellation: attempt.semantics.cancellation,
      compensation: attempt.semantics.compensation,
      idempotencyKey: attempt.idempotencyKey,
      principal: attempt.principal,
      pinnedObservation: attempt.pinnedObservation,
      now,
    }).attempt;
  }

  /**
   * Attach additional provider evidence (e.g. webhook evidence arriving
   * after the effect). Append-only and immutable.
   */
  attachEvidence(
    attemptId: string,
    drafts: readonly ProviderExecutionEvidenceDraft[],
  ): ExecutionAttempt {
    const current = this.#attempts.get(attemptId);
    if (current === undefined) {
      throw new ValidationError(`unknown execution attempt: ${attemptId}`);
    }
    const stamped = stampEvidence(current, drafts, this.#evidenceById);
    if (stamped.length === 0) {
      return current;
    }
    const latestEvidenceState = [...stamped]
      .reverse()
      .find((entry) => entry.providerState !== undefined)?.providerState;
    const next: ExecutionAttempt = Object.freeze({
      ...current,
      evidence: Object.freeze([...current.evidence, ...stamped]),
      ...(latestEvidenceState !== undefined ? { providerState: latestEvidenceState } : {}),
    });
    this.#attempts.set(attemptId, next);
    this.#replaceInPlanIndex(next);
    return next;
  }

  /** The current record of one attempt. */
  attempt(attemptId: string): ExecutionAttempt | undefined {
    return this.#attempts.get(attemptId);
  }

  /** All attempts recorded for one plan (in recording order). */
  attemptsForPlan(planId: string): readonly ExecutionAttempt[] {
    return [...(this.#byPlan.get(planId) ?? [])];
  }

  /** The evidence recorded for one attempt, in recording order (INV-05). */
  evidenceFor(attemptId: string): readonly ProviderExecutionEvidence[] {
    const attempt = this.#attempts.get(attemptId);
    return attempt === undefined ? [] : [...attempt.evidence];
  }

  /** Evidence lookup by id (immutable once recorded). */
  evidenceById(evidenceId: string): ProviderExecutionEvidence | undefined {
    return this.#evidenceById.get(evidenceId);
  }

  // -- internals ------------------------------------------------------------

  #findAttemptByScope(
    scope: { commandType: string; principal: { principalType: string; principalId: string }; key: string },
    commandHash: string,
  ): ExecutionAttempt | undefined {
    for (const attempt of this.#attempts.values()) {
      if (
        attempt.idempotencyKey === scope.key &&
        attempt.principal.principalType === scope.principal.principalType &&
        attempt.principal.principalId === scope.principal.principalId &&
        attempt.commandHash === commandHash
      ) {
        return attempt;
      }
    }
    return undefined;
  }

  #replaceInPlanIndex(next: ExecutionAttempt): void {
    const list = this.#byPlan.get(next.planId);
    if (list === undefined) {
      this.#byPlan.set(next.planId, [next]);
      return;
    }
    const index = list.findIndex((entry) => entry.attemptId === next.attemptId);
    if (index >= 0) {
      list[index] = next;
    } else {
      list.push(next);
    }
  }
}
