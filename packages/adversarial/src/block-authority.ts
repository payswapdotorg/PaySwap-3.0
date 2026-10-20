/**
 * @payswap/adversarial — the INV-21 law encoded for the immune plane:
 * BLOCK authority, escalate-only (P6-W3, lane r4-w3; NET-NEW — the
 * canonical invariant INV-21 "Security/adversarial intelligence cannot
 * downgrade BLOCK" extended from the onchain-security kernel's
 * block-law.ts pattern to the adversarial/immune composition).
 *
 * THE LAW (spec/architecture/invariants.json INV-21; MODULE-OWNERSHIP
 * layer `security`: `cannot_downgrade_block: true`):
 *
 *   Adversarial/security intelligence can ESCALATE to BLOCK and advise,
 *   but can NEVER downgrade or bypass a BLOCK decision.
 *
 * Encoded at three levels, structurally mirroring the kernel's own
 * encoding (block-law.ts) so the two compose without vocabulary drift:
 *
 * 1. TYPE — `NoBlockDowngrade<From, To>` resolves to `To` when the
 *   projection does not leave BLOCK, and to a descriptive error union
 *   otherwise; `EscalationOnly<From, To>` resolves to `To` when the
 *   projection never DECREASES restriction, and to an error union
 *   otherwise. Compile-time asserted in test/block-authority.test.ts.
 * 2. RUNTIME — `joinVerdicts` (the four-value lattice join over the
 *   pinned VERDICT_RANK) and `composeAdvisoryWithKernelDecision` (the
 *   escalate-only composition of advisory intelligence with a kernel
 *   gate decision through the D-1 seam pins) are the ONLY composition
 *   primitives: they can harden, never soften.
 * 3. REJECTION — `attemptAdvisoryDowngrade` and `attemptBlockBypass`
 *   ALWAYS throw; the rejections are tested first-class contracts.
 *
 * Deterministic only: pure functions; no state, no clock, no
 * randomness.
 */

import type { GateDecision, GuardCheck, BlockReason, UnknownDimension } from "./pins/index.ts";
import { VERDICT_RANK, type ThreatVerdict } from "./pins/index.ts";

// ---------------------------------------------------------------------------
// The gate-decision lattice (kernel vocabulary, pinned)
// ---------------------------------------------------------------------------

/** Deterministic restriction rank over the kernel decision vocabulary. */
export const GATE_DECISION_RANK = {
  ALLOW: 0,
  UNKNOWN: 1,
  BLOCK: 2,
} as const;

/** The more restrictive of two decision values (deterministic, symmetric). */
export function stricterGateDecision(
  a: keyof typeof GATE_DECISION_RANK,
  b: keyof typeof GATE_DECISION_RANK,
): keyof typeof GATE_DECISION_RANK {
  return GATE_DECISION_RANK[a] >= GATE_DECISION_RANK[b] ? a : b;
}

/** The more restrictive of two verdicts (lattice join, deterministic). */
export function joinVerdicts(a: ThreatVerdict, b: ThreatVerdict): ThreatVerdict {
  return VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b;
}

// ---------------------------------------------------------------------------
// TYPE LAW: no downgrade, escalation-only projections
// ---------------------------------------------------------------------------

/**
 * TYPE LAW: the only lawful projection of a BLOCK decision is a BLOCK
 * decision. `NoBlockDowngrade<From, To>` is `To` when the projection
 * does not leave BLOCK, and a descriptive error union when it would.
 */
export type NoBlockDowngrade<
  From extends keyof typeof GATE_DECISION_RANK,
  To extends keyof typeof GATE_DECISION_RANK,
> = From extends "BLOCK"
  ? To extends "BLOCK"
    ? To
    : ["CANNOT_DOWNGRADE_BLOCK", From, To]
  : To;

/**
 * TYPE LAW: adversarial intelligence may only ESCALATE. An
 * `EscalationOnly<From, To>` projection is lawful iff the target is at
 * least as restrictive as the source (equal is lawful — corroboration
 * at the same grade). Encoded as a decision table over the verdict
 * vocabulary: compile-time asserted in test/block-authority.test.ts.
 */
export type VerdictsAtLeast<Floor extends ThreatVerdict> =
  Floor extends "BLOCK"
    ? "BLOCK"
    : Floor extends "REQUIRE_CONFIRMATION"
      ? "REQUIRE_CONFIRMATION" | "BLOCK"
      : Floor extends "ALLOW_WITH_CONSTRAINTS"
        ? "ALLOW_WITH_CONSTRAINTS" | "REQUIRE_CONFIRMATION" | "BLOCK"
        : ThreatVerdict;

export type EscalationOnly<
  From extends ThreatVerdict,
  To extends ThreatVerdict,
> = To extends VerdictsAtLeast<From> ? To : ["CANNOT_DOWNGRADE_VERDICT", From, To];

// ---------------------------------------------------------------------------
// REJECTION: the tested first-class seams (always throw)
// ---------------------------------------------------------------------------

/** Raised when ANY code path would downgrade a BLOCK (INV-21). */
export class BlockDowngradeForbiddenError extends Error {
  readonly attempted: keyof typeof GATE_DECISION_RANK;

  constructor(
    attempted: keyof typeof GATE_DECISION_RANK,
    claimedBy: string,
  ) {
    super(
      `'${claimedBy}' attempted to downgrade a BLOCK gate decision to '${attempted}': adversarial intelligence can ESCALATE to BLOCK and advise, but can NEVER downgrade a BLOCK decision (MODULE-OWNERSHIP cannot_downgrade_block, INV-21)`,
    );
    this.name = "BlockDowngradeForbiddenError";
    this.attempted = attempted;
  }
}

/** Raised when ANY code path would bypass a BLOCK (INV-21). */
export class BlockBypassForbiddenError extends Error {
  readonly claimedBy: string;

  constructor(claimedBy: string) {
    super(
      `'${claimedBy}' attempted to bypass a BLOCK decision: a BLOCK is terminal — no advisory, epoch advance, revocation proposal or agent recommendation reaches around it (INV-21)`,
    );
    this.name = "BlockBypassForbiddenError";
    this.claimedBy = claimedBy;
  }
}

/**
 * OVERRIDE: rejected by construction for every decision value. This
 * function ALWAYS throws; it exists so the rejection is a tested
 * first-class seam. Adversarial intelligence advises (signals, flags,
 * proposals) and escalates (BLOCK-grade detections bind through the
 * composition primitives); it never composes verdicts that soften.
 */
export function attemptAdvisoryDowngrade(
  attempted: keyof typeof GATE_DECISION_RANK,
  claimedBy: string,
): never {
  throw new BlockDowngradeForbiddenError(attempted, claimedBy);
}

/**
 * BYPASS: rejected by construction. A kernel BLOCK is terminal; no
 * adversarial path may route around it (this function ALWAYS throws —
 * the tested seam for the bypass attempt).
 */
export function attemptBlockBypass(claimedBy: string): never {
  throw new BlockBypassForbiddenError(claimedBy);
}

// ---------------------------------------------------------------------------
// RUNTIME LAW: the escalate-only composition with the kernel seam
// ---------------------------------------------------------------------------

/** The composed decision over the kernel vocabulary + corroborating evidence. */
export interface ComposedAdvisoryDecision {
  readonly decision: keyof typeof GATE_DECISION_RANK;
  readonly kernelDecision: keyof typeof GATE_DECISION_RANK;
  readonly advisoryVerdict: ThreatVerdict;
  /** Why: the deterministic basis lines (audit lineage). */
  readonly basis: readonly string[];
  /**
   * The kernel decision object is NEVER mutated or rebuilt by the
   * advisory layer — it is carried verbatim (the kernel's own
   * attachAgentFlag contract: flags ride alongside, decisions stand).
   */
  readonly kernelEvidence: readonly string[];
}

function isVerdict(value: unknown): value is ThreatVerdict {
  return (
    typeof value === "string" &&
    (Object.keys(VERDICT_RANK) as readonly unknown[]).includes(value)
  );
}

/**
 * THE INV-21 COMPOSITION: advisory/threat intelligence with a kernel
 * gate decision (through the D-1 seam pins — the kernel's GateDecision
 * is supplied as pure data). Resolution lattice:
 *
 * - kernel BLOCK → BLOCK. TERMINAL: the advisory layer only
 *   corroborates; nothing it says can soften or bypass (INV-21);
 * - advisory BLOCK → BLOCK. ESCALATION: adversarial intelligence
 *   DETECTS threats the deterministic gate dimensions do not model,
 *   and its BLOCK-grade detections bind even over a kernel ALLOW;
 * - kernel UNKNOWN → at least REQUIRE_CONFIRMATION: an unresolved
 *   kernel dimension can never be silently allowed by an advisory
 *   recommendation (INV-4 discipline — the advisory ALLOW is capped);
 * - otherwise the advisory verdict composes as the floor-and-join: the
 *   composed decision is the join of the advisory verdict's gate-grade
 *   with ALLOW (advisory ALLOW_WITH_CONSTRAINTS keeps the kernel
 *   ALLOW; advisory REQUIRE_CONFIRMATION escalates the kernel ALLOW to
 *   REQUIRE_CONFIRMATION — harden-only, never soften).
 *
 * Deterministic: a pure function of the inputs.
 */
export function composeAdvisoryWithKernelDecision(input: {
  readonly kernelDecision: GateDecision;
  readonly advisoryVerdict: ThreatVerdict;
  readonly advisoryRefs?: readonly string[];
}): ComposedAdvisoryDecision {
  if (!isVerdict(input.advisoryVerdict)) {
    throw new Error(
      `advisoryVerdict: unknown verdict '${String(input.advisoryVerdict)}'`,
    );
  }
  const kernel = input.kernelDecision.decision;
  const basis: string[] = [];
  const advisoryRefs = input.advisoryRefs ?? [];

  if (kernel === "BLOCK") {
    // TERMINAL: the advisory layer corroborates only.
    basis.push("kernel:BLOCK:terminal (advisory corroborates, INV-21)");
    if (VERDICT_RANK[input.advisoryVerdict] === VERDICT_RANK.BLOCK) {
      basis.push("advisory:BLOCK:corroborated");
    }
    return {
      decision: "BLOCK",
      kernelDecision: kernel,
      advisoryVerdict: input.advisoryVerdict,
      basis: Object.freeze([...basis, ...advisoryRefs]),
      kernelEvidence: input.kernelDecision.evidenceRefs,
    };
  }

  if (VERDICT_RANK[input.advisoryVerdict] === VERDICT_RANK.BLOCK) {
    // ESCALATION: an advisory BLOCK binds even over a kernel ALLOW.
    basis.push("advisory:BLOCK:escalation (binding)");
    return {
      decision: "BLOCK",
      kernelDecision: kernel,
      advisoryVerdict: input.advisoryVerdict,
      basis: Object.freeze([...basis, ...advisoryRefs]),
      kernelEvidence: input.kernelDecision.evidenceRefs,
    };
  }

  if (kernel === "UNKNOWN") {
    // UNKNOWN is never converted to ALLOW by an advisory recommendation;
    // the resolution floor for an unresolved kernel dimension is human
    // confirmation (INV-4 discipline — harden-only).
    const verdict = joinVerdicts(input.advisoryVerdict, "REQUIRE_CONFIRMATION");
    basis.push(
      `kernel:UNKNOWN:floor=REQUIRE_CONFIRMATION (advisory verdict ${input.advisoryVerdict} composed to ${verdict})`,
    );
    const decision = verdictToGateGrade(verdict);
    return {
      decision,
      kernelDecision: kernel,
      advisoryVerdict: input.advisoryVerdict,
      basis: Object.freeze([...basis, ...advisoryRefs]),
      kernelEvidence: input.kernelDecision.evidenceRefs,
    };
  }

  // kernel ALLOW: the advisory verdict escalates or corroborates, never
  // softens (ALLOW is the floor by construction — there is nothing
  // below it to reach).
  const verdict = input.advisoryVerdict;
  const decision = verdictToGateGrade(verdict);
  basis.push(`kernel:ALLOW:advisory_verdict=${verdict} (composed to ${decision})`);
  return {
    decision,
    kernelDecision: kernel,
    advisoryVerdict: input.advisoryVerdict,
    basis: Object.freeze([...basis, ...advisoryRefs]),
    kernelEvidence: input.kernelDecision.evidenceRefs,
  };
}

/**
 * Project a four-value verdict onto the kernel's three-value decision
 * vocabulary: BLOCK → BLOCK; REQUIRE_CONFIRMATION → UNKNOWN (a human
 * must resolve it — the kernel's own UNKNOWN semantics); ALLOW and
 * ALLOW_WITH_CONSTRAINTS → ALLOW (constraints are carried by the
 * advisory channel, not the decision value). Deterministic; the
 * composed decision can only harden.
 */
export function verdictToGateGrade(
  verdict: ThreatVerdict,
): keyof typeof GATE_DECISION_RANK {
  switch (verdict) {
    case "BLOCK":
      return "BLOCK";
    case "REQUIRE_CONFIRMATION":
      return "UNKNOWN";
    case "ALLOW_WITH_CONSTRAINTS":
      return "ALLOW";
    case "ALLOW":
      return "ALLOW";
  }
}
