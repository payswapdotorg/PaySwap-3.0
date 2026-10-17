/**
 * @payswap/execution-graph — the AUTHORIZATION PROJECTION INDEX (P3-W2,
 * ENCODED LAW 2; ADAPT/RE-AUTHOR of payswap.org@8a735bf
 * packages/execution/src/authorization.ts, W3-003).
 *
 * THE IDENTITY LAW: this package NEVER authorizes. The financial protocol
 * layer owns real authorization; this index PROJECTS protocol-owned
 * authorization (opaque AuthorizationRef) against MATERIAL EXECUTION TERMS
 * and reconciles the projection's staleness. Concretely:
 * - `projectAuthorization` RECORDS a projection (it grants nothing —
 *   `canAuthorizeFinancialEffects` is the structural literal `false`);
 * - `verify` is fail-closed at an explicit instant: unknown, expired,
 *   request-hash-mismatched, term-changed or out-of-scope projections never
 *   vouch for anything;
 * - `invalidateAffectedProjections` is LAW 2: a material change on any
 *   covered axis (route, destination, asset, amount, risk, capability
 *   observations, quote) INVALIDATES every affected projection. An
 *   invalidated projection is TERMINAL — it can never verify CURRENT again;
 *   a refreshed authorization is a NEW projection with a NEW id;
 * - `attenuateForAdapter` derives the execution-only authority shape
 *   (canWriteFinancialState: false literal — adapters NEVER receive
 *   financial write authority; validation helpers in projection-validation.ts).
 */

import {
  ProjectionNotCurrentError,
  ProjectionRejectedError,
  ValidationError,
} from './errors.ts';
import { asAuthorizationProjectionId } from './identifiers.ts';
import { deepFreeze } from './canonical.ts';
import {
  changeAffectsTerms,
  diffMaterialTerms,
  materialTermsDigest,
  validateMaterialTerms,
} from './material-terms.ts';
import type {
  MaterialExecutionTerms,
  MaterialTermChange,
  ProjectionInvalidation,
} from './material-terms-contract.ts';
import {
  routeCoversMode,
  validateAdapterExecutionAuthority,
  validateApprovalArtifactLineage,
  validateAuthorizationRefShape,
} from './projection-validation.ts';
import type {
  AuthorizationProjection,
  AuthorizationProjectionVerification,
  InvalidateAffectedInput,
  ProjectAuthorizationInput,
  VerifyProjectionInput,
} from './projection-contract.ts';
import type { TimestampMs } from '@payswap/protocol';

/**
 * The authorization projection index: records projections of protocol-owned
 * authorization, verifies them fail-closed, and invalidates affected
 * projections on material term changes (LAW 2). Deterministic — every time
 * question is answered `at` an explicitly supplied instant.
 */
export class AuthorizationProjectionIndex {
  readonly #projections = new Map<string, AuthorizationProjection>();

  /**
   * RECORD a projection of a protocol authorization against material
   * execution terms. Fail-closed validation:
   * - the authorization ref must be structurally complete (INV-05 lineage);
   * - the material terms must cover at least one axis and be well-formed;
   * - the validity window must be explicit and non-degenerate;
   * - an approval-artifact lineage (when present) must match the request
   *   hash, outlive the projection's validity, and the projection principal
   *   must be a party to it (the projection cannot outlive or diverge from
   *   the approval).
   *
   * This NEVER grants anything — the projection is evidence of what the
   * protocol authorized, bound to terms.
   */
  projectAuthorization(input: ProjectAuthorizationInput): AuthorizationProjection {
    if (input === null || typeof input !== 'object') {
      throw new ValidationError('projection input must be an object');
    }
    const projectionId = asAuthorizationProjectionId(input.projectionId);
    if (this.#projections.has(projectionId)) {
      throw new ProjectionRejectedError(
        `authorization projection '${projectionId}' already exists`,
      );
    }
    const authorization = validateAuthorizationRefShape(input.authorization);
    validateMaterialTerms(input.materialTerms);
    if (typeof input.requestHash !== 'string' || input.requestHash.length === 0) {
      throw new ValidationError(
        'requestHash is required: a projection is bound to one exact execution request',
      );
    }
    if (typeof input.projectedAt !== 'bigint' || typeof input.validUntil !== 'bigint') {
      throw new ValidationError('projectedAt and validUntil must be bigint TimestampMs');
    }
    if (input.validUntil <= input.projectedAt) {
      throw new ValidationError(
        'a projection must be valid strictly after its projection instant',
      );
    }

    let approvalArtifact: ProjectAuthorizationInput['approvalArtifact'];
    if (input.approvalArtifact !== undefined) {
      const artifact = validateApprovalArtifactLineage(input.approvalArtifact);
      if (artifact.requestHash !== input.requestHash) {
        throw new ProjectionRejectedError(
          'approval artifact request hash does not match the projection request: the projection is not bound to what was approved',
          { artifactRequestHash: artifact.requestHash, projectionRequestHash: input.requestHash },
        );
      }
      if (input.validUntil > artifact.expiresAt) {
        throw new ProjectionRejectedError(
          'a projection issued from an approval cannot outlive its approval artifact',
          {
            projectionValidUntil: input.validUntil.toString(),
            artifactExpiresAt: artifact.expiresAt.toString(),
          },
        );
      }
      const commanded =
        sameParty(input.principalForApproval, artifact.principal) ||
        sameParty(input.principalForApproval, artifact.agent);
      if (input.principalForApproval !== undefined && !commanded) {
        throw new ProjectionRejectedError(
          'the projection principal must be a party to the approval artifact (approving principal or delegated agent)',
        );
      }
      approvalArtifact = artifact;
    }

    const projection: AuthorizationProjection = deepFreeze({
      projectionId,
      canAuthorizeFinancialEffects: false,
      authorization,
      principal: Object.freeze({
        principalType: 'approver',
        principalId: authorization.approverRef,
      }),
      materialTerms: deepFreeze({ ...input.materialTerms }),
      termsDigest: materialTermsDigest(input.materialTerms),
      requestHash: input.requestHash,
      projectedAt: input.projectedAt,
      validUntil: input.validUntil,
      ...(approvalArtifact !== undefined ? { approvalArtifact } : {}),
    });
    this.#projections.set(projectionId, projection);
    return projection;
  }

  /** The projection with this id, when recorded by this index. */
  lookup(projectionId: string): AuthorizationProjection | undefined {
    return this.#projections.get(projectionId);
  }

  /**
   * Fail-closed verification at an explicitly supplied instant. Every
   * dimension supplied is checked; anything unknown, expired, invalidated,
   * unbound, out-of-scope or term-changed refuses to vouch.
   */
  verify(
    projectionId: string,
    input: VerifyProjectionInput,
  ): AuthorizationProjectionVerification {
    const projection = this.#projections.get(projectionId);
    if (projection === undefined) {
      return {
        ok: false,
        status: 'UNKNOWN_PROJECTION',
        message: `authorization projection '${projectionId}' was never recorded by this index: unresolvable references never vouch for authority`,
      };
    }
    if (projection.invalidation !== undefined) {
      return {
        ok: false,
        status: 'INVALIDATED',
        reason: 'TERMS_CHANGED',
        message: `authorization projection '${projectionId}' was INVALIDATED at ${projection.invalidation.invalidatedAt.toString()} on axes [${projection.invalidation.reasonAxes.join(', ')}]: material execution terms changed (LAW 2)`,
      };
    }
    if (input.now >= projection.validUntil) {
      return {
        ok: false,
        status: 'EXPIRED',
        message: `authorization projection '${projectionId}' expired: expired projections fail closed everywhere`,
      };
    }
    if (input.requestHash !== undefined && input.requestHash !== projection.requestHash) {
      return {
        ok: false,
        status: 'CURRENT',
        reason: 'REQUEST_HASH_MISMATCH',
        message: `authorization projection '${projectionId}' is bound to a different request hash`,
      };
    }
    // LAW 2 seam: a NEWER observation version on any pinned instance makes
    // the projection stale on the CAPABILITY_OBSERVATIONS axis.
    if (input.latestObservationVersions !== undefined) {
      const pinned = projection.materialTerms.observationPins ?? [];
      for (const latest of input.latestObservationVersions) {
        const affected = pinned.find(
          (pin) =>
            pin.instanceId === latest.instanceId &&
            pin.observationVersion < latest.observationVersion,
        );
        if (affected !== undefined) {
          return {
            ok: false,
            status: 'CURRENT',
            reason: 'OBSERVATION_PIN_MISMATCH',
            message: `authorization projection '${projectionId}' rests on observation ${affected.instanceId}#${affected.observationVersion} but a NEWER version ${latest.observationVersion} exists: the projection is stale on the CAPABILITY_OBSERVATIONS axis (LAW 1/LAW 2)`,
          };
        }
      }
    }
    if (input.currentTerms !== undefined) {
      const change = diffMaterialTerms(projection.materialTerms, input.currentTerms, input.now);
      if (changeAffectsTerms(change, projection.materialTerms)) {
        return {
          ok: false,
          status: 'CURRENT',
          reason: 'TERMS_CHANGED',
          message: `authorization projection '${projectionId}' is bound to different material terms: changed axes [${change.changedAxes.join(', ')}] (LAW 2)`,
        };
      }
    }
    if (input.capabilityInstanceId !== undefined) {
      const pinned = projection.materialTerms.observationPins ?? [];
      const inScope = pinned.some((pin) => pin.instanceId === input.capabilityInstanceId);
      if (!inScope) {
        return {
          ok: false,
          status: 'CURRENT',
          reason: 'INSTANCE_NOT_IN_SCOPE',
          message: `authorization projection '${projectionId}' does not cover connected capability instance '${input.capabilityInstanceId}'`,
        };
      }
    }
    if (input.executionMode !== undefined && projection.materialTerms.route !== undefined) {
      if (!routeCoversMode(projection.materialTerms.route, input.executionMode)) {
        return {
          ok: false,
          status: 'CURRENT',
          reason: 'MODE_NOT_IN_SCOPE',
          message: `authorization projection '${projectionId}' terms do not cover execution mode '${input.executionMode}'`,
        };
      }
    }
    return { ok: true, status: 'CURRENT', projection };
  }

  /**
   * ENCODED LAW 2: invalidate every recorded projection whose material terms
   * are affected by the given change. Invalidated projections are TERMINAL:
   * they can never verify CURRENT again (a refreshed authorization is a NEW
   * projection with a NEW id). Returns the invalidations recorded.
   */
  invalidateAffectedProjections(input: InvalidateAffectedInput): readonly ProjectionInvalidation[] {
    if (input === null || typeof input !== 'object' || typeof input.now !== 'bigint') {
      throw new ValidationError('invalidation input must carry now: TimestampMs');
    }
    if (input.changedAxes.length === 0) {
      throw new ValidationError(
        'an invalidation must carry at least one changed material axis (LAW 2)',
      );
    }
    validateMaterialTerms(input.currentTerms);
    const invalidations: ProjectionInvalidation[] = [];
    for (const projection of this.#projections.values()) {
      if (projection.invalidation !== undefined) {
        continue; // already terminal — invalidation is immutable history
      }
      const change = diffMaterialTerms(projection.materialTerms, input.currentTerms, input.now);
      const reasonAxes = input.changedAxes.filter((axis) => change.changedAxes.includes(axis));
      const affected =
        reasonAxes.length > 0 && changeAffectsTerms(change, projection.materialTerms);
      if (!affected) {
        continue;
      }
      const invalidation: ProjectionInvalidation = deepFreeze({
        projectionId: projection.projectionId,
        reasonAxes: Object.freeze([...reasonAxes]),
        invalidatedAt: input.now,
        ...(input.note !== undefined ? { note: input.note } : {}),
      });
      const invalidated: AuthorizationProjection = deepFreeze({
        ...projection,
        invalidation,
      });
      this.#projections.set(invalidated.projectionId, invalidated);
      invalidations.push(invalidation);
    }
    return Object.freeze(invalidations);
  }

  /**
   * Invalidate projections directly affected by a recorded change object
   * (the diff-driven entry point; `currentTerms` supplies the after-state).
   */
  invalidateByChange(
    change: MaterialTermChange,
    currentTerms: MaterialExecutionTerms,
  ): readonly ProjectionInvalidation[] {
    return this.invalidateAffectedProjections({
      changedAxes: change.changedAxes,
      currentTerms,
      now: change.detectedAt,
    });
  }

  /**
   * Attenuate a CURRENT projection into the execution-only authority shape
   * an adapter may hold: fail-closed on verification, and the returned
   * authority carries `canWriteFinancialState: false` as a literal —
   * adapters NEVER get financial write authority.
   */
  attenuateForAdapter(projectionId: string, now: TimestampMs) {
    const verification = this.verify(projectionId, { now });
    if (!verification.ok) {
      throw new ProjectionNotCurrentError(
        `cannot attenuate '${projectionId}' for adapter use: ${verification.message}`,
        { status: verification.status, reason: verification.reason },
      );
    }
    return validateAdapterExecutionAuthority({
      authorityKind: 'ADAPTER_EXECUTION_ONLY',
      canWriteFinancialState: false,
      projection: verification.projection,
    });
  }

  /** All recorded projections, in recording order (diagnostic surface). */
  all(): readonly AuthorizationProjection[] {
    return [...this.#projections.values()];
  }
}

function sameParty(
  left: { principalType: string; principalId: string } | undefined,
  right: { principalType: string; principalId: string },
): boolean {
  if (left === undefined) {
    return false;
  }
  return left.principalType === right.principalType && left.principalId === right.principalId;
}
