/**
 * The organization-execution authority port (P3-W1 net-new).
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml layer `intelligence`):
 * intelligence PROPOSES and ORCHESTRATES but `cannot_authorize_financial_
 * effects: true`. Authority lives in the trust lane. The old repository's
 * organization-execution engine imported @payswap/trust VALUES
 * (evaluate / attenuateGrant / principalRef) — a runtime dependency this
 * lane may not carry (zero runtime dependencies; the ONE accepted sibling
 * import is TYPE-ONLY, mirroring packages/capability).
 *
 * The port keeps the SEMANTICS and moves the WIRING to the composition
 * root: the engine resolves every acting node through
 * `adapter.evaluate(...)` and mints delegated child authority ONLY through
 * `adapter.attenuateGrant(...)` — one code path, no bypass. The production
 * composition root wires the port to @payswap/trust's own functions (their
 * signatures are structurally identical — compile-time asserted in
 * test/authority-port.test.ts); tests wire a deterministic local adapter.
 *
 * Evidence-lineage law for adapters (INV-5): an ALLOW decision SHOULD cite
 * the authorizing grant as `grant:<grantId>` evidence so delegated action
 * is attributable in the execution trace.
 */

import type {
  AuthorizationDecision,
  AuthorizationRequest,
  ChildMandateRequest,
  PermissionGrant,
  Principal,
} from "@payswap/trust";

/**
 * Structural view of the trust lane's EpochState.ledger (the per-principal
 * credential-epoch gate). Declared locally because the trust EpochState's
 * ledger is a class-bound runtime value: this package (and its hermetic
 * package-local battery) must be able to CONSTRUCT epoch state without a
 * runtime trust import, while the REAL trust EpochState remains assignable
 * to this view (compile-time asserted in test/authority-port.test.ts —
 * the view is a structural supertype, so no drift is possible without a
 * typecheck failure).
 */
export interface AuthorityEpochState {
  readonly ledger: {
    currentEpoch(principalRef: string): { readonly value: bigint } | undefined;
  };
}

/** Issuance parameters for an attenuated child grant. */
export interface AuthorityGrantIssuance {
  readonly grantId: string;
  readonly issuedAt: number;
}

/**
 * The authority seam the organization-execution engine resolves every
 * acting node through. Method syntax keeps the members bivariant, so the
 * real @payswap/trust functions satisfy this interface directly at the
 * composition root.
 */
export interface OrganizationAuthorityAdapter {
  /** Deterministic principal reference (e.g. `agent:<fingerprint>`). */
  principalRef(principal: Principal): string;
  /**
   * Deterministic authorization evaluation (the trust lane's evaluate()).
   * Every acting organization node passes through this before acting —
   * no organization node can bypass authority.
   */
  evaluate(
    request: AuthorizationRequest,
    grants: readonly PermissionGrant[],
    epochState: AuthorityEpochState,
  ): AuthorizationDecision;
  /**
   * The ONLY lawful way to mint delegated child authority (the trust
   * lane's attenuateGrant()): the child must be strictly narrower than the
   * parent (INV-12); any widening attempt must throw.
   */
  attenuateGrant(
    parentGrant: PermissionGrant,
    request: ChildMandateRequest,
    issuance: AuthorityGrantIssuance,
  ): PermissionGrant;
}
