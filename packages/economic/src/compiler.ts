/**
 * @payswap/economic — the deterministic candidate compiler (P1-W1).
 *
 * Compilation pipeline (work-order scope): EconomicGoal (+ EconomicProgram
 * expansion) -> validated intent set -> typed CANDIDATE skeletons.
 *
 * Determinism law (ported from payswap.org@8a735bf
 * packages/route-compiler/test/determinism.test.ts): compilation is a PURE
 * FUNCTION of its inputs — same goal + same caller-supplied compile instant
 * -> byte-identical output (deep-equal results, stable content-derived ids,
 * stable digests); canonical input ordering makes the compilation invariant
 * under permutation of the SET-like goal fields (allowedArchetypes,
 * nonGoals, economicInputs, program parameters); no ambient clock, no
 * randomness, no filesystem, no network. Different compile instants are
 * DIFFERENT compilations (the digest includes compiledAt — an ambient clock
 * is never consulted, the instant is always caller-supplied).
 *
 * Fail-closed laws: non-integer or negative compile instants are refused;
 * an expired goal (compiledAt >= deadlineAt) compiles NOTHING (the demand
 * window is fail-closed); every derived intent is re-validated through the
 * canonical validators (construction from validated parts must still pass
 * — a compiler bug cannot smuggle an invalid intent); duplicate derived
 * ids are an internal-invariant violation and throw.
 *
 * Compiler pinning (old spec law: "Historical intents pin the intent spec
 * and compiler version that created them"): every compilation result
 * carries COMPILER_VERSION.
 *
 * OUT OF SCOPE (deliberately): rail-aware routing, scoring, best execution
 * (P5-W1); the EEG formalism (P3-W2); authorization decisions (P1-W3);
 * financial finality (P1-W2). Output is ADVISORY DEMAND ONLY.
 */

import { InvalidEconomicCompilationError } from "./errors.ts";
import { contentDigest } from "./digest.ts";
import { type EconomicGoal, validateEconomicGoal } from "./goal.ts";
import { expandEconomicProgram } from "./program.ts";
import {
  type MoneyMovementIntent,
  validateMoneyMovementIntent,
} from "./intent.ts";
import { validatePaymentIntent, type PaymentIntent } from "./payment-intent.ts";
import { type ServiceAccessIntent, validateServiceAccessIntent } from "./service-intent.ts";
import {
  CANDIDATE_SKELETON_FORMAT_VERSION,
  type CandidateEdge,
  type CandidateNode,
  type CandidateSkeleton,
} from "./candidate.ts";
import { economicInputSortKey } from "./versioned-input.ts";
import { deepFreeze, requireNonNegativeSafeInteger, type Fail } from "./validate.ts";

const fail: Fail = (message: string) => new InvalidEconomicCompilationError(message);

/** The compiler identity pinned into every compilation result. */
export const COMPILER_VERSION = "payswap-economic-compiler/1" as const;

/** One compiled intent, discriminated by archetype. */
export type CompiledIntent =
  | { readonly archetype: "MONEY_MOVEMENT"; readonly intent: MoneyMovementIntent }
  | { readonly archetype: "PAYMENT"; readonly intent: PaymentIntent }
  | { readonly archetype: "SERVICE_ACCESS"; readonly intent: ServiceAccessIntent };

/** The deterministic result of compiling one EconomicGoal. */
export interface GoalCompilationResult {
  /** The compiler version that produced this compilation (historical pinning). */
  readonly compilerVersion: string;
  /** The caller-supplied compile instant (never ambient). */
  readonly compiledAt: number;
  /** Goal lineage. */
  readonly goalId: string;
  /** The validated compiled intents, in goal-outcome order. */
  readonly intents: readonly CompiledIntent[];
  /** The candidate skeletons, one per compiled intent, in the same order. */
  readonly skeletons: readonly CandidateSkeleton[];
}

/** Compilation request for one goal. */
export interface GoalCompilationInput {
  /** The goal to compile (validated fail-closed). */
  readonly goal: unknown;
  /** Caller-supplied compile instant (ms) — the compiler has NO ambient clock. */
  readonly compiledAt: number;
}

/** The deterministic result of compiling an EconomicProgram (all occurrences). */
export interface ProgramCompilationResult extends GoalCompilationResult {
  /** Program lineage. */
  readonly programId: string;
  /** The expanded concrete goals (deterministic, in occurrence order). */
  readonly goals: readonly EconomicGoal[];
}

/** Compilation request for one program. */
export interface ProgramCompilationInput {
  /** The program to compile (validated + expanded fail-closed). */
  readonly program: unknown;
  /** Caller-supplied compile instant (ms) — the compiler has NO ambient clock. */
  readonly compiledAt: number;
}

/** Rejects duplicate derived ids (internal invariant — never trusts the digest). */
function rejectDuplicateIds(ids: readonly string[], what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new InvalidEconomicCompilationError(
        `derived ${what} identity collision ('${id}') — deterministic ids must be unique`,
      );
    }
    seen.add(id);
  }
}

/** Builds one movement demand graph: origin -> movement -> destination. */
function movementSkeletonParts(
  intentRef: string,
): { nodes: readonly CandidateNode[]; edges: readonly CandidateEdge[] } {
  const origin: CandidateNode = {
    nodeId: `cnode:${contentDigest({ kind: "VALUE_ORIGIN", intentRef })}`,
    kind: "VALUE_ORIGIN",
    intentRef,
  };
  const movement: CandidateNode = {
    nodeId: `cnode:${contentDigest({ kind: "VALUE_MOVEMENT", intentRef })}`,
    kind: "VALUE_MOVEMENT",
    intentRef,
  };
  const destination: CandidateNode = {
    nodeId: `cnode:${contentDigest({ kind: "VALUE_DESTINATION", intentRef })}`,
    kind: "VALUE_DESTINATION",
    intentRef,
  };
  const edges: readonly CandidateEdge[] = [
    {
      edgeId: `cedge:${contentDigest({ fromNodeId: origin.nodeId, kind: "VALUE_FROM", toNodeId: movement.nodeId })}`,
      fromNodeId: origin.nodeId,
      toNodeId: movement.nodeId,
      kind: "VALUE_FROM",
    },
    {
      edgeId: `cedge:${contentDigest({ fromNodeId: movement.nodeId, kind: "VALUE_TO", toNodeId: destination.nodeId })}`,
      fromNodeId: movement.nodeId,
      toNodeId: destination.nodeId,
      kind: "VALUE_TO",
    },
  ];
  return { nodes: [origin, movement, destination], edges };
}

/** Builds one service demand graph: a single provision node, no edges. */
function serviceSkeletonParts(intentRef: string): {
  nodes: readonly CandidateNode[];
  edges: readonly CandidateEdge[];
} {
  return {
    nodes: [
      {
        nodeId: `cnode:${contentDigest({ kind: "SERVICE_PROVISION", intentRef })}`,
        kind: "SERVICE_PROVISION",
        intentRef,
      },
    ],
    edges: [],
  };
}

/** Assembles the frozen skeleton for one compiled intent (canonical sorted orderings). */
function assembleSkeleton(
  goal: EconomicGoal,
  compiled: CompiledIntent,
  compiledAt: number,
): CandidateSkeleton {
  const { nodes, edges } =
    compiled.archetype === "SERVICE_ACCESS"
      ? serviceSkeletonParts(compiled.intent.intentId)
      : movementSkeletonParts(compiled.intent.intentId);
  rejectDuplicateIds(nodes.map((node) => node.nodeId), "node");
  rejectDuplicateIds(edges.map((edge) => edge.edgeId), "edge");
  const nonGoals = [...goal.nonGoals].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const economicInputs = [...goal.economicInputs].sort((a, b) =>
    economicInputSortKey(a) < economicInputSortKey(b) ? -1 : 1,
  );
  // The skeleton's content-derived identity covers BOTH its own fields AND
  // the canonical content of the realized intent: a changed demand (amount,
  // location, currency, window) is a DIFFERENT candidate, never the same
  // skeleton id (the single-source-of-truth law, ported from the old
  // compiler's digest discipline).
  const core = {
    formatVersion: CANDIDATE_SKELETON_FORMAT_VERSION,
    goalId: goal.goalId,
    intentRef: compiled.intent.intentId,
    archetype: compiled.archetype,
    intent: compiled.intent,
    authorizationRef: goal.authorizationRef,
    constraints: goal.constraints,
    nodes,
    edges,
    nonGoals,
    economicInputs,
  };
  const skeletonId = `cand:${contentDigest(core)}`;
  const digest = contentDigest({ ...core, skeletonId, compiledAt, compilerVersion: COMPILER_VERSION });
  const { intent: _realized, ...skeletonFields } = core;
  void _realized;
  return deepFreeze({ ...skeletonFields, skeletonId, digest });
}

/** Deterministic compilation of ONE validated EconomicGoal. */
export function compileEconomicGoal(input: GoalCompilationInput): GoalCompilationResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new InvalidEconomicCompilationError("a GoalCompilationInput is required");
  }
  const compiledAt = requireNonNegativeSafeInteger(
    (input as unknown as Readonly<Record<string, unknown>>)["compiledAt"],
    "GoalCompilationInput.compiledAt",
    fail,
  );
  const goal = validateEconomicGoal(
    (input as unknown as Readonly<Record<string, unknown>>)["goal"],
  );
  if (compiledAt >= goal.timeBounds.deadlineAt) {
    throw new InvalidEconomicCompilationError(
      `goal '${goal.goalId}' is expired at the compile instant — an expired demand compiles nothing`,
    );
  }

  const intents: CompiledIntent[] = [];
  const skeletons: CandidateSkeleton[] = [];
  for (let index = 0; index < goal.outcomes.length; index += 1) {
    const outcome = goal.outcomes[index];
    if (outcome === undefined) {
      continue;
    }
    const intentId = `${goal.goalId}:intent:${index}`;
    const compiled = compileOutcome(goal, outcome, intentId);
    intents.push(compiled);
    skeletons.push(assembleSkeleton(goal, compiled, compiledAt));
  }
  rejectDuplicateIds(skeletons.map((skeleton) => skeleton.skeletonId), "skeleton");
  return deepFreeze({
    compilerVersion: COMPILER_VERSION,
    compiledAt,
    goalId: goal.goalId,
    intents,
    skeletons,
  });
}

/** Compiles one goal outcome into its validated intent (re-validated fail-closed). */
function compileOutcome(
  goal: EconomicGoal,
  outcome: EconomicGoal["outcomes"][number],
  intentId: string,
): CompiledIntent {
  if (outcome.kind === "SERVICE_ACCESS") {
    const candidate: Record<string, unknown> = {
      intentId,
      principalRef: goal.principalRef,
      serviceRef: outcome.demand.serviceRef,
      beneficiaryRef: outcome.demand.beneficiaryRef,
      ...(outcome.demand.maxCost !== undefined ? { maxCost: outcome.demand.maxCost } : {}),
      constraints: goal.constraints,
      authorizationRef: goal.authorizationRef,
      declaredAt: goal.timeBounds.declaredAt,
      expiresAt: goal.timeBounds.deadlineAt,
    };
    return { archetype: "SERVICE_ACCESS", intent: validateServiceAccessIntent(candidate) };
  }
  const movement: Record<string, unknown> = {
    intentId,
    principalRef: goal.principalRef,
    origin: outcome.demand.origin,
    destination: outcome.demand.destination,
    originAmount: outcome.demand.originAmount,
    arrivalCurrency: outcome.demand.destination.currency,
    constraints: goal.constraints,
    intentAuthorizationRef: goal.authorizationRef,
    declaredAt: goal.timeBounds.declaredAt,
    expiresAt: goal.timeBounds.deadlineAt,
  };
  if (outcome.kind === "PAYMENT") {
    return {
      archetype: "PAYMENT",
      intent: validatePaymentIntent({ ...movement, commerceRef: outcome.commerceRef }),
    };
  }
  return { archetype: "MONEY_MOVEMENT", intent: validateMoneyMovementIntent(movement) };
}

/** Deterministic compilation of an EconomicProgram: expansion + per-goal compilation. */
export function compileEconomicProgram(
  input: ProgramCompilationInput,
): ProgramCompilationResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new InvalidEconomicCompilationError("a ProgramCompilationInput is required");
  }
  const compiledAt = requireNonNegativeSafeInteger(
    (input as unknown as Readonly<Record<string, unknown>>)["compiledAt"],
    "ProgramCompilationInput.compiledAt",
    fail,
  );
  const programRecord = (input as unknown as Readonly<Record<string, unknown>>)["program"];
  const goals = expandEconomicProgram(programRecord);
  const programId =
    programRecord !== null &&
    typeof programRecord === "object" &&
    !Array.isArray(programRecord) &&
    typeof (programRecord as Readonly<Record<string, unknown>>)["programId"] === "string"
      ? (programRecord as Readonly<Record<string, unknown>>)["programId"]
      : undefined;
  if (typeof programId !== "string" || programId.length === 0) {
    throw new InvalidEconomicCompilationError("ProgramCompilationInput.program is required");
  }
  const intents: CompiledIntent[] = [];
  const skeletons: CandidateSkeleton[] = [];
  for (const goal of goals) {
    const result = compileEconomicGoal({ goal, compiledAt });
    intents.push(...result.intents);
    skeletons.push(...result.skeletons);
  }
  return deepFreeze({
    compilerVersion: COMPILER_VERSION,
    compiledAt,
    goalId: goals.length === 1 ? goals[0]!.goalId : programId,
    programId,
    goals,
    intents,
    skeletons,
  });
}
