/**
 * @payswap/protocol — opaque authorization lineage boundary (P1-W2).
 *
 * INV-05: every consequential financial effect has authorization lineage and
 * evidence lineage. The trust lane (packages/trust, accepted P1-W3) owns the
 * REAL authorization artifacts: mandates, approval artifacts, grants,
 * security epochs. That lane is IN FLIGHT relative to this package's
 * integration, and the layer law forbids importing it here anyway during
 * Phase 1 (this package is dependency-free by dispatch contract).
 *
 * Therefore the financial protocol represents authorization references as
 * OPAQUE STRUCTURAL REFS: typed ids + artifact hashes. This module performs
 * NO validation of trust semantics — it verifies only that the reference is
 * structurally complete (non-empty ids, non-negative epoch, well-formed
 * artifact hashes). Trust-lane wiring lands at TL integration: the TL swaps
 * the opaque fields for typed references without touching financial
 * semantics.
 *
 * Old-repo note: the old settlement package used untyped
 * `authorizationRefs: readonly string[]` (packages/settlement/src/
 * instructions.ts). PaySwap 3.0 tightens this to a STRUCTURAL record so
 * artifact/mandate/approver/epoch dimensions cannot be conflated.
 */

import { ValidationError } from './errors.ts';
import type { TimestampMs } from './clock.ts';

/** Opaque id of a trust-lane authorization artifact. */
export type AuthorizationArtifactId = string;

/** Opaque reference to the mandate the authorization derives from. */
export type MandateRef = string;

/** Opaque reference to the approving principal (trust-lane identity). */
export type ApproverRef = string;

/** Epoch in which the authorization was issued (bigint, never a float). */
export type AuthorizationEpoch = bigint;

/**
 * The pinned structural authorization reference every consequential record
 * must carry (INV-05). Semantics live in the trust lane; this package treats
 * each field as opaque identity + integrity material.
 */
export interface AuthorizationRef {
  /** The trust-lane approval/authorization artifact id (opaque here). */
  readonly artifactId: AuthorizationArtifactId;
  /** The mandate under which the artifact was issued (opaque here). */
  readonly mandateRef: MandateRef;
  /** Who approved (opaque trust-lane principal reference). */
  readonly approverRef: ApproverRef;
  /** Security/policy epoch at issuance — stale epochs never authorize. */
  readonly epoch: AuthorizationEpoch;
  /**
   * Optional artifact integrity hash (opaque here; the trust lane owns the
   * signature/canonical-hash semantics — INV-19-adjacent boundary, recorded
   * as P1-W3 finding F-2).
   */
  readonly artifactHash?: string;
}

/** When the authorization reference was observed/recorded by the protocol. */
export interface AuthorizationLineage {
  readonly authorization: AuthorizationRef;
  readonly observedAt: TimestampMs;
}

const MAX_REF_LENGTH = 256;

/** Structural validation: the reference is complete and well-formed. */
export function validateAuthorizationRef(ref: AuthorizationRef): void {
  if (ref === null || typeof ref !== 'object') {
    throw new ValidationError('authorization reference must be an AuthorizationRef object');
  }
  requireOpaqueId(ref.artifactId, 'artifactId');
  requireOpaqueId(ref.mandateRef, 'mandateRef');
  requireOpaqueId(ref.approverRef, 'approverRef');
  if (typeof ref.epoch !== 'bigint' || ref.epoch < 0n) {
    throw new ValidationError(
      'authorization epoch must be a non-negative bigint (stale-epoch law)',
      { epoch: String(ref.epoch) },
    );
  }
  if (ref.artifactHash !== undefined) {
    if (typeof ref.artifactHash !== 'string' || ref.artifactHash.length === 0) {
      throw new ValidationError('artifactHash must be a non-empty string when present');
    }
  }
}

function requireOpaqueId(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`authorization ${field} must be a non-empty opaque id`, { field });
  }
  if (value.length > MAX_REF_LENGTH) {
    throw new ValidationError(`authorization ${field} exceeds ${MAX_REF_LENGTH} characters`, {
      field,
    });
  }
  if (value.trim() !== value) {
    throw new ValidationError(`authorization ${field} must not carry surrounding whitespace`, {
      field,
    });
  }
}

/** Type predicate form for inbound authorization references. */
export function isValidAuthorizationRef(ref: AuthorizationRef): boolean {
  try {
    validateAuthorizationRef(ref);
    return true;
  } catch {
    return false;
  }
}

/** Freeze a validated authorization reference (immutable lineage material). */
export function freezeAuthorizationRef(ref: AuthorizationRef): AuthorizationRef {
  validateAuthorizationRef(ref);
  const frozen: { -readonly [K in keyof AuthorizationRef]: AuthorizationRef[K] } = {
    artifactId: ref.artifactId,
    mandateRef: ref.mandateRef,
    approverRef: ref.approverRef,
    epoch: ref.epoch,
  };
  if (ref.artifactHash !== undefined) {
    frozen.artifactHash = ref.artifactHash;
  }
  return Object.freeze(frozen);
}

/**
 * Structural comparison used for lineage deduplication and replay equality.
 * Two references are the same lineage point when every opaque field and the
 * epoch match exactly.
 */
export function sameAuthorizationLineage(a: AuthorizationRef, b: AuthorizationRef): boolean {
  return (
    a.artifactId === b.artifactId &&
    a.mandateRef === b.mandateRef &&
    a.approverRef === b.approverRef &&
    a.epoch === b.epoch &&
    a.artifactHash === b.artifactHash
  );
}

/**
 * A minimal authorization-lineage requirement: at least one structurally
 * valid authorization reference (INV-05 — a consequential record without
 * authorization lineage is unconstructible).
 */
export function requireAuthorizationLineage(
  refs: readonly AuthorizationRef[],
): readonly AuthorizationRef[] {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new ValidationError(
      'INV-05: a consequential record requires at least one authorization lineage reference',
    );
  }
  return Object.freeze(refs.map(freezeAuthorizationRef));
}
