/**
 * @payswap/adversarial — onchain/provider threat intelligence and
 * immune-system integration (Work Order P6-W3, lane r4-w3).
 *
 * The security plane's IMMUNE SYSTEM + the adversarial intelligence that
 * feeds it (spec/architecture/MODULE-OWNERSHIP.yaml layer `security`:
 * examples policy, threat-intel, deterministic-gates, security-epoch;
 * `cannot_downgrade_block: true`):
 *
 * - pins/:       the structural pins — cross-lane contract shapes
 *                (protocol ValidationError + content digest; trust
 *                AmountSpec/Principal/security-epoch + security-block
 *                records; onchain-domain chain/asset vocabulary; the
 *                onchain-security D-1 seam: kernel gate wire +
 *                threat-intel wire) mirrored locally under the
 *                ZERO-sibling import law;
 * - block-authority.ts: the INV-21 law encoded for the immune plane —
 *                adversarial intelligence can ESCALATE to BLOCK and
 *                advise, but can NEVER downgrade or bypass a BLOCK
 *                decision (type + runtime + rejection);
 * - component-identity.ts + threat-signatures.ts: the component
 *                identity model + the threat-signature registry
 *                (matchable indicators scoped to vulnerable component
 *                identities and version ranges);
 * - advisories.ts: the network-wide advisory registry + the GLOBAL
 *                restriction view (advisory outcomes map to restrict /
 *                quarantine / retire);
 * - epochs.ts:   the monotonic security-epoch authority; an epoch
 *                advance VOIDS every epoch-scoped authorization issued
 *                under it (authority is perishable; blocks survive —
 *                INV-21);
 * - quarantine-ledger.ts: the quarantine ledger — release ONLY through
 *                evidence-backed VERIFIED remediation plus advisory
 *                closure (never time-based);
 * - capability-gate.ts + immune-gate.ts: the cached-state-bypass
 *                rejection + the composed immune gate (enforce advisory
 *                → quarantine/restrict/retire + optional epoch advance);
 * - capability-cases.ts + experts.ts + expert-resolutions.ts: the
 *                immutable security-learning feed + the expert
 *                human-fallback bridge (evidence artifacts, never
 *                hidden authority);
 * - provider/ (the "./provider-intel" subpath): the provider threat
 *                families — the eleven adversarial fault families
 *                (duplicated commands, lost webhooks, ambiguous
 *                provider, account takeover, malicious agents, package
 *                compromise, incentive Sybil/collusion/wash,
 *                leaderboard gaming, provider outage, clock skew,
 *                partial payment) as deterministic detectors over
 *                provider observation bundles, evidence-chained signals
 *                with integer-bps calibrated confidence, the recovery-
 *                path contracts, and the recommendation-only adversarial
 *                provider agent;
 * - integration/: the D-1 wiring bridges — the immune-state projection
 *                onto the kernel's composed OnchainSecurityState, the
 *                advisory bridge (kernel-shaped threat proposals → the
 *                REAL registry → enforcement; provider assessments →
 *                advisory publications + capability cases; the kernel
 *                flag channel), and the harden-only BLOCK escalation
 *                records (the trust plane's registry owns the exits).
 *
 * Boundary law (r4-w3): ZERO sibling imports — no @payswap/* anywhere,
 * tsconfig has NO paths entries; cross-lane shapes live in src/pins/
 * (structural mirrors — the accepted pattern). Deterministic only:
 * pure functions; no ambient clock, no randomness, no network in src.
 * Secret-free: no credential-shaped literal anywhere; fixtures are
 * runtime-fragment-assembled (INV-19 discipline).
 */

export const PACKAGE_NAME = "@payswap/adversarial" as const;

export {
  IMMUNE_WIRE_VERSION,
  INTEGRATION_WIRE_VERSION,
  PROVIDER_INTEL_WIRE_VERSION,
} from "./version.ts";
export * from "./pins/index.ts";
export * from "./block-authority.ts";
export * from "./component-identity.ts";
export * from "./threat-signatures.ts";
export * from "./advisories.ts";
export * from "./advisory-registry.ts";
export * from "./epochs.ts";
export * from "./quarantine-ledger.ts";
export * from "./capability-gate.ts";
export * from "./immune-gate.ts";
export * from "./capability-cases.ts";
export * from "./experts.ts";
export * from "./expert-resolutions.ts";
export * from "./integration/immune-projection.ts";
export * from "./integration/onchain-bridge.ts";
export * from "./integration/case-bridge.ts";
export * from "./integration/escalation.ts";
