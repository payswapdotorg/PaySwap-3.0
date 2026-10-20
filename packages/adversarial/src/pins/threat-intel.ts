/**
 * @payswap/adversarial — structural pin: the onchain-security
 * THREAT-INTEL WIRE — the D-1 seam, threat side (P6-W3, lane r4-w3,
 * commit 1).
 *
 * PINNED WIRE CONTRACT — the onchain threat-intelligence vocabulary
 * owned by the accepted @payswap/onchain-security rebuild (merge R2-W2
 * 95c8d8f; packages/onchain-security/src/threat-intel/*). The
 * adversarial plane composes WITH this seam and NEVER imports it
 * (zero-sibling law): every shape below is a structural mirror, so the
 * kernel's real types remain assignable to these pins by construction
 * and drift fails typecheck at the TL's integration station.
 *
 * What the seam carries, and why the immune plane needs it:
 *
 * - the four-value verdict vocabulary + rank (the threat layer's
 *   decision lattice — the immune plane's escalate-only compositions
 *   join over the SAME lattice);
 * - the 13 onchain threat families + severities + detection methods
 *   (the assessment signals the bridge consumes);
 * - `ThreatSignal` / `ThreatAssessment` — the adversarial agent's ONLY
 *   output currency: evidence-chained, confidence-calibrated signals,
 *   never a decision;
 * - `ThreatAdvisoryProposal` + `EvidenceRef` + `ImmuneComponentKind` —
 *   the kernel's advisory-bridge publication shapes. THIS package owns
 *   the REAL advisory registry the proposals publish into; the pin
 *   keeps the publication input structurally identical to what the
 *   kernel emits (the D-1 wiring contract's advisory surface);
 * - `OnchainThreatPolicy` — the versioned deterministic policy; the
 *   bridge consults its advisory-relevant fields
 *   (retireCompromisedContracts) exactly as the kernel's own
 *   advisoryActionForDrivingSignal does.
 *
 * Deterministic only: pure data + pure functions.
 */

// ---------------------------------------------------------------------------
// The verdict vocabulary (policy.ts, verbatim)
// ---------------------------------------------------------------------------

/**
 * The four-value deterministic verdict (SECURITY-MODEL.md vocabulary).
 * Order of restriction: ALLOW < ALLOW_WITH_CONSTRAINTS <
 * REQUIRE_CONFIRMATION < BLOCK.
 */
export const THREAT_VERDICTS = [
  "ALLOW",
  "ALLOW_WITH_CONSTRAINTS",
  "REQUIRE_CONFIRMATION",
  "BLOCK",
] as const;

export type ThreatVerdict = (typeof THREAT_VERDICTS)[number];

/** Deterministic restriction rank (higher = more restrictive). */
export const VERDICT_RANK: Readonly<Record<ThreatVerdict, number>> =
  Object.freeze({
    ALLOW: 0,
    ALLOW_WITH_CONSTRAINTS: 1,
    REQUIRE_CONFIRMATION: 2,
    BLOCK: 3,
  });

/** The four-value recommendation vocabulary (same union as the verdict). */
export type ThreatRecommendation =
  | "ALLOW"
  | "ALLOW_WITH_CONSTRAINTS"
  | "REQUIRE_CONFIRMATION"
  | "BLOCK";

// ---------------------------------------------------------------------------
// The 13 onchain threat families + severity + detection methods
// (families.ts / confidence.ts, verbatim)
// ---------------------------------------------------------------------------

export const THREAT_FAMILIES = [
  "malicious_approval_permit",
  "unexpected_spender",
  "token_impersonation",
  "honeypot_transfer_restriction",
  "proxy_admin_change",
  "oracle_manipulation",
  "bridge_compromise",
  "mev_sandwich_exposure",
  "destination_chain_confusion",
  "replay_signature_domain",
  "unexpected_balance_delta",
  "stale_changed_simulation",
  "finality_reorg_anomaly",
] as const;

export type ThreatFamily = (typeof THREAT_FAMILIES)[number];

export const THREAT_SEVERITIES = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type ThreatSeverity = (typeof THREAT_SEVERITIES)[number];

/** The advisory-severity vocabulary of the immune bridge (no info level). */
export type AdvisorySeverity = "low" | "medium" | "high" | "critical";

/** How a detection was made (the calibration input; confidence.ts, verbatim). */
export const DETECTION_METHODS = [
  "exact_identity_match",
  "structural_mismatch",
  "threshold_breach",
  "behavioral_pattern",
  "registry_absence",
] as const;

export type DetectionMethod = (typeof DETECTION_METHODS)[number];

// ---------------------------------------------------------------------------
// Evidence + signals + assessments (evidence.ts / signals.ts / agent.ts)
// ---------------------------------------------------------------------------

/** Reference to an immutable evidence artifact (content-addressed). */
export interface EvidenceRef {
  readonly evidenceId: string;
  readonly artifactRef: string;
  readonly contentDigest: string;
}

/**
 * The mandatory evidence chain of a threat signal (evidence.ts):
 * observation refs + content-digest refs + exact measured deltas.
 */
export interface ThreatEvidence {
  /** Observation ids this detection is grounded in (e.g. `approval:<spender>`). */
  readonly observationRefs: readonly string[];
  /** Content digests of the grounding observations. */
  readonly digestRefs: readonly string[];
  /** Exact measured deltas (string numbers; can be negative). */
  readonly deltas: readonly { readonly label: string; readonly value: string }[];
}

/** A threat signal: family + code + severity + calibrated confidence + evidence. */
export interface ThreatSignal {
  /** Deterministic content digest of the signal (identity). */
  readonly signalId: string;
  readonly family: ThreatFamily;
  /** Machine code, e.g. `unlimited_approval_to_drain_spender`. */
  readonly code: string;
  readonly severity: ThreatSeverity;
  /** How the detection was made (calibration input). */
  readonly method: DetectionMethod;
  /** Calibrated confidence, integer basis points in [0, 10_000]. */
  readonly confidenceBps: number;
  /** The mandatory evidence chain (observationRefs + digestRefs + deltas). */
  readonly evidence: ThreatEvidence;
  readonly summary: string;
}

/** The full output of one adversarial onchain analysis run (agent.ts). */
export interface ThreatAssessment {
  /** Deterministic content digest of the assessment (identity). */
  readonly assessmentId: string;
  /** The analyzing agent (provenance). */
  readonly agentRef: string;
  /** Evaluation instant (= input.at). */
  readonly analyzedAt: number;
  /** Signals raised, deterministic order (severity desc, family, code). */
  readonly signals: readonly ThreatSignal[];
  /** The agent's recommendation — evidence, NEVER authority. */
  readonly agentRecommendation: ThreatRecommendation;
  /** All evidence digest refs the assessment is bound to. */
  readonly evidenceRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// The immune component-kind vocabulary (advisory-bridge.ts, verbatim)
// ---------------------------------------------------------------------------

/**
 * The immune system's component kinds (structurally identical literals —
 * NO parallel vocabulary; mirrors the kernel's IMMUNE_COMPONENT_KINDS
 * and this package's own component-identity model).
 */
export const IMMUNE_COMPONENT_KINDS = [
  "agent_package",
  "agent_body",
  "agent_instance",
  "agent_key",
  "extension",
  "capability",
  "connected_instance",
] as const;

export type ImmuneComponentKind = (typeof IMMUNE_COMPONENT_KINDS)[number];

/** One affected component of a proposal (kind + id + optional range). */
export interface ThreatAffectedComponent {
  readonly kind: ImmuneComponentKind;
  readonly id: string;
  /** Inclusive affected-version range, when known. */
  readonly versionRange?: { minVersion?: string; maxVersion?: string };
}

// ---------------------------------------------------------------------------
// Advisory proposals (the kernel's advisory-bridge publication shape)
// ---------------------------------------------------------------------------

/** The advisory action vocabulary (restrict < quarantine < retire). */
export type ThreatAdvisoryAction = "restrict" | "quarantine" | "retire";

/**
 * A proposal to publish a security advisory from a threat assessment —
 * the kernel's advisory-bridge shape (structurally assignable to this
 * package's REAL advisory publish input; the D-1 wiring contract's
 * advisory surface).
 */
export interface ThreatAdvisoryProposal {
  readonly proposalId: string;
  readonly title: string;
  /** low | medium | high | critical (the advisory severity vocabulary). */
  readonly severity: AdvisorySeverity;
  readonly description: string;
  readonly affected: readonly ThreatAffectedComponent[];
  /** restrict < quarantine < retire (the advisory action vocabulary). */
  readonly action: ThreatAdvisoryAction;
  readonly remediation: {
    readonly summary: string;
    readonly workarounds: readonly string[];
  };
  readonly declaredBy: string;
  readonly publishedAt: number;
  /** Evidence refs binding the proposal to the assessment's chains. */
  readonly evidence: readonly EvidenceRef[];
  /** Signal ids that drove the proposal (audit lineage). */
  readonly sourceSignalIds: readonly string[];
}

// ---------------------------------------------------------------------------
// The versioned deterministic threat policy (policy.ts) — the STRUCTURAL
// VIEW the bridge consults
// ---------------------------------------------------------------------------

/** A confidence floor: below-floor signals are capped to `below`. */
export interface ConfidenceFloor {
  readonly floor: number;
  readonly below: ThreatVerdict;
}

/**
 * The versioned deterministic threat policy (the kernel's contract;
 * authoritative — never agent output), pinned as the STRUCTURAL VIEW
 * this package's bridges consume: identity (policyId + version) and the
 * advisory-relevant opt-in `retireCompromisedContracts` — the bridge
 * derives RETIRE-grade proposals only under that explicit opt-in,
 * exactly like the kernel's own advisoryActionForDrivingSignal. The
 * FULL policy contract (approval/oracle/bridge/MEV/simulation/finality
 * fields, family verdict tables, confidence floors) stays owned by the
 * kernel's threat-intel subpath; the real policy — with every extra
 * field — remains assignable to this view by construction (subset pin:
 * a source with more members is assignable to a target that declares
 * fewer; drift on the consulted members fails typecheck here).
 */
export interface OnchainThreatPolicyView {
  readonly policyId: string;
  readonly version: number;
  /** Explicit opt-in for RETIRE-grade advisory proposals (irreversible). */
  readonly retireCompromisedContracts?: boolean;
}
