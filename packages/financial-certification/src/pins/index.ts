/**
 * @payswap/financial-certification — the pinned wire shapes barrel
 * (P8-W1; the type-level pins).
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml, layer `security`,
 * deterministic-gates class — `security.cannot_downgrade_block`): this
 * package owns CERTIFICATION-GATE and EVIDENCE authority for financial
 * corridors, NOT financial truth. As an authoring discipline it is a
 * LEAF IN FLIGHT: zero runtime dependencies, zero non-relative imports
 * in src/**, and NO @payswap/* imports — every cross-lane contract shape
 * it needs is a LOCAL STRUCTURAL PIN (the canonical pattern:
 * packages/opportunities/src/pins/). The TL wires the authoritative
 * imports at integration, at which point each pin is verified against
 * its authority (byte-identical for VALUE pins, subset-typed for
 * STRUCTURE pins).
 *
 * Authorities pinned:
 * - ./protocol.ts         — @payswap/protocol (P1-W2): exact Money
 *                           (integer minor units, bigint), TimestampMs
 *                           and the three-value external-effect outcome
 *                           vocabulary (CONFIRMED/UNKNOWN/FAILED).
 * - ./provider-runtime.ts — @payswap/provider-runtime (P2-W2): the
 *                           per-operation idempotency contract (key
 *                           scope/derivation/replay/conflict), the
 *                           namespaced key derivation, the ambiguity
 *                           reasons and the event-processing outcomes
 *                           (SUPERSEDED_BY_NEWER_OBSERVATION et al).
 * - ./route-compiler.ts   — @payswap/route-compiler (P5-W1):
 *                           QuoteFreshness (the bounded observation
 *                           window + the inclusive-bound staleness law)
 *                           and the INDICATIVE/EXECUTABLE semantics.
 * - ./merchant.ts         — @payswap/merchant (P5-W3): the quote expiry
 *                           window (expiry AT the boundary), the exact
 *                           cross-multiplication ratio law and the
 *                           material-terms projection.
 * - ./surface.ts          — @payswap/surface (P2-W3): the late-event
 *                           stages (RETURNED/REFUNDED/CHARGED_BACK),
 *                           the UNKNOWN-first-class stage statuses and
 *                           the submission-is-not-finality payout
 *                           stage order.
 * - ./trust.ts            — @payswap/trust (P1-W3): the authorization
 *                           lineage a consequential financial effect
 *                           carries (mandate + grant + epoch stamp) and
 *                           the epoch-staleness law.
 */

export * from "./protocol.ts";
export * from "./provider-runtime.ts";
export * from "./route-compiler.ts";
export * from "./merchant.ts";
export * from "./surface.ts";
export * from "./trust.ts";
