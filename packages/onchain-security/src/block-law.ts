/**
 * @payswap/onchain-security — the encoded cannot_downgrade_block layer
 * law (R2-W2 net-new; MODULE-OWNERSHIP.yaml layer `security`:
 * `cannot_downgrade_block: true`; canonical INV-21: "Security/adversarial
 * intelligence cannot downgrade BLOCK").
 *
 * THE LAW, encoded at THREE levels:
 *
 * 1. TYPE level — `NoBlockDowngrade<From, To>`: the only lawful target of
 *    a projection FROM a BLOCK decision IS a BLOCK decision. Any API that
 *    would type-check a BLOCK→ALLOW/UNKNOWN conversion resolves to a
 *    descriptive error union instead. `BlockProjection` is the sole
 *    lawful projection type of a BLOCK decision.
 * 2. RUNTIME level — `joinGateDecisions` is the ONLY composition
 *    primitive: a commutative, associative LATTICE JOIN over
 *    ALLOW < UNKNOWN < BLOCK where BLOCK dominates and reasons/checks/
 *    evidence only ACCUMULATE. There is no function in this package that
 *    removes a block reason or softens a BLOCK.
 * 3. REJECTION level — `attemptBlockDowngrade` and `assertNoBlockDowngrade`:
 *    the first ALWAYS throws (a tested first-class contract, mirroring
 *    gates' attemptAgentOverride); the second is the fail-closed guard
 *    composition code uses when re-evaluating with fresh state (a fresh
 *    evaluation may only keep or RAISE the restriction, never lower it).
 *
 * The threat-intelligence lane ("./threat-intel") extends this law to the
 * four-value verdict vocabulary (composeThreatVerdict /
 * resolveOnchainSecurityDecision in threat-intel/verdict.ts): an agent
 * can only harden, never soften.
 */

import type { BlockReason, GateDecision, GuardCheck } from "./gates-policy.ts";

/**
 * The restriction lattice over gate decisions (higher = more
 * restrictive). BLOCK is maximal: nothing sits above it.
 */
export const GATE_DECISION_RANK = {
  ALLOW: 0,
  UNKNOWN: 1,
  BLOCK: 2,
} as const;

/** The more restrictive of two decision values (deterministic, symmetric). */
export function stricterGateDecision(
  a: GateDecision["decision"],
  b: GateDecision["decision"],
): GateDecision["decision"] {
  return GATE_DECISION_RANK[a] >= GATE_DECISION_RANK[b] ? a : b;
}

/**
 * TYPE LAW: the only lawful projection of a BLOCK decision is a BLOCK
 * decision. `NoBlockDowngrade<From, To>` is `To` when the projection does
 * not leave BLOCK, and a descriptive error union when it would. Compile-
 * time asserted in test/no-downgrade-law.test.ts.
 */
export type NoBlockDowngrade<
  From extends GateDecision["decision"],
  To extends GateDecision["decision"],
> = From extends "BLOCK"
  ? To extends "BLOCK"
    ? To
    : ["CANNOT_DOWNGRADE_BLOCK", From, To]
  : To;

/**
 * TYPE LAW: the sole lawful projection shape of a BLOCK decision — the
 * terminal block. A BLOCK may be re-stated (with accumulated reasons),
 * never re-typed.
 */
export type BlockProjection<Decision extends GateDecision> = Decision extends {
  decision: "BLOCK";
}
  ? { readonly decision: "BLOCK" }
  : never;

/** Raised when ANY code path would downgrade a BLOCK (INV-21). */
export class BlockDowngradeForbiddenError extends Error {
  readonly attempted: GateDecision["decision"];

  constructor(attempted: GateDecision["decision"], claimedBy: string) {
    super(
      `'${claimedBy}' attempted to downgrade a BLOCK gate decision to '${attempted}': a security gate can BLOCK, never un-block (MODULE-OWNERSHIP cannot_downgrade_block, INV-21)`,
    );
    this.name = "BlockDowngradeForbiddenError";
    this.attempted = attempted;
  }
}

// ---------------------------------------------------------------------------
// RUNTIME LAW: the lattice join + the tested rejection seam
// ---------------------------------------------------------------------------

/** Accumulated reasons of a joined BLOCK decision (deduplicated, stable). */
function joinedReasons(left: GateDecision, right: GateDecision): readonly BlockReason[] {
  if (left.decision !== "BLOCK" || right.decision !== "BLOCK") {
    return (left.decision === "BLOCK" ? left.reasons : right.decision === "BLOCK" ? right.reasons : []);
  }
  const seen = new Set<string>();
  const reasons: BlockReason[] = [];
  for (const reason of [...left.reasons, ...right.reasons]) {
    const key = `${reason.dimension}:${reason.code}`;
    if (!seen.has(key)) {
      seen.add(key);
      reasons.push(reason);
    }
  }
  return Object.freeze(reasons);
}

function joinedChecks(left: GateDecision, right: GateDecision): readonly GuardCheck[] {
  const seen = new Set<string>();
  const checks: GuardCheck[] = [];
  for (const item of [...left.checks, ...right.checks]) {
    const key = `${item.dimension}:${item.code}:${item.outcome}`;
    if (!seen.has(key)) {
      seen.add(key);
      checks.push(item);
    }
  }
  return Object.freeze(checks);
}

function joinedEvidence(left: GateDecision, right: GateDecision): readonly string[] {
  const seen = new Set<string>();
  const evidence: string[] = [];
  for (const ref of [...left.evidenceRefs, ...right.evidenceRefs]) {
    if (!seen.has(ref)) {
      seen.add(ref);
      evidence.push(ref);
    }
  }
  return Object.freeze(evidence);
}

/**
 * The ONLY composition primitive over gate decisions: a commutative,
 * associative LATTICE JOIN where BLOCK dominates and reasons/checks/
 * evidence only ACCUMULATE. A join can never remove a block reason and
 * never returns a decision less restrictive than either input — the
 * runtime encoding of cannot_downgrade_block (INV-21).
 */
export function joinGateDecisions(left: GateDecision, right: GateDecision): GateDecision {
  const decision = stricterGateDecision(left.decision, right.decision);
  const checks = joinedChecks(left, right);
  const evidenceRefs = joinedEvidence(left, right);
  if (decision === "BLOCK") {
    return Object.freeze({
      decision,
      reasons: joinedReasons(left, right),
      checks,
      evidenceRefs,
    });
  }
  if (decision === "UNKNOWN") {
    const dimensions = [
      ...(left.decision === "UNKNOWN" ? left.dimensions : []),
      ...(right.decision === "UNKNOWN" ? right.dimensions : []),
    ];
    return Object.freeze({
      decision,
      dimensions: Object.freeze(dimensions),
      checks,
      evidenceRefs,
    });
  }
  return Object.freeze({ decision, checks, evidenceRefs });
}

/**
 * OVERRIDE: rejected by construction for every attempted target value.
 * This function ALWAYS throws; it exists so the rejection is a tested
 * first-class contract (the block-law twin of attemptAgentOverride).
 */
export function attemptBlockDowngrade(
  from: GateDecision,
  attempted: GateDecision["decision"],
  claimedBy: string,
): never {
  if (from.decision !== "BLOCK") {
    throw new BlockDowngradeForbiddenError(
      attempted,
      `${claimedBy} (note: the source decision was '${from.decision}', not BLOCK — downgrades are structurally rejected regardless)`,
    );
  }
  throw new BlockDowngradeForbiddenError(attempted, claimedBy);
}

/**
 * Fail-closed guard for re-evaluation flows: a fresh evaluation may only
 * keep or RAISE the restriction, never lower it. Throws
 * BlockDowngradeForbiddenError when `before` is BLOCK and `after` is not.
 */
export function assertNoBlockDowngrade(
  before: GateDecision,
  after: GateDecision,
  label: string,
): void {
  if (before.decision === "BLOCK" && after.decision !== "BLOCK") {
    throw new BlockDowngradeForbiddenError(after.decision, label);
  }
}
