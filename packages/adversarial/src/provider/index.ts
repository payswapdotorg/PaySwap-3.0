/**
 * @payswap/adversarial — the provider threat-intelligence subpath
 * barrel ("./provider-intel"; P6-W3, lane r4-w3).
 *
 * The consolidated provider side of the adversarial plane (the old
 * repository's separate @payswap/adversarial fault suite + the immune
 * system's signature/case vocabulary, re-based into ONE package):
 *
 * - the eleven provider threat families with their law declarations
 *   and recovery-path contracts (the old W2-007 taxonomy, 1:1);
 * - the provider observation bundle (pure data — the incident
 *   recorder, outbox, clock, idempotency, capture, agent-telemetry,
 *   sealed-release, incentive and credential-change surfaces);
 * - evidence-chain-mandatory signals with integer-bps calibrated
 *   confidence (content-addressed; an evidence-free signal is
 *   unconstructible);
 * - the deterministic detectors (every family exactly once — proven by
 *   the sweep's fail-closed coverage assertion) with explicit typed
 *   thresholds (no hidden constants);
 * - the adversarial provider agent: recommendation-only (evidence,
 *   never authority — the composition is escalate-only, INV-21).
 *
 * Boundary law: this subpath's src imports ONLY the pins barrel and
 * its own modules (relative imports) — never a sibling package, never
 * a vendor SDK, never a live endpoint (zero-sibling law). The agent
 * never broadcasts, never mints authorization, never handles key
 * material.
 *
 * Deterministic only: callers pass every instant; no ambient clock, no
 * randomness, no floating point anywhere (confidence is integer bps;
 * shortfalls are exact BigInt rationals projected to integer bps).
 */

export const PROVIDER_INTEL_SURFACE_NAME = "@payswap/adversarial/provider-intel" as const;

// The subpath's wire-contract version stamp (see ../version.ts).
export { PROVIDER_INTEL_WIRE_VERSION } from "../version.ts";

// The eleven families + severity model + declarations.
export * from "./families.ts";
// The observation bundle + validation (fail closed).
export * from "./observations.ts";
// Evidence-chain-mandatory signals (content-addressed).
export * from "./signals.ts";
// The explicit threshold set + confidence calibration + evidence helpers.
export * from "./detectors-context.ts";
// The provider-plane detectors (duplicated commands, lost webhooks,
// ambiguous provider, outage, clock skew, partial payment).
export * from "./detectors-provider.ts";
// The agent/plane detectors (takeover, malicious agents, package
// compromise, incentive sybil/collusion/wash, leaderboard gaming).
export * from "./detectors-agent.ts";
// The sweep (every family exactly once, fail-closed coverage).
export * from "./detectors.ts";
// The recovery-path contracts (the exact recovery laws, declarative).
export * from "./recovery.ts";
// The adversarial provider agent (recommendation-only).
export * from "./agent.ts";
