/**
 * @payswap/trust — Trust and Authorization Authority plane for PaySwap 3.0
 * (Work Order P1-W3): principals, mandates, strict delegation attenuation,
 * approval artifacts, scoped execution grants, policy and security-epoch
 * linkage, security blocks (INV-21).
 *
 * LEAF PACKAGE LAW: zero runtime dependencies, zero PaySwap package imports
 * (MODULE-OWNERSHIP.yaml layer `trust`; the old repository's reversed
 * trust->protocol dependency is deliberately not ported — financial may
 * depend on trust, never the reverse).
 *
 * NOT exported from this index (deliberately): the internal canonical
 * minor-units helpers (src/minor-units.ts) — trust law enforcement
 * internals, never a public money API (single-owner law, INV-01/TB-7).
 */

export const PACKAGE_NAME = "@payswap/trust" as const;

export * from "./principal.ts";
export * from "./amount-spec.ts";
export * from "./mandate.ts";
export * from "./attenuation.ts";
export * from "./security-epoch.ts";
export * from "./policy-epoch.ts";
export * from "./security-block.ts";
export * from "./grants.ts";
export * from "./scoped-gate.ts";
export * from "./approval-artifacts.ts";
export * from "./authorization.ts";
