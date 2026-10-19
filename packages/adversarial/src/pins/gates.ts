/**
 * @payswap/adversarial — structural pin: the onchain-security KERNEL
 * GATE WIRE — the D-1 seam (P6-W3, lane r4-w3, commit 1).
 *
 * PINNED WIRE CONTRACT — the deterministic gate vocabulary owned by the
 * accepted @payswap/onchain-security rebuild (merge R2-W2 95c8d8f;
 * packages/onchain-security/src/gates-policy.ts). The adversarial plane
 * composes WITH this seam and NEVER imports it (zero-sibling law):
 * every shape below is a structural mirror of the kernel's contract —
 * the real kernel types remain assignable to these pins by
 * construction, so drift fails typecheck at the TL's integration
 * station.
 *
 * What the seam carries, and why the immune plane needs it:
 *
 * - `GateDecision` (ALLOW | BLOCK | UNKNOWN over ten guard dimensions)
 *   — the kernel's DETERMINISTIC decision. The INV-21 law this package
 *   encodes composes advisory/threat intelligence WITH kernel
 *   decisions: intelligence may ESCALATE an ALLOW/UNKNOWN to BLOCK and
 *   may corroborate a BLOCK, but can NEVER downgrade one. The pin is
 *   the composition input.
 * - `OnchainSecurityState` — PURE DATA the kernel's security_state
 *   guard consumes: network epoch, quarantined/restricted component
 *   keys, active advisory refs. This package's integration bridge
 *   PROJECTS the real immune machinery (advisory registry, quarantine
 *   ledger, epoch authority) onto exactly this shape — the D-1 wiring
 *   contract's data surface.
 * - `AgentSecurityFlag` / `GatedEvaluation` — the kernel's ADVISORY-
 *   ONLY channel: adversarial intelligence attaches flags; flags NEVER
 *   mutate a decision (INV-21). The bridge projects threat assessments
 *   onto this channel.
 *
 * Deterministic only: pure data + pure functions.
 */

// ---------------------------------------------------------------------------
// Guard dimensions + checks (the kernel's gates-policy.ts, verbatim)
// ---------------------------------------------------------------------------

/** The ten deterministic guard dimensions of the onchain security gates. */
export const GUARD_DIMENSIONS = [
  "chain",
  "asset",
  "amount",
  "destination",
  "spender_approval",
  "expiry",
  "route",
  "protocol_identity",
  "security_state",
  "simulation_consistency",
] as const;

export type GuardDimension = (typeof GUARD_DIMENSIONS)[number];

export type GuardOutcome = "pass" | "block" | "unknown";

/** One dimension's outcome with its exact evidence. */
export interface GuardCheck {
  readonly dimension: GuardDimension;
  readonly outcome: GuardOutcome;
  /** Machine code, e.g. `chain_not_permitted`. */
  readonly code: string;
  readonly detail: string;
}

/** A definitive violation. Terminal — no override path exists (INV-21). */
export interface BlockReason {
  readonly dimension: GuardDimension;
  readonly code: string;
  readonly message: string;
  /** Canonical INV ids + law citations exercised. */
  readonly invariantRefs: readonly string[];
}

/** A dimension that cannot be verified from available evidence (INV-4). */
export interface UnknownDimension {
  readonly dimension: GuardDimension;
  readonly code: string;
  readonly message: string;
}

/** The deterministic gate decision (the kernel's pinned vocabulary shape). */
export type GateDecision =
  | {
      readonly decision: "ALLOW";
      readonly checks: readonly GuardCheck[];
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly decision: "BLOCK";
      readonly reasons: readonly BlockReason[];
      readonly checks: readonly GuardCheck[];
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly decision: "UNKNOWN";
      readonly dimensions: readonly UnknownDimension[];
      readonly checks: readonly GuardCheck[];
      readonly evidenceRefs: readonly string[];
    };

// ---------------------------------------------------------------------------
// The composed security state (the kernel's immune-system data surface)
// ---------------------------------------------------------------------------

/**
 * Composed security state — PURE DATA produced by the wiring layer from
 * the REAL immune machinery (this package's advisory registry,
 * quarantine ledger, epoch authority). The kernel's gates treat these
 * as authoritative immune-system observations. THE D-1 BRIDGE PROJECTS
 * ONTO EXACTLY THIS SHAPE (structurally identical to the kernel's
 * gates-policy.ts declaration).
 */
export interface OnchainSecurityState {
  /** Observation instant of this security state. */
  readonly observedAt: number;
  /** Current network security epoch value. */
  readonly networkEpoch: bigint;
  /** Quarantined component keys (`kind:id`). */
  readonly quarantinedComponents: readonly string[];
  /** Restricted component keys (from active advisory restrictions). */
  readonly restrictedComponents: readonly string[];
  /** Active security advisory refs. */
  readonly activeAdvisoryRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// The advisory-only agent flag channel (the kernel's gates-policy.ts)
// ---------------------------------------------------------------------------

/** An adversarial/heuristic agent observation attached as evidence. */
export interface AgentSecurityFlag {
  readonly flagId: string;
  readonly flaggedBy: string;
  readonly dimension: GuardDimension | "general";
  readonly note: string;
  readonly flaggedAt: number;
}

/** A gate decision plus attached advisory agent flags (decision immutable). */
export interface GatedEvaluation {
  readonly decision: GateDecision;
  readonly flags: readonly AgentSecurityFlag[];
}
