/**
 * @payswap/execution-graph — AUTHORIZATION PROJECTION contracts (P3-W2,
 * ENCODED LAW 2; ADAPT of payswap.org@8a735bf
 * packages/execution/src/authorization.ts, W3-003).
 *
 * 3.0 RE-AUTHORIZATION (recorded): the old module was an ExecutionGrant
 * AUTHORITY — it ISSUED scoped execution grants. The 3.0 layer law is the
 * opposite: "The financial protocol layer owns real authorization; this
 * package projects/reconciles, never authorizes" (identity law, hard
 * constraint 5). Therefore:
 * - a projection RECORDS what the protocol lane's authorization (opaque
 *   AuthorizationRef, pinned type-only from @payswap/protocol) covers, as
 *   of an explicit instant, against explicit MATERIAL EXECUTION TERMS;
 * - it NEVER grants anything: `canAuthorizeFinancialEffects` is the
 *   structural literal `false`, and the attenuated adapter form carries
 *   `canWriteFinancialState: false` (old INV-C04/F06 law preserved);
 * - LAW 2: when material execution terms change (route, destination,
 *   asset, amount, risk, capability observations — see material-terms),
 *   affected projections are INVALIDATED. An invalidated projection is
 *   terminal: it can never verify CURRENT again; a refreshed projection is
 *   a NEW projection with a NEW id.
 */

import type { ExecutionMode } from '@payswap/capability';
import type { AuthorizationRef, PrincipalRef, TimestampMs } from '@payswap/protocol';
import type {
  MaterialExecutionTerms,
  MaterialTermAxis,
  ProjectionInvalidation,
} from './material-terms-contract.ts';
import type { AuthorizationProjectionId } from './identifiers.ts';

/** The status of an authorization projection at a verification instant. */
export type AuthorizationProjectionStatus =
  /** Projected, unexpired, terms unchanged: usable as CURRENT evidence. */
  'CURRENT'
  /** The validity window passed — expired projections fail closed. */
  | 'EXPIRED'
  /**
   * LAW 2: the material execution terms changed — the projection is
   * INVALIDATED and can never become CURRENT again.
   */
  | 'INVALIDATED'
  /** Not recorded by this index: unresolvable references never vouch. */
  | 'UNKNOWN_PROJECTION';

/** A fail-closed projection verification (never throws for state reasons). */
export type AuthorizationProjectionVerification =
  | { readonly ok: true; readonly status: 'CURRENT'; readonly projection: AuthorizationProjection }
  | {
      readonly ok: false;
      readonly status: AuthorizationProjectionStatus;
      readonly reason?:
        | 'TERMS_CHANGED'
        | 'REQUEST_HASH_MISMATCH'
        | 'INSTANCE_NOT_IN_SCOPE'
        | 'MODE_NOT_IN_SCOPE'
        | 'OBSERVATION_PIN_MISMATCH';
      readonly message: string;
    };

/**
 * A signed approval-artifact LINEAGE view backing a projection issued
 * through an approved flow (old INV-A03 adapted): the projection may not
 * outlive or diverge from the artifact it cites. The artifact itself is
 * owned by the trust lane; only the lineage shape is pinned here.
 */
export interface ApprovalArtifactLineage {
  readonly artifactId: string;
  /** The approving principal (the human/tenant authority). */
  readonly principal: PrincipalRef;
  /** The delegated agent acting under the approval (equals principal when not delegated). */
  readonly agent: PrincipalRef;
  readonly expiresAt: TimestampMs;
  /** The request hash of the exact request the approver saw. */
  readonly requestHash: string;
  /** Reference to the trusted-surface signature backing the artifact. */
  readonly signatureRef: string;
}

/**
 * The authorization PROJECTION record. Structurally NOT an authority:
 * `canAuthorizeFinancialEffects` is the literal `false` — nothing this
 * package exports can construct a projection claiming otherwise.
 */
export interface AuthorizationProjection {
  readonly projectionId: AuthorizationProjectionId;
  /** Structural literal: this record is a projection, never an authority. */
  readonly canAuthorizeFinancialEffects: false;
  /** The protocol-lane authorization this projects (opaque, type-only pin). */
  readonly authorization: AuthorizationRef;
  /** The principal the projection is scoped to (from the authorization). */
  readonly principal: PrincipalRef;
  /** The material execution terms the projection is bound to (LAW 2). */
  readonly materialTerms: MaterialExecutionTerms;
  /** Canonical digest of the material terms (byte-stable binding). */
  readonly termsDigest: string;
  /** Hash binding the projection to one exact execution request. */
  readonly requestHash: string;
  readonly projectedAt: TimestampMs;
  readonly validUntil: TimestampMs;
  /** Present iff the projection cites an approved flow (INV-A03 adapt). */
  readonly approvalArtifact?: ApprovalArtifactLineage;
  /** Recorded invalidation, iff the projection was invalidated (LAW 2). */
  readonly invalidation?: ProjectionInvalidation;
}

/** Input accepted by `projectAuthorization`. */
export interface ProjectAuthorizationInput {
  readonly projectionId: string;
  /** The protocol-lane authorization being projected (opaque wire shape). */
  readonly authorization: AuthorizationRef;
  readonly materialTerms: MaterialExecutionTerms;
  readonly requestHash: string;
  readonly validUntil: TimestampMs;
  readonly projectedAt: TimestampMs;
  /**
   * The principal on whose behalf the projection is made. When an approval
   * artifact lineage is cited, this principal must be a party to the
   * approval (approving principal or delegated agent) — the projection
   * cannot diverge from the approval it cites.
   */
  readonly principalForApproval?: PrincipalRef;
  readonly approvalArtifact?: ApprovalArtifactLineage;
}

/** Input accepted by `verifyProjection`. */
export interface VerifyProjectionInput {
  readonly now: TimestampMs;
  readonly requestHash?: string;
  readonly capabilityInstanceId?: string;
  readonly executionMode?: ExecutionMode;
  /**
   * The CURRENT material terms to check against: any covered axis that
   * changed yields TERMS_CHANGED (the caller should then invalidate).
   */
  readonly currentTerms?: MaterialExecutionTerms;
  /**
   * The latest observation pins (LAW 1/LAW 2 seam): if any pinned
   * observation in the projection is superseded by a NEWER version for the
   * same instance, the projection is stale on the CAPABILITY_OBSERVATIONS
   * axis.
   */
  readonly latestObservationVersions?: readonly {
    readonly instanceId: string;
    readonly observationVersion: number;
  }[];
}

/**
 * The ONLY authority shape an adapter may ever hold: execution-scoped,
 * derived from an authorization projection, and structurally incapable of
 * financial writes — `canWriteFinancialState` is the literal `false`
 * (old INV-C04/INV-F06 law).
 */
export interface AdapterExecutionAuthority {
  readonly authorityKind: 'ADAPTER_EXECUTION_ONLY';
  readonly canWriteFinancialState: false;
  readonly projection: AuthorizationProjection;
}

/**
 * Marker for the financial write authority that ONLY the Financial Protocol
 * Authority holds. Deliberately NOT constructible from anything this
 * package exports: an AdapterExecutionAuthority can never be assigned to it.
 */
export interface FinancialProtocolWriteAuthority {
  readonly canWriteFinancialState: true;
  readonly protocolCommandRef: string;
}

/** Input accepted by `invalidateAffectedProjections` (LAW 2). */
export interface InvalidateAffectedInput {
  /** The axes that changed (a change record's changedAxes). */
  readonly changedAxes: readonly MaterialTermAxis[];
  /** The terms AFTER the change (matched against each projection's terms). */
  readonly currentTerms: MaterialExecutionTerms;
  readonly now: TimestampMs;
  readonly note?: string;
}
