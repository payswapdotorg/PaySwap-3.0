/**
 * Approval artifacts (P1-W3): the typed, immutable EVIDENCE records of what
 * a human principal approved (adapted from payswap.org@8a735bf
 * packages/trust/src/authorization.ts artifact section, extended per the
 * P1-W3 work order).
 *
 * An ApprovalArtifact records: WHAT was approved (scope: actions, resources,
 * amount bound), BY WHICH principal (approver), UNDER WHICH mandate
 * (mandateRef), AT WHICH security epoch (securityEpoch — the network epoch
 * at issuance; TB-5: advancement past the stamp invalidates the artifact
 * deterministically), WITH WHICH PROOF LEVEL the approval was obtained, and
 * — for evidence lineage — opaque references to external effects it covers
 * (never executed or verified here).
 *
 * LAWS:
 * - TB-4: a signed approval artifact (not a chat message, not an agent's
 *   claim) is the only approval authority; it is IMMUTABLE once issued.
 * - Artifacts are evidence records only: `effectRefs` are opaque strings;
 *   this module never executes, resolves or verifies effects.
 * - The `signature` is an opaque non-empty string. Cryptographic signature
 *   VERIFICATION belongs to the platform/capability lanes (trusted approval
 *   surface), NOT to the trust plane's identity/authority model — consistent
 *   with the credential boundary (raw key material never enters this
 *   package; INV-19).
 */

import type { MandateRef } from "./principal.ts";
import type { ProofLevel, ResourceRef } from "./mandate.ts";
import type { AmountSpec } from "./amount-spec.ts";
import { PROOF_LEVELS } from "./mandate.ts";
import { validateAmountSpec } from "./amount-spec.ts";
import { compareCanonicalMinorUnits } from "./minor-units.ts";
import type { SecurityEpochAuthority } from "./security-epoch.ts";

/** What an approval artifact authorizes (ported ApprovalScope). */
export interface ApprovalScope {
  readonly actions: readonly string[];
  readonly resources: readonly ResourceRef[];
  readonly maxAmount?: AmountSpec;
}

/** The typed approval artifact (evidence record; immutable once issued). */
export interface ApprovalArtifact {
  /** Artifact identity (unique within the issuing records). */
  readonly id: string;
  /** Principal reference of the approver (canonical principalRef form). */
  readonly approvedBy: string;
  /** Supervised agent the approval was delegated through, when applicable. */
  readonly onBehalfOfAgent?: string;
  /** The mandate under whose escalation/authority this approval was issued. */
  readonly mandateRef: MandateRef;
  /** Network security epoch at issuance (linkage stamp, TB-5). */
  readonly securityEpoch: bigint;
  /** Proof level satisfied when the approval was obtained. */
  readonly proofLevel: ProofLevel;
  readonly scope: ApprovalScope;
  /** Request hash binding the approval to one concrete authorization request. */
  readonly requestHash: string;
  /** Opaque signature over the canonical signing payload (never verified here). */
  readonly signature: string;
  /** Opaque external effect ids this artifact covers (never executed/verified here). */
  readonly effectRefs: readonly string[];
  readonly issuedAt: number;
  readonly expiresAt: number;
}

/** Input to issueApprovalArtifact (same fields; the artifact is frozen on issue). */
export type ApprovalArtifactInput = ApprovalArtifact;

/** Raised on structurally invalid artifact issue attempts (fail closed). */
export class ApprovalArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalArtifactError";
  }
}

function requireNonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    throw new ApprovalArtifactError(`${label} must not be empty`);
  }
}

/** Deep-freeze helper: artifacts are immutable evidence once issued (TB-4). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Issue an approval artifact: validates the shape fail-closed, then returns
 * a DEEP-FROZEN artifact (immutable once issued — any mutation throws in
 * strict mode). Structural validation: identity/approver/mandate/request
 * hash/signature non-empty; proof level known; scope non-empty with valid
 * maxAmount; expiry strictly after issuance; security epoch at genesis or
 * higher.
 */
export function issueApprovalArtifact(input: ApprovalArtifactInput): ApprovalArtifact {
  requireNonEmpty(input.id, "artifact id");
  requireNonEmpty(input.approvedBy, "approvedBy");
  if (input.onBehalfOfAgent !== undefined) {
    requireNonEmpty(input.onBehalfOfAgent, "onBehalfOfAgent");
  }
  requireNonEmpty(input.mandateRef.mandateId, "mandateRef.mandateId");
  if (input.mandateRef.version < 1) {
    throw new ApprovalArtifactError("mandateRef.version must be >= 1");
  }
  if (!(PROOF_LEVELS as readonly string[]).includes(input.proofLevel)) {
    throw new ApprovalArtifactError(`unknown proof level '${input.proofLevel}'`);
  }
  if (input.scope.actions.length === 0) {
    throw new ApprovalArtifactError("approval scope actions must not be empty");
  }
  for (const action of input.scope.actions) {
    requireNonEmpty(action, "scope action");
  }
  if (input.scope.resources.length === 0) {
    throw new ApprovalArtifactError("approval scope resources must not be empty");
  }
  if (input.scope.maxAmount !== undefined) {
    validateAmountSpec(input.scope.maxAmount);
  }
  requireNonEmpty(input.requestHash, "requestHash");
  requireNonEmpty(input.signature, "signature");
  for (const effectRef of input.effectRefs) {
    requireNonEmpty(effectRef, "effectRef");
  }
  if (input.expiresAt <= input.issuedAt) {
    throw new ApprovalArtifactError(
      "approval artifact must expire strictly after it was issued",
    );
  }
  if (input.securityEpoch < 0n) {
    throw new ApprovalArtifactError("securityEpoch must be >= 0 (genesis epoch)");
  }
  return deepFreeze({
    ...input,
    mandateRef: { mandateId: input.mandateRef.mandateId, version: input.mandateRef.version },
    scope: deepFreeze({
      actions: [...input.scope.actions],
      resources: input.scope.resources.map((resource) => ({ ...resource })),
      ...(input.scope.maxAmount === undefined ? {} : { maxAmount: { ...input.scope.maxAmount } }),
    }),
    effectRefs: [...input.effectRefs],
  }) as ApprovalArtifact;
}

/**
 * Canonical signing payload for an approval artifact. The trusted approval
 * surface (platform/capability lanes) signs exactly this serialization;
 * deterministic and total: same artifact, same payload, always.
 */
export function approvalSigningPayload(artifact: ApprovalArtifact): string {
  const parts = [
    `id:${artifact.id}`,
    `approvedBy:${artifact.approvedBy}`,
    artifact.onBehalfOfAgent === undefined
      ? "onBehalfOfAgent:-"
      : `onBehalfOfAgent:${artifact.onBehalfOfAgent}`,
    `mandate:${artifact.mandateRef.mandateId}@${artifact.mandateRef.version}`,
    `securityEpoch:${artifact.securityEpoch}`,
    `proofLevel:${artifact.proofLevel}`,
    `actions:${artifact.scope.actions.join(",")}`,
    `resources:${artifact.scope.resources
      .map((resource) => `${resource.type}${resource.resourceId === undefined ? "" : ":" + resource.resourceId}`)
      .join(",")}`,
    artifact.scope.maxAmount === undefined
      ? "maxAmount:-"
      : `maxAmount:${artifact.scope.maxAmount.currency}:${artifact.scope.maxAmount.minorUnits}`,
    `effectRefs:${artifact.effectRefs.join(",")}`,
    `issuedAt:${artifact.issuedAt}`,
    `expiresAt:${artifact.expiresAt}`,
    `requestHash:${artifact.requestHash}`,
  ];
  return parts.join("|");
}

/** Deterministic artifact digest: identity of the signed evidence record. */
export function approvalArtifactDigest(artifact: ApprovalArtifact): string {
  return `approval-digest:v1:${approvalSigningPayload(artifact)}|signature:${artifact.signature}`;
}

export type ApprovalVerificationReason =
  | "missing_signature"
  | "expired"
  | "request_hash_mismatch"
  | "principal_mismatch"
  | "action_out_of_scope"
  | "resource_out_of_scope"
  | "amount_currency_mismatch"
  | "amount_exceeds_approval"
  | "stale_security_epoch"
  | "invalid_future_epoch_stamp";

export type ApprovalVerification =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: ApprovalVerificationReason };

/** Inputs to verifyApprovalArtifact beyond the artifact and request (deterministic). */
export interface ApprovalVerificationContext {
  /** Evaluation instant (never an ambient clock). */
  readonly now: number;
  /**
   * Network epoch authority. When supplied, the epoch-linkage law is
   * enforced: an artifact whose securityEpoch is below the current network
   * epoch is invalid (stale_security_epoch — TB-5); a stamp above the
   * current epoch is impossible through lawful issuance and fails closed
   * (invalid_future_epoch_stamp).
   */
  readonly networkEpoch?: SecurityEpochAuthority;
}

/** The request an artifact is verified against (subset of AuthorizationRequest). */
export interface ApprovalRequestBinding {
  readonly action: string;
  readonly resource: ResourceRef;
  readonly amount?: AmountSpec;
  /** Canonical principalRef of the acting principal (agent binding check). */
  readonly actingPrincipalRef: string;
}

/**
 * Verify an approval artifact against a request binding (adapted from the
 * old verifyApprovalArtifact; ported binding checks in deterministic order:
 * signature presence, expiry, request-hash binding, supervised-agent
 * binding, action scope, resource scope, amount bound — plus the net-new
 * epoch-linkage check. Cryptographic signature verification itself belongs
 * to the trusted-surface boundary; here the signature is opaque presence.
 */
export function verifyApprovalArtifact(
  artifact: ApprovalArtifact,
  requestHash: string,
  binding: ApprovalRequestBinding,
  context: ApprovalVerificationContext,
): ApprovalVerification {
  if (artifact.signature.length === 0) {
    return { valid: false, reason: "missing_signature" };
  }
  if (context.networkEpoch !== undefined) {
    const current = context.networkEpoch.currentEpoch().value;
    if (artifact.securityEpoch > current) {
      return { valid: false, reason: "invalid_future_epoch_stamp" };
    }
    if (artifact.securityEpoch < current) {
      return { valid: false, reason: "stale_security_epoch" };
    }
  }
  if (context.now >= artifact.expiresAt) {
    return { valid: false, reason: "expired" };
  }
  if (artifact.requestHash !== requestHash) {
    return { valid: false, reason: "request_hash_mismatch" };
  }
  if (artifact.onBehalfOfAgent !== undefined && binding.actingPrincipalRef !== artifact.onBehalfOfAgent) {
    return { valid: false, reason: "principal_mismatch" };
  }
  if (!artifact.scope.actions.includes(binding.action)) {
    return { valid: false, reason: "action_out_of_scope" };
  }
  const resourceInScope = artifact.scope.resources.some(
    (scoped) =>
      scoped.type === binding.resource.type &&
      scoped.resourceId === binding.resource.resourceId,
  );
  if (!resourceInScope) {
    return { valid: false, reason: "resource_out_of_scope" };
  }
  const maxAmount = artifact.scope.maxAmount;
  const requestAmount = binding.amount;
  if (maxAmount !== undefined && requestAmount !== undefined) {
    if (requestAmount.currency !== maxAmount.currency) {
      return { valid: false, reason: "amount_currency_mismatch" };
    }
    if (compareCanonicalMinorUnits(requestAmount.minorUnits, maxAmount.minorUnits) > 0) {
      return { valid: false, reason: "amount_exceeds_approval" };
    }
  }
  return { valid: true };
}
