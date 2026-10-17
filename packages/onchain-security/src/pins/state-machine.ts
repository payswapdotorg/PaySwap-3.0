/**
 * @payswap/onchain-security — structural pin: the declared deterministic
 * state machine (R2-W2).
 *
 * LAYER LAW: zero sibling imports. The state-machine kernel is owned by
 * the financial protocol lane (packages/protocol/src/state-machine.ts,
 * P1-W2 — itself the canonical re-homing of the same old-repo module).
 * The onchain write pipeline (src/pipeline.ts) is a DECLARED machine with
 * terminal-state discipline, so the minimal machine contract is pinned
 * here structurally: states, events, transitions, a terminal set —
 * anything not declared is impossible, `transition` either returns the
 * applied record or throws a typed error, never silent. Terminal states
 * have no outgoing non-recovery transitions (INV-3/INV-4 discipline:
 * historical facts immutable; UNKNOWN/terminal handled explicitly).
 *
 * A real protocol StateMachine satisfies this pin by construction; the
 * Tech Lead wires the protocol lane at integration.
 */

/** (from, on) combination with no declared rule. */
export class IllegalTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalTransitionError";
  }
}

/** Event used that the machine never declared. */
export class UndeclaredEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UndeclaredEventError";
  }
}

/** Attempt to leave a terminal state without a declared recovery rule. */
export class TerminalStateViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerminalStateViolationError";
  }
}

/** The machine definition itself is invalid. */
export class InvalidStateMachineDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateMachineDefinitionError";
  }
}

/** One declared transition rule (from + event → to). */
export interface TransitionRule<S extends string, E extends string, C> {
  readonly from: S;
  readonly on: E;
  readonly to: S;
  /** PURE guard: may read context, must never mutate it or perform I/O. */
  readonly guard?: (context: C) => boolean;
  readonly description?: string;
}

/** Explicit recovery out of a terminal state (the only lawful exit). */
export interface RecoveryRule<S extends string, E extends string> {
  readonly from: S;
  readonly on: E;
  readonly to: S;
  readonly description?: string;
}

/** A declared machine: states, events, transitions, terminal set, recovery. */
export interface StateMachineDefinition<S extends string, E extends string, C> {
  readonly name: string;
  readonly initial: S;
  readonly states: readonly S[];
  readonly events: readonly E[];
  readonly transitions: readonly TransitionRule<S, E, C>[];
  readonly terminalStates: readonly S[];
  readonly recovery?: readonly RecoveryRule<S, E>[];
}

/** The applied transition record. */
export interface TransitionRecord<S extends string, E extends string> {
  readonly from: S;
  readonly on: E;
  readonly to: S;
  /** True when the move was an explicit recovery out of a terminal state. */
  readonly viaRecovery: boolean;
}

/** The machine surface (deterministic; guards are pure). */
export interface StateMachine<S extends string, E extends string, C> {
  readonly name: string;
  readonly initial: S;
  readonly states: readonly S[];
  readonly events: readonly E[];
  readonly terminalStates: readonly S[];
  transition(from: S, event: E, context: C): TransitionRecord<S, E>;
}

function keyOf<S extends string, E extends string>(from: S, on: E): string {
  return `${from}+${on}`;
}

/**
 * Define a deterministic state machine. Definition-time validation:
 * - every transition/recovery references declared states and events;
 * - at most one rule per (from, on) — no ambiguous first-match;
 * - non-recovery transitions may not originate in a terminal state;
 * - recovery rules may only originate in terminal states;
 * - the initial state is declared and non-terminal.
 */
export function defineStateMachine<S extends string, E extends string, C>(
  definition: StateMachineDefinition<S, E, C>,
): StateMachine<S, E, C> {
  const stateSet = new Set<string>(definition.states);
  const eventSet = new Set<string>(definition.events);
  const terminalSet = new Set<string>(definition.terminalStates);

  const fail = (message: string): never => {
    throw new InvalidStateMachineDefinitionError(
      `state machine '${definition.name}': ${message}`,
    );
  };

  if (new Set(definition.states.map((state) => state)).size !== definition.states.length) {
    fail("states contain duplicates");
  }
  if (!stateSet.has(definition.initial)) {
    fail(`initial state '${definition.initial}' is not declared`);
  }
  if (terminalSet.has(definition.initial)) {
    fail(`initial state '${definition.initial}' must not be terminal`);
  }
  for (const terminal of definition.terminalStates) {
    if (!stateSet.has(terminal)) {
      fail(`terminal state '${terminal}' is not declared`);
    }
  }

  const rules = new Map<string, TransitionRule<S, E, C>>();
  for (const rule of definition.transitions) {
    if (!stateSet.has(rule.from) || !stateSet.has(rule.to)) {
      fail(`transition ${rule.from} --${rule.on}--> ${rule.to} references undeclared states`);
    }
    if (!eventSet.has(rule.on)) {
      fail(`transition ${rule.from} --${rule.on}--> ${rule.to} references undeclared event`);
    }
    if (terminalSet.has(rule.from)) {
      fail(`transition from terminal state '${rule.from}' requires a declared recovery rule`);
    }
    const key = keyOf(rule.from, rule.on);
    if (rules.has(key)) {
      fail(`ambiguous rules for ${key} (at most one rule per from+on)`);
    }
    rules.set(key, rule);
  }

  const recoveries = new Map<string, RecoveryRule<S, E>>();
  for (const rule of definition.recovery ?? []) {
    if (!stateSet.has(rule.from) || !stateSet.has(rule.to)) {
      fail(`recovery ${rule.from} --${rule.on}--> ${rule.to} references undeclared states`);
    }
    if (!eventSet.has(rule.on)) {
      fail(`recovery ${rule.from} --${rule.on}--> ${rule.to} references undeclared event`);
    }
    if (!terminalSet.has(rule.from)) {
      fail(`recovery ${rule.from} --${rule.on}--> ${rule.to} must originate in a terminal state`);
    }
    const key = keyOf(rule.from, rule.on);
    if (recoveries.has(key)) {
      fail(`ambiguous recovery rules for ${key}`);
    }
    recoveries.set(key, rule);
  }

  return {
    name: definition.name,
    initial: definition.initial,
    states: definition.states,
    events: definition.events,
    terminalStates: definition.terminalStates,
    transition(from: S, event: E, context: C): TransitionRecord<S, E> {
      if (!eventSet.has(event)) {
        throw new UndeclaredEventError(
          `state machine '${definition.name}' never declared event '${event}'`,
        );
      }
      if (terminalSet.has(from)) {
        const recovery = recoveries.get(keyOf(from, event));
        if (recovery !== undefined) {
          return { from, on: event, to: recovery.to, viaRecovery: true };
        }
        throw new TerminalStateViolationError(
          `state machine '${definition.name}': '${from}' is terminal — no declared recovery for '${event}'`,
        );
      }
      const rule = rules.get(keyOf(from, event));
      if (rule === undefined) {
        throw new IllegalTransitionError(
          `state machine '${definition.name}': no declared rule for ${keyOf(from, event)}`,
        );
      }
      if (rule.guard !== undefined && !rule.guard(context)) {
        throw new IllegalTransitionError(
          `state machine '${definition.name}': guard rejected ${keyOf(from, event)}`,
        );
      }
      return { from, on: event, to: rule.to, viaRecovery: false };
    },
  };
}
