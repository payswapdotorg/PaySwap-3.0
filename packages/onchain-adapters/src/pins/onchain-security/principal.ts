/**
 * STRUCTURAL PIN — the trust-lane Principal (Work Order P4-W3, lane R2-W3;
 * local structural mirror of the accepted @payswap/trust Principal shape,
 * reduced to the members the authorization feed carries — the agents-lane
 * authority-port pattern: opaque passthrough, structurally compatible by
 * construction, wired by the TL at integration).
 */

/** Who is requesting execution (the requester is never the authority). */
export interface Principal {
  readonly kind: 'agent' | 'user' | 'operator' | 'service' | (string & {});
  /** Opaque fingerprint of the requesting identity (never key material). */
  readonly agentKeyFingerprint?: string;
  readonly ownerRef?: string;
  readonly bodyRef?: string;
  readonly packageVersionRef?: string;
  readonly authorityEnvelope: readonly unknown[];
  readonly securityEpoch: bigint;
}
