/**
 * @payswap/opportunities — the pinned wire shapes barrel (P6-W2, lane
 * r4-w2; commit 1/4 — the type-level pins).
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml, layer `economic`):
 * packages/opportunities may_depend_on [contracts] only. As an authoring
 * discipline this package is a LEAF IN FLIGHT: zero runtime dependencies,
 * zero non-relative imports in src/**, and NO @payswap/* imports — every
 * cross-lane contract shape it needs is a LOCAL STRUCTURAL PIN (the
 * accepted pattern: packages/onchain-domain/src/pins.ts,
 * packages/lab/src/pins/index.ts, packages/economic/src/amount-spec.ts).
 * The TL wires the authoritative imports at integration, at which point
 * each pin is verified against its authority (byte-identical for VALUE
 * pins, subset-typed for STRUCTURE pins) before it is replaced by the
 * real import.
 *
 * Authorities pinned:
 * - ./onchain-domain.ts — @payswap/onchain-domain (P4-W1): the canonical
 *                         `${namespace}:${network}` rail/chain-key law,
 *                         the canonical asset-ref law and the asset
 *                         symbol pattern (the vocabulary this package
 *                         generalizes from chainKey to railKey).
 * - ./capability.ts     — @payswap/capability (P2-W1): the observation
 *                         discipline (monotonic per-source observation
 *                         VERSIONS, the two-axis availability law,
 *                         ELIGIBLE/NOT_ELIGIBLE/UNKNOWN) and the
 *                         INV-13 catalogue-never-authorizes law.
 * - ./economic.ts       — @payswap/economic (P1-W1): AmountSpec (the
 *                         pinned cross-lane money wire shape), the
 *                         versioned-economic-input envelope discipline
 *                         and the goal/intent lineage refs an opportunity
 *                         may cite as ADVISORY inputs.
 * - ./route-compiler.ts — @payswap/route-compiler (P5-W1): ExactRational
 *                         (exact non-negative rationals as canonical
 *                         decimal integer strings) and QuoteFreshness
 *                         (the bounded observation window + the
 *                         inclusive-bound staleness law) — the old
 *                         package consumed these as-is from
 *                         @payswap/best-execution; in 3.0 the authority
 *                         is the route-compiler lane.
 * - ./lab.ts            — @payswap/lab (P6-W1, now LANDED): the Lab
 *                         search wire shapes needed for the family
 *                         registration surface (the search index, the
 *                         CATALOGUE_ENTRY_ONLY selection law, the
 *                         executable block, the search plug-in seam and
 *                         the Domain Pack) — PINNED, never imported
 *                         (INV-L01: the Lab is driven from the test
 *                         layer only).
 * - ./agents.ts         — @payswap/agents (P3-W1): the proposal wire
 *                         (AgentProposal, PROPOSAL_SCHEMA_VERSION, the
 *                         protocol-command marker fields) — the
 *                         opportunity -> proposal -> decision seam is
 *                         typed against THIS pin.
 */

export * from "./onchain-domain.ts";
export * from "./capability.ts";
export * from "./economic.ts";
export * from "./route-compiler.ts";
export * from "./lab.ts";
export * from "./agents.ts";

// ---------------------------------------------------------------------------
// The pin discipline (why these modules exist)
// ---------------------------------------------------------------------------
// The v1 leaf-in-flight law: a package in flight pins the wire shapes of
// every external seam LOCALLY and imports NOTHING from siblings. This
// keeps lanes parallel while guaranteeing that the moment integration
// happens, the shapes cannot have drifted silently. Cross-lane consistency
// of the VALUE pins (the rail-key pattern, the staleness law, the marker
// fields, the proposal schema version) is asserted by test/pins.test.ts
// against the authorities' published laws — value pinning, never value
// imports (a value import would be a runtime dependency).
