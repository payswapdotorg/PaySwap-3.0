/**
 * @payswap/execution-graph — projection validation helpers (P3-W2; split
 * from projection.ts to honor the file-size law).
 *
 * Fail-closed structural validation of the wire shapes the authorization
 * projection consumes: the protocol authorization ref (opaque, INV-05
 * lineage), the approval-artifact lineage (the projection cannot outlive or
 * diverge from the approval it cites), and the adapter attenuation guard
 * (an adapter can NEVER hold financial write authority).
 */

import { ProjectionRejectedError, ValidationError } from './errors.ts';
import { deepFreeze } from './canonical.ts';
import type {
  AdapterExecutionAuthority,
  ApprovalArtifactLineage,
} from './projection-contract.ts';
import type { AuthorizationRef } from '@payswap/protocol';
import type { ExecutionMode } from '@payswap/capability';

/** Structural validation of the protocol authorization ref being projected. */
export function validateAuthorizationRefShape(ref: AuthorizationRef): AuthorizationRef {
  if (ref === null || typeof ref !== 'object') {
    throw new ValidationError('the projected authorization must be an AuthorizationRef object');
  }
  for (const field of ['artifactId', 'mandateRef', 'approverRef'] as const) {
    if (typeof ref[field] !== 'string' || (ref[field] as string).length === 0) {
      throw new ValidationError(
        `the projected authorization must carry a non-empty ${field} (opaque wire shape)`,
      );
    }
  }
  if (typeof ref.epoch !== 'bigint' || ref.epoch < 0n) {
    throw new ValidationError(
      'the projected authorization epoch must be a non-negative bigint (stale-epoch law)',
    );
  }
  if (
    ref.artifactHash !== undefined &&
    (typeof ref.artifactHash !== 'string' || ref.artifactHash.length === 0)
  ) {
    throw new ValidationError('authorization artifactHash must be non-empty when present');
  }
  return Object.freeze({ ...ref });
}

/** Fail-closed validation of an approval-artifact lineage view. */
export function validateApprovalArtifactLineage(
  artifact: ApprovalArtifactLineage,
): ApprovalArtifactLineage {
  if (artifact === null || typeof artifact !== 'object') {
    throw new ValidationError('an ApprovalArtifactLineage object is required');
  }
  if (typeof artifact.artifactId !== 'string' || artifact.artifactId.length === 0) {
    throw new ValidationError('the approval artifact lineage must carry an artifactId');
  }
  for (const field of ['principal', 'agent'] as const) {
    const principal = artifact[field];
    if (
      principal === null ||
      typeof principal !== 'object' ||
      typeof principal.principalType !== 'string' ||
      principal.principalType.length === 0 ||
      typeof principal.principalId !== 'string' ||
      principal.principalId.length === 0
    ) {
      throw new ValidationError(
        `the approval artifact lineage must identify BOTH principal and agent (${field})`,
      );
    }
  }
  if (typeof artifact.expiresAt !== 'bigint' || artifact.expiresAt <= 0n) {
    throw new ValidationError('the approval artifact lineage must carry an expiry');
  }
  if (typeof artifact.requestHash !== 'string' || artifact.requestHash.length === 0) {
    throw new ValidationError(
      'the approval artifact lineage must carry the request hash of the approved request',
    );
  }
  if (typeof artifact.signatureRef !== 'string' || artifact.signatureRef.length === 0) {
    throw new ValidationError('the approval artifact lineage must reference its signature');
  }
  return deepFreeze({
    artifactId: artifact.artifactId,
    principal: Object.freeze({ ...artifact.principal }),
    agent: Object.freeze({ ...artifact.agent }),
    expiresAt: artifact.expiresAt,
    requestHash: artifact.requestHash,
    signatureRef: artifact.signatureRef,
  });
}

/**
 * Runtime guard for adapter authorities from untyped sources: any value
 * claiming financial write authority is rejected outright (adapters NEVER
 * receive financial write authority).
 */
export function validateAdapterExecutionAuthority(
  candidate: unknown,
): AdapterExecutionAuthority {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('adapter execution authority must be an object');
  }
  const authority = candidate as Partial<AdapterExecutionAuthority>;
  if (authority.authorityKind !== 'ADAPTER_EXECUTION_ONLY') {
    throw new ProjectionRejectedError(
      'adapter authorities are execution-only: authorityKind must be ADAPTER_EXECUTION_ONLY',
    );
  }
  if (authority.canWriteFinancialState !== false) {
    throw new ProjectionRejectedError(
      'an adapter can NEVER hold financial write authority',
      { canWriteFinancialState: String(authority.canWriteFinancialState) },
    );
  }
  if (authority.projection === null || typeof authority.projection !== 'object') {
    throw new ValidationError('adapter execution authority must carry its projection');
  }
  return candidate as AdapterExecutionAuthority;
}

/**
 * Deterministic route-covers-mode check: the material ROUTE axis covers a
 * mode iff the chain shape matches the mode — a single-hop chain covers
 * PASS_THROUGH_NATIVE only; a multi-hop chain covers the composed modes.
 */
export function routeCoversMode(route: readonly string[], mode: ExecutionMode): boolean {
  if (mode === 'PASS_THROUGH_NATIVE') {
    return route.length === 1;
  }
  return route.length >= 1;
}
