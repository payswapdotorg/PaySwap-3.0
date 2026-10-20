/**
 * @payswap/adversarial — the structural pins barrel (P6-W3, lane r4-w3).
 *
 * Every cross-lane contract shape this package composes with is pinned
 * here as a STRUCTURAL MIRROR (the accepted R2-W2 pattern): the real
 * lane's contract remains assignable to the pin by construction, so
 * drift fails typecheck at the TL's integration station — integration
 * is TL accept-time.
 *
 * Pin inventory (owner lane → pinned shapes):
 * - protocol  → ValidationError (errors.ts);
 * - protocol/kernel discipline → canonical serialization + content
 *   digest (digest.ts — the FNV-1a 64 content-addressing every
 *   immune-system artifact uses);
 * - trust     → AmountSpec (money.ts), Principal + principalRef
 *   (principal.ts), SecurityEpoch / SecurityBlockRecord /
 *   BlockRevocationRecord (security-epoch.ts);
 * - onchain-domain → ChainRef + chainKey validation (chain.ts),
 *   AssetRef + asset classes + asset-id shape (asset.ts);
 * - onchain-security (the D-1 seam) → the kernel gate wire
 *   (gates.ts: GateDecision, OnchainSecurityState, AgentSecurityFlag,
 *   GatedEvaluation, guard vocabulary) + the threat-intel wire
 *   (threat-intel.ts: verdicts, the 13 families, severities, methods,
 *   signals, assessments, advisory proposals, evidence refs, immune
 *   component kinds, the policy view).
 *
 * LAYER LAW: zero sibling imports — no @payswap/* anywhere, no tsconfig
 * paths. Machine-checked by test/boundary.test.ts.
 */

export * from "./errors.ts";
export * from "./digest.ts";
export * from "./money.ts";
export * from "./principal.ts";
export * from "./chain.ts";
export * from "./asset.ts";
export * from "./gates.ts";
export * from "./security-epoch.ts";
// The threat-intel wire pin: every kernel vocabulary EXCEPT the two
// names this package's own modules canonically own at the root barrel
// (AdvisorySeverity — advisories.ts; EvidenceRef — quarantine-ledger.ts).
// The pin files declare them structurally identical to the kernel wire;
// direct imports from "./threat-intel.ts" remain available where the
// kernel-shaped surface is needed explicitly.
export {
  THREAT_VERDICTS,
  VERDICT_RANK,
  THREAT_FAMILIES,
  THREAT_SEVERITIES,
  DETECTION_METHODS,
  IMMUNE_COMPONENT_KINDS,
} from "./threat-intel.ts";
export type {
  ThreatVerdict,
  ThreatRecommendation,
  ThreatFamily,
  ThreatSeverity,
  DetectionMethod,
  ThreatEvidence,
  ThreatSignal,
  ThreatAssessment,
  ImmuneComponentKind,
  ThreatAffectedComponent,
  ThreatAdvisoryAction,
  ThreatAdvisoryProposal,
  ConfidenceFloor,
  OnchainThreatPolicyView,
} from "./threat-intel.ts";
