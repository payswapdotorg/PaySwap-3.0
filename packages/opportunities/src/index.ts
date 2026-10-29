/**
 * @payswap/opportunities — evidence-backed FinancialOpportunity discovery
 * across rails (Work Order P6-W2, lane r4-w2; the P6 rebuild of
 * payswap.org@8a735bf packages/onchain-opportunities, P4-W3-002).
 *
 * LAYER LAW (MODULE-OWNERSHIP layer `economic`): may_depend_on
 * [contracts] only. A LEAF IN FLIGHT: zero runtime dependencies, zero
 * non-relative imports in src/**, NO @payswap/* imports, no tsconfig
 * paths — every cross-lane contract shape is a LOCAL STRUCTURAL PIN
 * (src/pins/*.ts; the TL wires the real imports at integration).
 *
 * HARD LAWS (encoded structurally): EVIDENCE-BACKED ONLY (versioned,
 * lineage-preserved supporting observations; NO constructor path without
 * evidence); NEVER AUTHORIZATION (the DISCOVERY_NEVER_AUTHORIZATION
 * tier, the always-throwing execution gate, the
 * opportunity -> proposal -> decision seam pinned against the agents
 * wire; agents may discover/surface but never execute); HONEST ESTIMATES
 * (bounds, exact rationals, the no-guaranteed-returns vocabulary law,
 * adversarial observations surfaced ineligible/UNKNOWN — never
 * attractive); DETERMINISM (pure functions, caller-supplied instants, no
 * ambient clock/randomness/network); SECRET-FREE (no credential-shaped
 * constants; the runtime scrubber proves agent-facing artifacts carry no
 * key material).
 */

export const PACKAGE_NAME = "@payswap/opportunities" as const;

// The pinned wire shapes (commit 1/4): every external seam as a local
// structural pin — onchain-domain, capability, economic, route-compiler,
// lab and agents (see ./pins/index.ts for the authority map).
export * from "./pins/index.ts";

// The typed error taxonomy.
export * from "./errors.ts";

// The exact value laws (credited to the route-compiler authority).
export * from "./rational.ts";
export * from "./freshness.ts";

// The vocabulary law (no guaranteed returns — structural).
export * from "./vocabulary.ts";

// The structural never-authorization tier.
export * from "./discovery-tier.ts";

// Knowable values (UNKNOWN is honest).
export * from "./knowable.ts";

// The FinancialOpportunity model + validation (the file law split).
export * from "./model.ts";
export * from "./model-fields.ts";
export * from "./model-validation-sections.ts";
export * from "./model-validation.ts";

// The deterministic discovery policy + evidence-backed estimation.
export * from "./eligibility.ts";
export * from "./estimation.ts";

// The ONE constructor + input validation.
export * from "./discovery-input.ts";
export * from "./discovery.ts";

// The observation law at read time (deterministic invalidation).
export * from "./observation.ts";

// The opportunity -> proposal -> decision seam (NET-NEW, hard law 2).
export * from "./proposal-seam.ts";

// The P16-C offer/consent/matching/wait family (the evidence-backed
// offer lifecycle, the minimum-disclosure consent ledger, the
// consent-gated match projection, the durable wait criteria and the
// publication-rate limits — exported for the P21 journey surfaces).
export * from "./offer-lifecycle.ts";
export * from "./consent.ts";
export * from "./matching.ts";
export * from "./wait-criteria.ts";
export * from "./offer-limits.ts";

// The P21-C conditional opportunity + the wait re-check (ADR-0014 D9:
// the party-change precondition composition and the pure "check now"
// service consumed by the journey panel and the E2E).
export * from "./conditional.ts";
export * from "./conditional-publication.ts";
export * from "./conditional-lifecycle.ts";
export * from "./wait-recheck.ts";

// The canonical helpers (ADR-0009 D4 — the one digest flavor, re-declared
// locally under the leaf-in-flight law; the deterministic identities of
// the P23-A surfaces compute over it).
export * from "./canonical.ts";

// The P23-A repair-discovery foundations (ADR-0015 D2/D4/D6): the typed
// repair-operator catalogue over the pinned 26-code corridor exclusion
// vocabulary + the honest non-operator classifications + the totality law;
// the first-class platform work items; the bounded, grounded model-proposal
// interface with its strict validation, budget truncation receipts and the
// dedup fold. Advisory only, never execution.
export * from "./repair-facts.ts";
export * from "./repair-operators.ts";
export * from "./repair-classifications.ts";
export * from "./platform-work.ts";
export * from "./repair-proposals.ts";
export * from "./repair-proposal-validation.ts";
export * from "./repair-proposal-fold.ts";

// The secret-free law (runtime scrubber, hard law 5).
export * from "./secret-free.ts";

// The Lab family registration (pure data, test-layer composition).
export * from "./lab-registration.ts";
