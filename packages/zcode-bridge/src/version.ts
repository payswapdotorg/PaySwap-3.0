/**
 * @payswap/zcode-bridge — versioning and stability policy (P3-W3).
 *
 * NET-NEW (R1-W3 rebuild of the accepted-then-lost work/p3-w3 build): the
 * bridge contract version follows the same semver-as-policy discipline as
 * the accepted @payswap/surface contracts (P2-W3) and the capability fabric
 * (P2-W1).
 *
 * The bridge surface is a STABILITY BOUNDARY: PaySwap consumers (P3-W2
 * execution graph, P6 intelligence lanes, P7 experience shells) import these
 * pinned substrate shapes without any framework and with zero runtime
 * dependencies. The version below changes ONLY when a pinned wire shape
 * changes (additive or breaking) — never because a substrate implementation
 * detail moved underneath a faithfully pinned shape.
 *
 * Substrate pin: every wire shape in this package is pinned against the
 * ZCode substrate as it exists IN THIS REPOSITORY's worktree, whose upstream
 * lineage is zai-org/ZCode @ 29628c9acdb81b703bbd4080c207a0e7ce5e276e
 * (verified by docs/migration-evidence/ZCODE-BASELINE-VERIFICATION.md, P0-W3).
 * The exact repo-relative source paths per surface are recorded on each
 * ZcodeBridgeSurfaceObservation and in the inventory (src/bridge/inventory.ts).
 */

/**
 * The bridge contract version. Semver, as policy:
 * - MAJOR: a breaking change to any exported pinned shape or function
 *   signature (removals, narrowed unions, changed required fields). Requires
 *   a work order that names the bridge explicitly and a spec/zcode-bridge
 *   update.
 * - MINOR: additive contracts (a new bridged surface, a new optional wire
 *   field, a newly pinned vocabulary member observed in the substrate).
 *   Old consumers keep compiling.
 * - PATCH: wording/documentation and pure implementation fixes.
 */
export const ZCODE_BRIDGE_VERSION = "1.0.0" as const;

/** Package identity (mirrors package.json name; assertions pin this). */
export const PACKAGE_NAME = "@payswap/zcode-bridge" as const;

/**
 * The upstream ZCode commit this repository's substrate lineage is pinned
 * against (spec/MIGRATION-FROM-ZCODE.md; verified byte-identical to
 * zai-org/ZCode by the P0-W3 baseline verification record).
 */
export const SUBSTRATE_PIN = "29628c9acdb81b703bbd4080c207a0e7ce5e276e" as const;

/** Which parts of the bridge are covered by which stability class. */
export type ZcodeBridgeStability =
  /** Frozen: removal or shape change requires a MAJOR bump. */
  | "stable"
  /** Additive-only between MINOR bumps. */
  | "experimental";

/** Provenance record for bridge contracts (auditable, frozen at construction). */
export interface ZcodeBridgeProvenance {
  readonly bridgeVersion: typeof ZCODE_BRIDGE_VERSION;
  readonly stability: ZcodeBridgeStability;
  /** The work order that introduced the contract. */
  readonly workOrder: string;
  /** The substrate pin the shapes were verified against. */
  readonly substratePin: typeof SUBSTRATE_PIN;
}
