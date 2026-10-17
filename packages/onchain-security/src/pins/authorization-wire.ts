/**
 * @payswap/onchain-security — structural pin: the trust-plane
 * authorization wire (R2-W2).
 *
 * LAYER LAW: zero sibling imports. The authorization/approval model is
 * owned by the trust lane (packages/trust/src/{authorization,
 * approval-artifacts}.ts, P1-W3). This file pins the contract shapes the
 * onchain authorization surface (src/authorization.ts) extends:
 *
 * - `ApprovalScope` — verbatim the trust lane's shape (actions, resources,
 *   optional maxAmount): the onchain scope NARROWS it.
 * - `ResourceRef` — verbatim { type, resourceId? }.
 * - `SignedApprovalArtifact` — the signed-approval wire this package's
 *   `OnchainAuthorizationArtifact` extends: principal (the approver's
 *   canonical ref), optional agent binding, scope, expiry, request hash,
 *   opaque signature, issuance instant. Structurally reconciled with the
 *   3.0 trust `ApprovalArtifact` field-for-field:
 *     approvedBy↔principal, onBehalfOfAgent↔agentRef, expiresAt↔expiry,
 *     securityEpoch↔networkEpochAtIssuance (carried by the onchain
 *     narrowing), issuedAt↔issuedAt. The signature is an OPAQUE string:
 *   cryptographic verification belongs to the trusted surface, never
 *   here (INV-19 — no key material crosses this boundary).
 * - `AuthorizationRequest` / `AuthorizationContext` — verbatim the trust
 *   lane's evaluation-request shape, so `asTrustAuthorizationRequest`
 *   projects an onchain request onto the trust plane without conversion
 *   drift.
 * - `approvalSigningPayload` — the canonical trust-plane payload
 *   serialization (verbatim field order): the onchain signing payload
 *   EXTENDS it, so a wallet verifying the trust payload accepts the
 *   onchain payload's trust prefix unchanged.
 */

import type { AmountSpec } from "./money.ts";
import type { Principal } from "./principal.ts";

/** Concrete resource reference presented in an authorization request. */
export interface ResourceRef {
  readonly type: string;
  readonly resourceId?: string;
}

/** Context of an authorization evaluation (amount, rail, beneficiary...). */
export interface AuthorizationContext {
  readonly amount?: AmountSpec;
  readonly rail?: string;
  readonly country?: string;
  readonly beneficiary?: string;
}

/** A request for authorization of one action on one resource (trust wire). */
export interface AuthorizationRequest {
  readonly principal: Principal;
  readonly action: string;
  readonly resource: ResourceRef;
  readonly context: AuthorizationContext;
  readonly requestHash: string;
  readonly requestedAt: number;
}

/** What a signed approval authorizes (trust wire; the onchain scope narrows it). */
export interface ApprovalScope {
  readonly actions: readonly string[];
  readonly resources: readonly ResourceRef[];
  readonly maxAmount?: AmountSpec;
}

/**
 * The signed-approval wire: a signed approval artifact is the ONLY
 * approval authority (never a chat message, never an agent claim); the
 * signature is opaque evidence, never verified in this package.
 */
export interface SignedApprovalArtifact {
  /** Canonical principal ref of the approver (trust `approvedBy`). */
  readonly principal: string;
  /** The supervised agent the approval was delegated through, when applicable. */
  readonly agentRef?: string;
  readonly scope: ApprovalScope;
  /** Absolute expiry (ms). */
  readonly expiry: number;
  /** Request hash binding the artifact to one concrete authorization request. */
  readonly requestHash: string;
  /** Opaque signature over the canonical signing payload. */
  readonly signature: string;
  readonly issuedAt: number;
}

/**
 * Canonical trust-plane signing payload (verbatim serialization). The
 * onchain payload (src/authorization.ts `onchainApprovalSigningPayload`)
 * is this string EXTENDED with every onchain binding — one auditable
 * prefix, no re-serialization drift.
 */
export function approvalSigningPayload(artifact: SignedApprovalArtifact): string {
  const parts = [
    `principal:${artifact.principal}`,
    artifact.agentRef === undefined ? "agent:-" : `agent:${artifact.agentRef}`,
    `actions:${artifact.scope.actions.join(",")}`,
    `resources:${artifact.scope.resources
      .map(
        (resource) =>
          `${resource.type}${resource.resourceId === undefined ? "" : ":" + resource.resourceId}`,
      )
      .join(",")}`,
    artifact.scope.maxAmount === undefined
      ? "maxAmount:-"
      : `maxAmount:${artifact.scope.maxAmount.currency}:${artifact.scope.maxAmount.minorUnits}`,
    `expiry:${artifact.expiry}`,
    `requestHash:${artifact.requestHash}`,
    `issuedAt:${artifact.issuedAt}`,
    `signature:${artifact.signature}`,
  ];
  return parts.join("|");
}
