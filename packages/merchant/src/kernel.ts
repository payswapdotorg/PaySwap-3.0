/**
 * @payswap/merchant — the deterministic canonicalization backbone
 * (P5-W3, lane R3-W3; PORT+ADAPT of the execution-graph canonical
 * module's digest law, re-declared locally because sibling imports
 * here are forbidden — the leaf-in-flight law).
 *
 * - `stableStringify` — CANONICAL JSON: recursively key-sorted,
 *   bigint-aware, byte-stable text (`n:` numbers, `b:` bigints; the
 *   economic lane's digest law). Same input -> same bytes, always.
 * - `fnv1a64` — FNV-1a 64 digests: deterministic content binding
 *   (binding, not security).
 * - `canonicalDigest` — the canonical digest of any wire-shaped value.
 * - `deepFreeze` — immutability of every recorded fact (INV-3).
 * - `canonicallyEqual` — deterministic structural equality.
 *
 * Determinism law: no ambient clock, no randomness, no filesystem, no
 * network. Same input -> same output, always.
 */

import { CanonicalizationError } from "./errors.ts";

// ---------------------------------------------------------------------------
// Canonical JSON (bigint-aware, key-sorted, byte-stable)
// ---------------------------------------------------------------------------

/**
 * Canonical, sort-stable JSON text (bigint-aware). Objects serialize
 * with recursively sorted keys; bigints serialize as `b:<decimal>`;
 * numbers as `n:<decimal>`; strings via JSON.stringify. Functions,
 * symbols, `undefined` and non-finite numbers are rejected — canonical
 * text is total over wire data.
 */
export function stableStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalizationError("canonical JSON rejects non-finite numbers");
      }
      return `n:${value.toString()}`;
    case "bigint":
      return `b:${value.toString()}`;
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
      }
      const record = value as Readonly<Record<string, unknown>>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        parts.push(`${JSON.stringify(key)}:${stableStringify(record[key])}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new CanonicalizationError(
        `canonical JSON rejects values of type '${typeof value}'`,
      );
  }
}

/** Alias: the canonical JSON rendering used by the digest law. */
export const canonicalJsonStringify = stableStringify;

// ---------------------------------------------------------------------------
// FNV-1a 64 (deterministic binding — never security)
// ---------------------------------------------------------------------------

const MASK64 = 0xffff_ffff_ffff_ffffn;
const FNV_OFFSET = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME = 0x100_0000_01b3n;

/** FNV-1a 64 digest over canonical text (deterministic binding, not security). */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index) & 0xff);
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Canonical digest of any wire-shaped value (sorted keys, bigint-aware).
 * The digest is CONTENT BINDING for lineage/evidence records — it is
 * deterministic and dependency-free, and never a security primitive.
 */
export function canonicalDigest(value: unknown): string {
  return fnv1a64(stableStringify(value));
}

// ---------------------------------------------------------------------------
// Deep freeze (INV-3: historical facts are immutable)
// ---------------------------------------------------------------------------

/** Deep-freeze a recorded fact (INV-3: historical facts are immutable). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (Object.isFrozen(value)) {
      return value;
    }
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Deterministic structural equality of two wire-shaped values. */
export function canonicallyEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

// ---------------------------------------------------------------------------
// Shared limits (the bounded-string law used across the package)
// ---------------------------------------------------------------------------

/** The package's shared structural limits (bounded strings/ids). */
export const LIMITS = Object.freeze({
  /** Maximum length of any branded id / bounded reference. */
  refMaxLength: 256,
  /** Maximum length of display names (business/asset display names). */
  displayNameMaxLength: 128,
  /** Minimum length of a 3-letter currency code. */
  currencyCodeLength: 3,
  /** Maximum secret-scan depth (the kernel's bounded-depth law). */
  secretScanMaxDepth: 8,
} as const);

import { MachineGuardError, MachineTransitionError } from "./errors.ts";

/** One declared transition of a state machine. */
export interface MachineTransition<S extends string, E extends string, C> {
  readonly from: S;
  readonly on: E;
  readonly to: S;
  /** Deterministic guard: the transition fires only when it passes. */
  readonly guard?: (context: C) => boolean;
  readonly description?: string;
}

/** The definition of a deterministic state machine. */
export interface StateMachineDefinition<S extends string, E extends string, C> {
  readonly name: string;
  readonly initial: S;
  readonly states: readonly S[];
  readonly events: readonly E[];
  readonly transitions: readonly MachineTransition<S, E, C>[];
  readonly terminalStates: readonly S[];
}

/** A built state machine (pure, deterministic, frozen). */
export interface StateMachine<S extends string, E extends string, C> {
  readonly name: string;
  readonly initial: S;
  readonly states: readonly S[];
  readonly events: readonly E[];
  readonly transitions: readonly MachineTransition<S, E, C>[];
  readonly terminalStates: readonly S[];

  /**
   * Attempt one transition. Fail-closed: an undeclared transition
   * throws `MachineTransitionError`; a declared transition whose guard
   * rejects the context throws `MachineGuardError`. Terminal states
   * have no outgoing rules (monotonic by construction).
   */
  transition(from: S, on: E, context?: C): MachineTransitionRecord<S, E>;

  /** Whether the transition is declared AND its guard (if any) passes. */
  canTransition(from: S, on: E, context?: C): boolean;

  /** Whether the state is terminal (monotonic: no outgoing rules). */
  isTerminal(state: S): boolean;
}

/** The record of one executed transition (history is append-only). */
export interface MachineTransitionRecord<S extends string, E extends string> {
  readonly from: S;
  readonly on: E;
  readonly to: S;
}

/** Build a deterministic state machine from its definition. */
export function defineStateMachine<S extends string, E extends string, C>(
  definition: StateMachineDefinition<S, E, C>,
): StateMachine<S, E, C> {
  const declaredStates = new Set<string>(definition.states);
  const declaredEvents = new Set<string>(definition.events);
  const fromStates = new Set<string>(definition.transitions.map((rule) => rule.from));

  // Structural integrity of the definition itself (fail-closed).
  if (!declaredStates.has(definition.initial)) {
    throw new MachineTransitionError(
      `state machine '${definition.name}': the initial state is not declared`,
    );
  }
  for (const rule of definition.transitions) {
    if (!declaredStates.has(rule.from) || !declaredStates.has(rule.to)) {
      throw new MachineTransitionError(
        `state machine '${definition.name}': a transition references an undeclared state`,
        { from: rule.from, on: rule.on, to: rule.to },
      );
    }
    if (!declaredEvents.has(rule.on)) {
      throw new MachineTransitionError(
        `state machine '${definition.name}': a transition references an undeclared event`,
        { from: rule.from, on: rule.on, to: rule.to },
      );
    }
  }
  for (const terminal of definition.terminalStates) {
    if (!declaredStates.has(terminal)) {
      throw new MachineTransitionError(
        `state machine '${definition.name}': a terminal state is not declared`,
        { state: terminal },
      );
    }
    if (fromStates.has(terminal)) {
      throw new MachineTransitionError(
        `state machine '${definition.name}': terminal state '${terminal}' declares outgoing transitions (terminal states are monotonic)`,
      );
    }
  }

  const machine: StateMachine<S, E, C> = {
    name: definition.name,
    initial: definition.initial,
    states: Object.freeze([...definition.states]),
    events: Object.freeze([...definition.events]),
    transitions: Object.freeze(
      definition.transitions.map((rule) => Object.freeze({ ...rule })),
    ),
    terminalStates: Object.freeze([...definition.terminalStates]),

    transition(from: S, on: E, context?: C): MachineTransitionRecord<S, E> {
      if (!declaredStates.has(from)) {
        throw new MachineTransitionError(
          `state machine '${definition.name}': unknown source state '${from}'`,
        );
      }
      const candidates = definition.transitions.filter(
        (rule) => rule.from === from && rule.on === on,
      );
      if (candidates.length === 0) {
        if (definition.terminalStates.includes(from)) {
          throw new MachineTransitionError(
            `state machine '${definition.name}': state '${from}' is terminal — the record is never rewritten (monotonic; a retry mints a NEW record)`,
            { from, on },
          );
        }
        throw new MachineTransitionError(
          `state machine '${definition.name}': event '${on}' is not declared from state '${from}'`,
          { from, on },
        );
      }
      const guarded = candidates.filter(
        (rule) => rule.guard === undefined || context === undefined || rule.guard(context),
      );
      if (guarded.length === 0) {
        const guard = candidates[0]?.guard;
        if (guard !== undefined && context !== undefined) {
          throw new MachineGuardError(
            `state machine '${definition.name}': the guard rejected event '${on}' from state '${from}'`,
            { from, on },
          );
        }
        throw new MachineTransitionError(
          `state machine '${definition.name}': event '${on}' is not legal from state '${from}'`,
          { from, on },
        );
      }
      const rule = guarded[0];
      if (rule === undefined) {
        throw new MachineTransitionError(
          `state machine '${definition.name}': no legal rule found (internal integrity failure)`,
        );
      }
      return Object.freeze({ from: rule.from, on: rule.on, to: rule.to });
    },

    canTransition(from: S, on: E, context?: C): boolean {
      if (!declaredStates.has(from)) {
        return false;
      }
      return definition.transitions.some(
        (rule) =>
          rule.from === from &&
          rule.on === on &&
          (rule.guard === undefined || context === undefined || rule.guard(context)),
      );
    },

    isTerminal(state: S): boolean {
      return definition.terminalStates.includes(state);
    },
  };
  return Object.freeze(machine);
}
