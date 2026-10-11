/**
 * @payswap/provider-runtime — opaque structural cross-lane refs (P2-W2).
 *
 * TWO cross-lane pins live here, both OPAQUE STRUCTURAL refs exactly as the
 * protocol lane pinned trust artifacts in P1 (packages/protocol/src/
 * authorization.ts — the P1-W2 AuthorizationRef pattern this work order
 * mandates):
 *
 * 1. `AuthorizationRef` — pinned byte-compatible structural shape of the
 *    accepted @payswap/protocol authorization lineage ref. The trust lane
 *    owns the semantics (packages/trust, accepted P1-W3); the protocol lane
 *    owns the lineage type; THIS package validates only structural
 *    completeness. No @payswap/* import exists (dependency-free in flight);
 *    the TL wires the type at integration without touching runtime
 *    semantics.
 *
 * 2. `CapabilityRef` — the capability-lane reference (P2-W1, IN FLIGHT and
 *    therefore unimportable under the pairwise-disjoint law): typed ids +
 *    version only. The capability fabric owns the real
 *    CapabilityDefinition -> ProviderImplementation -> ConnectedCapability
 *    Instance hierarchy; the runtime treats each ref as opaque identity
 *    material and NEVER re-derives capability semantics from it.
 *
 * Scope admission compares refs by structural identity only (ids + version
 * must match exactly — a capability reference with a different version is a
 * DIFFERENT reference; catalogue drift can never silently widen scope).
 */

import { ValidationError } from './errors.ts';

// ---------------------------------------------------------------------------
// AuthorizationRef (P1-W2 pattern pin — see module doc)
// ---------------------------------------------------------------------------

/** Opaque id of a trust-lane authorization artifact. */
export type AuthorizationArtifactId = string;
/** Opaque reference to the mandate the authorization derives from. */
export type MandateRef = string;
/** Opaque reference to the approving principal (trust-lane identity). */
export type ApproverRef = string;
/** Epoch in which the authorization was issued (bigint, never a float). */
export type AuthorizationEpoch = bigint;

/** The pinned structural authorization reference (P1-W2 pattern; opaque here). */
export interface AuthorizationRef {
  /** The trust-lane approval/authorization artifact id (opaque here). */
  readonly artifactId: AuthorizationArtifactId;
  /** The mandate under which the artifact was issued (opaque here). */
  readonly mandateRef: MandateRef;
  /** Who approved (opaque trust-lane principal reference). */
  readonly approverRef: ApproverRef;
  /** Security/policy epoch at issuance — stale epochs never authorize. */
  readonly epoch: AuthorizationEpoch;
  /** Optional artifact integrity hash (opaque; crypto owned by platform lane). */
  readonly artifactHash?: string;
}

const MAX_REF_LENGTH = 256;

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

/** Structural validation: the authorization reference is complete and well-formed. */
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

/** Type predicate form for inbound authorization references. */
export function isValidAuthorizationRef(ref: AuthorizationRef): boolean {
  try {
    validateAuthorizationRef(ref);
    return true;
  } catch {
    return false;
  }
}

/** Structural lineage equality (replay equality, never semantic trust equality). */
export function sameAuthorizationLineage(a: AuthorizationRef, b: AuthorizationRef): boolean {
  return (
    a.artifactId === b.artifactId &&
    a.mandateRef === b.mandateRef &&
    a.approverRef === b.approverRef &&
    a.epoch === b.epoch &&
    a.artifactHash === b.artifactHash
  );
}

// ---------------------------------------------------------------------------
// CapabilityRef (P2-W1 in-flight lane — opaque structural ref)
// ---------------------------------------------------------------------------

/**
 * Opaque reference to a capability-lane artifact: typed ids + version.
 * The capability fabric (P2-W1) owns CapabilityDefinition /
 * ProviderImplementation / ConnectedCapabilityInstance semantics; this
 * package never re-derives them. Identity comparison is structural and
 * exact — version drift is a different reference.
 */
export interface CapabilityRef {
  /** Opaque capability definition id (P2-W1 vocabulary). */
  readonly definitionId: string;
  /** Opaque provider implementation id satisfying the definition (P2-W1). */
  readonly implementationId: string;
  /** Version of the definition/implementation the connection was scoped to. */
  readonly version: string;
}

/** Structural validation of a capability reference (opaque identity material). */
export function validateCapabilityRef(ref: CapabilityRef): void {
  if (ref === null || typeof ref !== 'object') {
    throw new ValidationError('capability reference must be a CapabilityRef object');
  }
  for (const field of ['definitionId', 'implementationId', 'version'] as const) {
    const value = ref[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new ValidationError(`capability ${field} must be a non-empty string`, { field });
    }
    if (value.length > MAX_REF_LENGTH) {
      throw new ValidationError(`capability ${field} exceeds ${MAX_REF_LENGTH} characters`, {
        field,
      });
    }
  }
}

/** Type predicate form for inbound capability references. */
export function isValidCapabilityRef(ref: CapabilityRef): boolean {
  try {
    validateCapabilityRef(ref);
    return true;
  } catch {
    return false;
  }
}

/** Structural capability identity (definition + implementation + version). */
export function sameCapabilityRef(a: CapabilityRef, b: CapabilityRef): boolean {
  return (
    a.definitionId === b.definitionId &&
    a.implementationId === b.implementationId &&
    a.version === b.version
  );
}

/** Stable rendering used for scope keys and conflict details (no secrets — ids only). */
export function capabilityRefKey(ref: CapabilityRef): string {
  validateCapabilityRef(ref);
  return `${ref.definitionId}@${ref.implementationId}@${ref.version}`;
}
