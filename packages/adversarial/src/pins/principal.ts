/**
 * @payswap/adversarial — structural pin: the Principal model and its
 * canonical reference (P6-W3, lane r4-w3).
 *
 * LAYER LAW: zero sibling imports (MODULE-OWNERSHIP layer `security`).
 * The principal identity MODEL is owned by the trust lane
 * (packages/trust/src/principal.ts, P1-W3); this file pins its contract
 * shapes STRUCTURALLY (verbatim the onchain-security lane's own pin,
 * packages/onchain-security/src/pins/principal.ts, R2-W2) so this
 * package can name acting principals on epoch-scoped authorizations
 * without a runtime trust dependency. The real trust Principal remains
 * assignable to this pin by construction (identical member shapes); the
 * Tech Lead wires the lanes at integration.
 *
 * `principalRef` mirrors trust's canonical projection verbatim
 * (`user:<id>` / `agent:<fingerprint>` / `service:<id>`): security
 * lineage (who held which epoch-scoped authorization when it was
 * voided) records exactly these strings.
 */

/** Reference to a mandate, carried inside an AgentPrincipal authority envelope. */
export interface MandateRef {
  readonly mandateId: string;
  readonly version: number;
}

/** Human principal. `securityEpoch` binds the credential to its epoch. */
export interface UserPrincipal {
  readonly kind: "user";
  readonly id: string;
  readonly securityEpoch: bigint;
}

/**
 * Agent principal: binds the runtime credential fingerprint, the owner,
 * the stable Body identity and the (mandate-referencing) authority
 * envelope. Authority travels through mandates, never inline.
 */
export interface AgentPrincipal {
  readonly kind: "agent";
  readonly agentKeyFingerprint: string;
  readonly ownerRef: string;
  readonly bodyRef: string;
  readonly packageVersionRef: string;
  readonly authorityEnvelope: readonly MandateRef[];
  readonly securityEpoch: bigint;
}

/** Service principal with an explicit, non-delegable scope descriptor. */
export interface ServicePrincipal {
  readonly kind: "service";
  readonly id: string;
  readonly scope: string;
}

export type Principal = UserPrincipal | AgentPrincipal | ServicePrincipal;

/** Canonical principal reference (trust-lane projection, verbatim semantics). */
export function principalRef(principal: Principal): string {
  switch (principal.kind) {
    case "user":
      return `user:${principal.id}`;
    case "agent":
      return `agent:${principal.agentKeyFingerprint}`;
    case "service":
      return `service:${principal.id}`;
  }
}
