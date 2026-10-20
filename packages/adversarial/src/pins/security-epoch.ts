/**
 * @payswap/adversarial — structural pin: the trust lane's security-
 * epoch and security-block vocabulary (P6-W3, lane r4-w3, commit 1).
 *
 * PINNED WIRE CONTRACT — the trust plane owns the network-wide
 * SecurityEpoch authority and the SecurityBlockRegistry, the trust-plane
 * home of the INV-21 block law (packages/trust/src/security-epoch.ts +
 * security-block.ts, P1-W3):
 *
 *   "A BLOCK verdict is STICKY ACROSS EPOCH ADVANCEMENT ... The ONLY
 *    path that retires a block is an EXPLICIT higher-authority
 *    revocation."
 *
 * This package's escalation bridge composes WITH that law and NEVER
 * imports it (zero-sibling law): the shapes below are structural
 * mirrors — the real trust records remain assignable to these pins by
 * construction, so drift fails typecheck at the integration station.
 *
 * What the seam carries, and why the adversarial plane needs it:
 *
 * - `SecurityEpochPin` — one network-wide epoch value with advance
 *   metadata (monotonic; an advance VOIDS every epoch-scoped
 *   authorization issued at a lower epoch, TB-5; blocks are the
 *   deliberate exception — INV-21);
 * - `SecurityBlockRecordPin` — a registered BLOCK verdict (append-only
 *   evidence record): the escalation target. Adversarial intelligence
 *   PROPOSES block registrations (harden-only); it can never revoke,
 *   downgrade or expire one;
 * - `BlockRevocationRecordPin` — the explicit higher-authority
 *   revocation (the ONLY block exit; append-only, irrevocable).
 *
 * Deterministic only: pure data + pure functions.
 */

/** One network-wide security epoch value with its advance metadata (trust mirror). */
export interface SecurityEpochPin {
  readonly value: bigint;
  /** When the epoch was advanced; never moves backwards (monotonic). */
  readonly advancedAt: number;
  readonly reason: string;
  /** Opaque reference to the security-relevant event that ordered the advance. */
  readonly eventRef?: string;
}

/** A registered BLOCK verdict (append-only evidence record; trust mirror). */
export interface SecurityBlockRecordPin {
  readonly id: string;
  /** Opaque reference to what is blocked (principal, resource, action class...). */
  readonly subjectRef: string;
  readonly reason: string;
  /** Network security epoch at which the block was issued. */
  readonly issuedAtEpoch: bigint;
  /** Opaque evidence references backing the block. */
  readonly evidenceRefs: readonly string[];
}

/** The explicit higher-authority revocation of a block (append-only evidence). */
export interface BlockRevocationRecordPin {
  readonly blockId: string;
  /** Opaque reference to the higher authority ordering the revocation. */
  readonly revokedBy: string;
  readonly reason: string;
  /** Network security epoch at which the revocation fired. */
  readonly revokedAtEpoch: bigint;
}
