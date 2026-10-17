/**
 * @payswap/onchain-adapters — the per-operation lifecycle STATE MACHINE
 * (Work Order P4-W3, lane R2-W3; NET-NEW for the 3.0 determinism law:
 * "lifecycle is a pure state machine").
 *
 * The frozen nine-stage lifecycle, made mechanical for the
 * authorize→broadcast→observe→finality/reconcile spine. Pure and
 * deterministic: no I/O, no clock, no entropy — transitions are a frozen
 * table and the tracker is an in-memory recorder (composition roots may
 * persist the record; see the evidence record's deferral register).
 *
 * The laws encoded (each a mechanical transition-table fact, not a comment):
 *
 * - AUTHORIZE BEFORE BROADCAST: the BROADCAST event exists ONLY from
 *   AUTHORIZED — an unauthorized submission is unrepresentable;
 * - ONE WRITE PER EXECUTION: a broadcast binds its execution reference to
 *   exactly one authorized write digest (re-binding fails closed);
 * - REORG AMBIGUITY: a CONFIRMED observation can become OUTCOME_UNKNOWN
 *   (the reorg/fork law) but never FAILED — an ambiguity is not a failure;
 * - FINALITY ONLY FROM CONFIRMED: the finality-evaluation event exists only
 *   from CONFIRMED;
 * - RECONCILIATION IS THE ONLY EXIT FROM UNKNOWN: OUTCOME_UNKNOWN has
 *   exactly ONE outgoing event — PLAN_RECONCILIATION. There is NO
 *   transition from OUTCOME_UNKNOWN back to AUTHORIZED or BROADCAST: a
 *   blind retry of an unknown external write is structurally
 *   unrepresentable (the blind-retry-forbidden law);
 * - TERMINAL MONOTONICITY: FAILED, FINALITY_EVALUATED and
 *   RECONCILIATION_PLANNED are terminal (a retry mints a NEW operation).
 */

import { ValidationError } from '../errors.ts';

export const ADAPTER_OPERATION_STATES = [
  'IDLE',
  'PREPARED',
  'SIMULATED',
  'AUTHORIZED',
  'BROADCAST',
  'CONFIRMED',
  'FAILED',
  'OUTCOME_UNKNOWN',
  'FINALITY_EVALUATED',
  'RECONCILIATION_PLANNED',
] as const;

export type AdapterOperationState = (typeof ADAPTER_OPERATION_STATES)[number];

export const ADAPTER_OPERATION_EVENTS = [
  'PREPARE',
  'SIMULATE',
  'AUTHORIZE',
  'BROADCAST',
  'OBSERVE_CONFIRMED',
  'OBSERVE_FAILED',
  'OBSERVE_UNKNOWN',
  'EVALUATE_FINALITY',
  'PLAN_RECONCILIATION',
] as const;

export type AdapterOperationEvent = (typeof ADAPTER_OPERATION_EVENTS)[number];

export interface AdapterOperationTransition {
  readonly from: AdapterOperationState;
  readonly on: AdapterOperationEvent;
  readonly to: AdapterOperationState;
  readonly description: string;
}

/** The frozen transition table (deterministic and total over its rows). */
export const ADAPTER_OPERATION_TRANSITIONS: readonly AdapterOperationTransition[] =
  Object.freeze([
    { from: 'IDLE', on: 'PREPARE', to: 'PREPARED', description: 'directive validated, kernel write prepared' },
    { from: 'PREPARED', on: 'SIMULATE', to: 'SIMULATED', description: 'family simulation recorded as an observation' },
    { from: 'PREPARED', on: 'AUTHORIZE', to: 'AUTHORIZED', description: 'kernel gates ALLOW, artifact minted, recheck passed (simulation optional per family)' },
    { from: 'SIMULATED', on: 'AUTHORIZE', to: 'AUTHORIZED', description: 'kernel gates ALLOW, artifact minted, recheck passed' },
    { from: 'AUTHORIZED', on: 'BROADCAST', to: 'BROADCAST', description: 'trusted-surface-signed payload submitted — submitted is not finality' },
    { from: 'IDLE', on: 'OBSERVE_CONFIRMED', to: 'CONFIRMED', description: 'external-operation observation without a prior broadcast through this adapter (reconciliation-style re-observation is legal)' },
    { from: 'IDLE', on: 'OBSERVE_FAILED', to: 'FAILED', description: 'external-operation observation of a definitive failure' },
    { from: 'IDLE', on: 'OBSERVE_UNKNOWN', to: 'OUTCOME_UNKNOWN', description: 'external-operation observation of ambiguity' },
    { from: 'BROADCAST', on: 'OBSERVE_CONFIRMED', to: 'CONFIRMED', description: 'external operation observed confirmed (finality CANDIDATE only)' },
    { from: 'BROADCAST', on: 'OBSERVE_FAILED', to: 'FAILED', description: 'definitive on-chain failure (terminal — a retry mints a new operation)' },
    { from: 'BROADCAST', on: 'OBSERVE_UNKNOWN', to: 'OUTCOME_UNKNOWN', description: 'ambiguity: unclassified provider response, unreachable rail or vanished reference' },
    { from: 'CONFIRMED', on: 'OBSERVE_CONFIRMED', to: 'CONFIRMED', description: 're-observation at greater depth (monotonic)' },
    { from: 'CONFIRMED', on: 'OBSERVE_UNKNOWN', to: 'OUTCOME_UNKNOWN', description: 'REORG/FORK: a previously confirmed observation turned ambiguous — never FAILED' },
    { from: 'CONFIRMED', on: 'EVALUATE_FINALITY', to: 'FINALITY_EVALUATED', description: 'depth compared against declared guidance (candidate only — finality stays protocol-owned; terminal)' },
    { from: 'OUTCOME_UNKNOWN', on: 'PLAN_RECONCILIATION', to: 'RECONCILIATION_PLANNED', description: 'the ONLY exit from ambiguity — the settlement reconciliation authority resolves (terminal)' },
  ]);

/** Terminal states: monotonic — no outgoing transitions exist. */
export const ADAPTER_OPERATION_TERMINAL_STATES: readonly AdapterOperationState[] =
  Object.freeze(['FAILED', 'FINALITY_EVALUATED', 'RECONCILIATION_PLANNED']);

function transitionFrom(state: AdapterOperationState, event: AdapterOperationEvent): AdapterOperationTransition | undefined {
  return ADAPTER_OPERATION_TRANSITIONS.find((t) => t.from === state && t.on === event);
}

/** Deterministic transition probe: is (state, event) lawful? */
export function isLawfulTransition(state: AdapterOperationState, event: AdapterOperationEvent): boolean {
  return transitionFrom(state, event) !== undefined;
}

/** The lawful target of (state, event), when one exists. */
export function targetState(state: AdapterOperationState, event: AdapterOperationEvent): AdapterOperationState | undefined {
  return transitionFrom(state, event)?.to;
}

interface TrackedOperation {
  readonly writeDigest: string;
  state: AdapterOperationState;
}

/**
 * The pure per-adapter operation tracker: records the spine transitions for
 * execution references and fails closed on unlawful progression. The
 * authorize→broadcast binding (writeDigest) is enforced here: a broadcast
 * may only be recorded for a write the SAME adapter authorized, and an
 * execution reference is bound to exactly one write digest.
 */
export class AdapterOperationTracker {
  readonly #operations = new Map<string, TrackedOperation>();
  readonly #authorizedWrites = new Set<string>();

  /** Records an authorize event for a write digest (the broadcast precondition). */
  recordAuthorize(writeDigest: string): void {
    this.#authorizedWrites.add(writeDigest);
  }

  /** Whether a write digest has been authorized through this adapter. */
  isAuthorized(writeDigest: string): boolean {
    return this.#authorizedWrites.has(writeDigest);
  }

  /** Records a lawful transition for an execution reference (fail closed). */
  #advance(executionRef: string, event: AdapterOperationEvent, expected?: { readonly writeDigest?: string }): AdapterOperationState {
    const existing = this.#operations.get(executionRef);
    const state = existing?.state ?? 'IDLE';
    const transition = transitionFrom(state, event);
    if (transition === undefined) {
      throw new ValidationError(
        `operation lifecycle violation: event '${event}' is unlawful from state '${state}' for execution '${executionRef}' (the transition table is frozen — see ADAPTER_OPERATION_TRANSITIONS; blind retry and out-of-order stages are structurally unrepresentable)`,
        { executionRef, event, state },
      );
    }
    if (expected?.writeDigest !== undefined) {
      if (!this.#authorizedWrites.has(expected.writeDigest)) {
        throw new ValidationError(
          `operation lifecycle violation: execution '${executionRef}' broadcasts write '${expected.writeDigest}' which was never authorized through this adapter — authorize before broadcast is structural`,
          { executionRef, writeDigest: expected.writeDigest },
        );
      }
      if (existing !== undefined && existing.writeDigest !== expected.writeDigest) {
        throw new ValidationError(
          `operation lifecycle violation: execution '${executionRef}' is bound to write '${existing.writeDigest}' and cannot re-bind to '${expected.writeDigest}' — one execution, one authorized write (a retry mints a NEW execution)`,
          { executionRef, writeDigest: expected.writeDigest },
        );
      }
    }
    const next = transition.to;
    if (existing === undefined) {
      this.#operations.set(executionRef, {
        writeDigest: expected?.writeDigest ?? 'unbound',
        state: next,
      });
    } else {
      existing.state = next;
    }
    return next;
  }

  /** Records the broadcast of an authorized write under an execution ref. */
  recordBroadcast(executionRef: string, writeDigest: string): AdapterOperationState {
    // The authorize-before-broadcast law: the write must have been
    // authorized through THIS adapter (authorize records by write digest).
    if (!this.#authorizedWrites.has(writeDigest)) {
      throw new ValidationError(
        `operation lifecycle violation: execution '${executionRef}' broadcasts write '${writeDigest}' which was never authorized through this adapter — authorize before broadcast is structural`,
        { executionRef, writeDigest },
      );
    }
    const existing = this.#operations.get(executionRef);
    if (existing === undefined) {
      // First submission of a NEW execution over an AUTHORIZED write (the
      // AUTHORIZED → BROADCAST transition; the authorized-write set is the
      // AUTHORIZED state's proof).
      this.#operations.set(executionRef, { writeDigest, state: 'BROADCAST' });
      return 'BROADCAST';
    }
    if (existing.writeDigest !== writeDigest) {
      throw new ValidationError(
        `operation lifecycle violation: execution '${executionRef}' is bound to write '${existing.writeDigest}' and cannot re-bind to '${writeDigest}' — one execution, one authorized write (a retry mints a NEW execution)`,
        { executionRef, writeDigest },
      );
    }
    // A SEEN execution can never lawfully re-broadcast: from BROADCAST or
    // any observed state the BROADCAST event is unlawful — the blind retry
    // of a submitted (or ambiguous) external write is structurally
    // unrepresentable. A retry mints a NEW execution reference.
    return this.#advance(executionRef, 'BROADCAST');
  }

  /** Records a result observation with the given outcome. */
  recordObserved(
    executionRef: string,
    outcome: 'CONFIRMED' | 'FAILED' | 'OUTCOME_UNKNOWN',
  ): AdapterOperationState {
    switch (outcome) {
      case 'CONFIRMED':
        return this.#advance(executionRef, 'OBSERVE_CONFIRMED');
      case 'FAILED':
        return this.#advance(executionRef, 'OBSERVE_FAILED');
      case 'OUTCOME_UNKNOWN':
        return this.#advance(executionRef, 'OBSERVE_UNKNOWN');
    }
  }

  /** Records a finality evaluation (only from CONFIRMED). */
  recordFinality(executionRef: string): AdapterOperationState {
    return this.#advance(executionRef, 'EVALUATE_FINALITY');
  }

  /** Records a reconciliation plan (only from OUTCOME_UNKNOWN). */
  recordReconcile(executionRef: string): AdapterOperationState {
    return this.#advance(executionRef, 'PLAN_RECONCILIATION');
  }

  /** The recorded state of an execution reference (IDLE when unseen). */
  stateOf(executionRef: string): AdapterOperationState {
    return this.#operations.get(executionRef)?.state ?? 'IDLE';
  }
}
