/**
 * @payswap/provider-runtime — the idempotency registrar (P2-W2).
 *
 * The INV-06 decision point, scoped PER OPERATION (never one universal
 * mechanism — Wise §4.4; see idempotency.ts for the contract registry).
 * Split from idempotency.ts for the <=400-line file law.
 *
 * Semantics (P1-W2 registrar adapted to per-operation scope + ambiguity):
 *
 * | existing record | same commandHash        | different commandHash |
 * |-----------------|--------------------------|-----------------------|
 * | none            | BEGIN                    | BEGIN                 |
 * | IN_FLIGHT       | REPLAY (in flight)       | CONFLICT              |
 * | COMPLETED       | REPLAY (recorded result) | CONFLICT              |
 * | FAILED          | BEGIN (retry re-arms)    | CONFLICT              |
 * | AMBIGUOUS       | REPLAY (ambiguous)       | CONFLICT              |
 *
 * - same key + different command hash → CONFLICT (INV-06 violation attempt);
 * - retry after completion → exact REPLAY of the recorded provider references;
 * - retry after definitive failure → BEGIN again (transient failures are retryable);
 * - duplicate while in flight → REPLAY so the caller waits instead of
 *   double-executing (never a silent second execution);
 * - AMBIGUOUS (UNKNOWN outcome recorded) keeps the record occupied — the
 *   exits are `complete` (reconciliation evidence confirmed the effect) or
 *   `fail` (reconciliation evidence proved no effect).
 *
 * Durable implementations MUST decide `begin` atomically with command
 * execution. This in-memory reference store exists so the contract
 * semantics are executable and testable without a database.
 */

import { IdempotencyKeyConflictError, ValidationError } from './errors.ts';
import { contentHash } from './identifiers.ts';
import type { OperationIdempotencyContract } from './idempotency.ts';

/** Registrar record status. */
export type IdempotencyRecordStatus = 'IN_FLIGHT' | 'COMPLETED' | 'FAILED' | 'AMBIGUOUS';

/** The durable record of the idempotency decision + identifiers (Wise §4.4 persistence). */
export interface IdempotencyRecord {
  readonly operationId: string;
  readonly connectionId: string;
  readonly idempotencyKey: string;
  readonly commandId: string;
  readonly correlationId: string;
  readonly commandHash: string;
  readonly status: IdempotencyRecordStatus;
  /** Provider references acknowledged for the completed command. */
  readonly providerReferences: readonly string[];
  /** When the record last changed state (bigint ms). */
  readonly lastTransitionAt: bigint;
  /** Present while AMBIGUOUS: the ambiguity must be reconciled before retry. */
  readonly ambiguousSince?: bigint;
}

/** The begin() decision. */
export type IdempotencyBeginOutcome =
  | { readonly kind: 'BEGIN' }
  | { readonly kind: 'REPLAY'; readonly record: IdempotencyRecord }
  | { readonly kind: 'CONFLICT'; readonly record: IdempotencyRecord };

/** The canonical scope key: operation + (connection per contract) + key. */
export function idempotencyScopeKey(
  contract: OperationIdempotencyContract,
  connectionId: string,
  idempotencyKey: string,
): string {
  const parts: string[] = [];
  if (contract.keyScope.operation) {
    parts.push(`op:${contract.operationId}`);
  }
  if (contract.keyScope.connection) {
    parts.push(`conn:${connectionId}`);
  }
  parts.push(`key:${idempotencyKey}`);
  return parts.join('|');
}

/** The in-memory idempotency registrar (deterministic reference store). */
export class InMemoryIdempotencyRegistrar {
  private readonly records = new Map<string, IdempotencyRecord>();

  begin(input: {
    readonly contract: OperationIdempotencyContract;
    readonly connectionId: string;
    readonly commandId: string;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly command: unknown;
    readonly now: bigint;
  }): IdempotencyBeginOutcome {
    const commandHash = contentHash(input.command);
    const scopeKey = idempotencyScopeKey(input.contract, input.connectionId, input.idempotencyKey);
    const existing = this.records.get(scopeKey);
    if (existing === undefined) {
      const record: IdempotencyRecord = Object.freeze({
        operationId: input.contract.operationId,
        connectionId: input.connectionId,
        idempotencyKey: input.idempotencyKey,
        commandId: input.commandId,
        correlationId: input.correlationId,
        commandHash,
        status: 'IN_FLIGHT',
        providerReferences: Object.freeze([]),
        lastTransitionAt: input.now,
      });
      this.records.set(scopeKey, record);
      return { kind: 'BEGIN' };
    }
    if (existing.commandHash !== commandHash) {
      // INV-06: same key, different command — a conflict, never a re-execution.
      return { kind: 'CONFLICT', record: existing };
    }
    if (existing.status === 'FAILED') {
      // Retry-safety: a definitive failure may be retried under the same hash.
      this.records.set(
        scopeKey,
        Object.freeze({ ...existing, status: 'IN_FLIGHT', lastTransitionAt: input.now }),
      );
      return { kind: 'BEGIN' };
    }
    // IN_FLIGHT / COMPLETED / AMBIGUOUS: REPLAY so the caller waits /
    // receives the recorded result / is forced to reconcile — never a
    // silent second execution.
    return { kind: 'REPLAY', record: existing };
  }

  /** Mark the command definitively completed with its provider references. */
  complete(input: {
    readonly contract: OperationIdempotencyContract;
    readonly connectionId: string;
    readonly idempotencyKey: string;
    readonly providerReferences: readonly string[];
    readonly now: bigint;
  }): IdempotencyRecord {
    const scopeKey = idempotencyScopeKey(input.contract, input.connectionId, input.idempotencyKey);
    const existing = this.records.get(scopeKey);
    if (existing === undefined) {
      throw new ValidationError('no idempotency record for scope', { scopeKey });
    }
    if (existing.status === 'COMPLETED') {
      if (
        existing.providerReferences.length === input.providerReferences.length &&
        existing.providerReferences.every((ref, i) => ref === input.providerReferences[i])
      ) {
        return existing; // idempotent double-complete with the identical result
      }
      throw new IdempotencyKeyConflictError(
        'scope already completed with different provider references — results must be deterministic',
        { scopeKey },
      );
    }
    if (existing.status === 'FAILED') {
      throw new ValidationError('cannot complete a failed idempotency record', { scopeKey });
    }
    const record: IdempotencyRecord = Object.freeze({
      ...existing,
      status: 'COMPLETED',
      providerReferences: Object.freeze([...input.providerReferences]),
      lastTransitionAt: input.now,
    });
    this.records.set(scopeKey, record);
    return record;
  }

  /** Mark a definitive failure (pre-dispatch refusal or definitive provider failure). */
  fail(input: {
    readonly contract: OperationIdempotencyContract;
    readonly connectionId: string;
    readonly idempotencyKey: string;
    readonly now: bigint;
  }): IdempotencyRecord {
    const scopeKey = idempotencyScopeKey(input.contract, input.connectionId, input.idempotencyKey);
    const existing = this.records.get(scopeKey);
    if (existing === undefined) {
      throw new ValidationError('no idempotency record for scope', { scopeKey });
    }
    if (existing.status === 'COMPLETED') {
      throw new ValidationError('cannot fail a completed idempotency record', { scopeKey });
    }
    const record: IdempotencyRecord = Object.freeze({
      ...existing,
      status: 'FAILED',
      providerReferences: Object.freeze([]),
      lastTransitionAt: input.now,
    });
    this.records.set(scopeKey, record);
    return record;
  }

  /**
   * Mark AMBIGUOUS (UNKNOWN outcome recorded): the record STAYS occupied —
   * a duplicate command must never silently re-execute while the outcome
   * is unresolved (INV-04/INV-06). The exits are `complete` (reconciliation
   * evidence confirmed the effect) or `fail` (reconciliation evidence
   * proved no effect).
   */
  markAmbiguous(input: {
    readonly contract: OperationIdempotencyContract;
    readonly connectionId: string;
    readonly idempotencyKey: string;
    readonly now: bigint;
  }): IdempotencyRecord {
    const scopeKey = idempotencyScopeKey(input.contract, input.connectionId, input.idempotencyKey);
    const existing = this.records.get(scopeKey);
    if (existing === undefined) {
      throw new ValidationError('no idempotency record for scope', { scopeKey });
    }
    if (existing.status === 'COMPLETED') {
      throw new ValidationError('cannot mark a completed record ambiguous', { scopeKey });
    }
    const record: IdempotencyRecord = Object.freeze({
      ...existing,
      status: 'AMBIGUOUS',
      lastTransitionAt: input.now,
      ambiguousSince: input.now,
    });
    this.records.set(scopeKey, record);
    return record;
  }

  get(input: {
    readonly contract: OperationIdempotencyContract;
    readonly connectionId: string;
    readonly idempotencyKey: string;
  }): IdempotencyRecord | undefined {
    const scopeKey = idempotencyScopeKey(input.contract, input.connectionId, input.idempotencyKey);
    return this.records.get(scopeKey);
  }

  list(): readonly IdempotencyRecord[] {
    return [...this.records.values()];
  }
}
