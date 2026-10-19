/**
 * @payswap/lab — the Reality Engineering Lab (Work Order P6-W1, lane
 * R4-W1; the P6 rebuild of the old payswap.org@8a735bf packages/lab).
 *
 * Replay, counterfactuals, fault injection, Organization/Strategy search,
 * robustness, shadow and canary promotion. Simulated routes/events are
 * advisory/test evidence only; no production financial authority
 * (canonical INV-11: simulation is never production financial authority).
 *
 * COMMIT 1/4 — THE PINNED WIRE SHAPES ONLY. This barrel currently exposes
 * exactly the local structural pins for every external seam (see
 * ./pins/index.ts for the authority map). The implementation families
 * (simulation engine, scenarios, Domain Packs, evaluator, replay,
 * counterfactual, search, candidates, promotion, Director) land in commit
 * 2/4 and the ported test corpus in commit 3/4.
 *
 * Package-level invariants (mirrors of the old W2-004 laws, re-cited to
 * the canonical 3.0 invariants):
 * - INV-L01 (canonical INV-11): the simulation namespace is isolated and
 *   branded; no export path converts a simulation result into any
 *   production-evidence type; the engine module imports nothing.
 * - INV-L02: promotion to SHADOW or beyond requires the complete evidence
 *   bundle (replay + counterfactual + robustness, plus the per-stage
 *   shadow/canary reports) — PromotionEvidenceError otherwise, no
 *   override path.
 * - INV-L03: promotion is versioned and reversible (append-only ledger;
 *   rollback appends, history is never rewritten).
 * - INV-13: executable search is instance + observation grounded — never
 *   catalogue definitions alone; two-axis UNKNOWN is preserved verbatim.
 * - INV-15: provider-native incumbents compete without a composition
 *   prior (no mode-based ranking advantage).
 * - INV-9: Lab composition is a proposal; it grants no authority.
 */

export const PACKAGE_NAME = "@payswap/lab" as const;

export * from "./pins/index.ts";
