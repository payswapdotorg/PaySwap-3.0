/**
 * @payswap/onchain-domain — versioning and stability policy (P4-W1, lane
 * R2-W1).
 *
 * This is a REBUILD of an accepted-then-lost work item (the P4-W1 of the
 * roadmap). The onchain domain surface is a STABILITY BOUNDARY: Phase 4
 * security (P4-W2) and adapters (P4-W3) build on this vocabulary, and Phase
 * 5 routing (P5-W1/P5-W2) consumes it — consumers import these pinned
 * onchain shapes framework-free and with zero runtime dependencies.
 *
 * The version below changes ONLY when a pinned wire shape changes (additive
 * or breaking) — never because an implementation detail moved underneath a
 * faithfully pinned shape.
 *
 * Evidence pin: the ported vocabulary is verified against
 * payswapdotorg/payswap.org @ 8a735bf1639198c43115087a2992555166a9acf9
 * (old packages/onchain-domain — 11 src files / 145 tests; evidence, NOT
 * authority — the PaySwap 3.0 architecture wins; see
 * spec/MIGRATION-FROM-PAYSWAP-ORG.md and migration matrix MMI-18).
 */

/**
 * The onchain domain contract version. Semver, as policy:
 * - MAJOR: a breaking change to any exported pinned shape or function
 *   signature (removals, narrowed unions, changed required fields). Requires
 *   a work order that names the onchain domain explicitly and a
 *   spec/onchain-domain update.
 * - MINOR: additive contracts (a new operation kind, a new optional wire
 *   field, a newly declared family extension shape). Old consumers keep
 *   compiling.
 * - PATCH: wording/documentation and pure implementation fixes.
 */
export const ONCHAIN_DOMAIN_VERSION = "1.0.0" as const;

/** Package identity (mirrors package.json name; assertions pin this). */
export const PACKAGE_NAME = "@payswap/onchain-domain" as const;

/**
 * The old-repository commit the ported vocabulary was verified against
 * (read-only evidence; the canonical authority is the PaySwap 3.0
 * architecture: MODULE-OWNERSHIP, INVARIANTS, CAPABILITY-MODEL,
 * NON-CUSTODY).
 */
export const OLD_REPO_EVIDENCE_PIN =
  "8a735bf1639198c43115087a2992555166a9acf9" as const;

/** Which parts of the onchain domain are covered by which stability class. */
export type OnchainDomainStability =
  /** Frozen: removal or shape change requires a MAJOR bump. */
  | "stable"
  /** Additive-only between MINOR bumps. */
  | "experimental";

/** Provenance record for onchain domain contracts (auditable, frozen). */
export interface OnchainDomainProvenance {
  readonly domainVersion: typeof ONCHAIN_DOMAIN_VERSION;
  readonly stability: OnchainDomainStability;
  /** The work order that introduced the contract. */
  readonly workOrder: string;
  /** The old-repository evidence pin the vocabulary was verified against. */
  readonly evidencePin: typeof OLD_REPO_EVIDENCE_PIN;
}

/**
 * The provenance of this contract surface, frozen at construction
 * (deterministic: no ambient clock — the stamp is declared data).
 */
export const ONCHAIN_DOMAIN_PROVENANCE: OnchainDomainProvenance =
  Object.freeze({
    domainVersion: ONCHAIN_DOMAIN_VERSION,
    stability: "stable",
    workOrder: "P4-W1",
    evidencePin: OLD_REPO_EVIDENCE_PIN,
  });
