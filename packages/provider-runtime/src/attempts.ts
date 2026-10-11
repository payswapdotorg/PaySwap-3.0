/**
 * @payswap/provider-runtime — the effect-attempt ledger (P2-W2).
 *
 * The persisted EXTERNAL EFFECT ATTEMPT and its append-only ledger: the
 * Wise §4.4 identifier persistence (command/request id, provider
 * reference, correlation id, event id, times, outcomes) plus the INV-05
 * evidence lineage refs (authorization + capability + raw-state record).
 * Split from execution-bridge.ts for the <=400-line file law.
 */

import type { TimestampMs } from './clock.ts';
import { asAttemptId, type RawStateRecordId } from './identifiers.ts';
import type { AuthorizationRef, CapabilityRef } from './refs.ts';
import type { AmbiguityReason, ExternalEffectOutcome, ProviderFailureMetadata } from './result-envelope.ts';
import type { ExecutionMode } from './execution-mode.ts';

/**
 * One persisted external-effect attempt. Every field is lineage or
 * evidence material — secret material can never appear here (the bridge
 * constructs attempts only from redacted surfaces; INV-19).
 */
export interface EffectAttempt {
  readonly attemptId: string;
  readonly commandId: string;
  readonly correlationId: string;
  /** Opaque authorization lineage carried through from the command (INV-05). */
  readonly authorization: AuthorizationRef;
  /** The opaque capability the operation exercised (INV-05). */
  readonly capability: CapabilityRef;
  readonly operationId: string;
  readonly idempotencyKey: string;
  readonly executionMode: ExecutionMode;
  readonly connectionId: string;
  readonly dispatchedAt: TimestampMs;
  readonly completedAt: TimestampMs;
  readonly outcome: ExternalEffectOutcome;
  readonly providerReferences: readonly string[];
  /** Present when an event (not a response) supplied the outcome evidence. */
  readonly providerEventId?: string;
  /** Retained raw provider-state record (INV-05 evidence lineage ref). */
  readonly rawStateRecordId?: RawStateRecordId;
  readonly failure?: ProviderFailureMetadata;
  readonly ambiguityReason?: AmbiguityReason;
  /** Deterministic content hash of the command body (replay equality). */
  readonly commandHash: string;
}

/**
 * The append-only effect-attempt ledger (in-memory deterministic
 * reference; durable persistence is a separately-accepted Work Order).
 * Attempts are immutable once appended; the log never rewrites history.
 */
export class InMemoryEffectAttemptLedger {
  private readonly attempts: EffectAttempt[] = [];
  private sequence = 0n;

  /** Append one immutable attempt (mints the deterministic attempt id). */
  append(attempt: Omit<EffectAttempt, 'attemptId'>): EffectAttempt {
    this.sequence += 1n;
    const sealed = Object.freeze({
      ...attempt,
      attemptId: asAttemptId(`attempt:${this.sequence}`),
    }) as EffectAttempt;
    this.attempts.push(sealed);
    return sealed;
  }

  /** Attempts for one command (audit surface; oldest first). */
  forCommand(commandId: string): readonly EffectAttempt[] {
    return this.attempts.filter((attempt) => attempt.commandId === commandId);
  }

  /** The newest attempt for one command (the retry gate reads this). */
  latestFor(commandId: string): EffectAttempt | undefined {
    const forCommand = this.forCommand(commandId);
    return forCommand.length > 0 ? forCommand[forCommand.length - 1] : undefined;
  }

  /** The full append-only log. */
  log(): readonly EffectAttempt[] {
    return [...this.attempts];
  }

  get size(): number {
    return this.attempts.length;
  }
}
