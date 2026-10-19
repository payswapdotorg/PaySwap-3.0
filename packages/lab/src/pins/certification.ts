/**
 * @payswap/lab — the PINNED WIRE SHAPES of certification and the
 * smart-contract extension discipline (P6-W1, lane R4-W1; commit 1/4 —
 * the type-level pins).
 *
 * LAYER LAW: zero sibling imports. Authority: @payswap/capability
 * src/certification.ts + src/smart-contract.ts (P2-W1, accepted).
 *
 * THE SEARCHABILITY LAW (old FROZEN §288; authority: `isSearchableByLab`):
 * a smart-contract extension becomes searchable by the Lab ONLY after
 * certification — the extension must DECLARE
 * `searchableByLabAfterCertification: true` AND the carrying certification
 * must be CERTIFIED. A searchability flag is discovery, never execution
 * authority (INV-13 family).
 */

// ---------------------------------------------------------------------------
// Certification (STRUCTURAL PINS — authority: @payswap/capability)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/certification.ts `CertificationSubjectRef`.
 */
export interface PinnedCertificationSubjectRef {
  readonly kind: string;
  readonly subjectId: string;
  readonly version: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `CertificationEvidenceRef`.
 */
export interface PinnedCertificationEvidenceRef {
  readonly evidenceId: string;
  readonly kind: string;
  readonly artifactRef: string;
  readonly contentHash: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `CertificationStatus` (the lifecycle of a certification record).
 */
export type PinnedCertificationStatus =
  | "CERTIFIED"
  | "SUSPENDED"
  | "REVOKED"
  | "EXPIRED";

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/certification.ts `CertificationRecord` (SUBSET: the record identity,
 * subject, status, evidence and certifiedAt; the authority's shape
 * additionally carries the smart-contract risk profile and validity
 * window — owned by the capability lane, opaque here).
 */
export interface PinnedCertificationRecord {
  readonly recordId: string;
  readonly subject: PinnedCertificationSubjectRef;
  readonly status: PinnedCertificationStatus;
  readonly evidence: readonly PinnedCertificationEvidenceRef[];
  readonly certifiedAt: string;
}

// ---------------------------------------------------------------------------
// Smart-contract extensions (STRUCTURAL PIN — authority:
// @payswap/capability src/smart-contract.ts `SmartContractExtension`)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/smart-contract.ts `SmartContractExtension` (SUBSET: the identity,
 * authority and searchability surface the Lab building-block index reads;
 * the authority's shape additionally carries oracle dependencies, custody
 * discipline and pause powers in full — owned by the capability lane).
 *
 * `searchableByLabAfterCertification` is the DECLARED flag gating Lab
 * searchability: certification PLUS the declaration makes the block
 * searchable (see pinnedIsSearchableByLab below — the pinned form of the
 * authority's `isSearchableByLab`).
 */
export interface PinnedSmartContractExtension {
  readonly kind: string;
  readonly chainRef: string;
  readonly contractAddress: string;
  readonly sourceHash: string;
  readonly bytecodeHash: string;
  readonly upgradeAuthority: {
    readonly kind: string;
    readonly description: string;
  };
  readonly adminAuthority: {
    readonly kind: string;
    readonly description: string;
  };
  readonly searchableByLabAfterCertification: boolean;
}

/**
 * VALUE PIN — authority: @payswap/capability `isSearchableByLab`
 * (behaviour-identical): a smart-contract extension is searchable by the
 * Lab exactly when the extension DECLARES
 * searchableByLabAfterCertification AND the carrying certification is
 * CERTIFIED. Searchability is discovery, never execution authority.
 */
export function pinnedIsSearchableByLab(
  extension: PinnedSmartContractExtension,
  certificationStatus: PinnedCertificationStatus,
): boolean {
  return (
    extension.searchableByLabAfterCertification === true &&
    certificationStatus === "CERTIFIED"
  );
}

// ---------------------------------------------------------------------------
// DECLARED_CAPABILITY blocks (the accepted P6-W1 rename)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — the DECLARED_CAPABILITY block payload (the accepted
 * P6-W1 rename of the old ServiceAccessCapability block kind; authority
 * for the underlying shape: @payswap/capability packs/developer services,
 * P2-W1). A declared developer-service capability as a searchable Lab
 * building block: conditions, cost components (exact bps), risk class,
 * provenance and accountability references. Indexing is DISCOVERY ONLY —
 * a declared capability block is a proposal ingredient, never execution
 * authority (INV-09/INV-10).
 */
export interface PinnedDeclaredCapability {
  readonly id: string;
  readonly capabilityClass: string;
  readonly conditions: readonly {
    readonly kind: string;
    readonly description: string;
    readonly hardConstraint: boolean;
  }[];
  readonly cost: readonly {
    readonly componentId: string;
    readonly kind: string;
    readonly bps: bigint;
  }[];
  readonly risk: {
    readonly riskClass: string;
    readonly severity: string;
    readonly mitigations: readonly string[];
  };
  readonly provenance: {
    readonly declaredBy: string;
    readonly artifactRef: string;
    readonly contentHash: string;
  };
  readonly economicAccountability: {
    readonly accountablePartyRef: string;
    readonly ledgerAccountRef: string;
    readonly recoursePolicyRef: string;
  };
}
