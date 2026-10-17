/**
 * @payswap/onchain-security — deterministic security gates: the POLICY
 * contracts (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-security/src/gates.ts, split for the ≤400-line law).
 *
 * The gates are a DETERMINISTIC STATE EVALUATION, not an agent judgment
 * (SECURITY-MODEL.md): a pure function of (prepared write, optional
 * simulation observation, versioned policy, composed security state,
 * evaluation instant) that outputs exactly one of:
 *
 * - BLOCK  — a guard dimension is definitively violated. TERMINAL: no
 *   agent, heuristic or adversarial signal can override or downgrade it
 *   (INV-21 — the encoded layer law lives in block-law.ts); the pipeline
 *   enters the BLOCKED terminal state.
 * - ALLOW  — every dimension passed on current evidence.
 * - UNKNOWN — a dimension cannot be verified from available evidence
 *   (uncertified protocol, inconclusive simulation, stale security
 *   state). UNKNOWN is NEVER silently converted to ALLOW or BLOCK (INV-4);
 *   it can only be resolved by NEW evidence: a policy-authority escalation
 *   record (versioned policy input with evidence refs) or re-running the
 *   gates after certification/state refresh.
 *
 * Guard dimensions evaluated BEFORE authorization: chain, asset, amount,
 * destination, spender/approval changes, expiry, route and
 * protocol/contract identity — plus composed security state and
 * simulation consistency (INV-18; INV-20).
 *
 * The immune-system composition is pure data: `OnchainSecurityState` is
 * supplied by the wiring layer from the REAL trust/capability/security
 * machinery (network security epoch, quarantine ledger, advisory
 * restriction view); the composition is proven in test/ against a
 * structural wiring double (TL wires the real lanes at integration).
 *
 * Adversarial/heuristic agents may FLAG (`attachAgentFlag`): flags are
 * recorded as evidence and can never mutate a decision (INV-21).
 *
 * Deterministic only: no ambient clock (callers pass `at`), no randomness.
 */

import type { AmountSpec } from "./pins/index.ts";
import type { AssetIdentity, ProtocolIdentity } from "./types.ts";
import { assertNoSecretMaterial } from "./secrets.ts";

// ---------------------------------------------------------------------------
// Guard dimensions, checks, reasons
// ---------------------------------------------------------------------------

/** Every guard dimension evaluated before authorization. */
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

/** The deterministic gate decision (the surface lane's pinned vocabulary shape). */
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
// Policy (versioned deterministic input — frozen at evaluation)
// ---------------------------------------------------------------------------

/**
 * A POLICY-AUTHORITY resolution of one UNKNOWN dimension (the explicit
 * escalation path). Escalations are versioned policy INPUTS with evidence
 * refs — agents can never mint them at runtime; the adversarial suite
 * proves an injected escalation is ignored.
 */
export interface UnknownDimensionEscalation {
  readonly escalationId: string;
  readonly dimension: Extract<GuardDimension, "route" | "protocol_identity" | "security_state" | "simulation_consistency">;
  /** The exact target this resolves: routeHash, protocolId, contract target or asset id. */
  readonly targetRef: string;
  readonly disposition: "allow_with_evidence";
  readonly evidenceRefs: readonly string[];
  /** Policy authority ref that recorded the resolution. */
  readonly resolvedBy: string;
  readonly resolvedAt: number;
  readonly expiresAt: number;
}

/** Deterministic security policy: versioned, immutable input. */
export interface OnchainSecurityPolicy {
  readonly policyId: string;
  readonly version: number;
  /** Allowed chains (exact). Undefined = policy leaves chains unrestricted. */
  readonly allowedChains?: readonly string[];
  /** Allowed assets (exact chain+assetId+identity). Undefined = unrestricted. */
  readonly allowedAssets?: readonly AssetIdentity[];
  /** Allowed destination addresses (exact strings). Undefined = unrestricted. */
  readonly allowedDestinations?: readonly string[];
  /** Allowed spender addresses for approvals. Undefined = unrestricted. */
  readonly allowedSpenders?: readonly string[];
  /** Cap on any single approval amount. */
  readonly maxApprovalAmount?: { readonly currency: string; readonly minorUnits: string };
  /** Forbid unlimited (max-integer) approvals outright. */
  readonly forbidUnlimitedApprovals: boolean;
  /** Certified route hashes. */
  readonly knownRoutes?: readonly string[];
  /** Certified protocol/contract identities (full declarations). */
  readonly certifiedProtocols?: readonly ProtocolIdentity[];
  /** INV-20: unknown generic contract writes never execute silently. */
  readonly unknownContractPolicy: "block" | "escalate";
  readonly unknownRoutePolicy: "block" | "escalate";
  /** Policy-authority resolutions of UNKNOWN dimensions (with evidence). */
  readonly escalations?: readonly UnknownDimensionEscalation[];
  /** Max age of the composed security state before it is itself UNKNOWN. */
  readonly maxSecurityStateAgeMs?: number;
}

/**
 * Composed security state — PURE DATA produced by the wiring layer from
 * the REAL trust/capability/security machinery (the epoch authority,
 * quarantine/block registries, advisory restrictions). The gates treat
 * these as authoritative immune-system observations.
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
// Agent flags (advisory only — never authority, never mutation)
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

// ---------------------------------------------------------------------------
// Implementation (errors, agent flags, override rejection)
// ---------------------------------------------------------------------------

/** Raised on malformed gate input (fail closed). */
export class InvalidGateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGateInputError";
  }
}

/** Raised when ANY agent attempts to override a gate decision (INV-21). */
export class AgentOverrideForbiddenError extends Error {
  readonly attemptedDecision: GateDecision["decision"];

  constructor(attemptedDecision: GateDecision["decision"], claimedBy: string) {
    super(
      `Agent '${claimedBy}' attempted to override a deterministic ${attemptedDecision} gate decision: agents may FLAG but can NEVER override a BLOCK or convert UNKNOWN to ALLOW (INV-21 — the encoded cannot_downgrade_block layer law)`,
    );
    this.name = "AgentOverrideForbiddenError";
    this.attemptedDecision = attemptedDecision;
  }
}

/**
 * FLAG: attach an adversarial/heuristic observation. The decision object
 * is NEVER mutated — flags ride alongside as evidence. This is the ONLY
 * influence an agent has on a gated evaluation, and it has none on the
 * decision itself (INV-21).
 */
export function attachAgentFlag(evaluation: GatedEvaluation, flag: AgentSecurityFlag): GatedEvaluation {
  assertNoSecretMaterial(flag, "agent security flag");
  if (flag.flagId.length === 0) {
    throw new InvalidGateInputError("flagId must be a non-empty string");
  }
  if (flag.flaggedBy.length === 0) {
    throw new InvalidGateInputError("flaggedBy must be a non-empty string (agent ref)");
  }
  return {
    decision: evaluation.decision,
    flags: [...evaluation.flags, Object.freeze(flag)],
  };
}

/**
 * OVERRIDE: rejected by construction for every decision value. An agent
 * never needs to override anything: ALLOW needs no override, BLOCK is
 * untouchable (INV-21), and UNKNOWN → ALLOW by agent judgment is exactly
 * the silent conversion the architecture forbids (INV-4). This function
 * ALWAYS throws; it exists so the rejection is a tested, first-class
 * contract.
 */
export function attemptAgentOverride(
  decision: GateDecision,
  claimedBy: string,
): never {
  throw new AgentOverrideForbiddenError(decision.decision, claimedBy);
}
