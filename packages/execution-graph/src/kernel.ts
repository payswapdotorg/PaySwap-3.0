/**
 * @payswap/execution-graph — the deterministic kernel (P3-W2; ADAPT of the
 * @payswap/protocol kernel surfaces this package needs: state-machine.ts +
 * idempotency.ts).
 *
 * WHY LOCAL: the layer law pins sibling imports to TYPE-ONLY (erased at
 * runtime), so the runtime semantics this package's ledger needs are
 * re-implemented here, deterministically, against the SAME contract tables:
 * - the state machine is a declared graph (states/events/transitions/
 *   terminals/recovery); anything not declared is impossible and throws a
 *   typed error, never silently;
 * - the idempotency registrar decides `begin` as the single decision point:
 *   same scope + same command hash -> BEGIN or REPLAY; same scope +
 *   different command -> CONFLICT; FAILED scopes re-arm (retry-safe).
 *   Terminality: INV-03. Idempotency: INV-06.
 *
 * The implementations are byte-for-byte behavioral mirrors of the protocol
 * kernel's (accepted P1-W2 battery); divergence would be a finding.
 */

import {
  IllegalTransitionError,
  TerminalStateViolationError,
  UndeclaredEventError,
  ValidationError,
} from './errors.ts';

// ---------------------------------------------------------------------------
// Deterministic state machine (INV-03 terminality)
// ---------------------------------------------------------------------------

export interface TransitionRule<S extends string, E extends string> {
  readonly from: S;
  readonly on: E;
  readonly to: S;
  readonly description?: string;
}

export interface RecoveryRule<S extends string, E extends string> {
  /** Must be a terminal state — recovery is the only exit from terminality. */
  readonly from: S;
  readonly on: E;
  readonly to: S;
}

export interface StateMachineDefinition<S extends string, E extends string> {
  readonly name: string;
  readonly initial: S;
  readonly states: readonly S[];
  readonly events: readonly E[];
  readonly transitions: readonly TransitionRule<S, E>[];
  readonly terminalStates: readonly S[];
  readonly recovery?: readonly RecoveryRule<S, E>[];
}

export interface TransitionRecord<S extends string, E extends string> {
  readonly from: S;
  readonly on: E;
  readonly to: S;
  /** True when the move was an explicit recovery out of a terminal state. */
  readonly viaRecovery: boolean;
}

export interface StateMachine<S extends string, E extends string> {
  readonly name: string;
  readonly initial: S;
  isTerminal(state: S): boolean;
  transition(state: S, event: E): TransitionRecord<S, E>;
}

function ruleKey(from: string, on: string): string {
  return JSON.stringify([from, on]);
}

/** Build a validated, deterministic state machine (anything undeclared throws). */
export function defineStateMachine<S extends string, E extends string>(
  definition: StateMachineDefinition<S, E>,
): StateMachine<S, E> {
  const { name } = definition;
  const states = [...definition.states];
  const events = [...definition.events];
  const terminalStates = [...definition.terminalStates];
  if (states.length === 0) {
    throw new ValidationError(`machine '${name}' requires at least one state`);
  }
  if (new Set(states).size !== states.length) {
    throw new ValidationError(`machine '${name}' declares duplicate states`);
  }
  if (new Set(events).size !== events.length) {
    throw new ValidationError(`machine '${name}' declares duplicate events`);
  }
  const stateSet = new Set<string>(states);
  const eventSet = new Set<string>(events);
  const terminalSet = new Set<string>(terminalStates);
  for (const terminal of terminalStates) {
    if (!stateSet.has(terminal)) {
      throw new ValidationError(
        `machine '${name}' declares an undeclared terminal state '${terminal}'`,
      );
    }
  }
  if (!stateSet.has(definition.initial)) {
    throw new ValidationError(`machine '${name}' initial state is undeclared`);
  }
  if (terminalSet.has(definition.initial)) {
    throw new ValidationError(`machine '${name}' initial state must not be terminal`);
  }

  const normalRules = new Map<string, TransitionRule<S, E>>();
  for (const rule of definition.transitions) {
    if (!stateSet.has(rule.from) || !stateSet.has(rule.to) || !eventSet.has(rule.on)) {
      throw new ValidationError(
        `machine '${name}' transition references an undeclared state or event`,
      );
    }
    if (terminalSet.has(rule.from)) {
      throw new ValidationError(
        `machine '${name}': terminal states may only exit via declared recovery (terminality law)`,
      );
    }
    const key = ruleKey(rule.from, rule.on);
    if (normalRules.has(key)) {
      throw new ValidationError(
        `machine '${name}': duplicate transition for (${rule.from}, ${rule.on}); declare exactly one rule per pair`,
      );
    }
    normalRules.set(key, rule);
  }

  const recoveryRules = new Map<string, RecoveryRule<S, E>>();
  for (const rule of definition.recovery ?? []) {
    if (!stateSet.has(rule.from) || !stateSet.has(rule.to) || !eventSet.has(rule.on)) {
      throw new ValidationError(
        `machine '${name}' recovery rule references an undeclared state or event`,
      );
    }
    if (!terminalSet.has(rule.from)) {
      throw new ValidationError(
        `machine '${name}': recovery may only originate from terminal states (terminality law)`,
      );
    }
    const key = ruleKey(rule.from, rule.on);
    if (recoveryRules.has(key)) {
      throw new ValidationError(
        `machine '${name}': duplicate recovery rule for (${rule.from}, ${rule.on})`,
      );
    }
    recoveryRules.set(key, rule);
  }

  return {
    name,
    initial: definition.initial,
    isTerminal(state: S): boolean {
      return terminalSet.has(state);
    },
    transition(state: S, event: E): TransitionRecord<S, E> {
      if (!eventSet.has(event)) {
        throw new UndeclaredEventError(`event '${event}' is not declared by machine '${name}'`, {
          machine: name,
          event,
        });
      }
      if (!stateSet.has(state)) {
        throw new IllegalTransitionError(`state '${state}' is not declared by machine '${name}'`, {
          machine: name,
          state,
        });
      }
      const isTerminalState = terminalSet.has(state);
      const rule = isTerminalState
        ? recoveryRules.get(ruleKey(state, event))
        : normalRules.get(ruleKey(state, event));
      if (rule === undefined) {
        if (isTerminalState) {
          throw new TerminalStateViolationError(
            `machine '${name}': terminal state '${state}' is monotonic; no recovery rule declared for event '${event}'`,
            { machine: name, from: state, on: event },
          );
        }
        throw new IllegalTransitionError(
          `machine '${name}': no transition declared for (${state}, ${event})`,
          { machine: name, from: state, on: event },
        );
      }
      return { from: state, on: event, to: rule.to, viaRecovery: isTerminalState };
    },
  };
}

// ---------------------------------------------------------------------------
// Idempotency registrar (INV-06)
// ---------------------------------------------------------------------------

/** The idempotency scope of a command: what command, by whom, under which key. */
export interface IdempotencyScopeLike {
  readonly commandType: string;
  readonly principal: { readonly principalType: string; readonly principalId: string };
  readonly key: string;
}

/** Durable record of the idempotency decision for one scope. */
export interface IdempotencyRecordLike {
  readonly scope: IdempotencyScopeLike;
  readonly commandHash: string;
  readonly status: 'IN_FLIGHT' | 'COMPLETED' | 'FAILED';
  readonly resultHash?: string;
}

export type BeginOutcomeLike =
  | { readonly kind: 'BEGIN' }
  | { readonly kind: 'REPLAY'; readonly record: IdempotencyRecordLike }
  | { readonly kind: 'CONFLICT'; readonly record: IdempotencyRecordLike };

/** Deterministic canonical scope key (unambiguous JSON array form). */
export function idempotencyScopeKey(scope: IdempotencyScopeLike): string {
  return JSON.stringify([
    scope.commandType,
    scope.principal.principalType,
    scope.principal.principalId,
    scope.key,
  ]);
}

/** Storage-agnostic registrar contract (the protocol kernel's shape). */
export interface IdempotencyRegistrar {
  begin(scope: IdempotencyScopeLike, commandHash: string): BeginOutcomeLike;
  complete(scope: IdempotencyScopeLike, resultHash: string): void;
  fail(scope: IdempotencyScopeLike): void;
}

/**
 * Deterministic in-memory idempotency registrar. `begin` is the single
 * decision point (BEGIN / REPLAY / CONFLICT per the protocol table); FAILED
 * scopes re-arm so a definitive failure may be retried under the same key
 * (retry-safe, INV-06).
 */
export class InMemoryIdempotencyRegistrar {
  readonly #records = new Map<string, IdempotencyRecordLike>();

  begin(scope: IdempotencyScopeLike, commandHash: string): BeginOutcomeLike {
    const key = idempotencyScopeKey(scope);
    const existing = this.#records.get(key);
    if (existing === undefined) {
      const record: IdempotencyRecordLike = {
        scope: Object.freeze({
          commandType: scope.commandType,
          principal: Object.freeze({ ...scope.principal }),
          key: scope.key,
        }),
        commandHash,
        status: 'IN_FLIGHT',
      };
      this.#records.set(key, record);
      return { kind: 'BEGIN' };
    }
    if (existing.commandHash !== commandHash) {
      return { kind: 'CONFLICT', record: existing };
    }
    if (existing.status === 'FAILED') {
      const rearmed: IdempotencyRecordLike = { ...existing, status: 'IN_FLIGHT' };
      this.#records.set(key, rearmed);
      return { kind: 'BEGIN' };
    }
    return { kind: 'REPLAY', record: existing };
  }

  complete(scope: IdempotencyScopeLike, resultHash: string): void {
    const key = idempotencyScopeKey(scope);
    const existing = this.#records.get(key);
    if (existing === undefined || existing.status !== 'IN_FLIGHT') {
      throw new ValidationError(
        'idempotency completion requires an IN_FLIGHT record for the scope',
      );
    }
    this.#records.set(key, { ...existing, status: 'COMPLETED', resultHash });
  }

  fail(scope: IdempotencyScopeLike): void {
    const key = idempotencyScopeKey(scope);
    const existing = this.#records.get(key);
    if (existing === undefined || existing.status !== 'IN_FLIGHT') {
      throw new ValidationError(
        'idempotency failure requires an IN_FLIGHT record for the scope',
      );
    }
    this.#records.set(key, { ...existing, status: 'FAILED' });
  }

  recordFor(scope: IdempotencyScopeLike): IdempotencyRecordLike | undefined {
    return this.#records.get(idempotencyScopeKey(scope));
  }
}
