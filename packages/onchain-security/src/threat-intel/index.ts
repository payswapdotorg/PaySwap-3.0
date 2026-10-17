/**
 * @payswap/onchain-security — the onchain threat-intelligence subpath
 * barrel ("./threat-intel"; R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/index.ts).
 *
 * The security layer OWNS the onchain threat-intelligence vocabulary
 * (MODULE-OWNERSHIP layer `security` examples include threat-intel), so
 * the old repository's separate @payswap/onchain-threat-intel package is
 * re-homed HERE as a subpath of @payswap/onchain-security:
 *
 * - the 13 onchain threat families with deterministic detectors over
 *   (prepared write, simulation, policy, observation bundle, instant);
 * - the adversarial transaction agent: a deterministic analysis engine
 *   that outputs THREAT SIGNALS, each carrying its mandatory evidence
 *   chain (which observation, which digest, which exact delta) and an
 *   integer-bps CALIBRATED CONFIDENCE;
 * - the versioned deterministic threat policy and the four-value verdict
 *   vocabulary (ALLOW | ALLOW_WITH_CONSTRAINTS | REQUIRE_CONFIRMATION |
 *   BLOCK) — the policy is AUTHORITATIVE;
 * - the composed no-downgrade seam: composeThreatVerdict +
 *   resolveOnchainSecurityDecision implement the extended kernel law (an
 *   agent BLOCK stays BLOCK; a policy BLOCK overrides an agent ALLOW; a
 *   kernel BLOCK is terminal; a kernel UNKNOWN is never agent-allowed —
 *   INV-21); attemptAgentVerdictOverride always throws — the rejection is
 *   a tested contract;
 * - the immune-system bridge: advisory proposals + threat signature
 *   registrations structurally aligned with the advisory/signature
 *   publication inputs, so quarantine/restrict/retire flows integrate
 *   with the real immune machinery at the wiring layer;
 * - the kernel flag channel: threat signals project onto the kernel's
 *   advisory-only AgentSecurityFlag surface (attachThreatAssessment —
 *   flags never mutate decisions).
 *
 * Boundary law: this subpath's src imports ONLY the kernel barrel modules
 * of its own package (relative imports) — never a sibling package, never
 * a venue pack, never a vendor SDK, never a live endpoint (zero-sibling
 * law). The agent never broadcasts, never mints authorization, never
 * handles key material (the kernel secret scan runs on every agent-facing
 * artifact this subpath constructs — INV-19).
 *
 * Deterministic only: callers pass every instant; no ambient clock, no
 * randomness, no floating point anywhere (confidence is integer bps;
 * price deviations are exact BigInt rationals).
 */

export const THREAT_INTEL_SURFACE_NAME = "@payswap/onchain-security/threat-intel" as const;

// The subpath's wire-contract version stamp (see ../version.ts).
export { THREAT_INTEL_WIRE_VERSION } from "../version.ts";

// The 13 threat families + severity model.
export * from "./families.ts";
// Mandatory evidence chains + exact deltas + rational arithmetic.
export * from "./evidence.ts";
// Calibrated confidence (integer basis points).
export * from "./confidence.ts";
// Observation entries (behavioral/registry + chain infrastructure).
export * from "./observations-intel.ts";
export * from "./observations-chain.ts";
// The threat-intelligence observation bundle.
export * from "./observations.ts";
// Threat signals (evidence + confidence, content-addressed).
export * from "./signals.ts";
// The versioned deterministic threat policy + verdict vocabulary + evaluation.
export * from "./policy.ts";
export * from "./policy-evaluation.ts";
// The shared detector context (raw signals + evidence helpers).
export * from "./detectors-context.ts";
// The 13 family detectors (evidence-generating, never verdicts) + the sweep.
export * from "./detectors.ts";
export * from "./detectors-approvals.ts";
export * from "./detectors-infra.ts";
export * from "./detectors-mev-bridge.ts";
export * from "./detectors-state.ts";
export * from "./detectors-consistency.ts";
// The adversarial transaction agent + threat assessments.
export * from "./agent.ts";
// The composed verdict + the no-downgrade seam + kernel flag channel.
export * from "./verdict.ts";
// The immune-system bridge (advisory proposals).
export * from "./advisory-bridge.ts";
// The threat signature pack (registration inputs).
export * from "./threat-signatures.ts";
