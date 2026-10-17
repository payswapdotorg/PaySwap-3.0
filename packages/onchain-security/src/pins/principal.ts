/**
 * @payswap/onchain-security — structural pin: the Principal model and
 * its canonical reference (R2-W2).
 *
 * LAYER LAW: zero sibling imports (MODULE-OWNERSHIP layer `security`).
 * The principal identity MODEL is owned by the trust lane
 * (packages/trust/src/principal.ts, P1-W3); this file pins its contract
 * shapes STRUCTURALLY so this package can name requesting principals and
 * mint authorization artifacts without a runtime trust dependency. The
 * real trust Principal remains assignable to this pin by construction
 * (identical member shapes); the Tech Lead wires the lanes at
 * integration.
 *
 * `principalRef` mirrors trust's canonical projection verbatim
 * (`user:<id>` / `agent:<fingerprint>` / `service:<id>`): authorization
 * lineage (INV-5) records exactly these strings.
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
