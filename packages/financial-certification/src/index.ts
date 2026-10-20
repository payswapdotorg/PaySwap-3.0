/**
 * @payswap/financial-certification — the package barrel (P8-W1).
 *
 * The financial invariant/conformance certification suite for fiat
 * corridors: the nine hard laws (src/laws.ts) with their conformance
 * verdict model, the per-law conformance verifiers
 * (src/quote-honesty.ts, src/idempotency.ts, src/leg-separation.ts,
 * src/event-ordering.ts, src/ambiguous-outcome.ts, src/late-events.ts),
 * the uniform certification gate wall (src/gate-wall.ts), the versioned
 * suites and their evaluation (src/suites.ts), the digest-chained
 * certification records (src/records.ts), the escalate-only promotion
 * ledger (src/promotion.ts) and the live-corridor limitation surface
 * (src/live-corridor.ts).
 *
 * THE PACKAGE OWNS CERTIFICATION-GATE AND EVIDENCE AUTHORITY, NOT
 * FINANCIAL TRUTH: money semantics stay pinned to the protocol wires
 * (src/pins/protocol.ts); this package never re-derives them.
 */

export * from "./digest.ts";
export * from "./errors.ts";
export * from "./laws.ts";
export * from "./pins/index.ts";
export * from "./live-corridor.ts";
export * from "./quote-honesty.ts";
export * from "./idempotency.ts";
export * from "./leg-separation.ts";
export * from "./event-ordering.ts";
export * from "./ambiguous-outcome.ts";
export * from "./late-events.ts";
export * from "./gate-wall.ts";
export * from "./suites.ts";
export * from "./records.ts";
export * from "./promotion.ts";
