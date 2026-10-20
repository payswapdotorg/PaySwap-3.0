/**
 * @payswap/financial-certification — the pinned wire shapes of the trust
 * lane's authorization-lineage authority (P8-W1).
 *
 * Authority: @payswap/trust (P1-W3 — Mandate/PermissionGrant contracts,
 * scoped execution grants, the security-epoch stamp). Under the
 * zero-sibling law the wire shapes are LOCAL STRUCTURAL PINS; the
 * financial-certification package CERTIFIES that each corridor leg
 * carries authorization lineage of this shape — it never issues,
 * evaluates or attenuates mandates itself (no parallel trust
 * authority).
 */

/**
 * STRUCTURAL PIN — authority: @payswap/trust src/mandate.ts +
 * src/grants.ts (subset-typed): the authorization lineage a
 * consequential financial effect must carry (INV-05 evidence lineage).
 * `issuedAtEpoch` is the network security epoch at issuance — an epoch
 * advancement deterministically invalidates every lineage stamped at a
 * lower epoch.
 */
export interface PinnedAuthorizationLineage {
  /** Reference to the mandate that delegates the power. */
  readonly mandateRef: string;
  /** Reference to the issued grant instance the effect was authorized by. */
  readonly grantRef: string;
  /** Network security epoch at issuance (epoch-scoped validity). */
  readonly issuedAtEpoch: bigint;
}

/**
 * VALUE PIN — authority: @payswap/trust src/security-epoch.ts /
 * src/policy-epoch.ts (behaviour-identical): a lineage is STALE when the
 * network epoch has advanced strictly above its issuance epoch — stale
 * lineage must be re-authorized before it can authorize anything.
 */
export function pinnedAuthorizationLineageStale(
  lineage: PinnedAuthorizationLineage,
  currentEpoch: bigint,
): boolean {
  if (typeof currentEpoch !== "bigint" || currentEpoch < 0n) {
    throw new RangeError(
      "the current epoch must be a non-negative bigint",
    );
  }
  return currentEpoch > lineage.issuedAtEpoch;
}
