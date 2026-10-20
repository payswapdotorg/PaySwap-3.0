/**
 * @payswap/financial-certification — the package barrel (P8-W1).
 *
 * The financial invariant/conformance certification suite for fiat
 * corridors: the nine hard laws (src/laws.ts) with their conformance
 * verdict model, the per-law conformance verifiers, the uniform
 * certification gate wall, the versioned suites, the digest-chained
 * certification records, the escalate-only promotion ledger and the
 * live-corridor limitation surface.
 *
 * THE PACKAGE OWNS CERTIFICATION-GATE AND EVIDENCE AUTHORITY, NOT
 * FINANCIAL TRUTH: money semantics stay pinned to the protocol wires
 * (src/pins/protocol.ts); this package never re-derives them.
 */

export * from "./digest.ts";
export * from "./errors.ts";
export * from "./laws.ts";
export * from "./pins/index.ts";
