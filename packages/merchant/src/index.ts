/**
 * @payswap/merchant — the public barrel (P5-W3, lane R3-W3).
 *
 * Merchant checkout + crypto acceptance in ONE deterministic,
 * zero-dependency package: onboarding (fiat-denominated by default),
 * crypto acceptance activation (a narrowing statement, never
 * authority), checkout flows with quotes-as-observations and exact
 * bigint cross-multiplication, the wallet-payment path as a TYPED
 * INJECTION PORT with a HANDOFF-ONLY exit (money movement DELEGATED
 * through the pinned SettlementInstructionId typed reference — no
 * parallel engine), local work-item state machines ONLY (UNKNOWN
 * first-class, reconciliation the only ambiguity exit, evidence-
 * mandatory definitive outcomes), typed webhooks (evidence, never
 * authority), refunds only where the typed rail observation supports
 * them, settlement configuration as typed data, and the two
 * provider-verified Stripe paths (never conflated; a synthetic Stripe
 * balance effect is unconstructible).
 *
 * COMMIT 1/4 SURFACE: this barrel currently exports ONLY the pinned
 * wire shapes (the type-level pins of every external seam). The
 * implementation modules land in commit 2/4 and re-export through this
 * same barrel; the 25-file/353-test suite lands in commit 3/4.
 *
 * The barrel is the package's PUBLIC CONTRACT SURFACE (curated; the
 * internal helpers stay module-scoped and are importable from their
 * modules by the package's own tests — never by siblings). Zero
 * runtime dependencies; every cross-lane contract shape is a LOCAL
 * STRUCTURAL PIN (the leaf-in-flight law — the TL wires the types at
 * integration; never a value import).
 */

export const PACKAGE_NAME = "@payswap/merchant" as const;

/** The package's semantic version (mirrors package.json). */
export const PACKAGE_VERSION = "0.1.0" as const;

/** The work order + lane this rebuild delivers. */
export const WORK_ORDER_ID = "P5-W3" as const;
export const REBUILD_LANE = "R3-W3" as const;

// --- The pinned wire shapes (commit 1/4; every external seam) ------------
export * from "./pins/index.ts";
