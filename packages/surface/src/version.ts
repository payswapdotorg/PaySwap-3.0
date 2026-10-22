/**
 * @payswap/surface — versioning and stability policy (P2-W3).
 *
 * PORT of payswap.org@8a735bf packages/surface/src/version.ts (52L) with the
 * work-order id moved from the old P4-W4-002 to the canonical P2-W3; no
 * semantic change.
 *
 * The surface API is a STABILITY BOUNDARY (INV-22): a future Web app (P7-W1),
 * Desktop shell (P7-W2), mobile app, browser extension, SDK and external-agent
 * APIs (P7-W3) import these contracts without React and without any UI
 * framework. The version below is the CONTRACT version of the surface — it
 * changes ONLY when a contract shape changes (additive or breaking), never
 * because an implementation detail moved.
 */

/**
 * The surface contract version. Semver, as policy:
 * - MAJOR: a breaking change to any exported type or function signature
 *   (removals, narrowed unions, changed required fields). Requires a work
 *   order that names the surface explicitly and a spec/surface update.
 * - MINOR: additive contracts (a new outcome action, a new area, a new
 *   optional field). Old consumers keep compiling.
 * - PATCH: wording/documentation and pure implementation fixes.
 *
 * Every runtime the surface serves records the version it compiled against
 * — drift is detectable at build time, not discovered in production.
 */
export const SURFACE_API_VERSION = "1.3.0" as const;

/** Which parts of the surface are covered by which stability class. */
export type SurfaceStability =
  /** Frozen: removal or shape change requires a MAJOR bump. */
  | "stable"
  /** Additive-only between MINOR bumps; consumed by shipped surfaces. */
  | "experimental";

export interface SurfaceContractProvenance {
  readonly surfaceApiVersion: typeof SURFACE_API_VERSION;
  readonly stability: SurfaceStability;
  /** The work order that introduced the contract. */
  readonly workOrder: string;
}

/** Tag every exported contract model with its provenance (auditable). */
export function surfaceProvenance(
  workOrder: string,
  stability: SurfaceStability = "stable",
): SurfaceContractProvenance {
  return {
    surfaceApiVersion: SURFACE_API_VERSION,
    stability,
    workOrder,
  };
}
