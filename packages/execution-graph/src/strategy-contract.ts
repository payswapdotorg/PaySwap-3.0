/**
 * @payswap/execution-graph — the STRATEGY MODEL contracts (P3-W2; strategy
 * half of the old payswap.org@8a735bf packages/lab simulation program).
 *
 * WORK-ORDER LAW: "Strategy model: strategies answer WHAT (settle-now,
 * batch, net-later...); the Director is deterministic controls + replaceable
 * learned components — advisory only, never an authority."
 *
 * - A STRATEGY answers WHAT: how execution is ORGANIZED (settle now, batch
 *   within a window, defer to net later, hold for review). It never answers
 *   HOW the rails are chosen (route compilation is P5-W1) and never carries
 *   authority (INV-09/INV-10: no strategy artifact can declare financial
 *   truth or directly authorize execution).
 * - Every strategy artifact carries the STRUCTURAL LITERAL
 *   `advisoryOnly: true` / `authoritative: false` — consumers can rely on
 *   the constant at the type level.
 * - The StrategyProgram (ADAPT of the old SimulationProgram) is pure data:
 *   the WHAT-dimensions of a routing/settlement policy, evaluated
 *   deterministically by the simulator. A program may DECLARE a bypass
 *   (`authorizationMode: 'DECLARED_BYPASS'`) so the evaluator can fail it —
 *   declaring is the only way to reach it; nothing here fabricates
 *   authorization.
 */

import type { TimestampMs } from '@payswap/protocol';

/** The closed WHAT-vocabulary of strategy directives. */
export const STRATEGY_DIRECTIVE_KINDS = [
  'SETTLE_NOW',
  'BATCH',
  'NET_LATER',
  'HOLD_FOR_REVIEW',
] as const;

/** One strategy directive kind (WHAT to do — never HOW, never authority). */
export type StrategyDirectiveKind = (typeof STRATEGY_DIRECTIVE_KINDS)[number];

/** Total predicate over the directive vocabulary. */
export function isStrategyDirectiveKind(value: unknown): value is StrategyDirectiveKind {
  return (
    typeof value === 'string' &&
    (STRATEGY_DIRECTIVE_KINDS as readonly unknown[]).includes(value)
  );
}

/** Parameters per directive kind (typed, bounded, deterministic). */
export interface StrategyDirectiveParameters {
  /** BATCH: the coalescing window, in discrete steps (> 0). */
  readonly windowSteps?: number;
  /** NET_LATER: how far settlement may be deferred, in discrete steps (> 0). */
  readonly deferSteps?: number;
  /** HOLD_FOR_REVIEW: why the demand must wait for a human/agent decision. */
  readonly reason?: string;
}

/**
 * One strategy directive: WHAT to do with a demand. Structurally advisory —
 * `advisoryOnly` is the literal `true` and cannot be constructed otherwise.
 */
export interface StrategyDirective {
  readonly directiveId: string;
  readonly kind: StrategyDirectiveKind;
  readonly parameters: StrategyDirectiveParameters;
  /** STRUCTURAL LITERAL: a directive is advisory, never authority (INV-09). */
  readonly advisoryOnly: true;
  /** Deterministic rationale (recorded, inspectable, never binding). */
  readonly rationale: string;
}

/** The demand shape a strategy organizes (WHAT the demand wants). */
export interface StrategyDemandShape {
  readonly demandId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly direction: 'OUTBOUND' | 'INBOUND';
  readonly deadlineMs: number;
  /** A demand gated on an approval arriving (holds for review). */
  readonly requiresApproval?: boolean;
}

/**
 * A deterministic routing/settlement policy under evaluation — pure data, no
 * authority, no credentials, no protocol-command shape (ADAPT of the old
 * lab SimulationProgram, W2-004).
 */
export interface StrategyProgram {
  readonly programId: string;
  readonly programVersion: string;
  /** Ordered rail preferences; the first usable rail wins (simulator input). */
  readonly routePreference: readonly string[];
  /** Batch co-directional demands inside the delay window (netting). */
  readonly useNetting: boolean;
  /** Cover liquidity gaps with explicit network credit (INV-02 discipline). */
  readonly useNetworkCredit: boolean;
  /** How many steps a demand may be deferred for batching. */
  readonly delayToleranceSteps: number;
  /** Screen fraudulent demands (hard compliance constraint). */
  readonly fraudScreening: boolean;
  /** Context receives only the minimum data required (privacy discipline). */
  readonly privacyBounded: boolean;
  /**
   * A program may declare a bypass — the simulator will then settle without
   * authorization and the evaluator's AUTHORIZATION hard constraint fails.
   * Declaring the bypass is the only way to reach it (nothing here
   * fabricates authorization).
   */
  readonly authorizationMode: 'PROTOCOL_AUTHORIZED' | 'DECLARED_BYPASS';
}

/**
 * A strategy ADVISORY: the program plus its resolved directives, wrapped in
 * the advisory envelope. `authoritative` is the STRUCTURAL LITERAL `false`
 * (old FROZEN §227 discipline, canonical INV-09/INV-11).
 */
export interface StrategyAdvisory {
  readonly advisoryId: string;
  readonly programId: string;
  readonly programVersion: string;
  readonly directives: readonly StrategyDirective[];
  /** Canonical digest of the advisory's truth-relevant content. */
  readonly digest: string;
  readonly issuedAt: TimestampMs;
  /** STRUCTURAL LITERAL: advisories are never authority (INV-09/INV-11). */
  readonly authoritative: false;
}
