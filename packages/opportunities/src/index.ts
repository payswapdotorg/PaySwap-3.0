/**
 * @payswap/opportunities — evidence-backed FinancialOpportunity discovery
 * across rails (Work Order P6-W2, lane r4-w2; the P6 rebuild of
 * payswap.org@8a735bf packages/onchain-opportunities, P4-W3-002).
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml, layer `economic`):
 * may_depend_on [contracts] only; must_not_depend_on ui, model-runtime,
 * provider-sdk. As an authoring discipline this package is a LEAF IN
 * FLIGHT: zero runtime dependencies, zero non-relative imports in
 * src/**, NO @payswap/* imports and NO tsconfig paths entries — every
 * cross-lane contract shape is a LOCAL STRUCTURAL PIN (src/pins/*.ts,
 * each naming its authority; the TL wires the real imports at
 * integration).
 *
 * SURFACE (the P6-W2 rebuild, hard laws encoded structurally):
 * - EVIDENCE-BACKED ONLY: every FinancialOpportunity carries VERSIONED,
 *   lineage-preserved supporting observations (the primary observation
 *   grounds identity; the supporting chain is carried verbatim; there is
 *   NO constructor path without evidence — non-empty evidence refs,
 *   positive observation versions, bounded freshness);
 * - NEVER AUTHORIZATION: discovery is a projection, never financial
 *   authority — the structural DISCOVERY_NEVER_AUTHORIZATION tier, the
 *   execution gate that always throws, and the
 *   opportunity -> proposal -> decision seam typed against the pinned
 *   agents proposal wire (never execution; agents may discover/surface
 *   but cannot execute);
 * - HONEST ESTIMATES: the expected return is an EVIDENCE-BACKED ESTIMATE
 *   with explicit uncertainty bounds (exact rationals, no floating
 *   point) under a structural no-guaranteed-returns vocabulary law, and
 *   adversarial observations (stale evidence, manipulated APYs, fake
 *   incentives, vanished liquidity, honeypot exits, unapproved
 *   strategies) surface as ineligible/UNKNOWN — never as attractive;
 * - DETERMINISM: pure functions only — caller-supplied instants, no
 *   ambient clock, no randomness, no network, byte-identical outputs for
 *   identical inputs;
 * - SECRET-FREE: no credential-shaped constants anywhere, and the
 *   runtime scrubber proves agent-facing artifacts carry no key
 *   material.
 */

export const PACKAGE_NAME = "@payswap/opportunities" as const;

// The pinned wire shapes (commit 1/4): every external seam as a local
// structural pin — onchain-domain, capability, economic, route-compiler,
// lab and agents (see ./pins/index.ts for the authority map).
export * from "./pins/index.ts";
