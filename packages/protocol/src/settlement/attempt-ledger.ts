/**
 * @payswap/protocol — the settlement attempt ledger (P1-W2, MMI-12 PORT).
 *
 * Adapted from payswap.org@8a735bf packages/settlement/src/instructions.ts
 * (old Work Order W1-004; the ledger half — the record contract and
 * lifecycle machine live in attempts.ts). Idempotent (INV-06), retry-safe,
 * evidence-linked (INV-05), terminality-monotonic (INV-03/04).
 *
 * Deterministic reference implementation over the protocol kernel's
 * idempotency registrar (production replaces persistence, not semantics).
 */

import { ValidationError } from '../errors.ts';
import { PaySwapError } from '../errors.ts';
import type { PaySwapErrorDetails } from '../errors.ts';
import type { TimestampMs } from '../clock.ts';
import { InMemoryIdempotencyRegistrar } from '../idempotency.ts';
import type { IdempotencyRegistrar } from '../idempotency.ts';
import type { PrincipalRef } from '../identifiers.ts';
import type { SettlementInstructionId } from '../netting.ts';
import { asSettlementInstructionId } from '../netting.ts';
import type { IdempotencyRecord } from '../idempotency.ts';
import {
  asSettlementAttemptId,
  settlementAttemptStateMachine,
  settlementCommandHash,
  settlementResultHash,
} from './attempts.ts';
import {
  SettlementAttemptConflictError,
  SettlementEvidenceRequiredError,
  SettlementRetryForbiddenError,
} from './attempts.ts';
import type {
  BeginSettlementAttemptInput,
  BeginSettlementAttemptOutcome,
  ExternalOutcome,
  SettlementAttempt,
  SettlementAttemptEvent,
  SettlementAttemptId,
  SettlementTransitionRecord,
  UnknownOutcomeResolution,
} from './attempts.ts';

/**
 * The settlement attempt ledger: idempotent, retry-safe, evidence-linked.
 * Deterministic reference implementation over the protocol kernel's
 * idempotency registrar (production replaces persistence, not semantics).
 */
export class SettlementAttemptLedger {
  readonly #registrar: IdempotencyRegistrar;
  readonly #attempts = new Map<string, SettlementAttempt>();
  readonly #byInstruction = new Map<string, SettlementAttempt[]>();

  constructor(registrar?: IdempotencyRegistrar) {
    this.#registrar = registrar ?? new InMemoryIdempotencyRegistrar();
  }

  /**
   * Begin an attempt under the INV-06 discipline: the (settlement.attempt,
   * principal, key) scope maps to one authoritative attempt. In-flight or
   * completed duplicates REPLAY; a different command CONFLICTS.
   */
  begin(input: BeginSettlementAttemptInput): BeginSettlementAttemptOutcome {
    if (input === null || typeof input !== 'object') throw new ValidationError('attempt begin input must be an object');
    const attemptId = asSettlementAttemptId(input.attemptId);
    const instructionId = asSettlementInstructionId(input.instructionId);
    if (typeof input.rail !== 'string' || input.rail.length === 0) throw new ValidationError('attempt rail must be a non-empty string');
    if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length === 0) throw new ValidationError('idempotencyKey is required (INV-06)');
    if (input.principal === null || typeof input.principal !== 'object') throw new ValidationError('principal is required');
    if (typeof input.now !== 'bigint') throw new ValidationError('now must be a bigint TimestampMs');
    if (this.#attempts.has(attemptId)) {
      throw new ValidationError(`settlement attempt id '${attemptId}' is already recorded`);
    }
    const scope = {
      commandType: 'settlement.attempt',
      principal: input.principal,
      key: input.idempotencyKey,
    };
    const commandHash = settlementCommandHash({
      instructionId,
      rail: input.rail,
      principal: input.principal,
    });
    const outcome = this.#registrar.begin(scope, commandHash);
    if (outcome.kind === 'CONFLICT') {
      throw new SettlementAttemptConflictError(
        `INV-06: idempotency key '${input.idempotencyKey}' is already bound to a different command`,
        { principal: input.principal.principalId, commandHash },
      );
    }
    if (outcome.kind === 'REPLAY') {
      const existing = this.#findAttemptByScope(scope, commandHash);
      if (existing !== undefined) {
        return { kind: 'REPLAY', attempt: existing, record: outcome.record };
      }
      throw new SettlementAttemptConflictError(
        `INV-06: idempotency key '${input.idempotencyKey}' replays a command this ledger did not record`,
        { commandHash },
      );
    }

    const attempt: SettlementAttempt = Object.freeze({
      attemptId,
      instructionId,
      rail: input.rail,
      state: 'PENDING',
      idempotencyKey: input.idempotencyKey,
      principal: Object.freeze({ ...input.principal }),
      commandHash,
      evidenceIds: Object.freeze([]),
      createdAt: input.now,
      updatedAt: input.now,
      history: Object.freeze([]),
    });
    this.#attempts.set(attemptId, attempt);
    const list = this.#byInstruction.get(instructionId) ?? [];
    list.push(attempt);
    this.#byInstruction.set(instructionId, list);
    return { kind: 'BEGIN', attempt };
  }

  /** Start the attempt (pure local transition — no evidence required). */
  start(attemptId: string, now: TimestampMs): SettlementAttempt {
    return this.#advance(attemptId, 'START', { evidenceIds: [], now });
  }

  /**
   * Record the outcome of the external settlement write (linked evidence
   * REQUIRED — even for ambiguity, the ambiguity observation itself is
   * evidence). Only legal from IN_FLIGHT; an OUTCOME_UNKNOWN attempt must
   * be resolved through reconciliation — a direct outcome write from
   * ambiguity is structurally refused.
   */
  recordExternalOutcome(
    attemptId: string,
    outcome: ExternalOutcome,
    evidenceIds: readonly string[],
    now: TimestampMs,
  ): SettlementAttempt {
    if (outcome !== 'SUCCEEDED' && outcome !== 'FAILED' && outcome !== 'OUTCOME_UNKNOWN') {
      throw new ValidationError(`unknown external outcome '${String(outcome)}'`);
    }
    const event: SettlementAttemptEvent =
      outcome === 'SUCCEEDED'
        ? 'CONFIRM_SUCCEEDED'
        : outcome === 'FAILED'
          ? 'CONFIRM_FAILED'
          : 'OUTCOME_UNKNOWN';
    const current = this.#attempts.get(attemptId);
    if (current === undefined) throw new ValidationError(`unknown settlement attempt: ${attemptId}`);
    if (current.state === 'OUTCOME_UNKNOWN') {
      throw new ValidationError(
        'INV-04: an OUTCOME_UNKNOWN settlement attempt can only leave its state through a reconciliation resolution — never through a direct outcome write and never through retry',
        { attemptId, state: current.state },
      );
    }
    return this.#advance(attemptId, event, { evidenceIds, now });
  }

  /**
   * Resolve an OUTCOME_UNKNOWN attempt through a reconciliation resolution
   * (the ONLY exit from ambiguity): matching resolution event, resolving
   * principal, and evidence REQUIRED.
   */
  resolveUnknown(
    attemptId: string,
    resolution: UnknownOutcomeResolution,
    now: TimestampMs,
  ): SettlementAttempt {
    if (resolution === null || typeof resolution !== 'object') throw new ValidationError('resolution must be an UnknownOutcomeResolution');
    const current = this.#attempts.get(attemptId);
    if (current === undefined) throw new ValidationError(`unknown settlement attempt: ${attemptId}`);
    if (current.state !== 'OUTCOME_UNKNOWN') {
      throw new ValidationError(
        `reconciliation resolutions apply only to OUTCOME_UNKNOWN attempts (attempt is '${current.state}')`,
        { attemptId, state: current.state },
      );
    }
    if (typeof resolution.caseId !== 'string' || resolution.caseId.length === 0) throw new ValidationError('a resolution must reference its reconciliation case');
    if (resolution.resolvedBy === null || typeof resolution.resolvedBy !== 'object') throw new ValidationError('a resolution must name the resolving principal');
    if (!Array.isArray(resolution.evidenceIds) || resolution.evidenceIds.length === 0) {
      throw new SettlementEvidenceRequiredError(
        'a reconciliation resolution must carry provider evidence linked to the ambiguous attempt',
        { attemptId, caseId: resolution.caseId },
      );
    }
    const event: SettlementAttemptEvent =
      resolution.resolvedOutcome === 'CONFIRMED_SUCCEEDED'
        ? 'RECONCILE_RESOLVED_SUCCEEDED'
        : 'RECONCILE_RESOLVED_FAILED';
    return this.#advance(attemptId, event, { evidenceIds: resolution.evidenceIds, now, resolution });
  }

  /** Attach additional evidence ids (append-only; already-linked ids are not duplicated). */
  attachEvidence(attemptId: string, evidenceIds: readonly string[], now: TimestampMs): SettlementAttempt {
    const current = this.#attempts.get(attemptId);
    if (current === undefined) {
      throw new ValidationError(`unknown settlement attempt: ${attemptId}`);
    }
    if (!Array.isArray(evidenceIds)) throw new ValidationError('evidenceIds must be an array of evidence node ids');
    const linked = new Set(current.evidenceIds);
    const additions: string[] = [];
    for (const id of evidenceIds) {
      if (typeof id !== 'string' || id.length === 0) throw new ValidationError('evidence ids must be non-empty strings');
      if (!linked.has(id)) { linked.add(id); additions.push(id); }
    }
    if (additions.length === 0) {
      return current;
    }
    const next: SettlementAttempt = Object.freeze({
      ...current,
      evidenceIds: Object.freeze([...current.evidenceIds, ...additions]),
      updatedAt: now,
    });
    this.#attempts.set(attemptId, next);
    this.#replaceInInstructionIndex(next);
    return next;
  }

  /**
   * INV-04: UNKNOWN external writes are never blindly retried. Retrying is
   * admissible ONLY for definitively FAILED attempts (the scope re-arms and
   * a NEW record is minted; the FAILED record stays FAILED).
   */
  requestRetry(attemptId: string, retryAttemptId: string, now: TimestampMs): SettlementAttempt {
    const attempt = this.#attempts.get(attemptId);
    if (attempt === undefined) {
      throw new ValidationError(`unknown settlement attempt: ${attemptId}`);
    }
    if (attempt.state === 'OUTCOME_UNKNOWN') {
      throw new SettlementRetryForbiddenError(
        'the external settlement write outcome is UNKNOWN — a blind retry is forbidden; reconciliation must resolve the ambiguity first',
        { attemptId, state: attempt.state },
      );
    }
    if (attempt.state !== 'FAILED') {
      throw new SettlementRetryForbiddenError(
        `only definitively FAILED settlement attempts may be retried (attempt is '${attempt.state}')`,
        { attemptId, state: attempt.state },
      );
    }
    const outcome = this.begin({
      attemptId: retryAttemptId,
      instructionId: attempt.instructionId,
      rail: attempt.rail,
      idempotencyKey: attempt.idempotencyKey,
      principal: attempt.principal,
      now,
    });
    return outcome.attempt;
  }

  /** The current record of one attempt. */
  attempt(attemptId: string): SettlementAttempt | undefined {
    return this.#attempts.get(attemptId);
  }

  /** All attempts recorded for one instruction (in recording order). */
  attemptsForInstruction(instructionId: string): readonly SettlementAttempt[] {
    return [...(this.#byInstruction.get(instructionId) ?? [])];
  }

  /** Does the instruction still carry an unresolved ambiguity? (INV-04) */
  hasOpenAmbiguity(instructionId: string): boolean {
    return this.attemptsForInstruction(instructionId).some(
      (attempt) => attempt.state === 'OUTCOME_UNKNOWN',
    );
  }

  // -- internals ------------------------------------------------------------

  #advance(
    attemptId: string,
    event: SettlementAttemptEvent,
    input: {
      readonly evidenceIds: readonly string[];
      readonly now: TimestampMs;
      readonly resolution?: UnknownOutcomeResolution;
    },
  ): SettlementAttempt {
    const current = this.#attempts.get(attemptId);
    if (current === undefined) {
      throw new ValidationError(`unknown settlement attempt: ${attemptId}`);
    }
    if (input === null || typeof input !== 'object' || typeof input.now !== 'bigint') throw new ValidationError('advance input must carry now: TimestampMs');
    if (!Array.isArray(input.evidenceIds)) throw new ValidationError('evidenceIds must be an array');

    // INV-05: every event that represents an external effect requires linked
    // provider evidence (START is the only pure local transition).
    if (event !== 'START' && input.evidenceIds.length === 0) {
      throw new SettlementEvidenceRequiredError(
        `event '${event}' on settlement attempt '${attemptId}' represents an external effect and requires linked evidence`,
        { attemptId, event },
      );
    }
    for (const id of input.evidenceIds) {
      if (typeof id !== 'string' || id.length === 0) throw new ValidationError('evidence ids must be non-empty strings');
    }

    // Terminality (kernel machine): monotonic terminals; OUTCOME_UNKNOWN has
    // no ordinary exit.
    const transition = settlementAttemptStateMachine.transition(current.state, event);
    const linked = new Set(current.evidenceIds);
    for (const id of input.evidenceIds) {
      linked.add(id);
    }
    const record: SettlementTransitionRecord = Object.freeze({
      from: transition.from,
      on: transition.on,
      to: transition.to,
      viaRecovery: transition.viaRecovery,
      recordedAt: input.now,
      evidenceIds: Object.freeze([...input.evidenceIds]),
      ...(input.resolution !== undefined ? { resolutionCaseId: input.resolution.caseId } : {}),
    });
    const next: SettlementAttempt = Object.freeze({
      ...current,
      state: transition.to,
      evidenceIds: Object.freeze([...linked]),
      updatedAt: input.now,
      history: Object.freeze([...current.history, record]),
      ...(input.resolution !== undefined ? { resolution: Object.freeze({ ...input.resolution }) } : {}),
    });
    this.#attempts.set(attemptId, next);
    this.#replaceInInstructionIndex(next);
    // INV-06 idempotency discipline at terminalization:
    // FAILED → the registrar FAILED status (a retry re-arms the scope);
    // other terminals → COMPLETED with the deterministic result hash.
    if (
      settlementAttemptStateMachine.isTerminal(transition.to) &&
      !settlementAttemptStateMachine.isTerminal(current.state)
    ) {
      if (transition.to === 'FAILED') {
        this.#registrar.fail({
          commandType: 'settlement.attempt',
          principal: next.principal,
          key: next.idempotencyKey,
        });
      } else {
        this.#registrar.complete(
          {
            commandType: 'settlement.attempt',
            principal: next.principal,
            key: next.idempotencyKey,
          },
          settlementResultHash(next),
        );
      }
    }
    return next;
  }

  #findAttemptByScope(
    scope: { commandType: string; principal: PrincipalRef; key: string },
    commandHash: string,
  ): SettlementAttempt | undefined {
    // The authoritative attempt for a scope is the LATEST recorded under it
    // (a retry mints a new record; the earlier FAILED record stays history).
    let found: SettlementAttempt | undefined;
    for (const attempt of this.#attempts.values()) {
      if (
        attempt.idempotencyKey === scope.key &&
        attempt.principal.principalType === scope.principal.principalType &&
        attempt.principal.principalId === scope.principal.principalId &&
        attempt.commandHash === commandHash
      ) {
        found = attempt;
      }
    }
    return found;
  }

  #replaceInInstructionIndex(next: SettlementAttempt): void {
    const list = this.#byInstruction.get(next.instructionId);
    if (list === undefined) {
      this.#byInstruction.set(next.instructionId, [next]);
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
