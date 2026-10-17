/**
 * @payswap/onchain-security — onchain authorization: the VERIFICATION
 * contracts (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-security/src/authorization.ts, split for the
 * ≤400-line law).
 *
 * Verification is a three-stage fail-closed pipeline over a minted
 * artifact: stage 1 composes the trust-plane checks (signature presence,
 * expiry, request-hash binding, principal/agent binding, action/resource/
 * amount scope) verbatim; stage 2 verifies every onchain binding (the
 * artifact's scope must bind EXACTLY the request's write); stage 3
 * verifies epoch, trusted-surface provenance and delegation liveness.
 * The first violation fails closed with the exact reason recorded.
 */

import type { OnchainAuthorizationArtifact, OnchainAuthorizationRequest, TrustedApprovalSurface } from "./authorization.ts";
import type { OnchainSecurityState } from "./gates-policy.ts";
import type { SigningDelegation, SigningDelegationRegistry } from "./delegation.ts";
import { delegationCoversWrite } from "./delegation.ts";
import { compareAmounts, principalRef } from "./pins/index.ts";
import { approvalSigningPayload } from "./pins/index.ts";
import { assertNoSecretMaterial } from "./secrets.ts";
import type { ApprovalChangeRequest } from "./types.ts";
import { sameAsset, sameProtocol } from "./types.ts";

/** Every reason a signed onchain authorization can fail verification. */
export type OnchainAuthorizationReason =
  | "secret_material_detected"
  | "missing_signature"
  | "expired"
  | "request_hash_mismatch"
  | "principal_mismatch"
  | "action_out_of_scope"
  | "resource_out_of_scope"
  | "amount_currency_mismatch"
  | "amount_exceeds_approval"
  | "unregistered_surface"
  | "stale_network_epoch"
  | "chain_mismatch"
  | "asset_mismatch"
  | "amount_mismatch"
  | "destination_mismatch"
  | "approval_mismatch"
  | "route_mismatch"
  | "protocol_identity_mismatch"
  | "expected_diff_mismatch"
  | "write_digest_mismatch"
  | "settlement_instruction_mismatch"
  | "write_expiry_mismatch"
  | "delegation_required"
  | "delegation_unknown"
  | "delegation_revoked"
  | "delegation_expired"
  | "delegation_scope_mismatch"
  | "malformed_artifact";

/** The verification outcome: valid with evidence, or invalid with reason. */
export type OnchainAuthorizationVerification =
  | { readonly valid: true; readonly evidenceRefs: readonly string[] }
  | { readonly valid: false; readonly reason: OnchainAuthorizationReason; readonly detail: string };

/** The dependencies verification consults (current security state + registries). */
export interface OnchainAuthorizationVerificationDeps {
  readonly securityState: OnchainSecurityState;
  readonly delegationRegistry?: SigningDelegationRegistry;
  readonly trustedSurfaces?: readonly TrustedApprovalSurface[];
}

/** Type-only re-export for the request/artifact pair (verification input). */
export type { OnchainAuthorizationArtifact, OnchainAuthorizationRequest };

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function approvalsEqual(a: readonly ApprovalChangeRequest[], b: readonly ApprovalChangeRequest[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const key = (approval: ApprovalChangeRequest) =>
    `${approval.asset.chain}|${approval.asset.assetId}|${approval.owner}|${approval.spender}|${approval.amount.currency}|${approval.amount.minorUnits}|${approval.unlimited}`;
  const sortedA = a.map(key).sort();
  const sortedB = b.map(key).sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

/**
 * Verify a signed onchain authorization artifact against the request it
 * claims to authorize, at instant `at`, with the CURRENT security state
 * (epoch binding) and optional delegation registry + trusted-surface
 * provenance.
 *
 * Stage 1 composes the trust-plane checks verbatim (signature presence,
 * expiry, request-hash binding, principal/agent binding, action/resource/
 * amount scope). Stage 2 verifies every onchain binding. Stage 3 verifies
 * epoch, surface provenance and delegation liveness. Fail closed on the
 * first violation, with the exact reason recorded.
 */
export function verifyOnchainAuthorization(
  artifact: OnchainAuthorizationArtifact,
  request: OnchainAuthorizationRequest,
  at: number,
  deps: OnchainAuthorizationVerificationDeps,
): OnchainAuthorizationVerification {
  // Stage 0: the artifact itself must be structurally sound and must not
  // smuggle secret material. Malformed shapes fail closed, never crash.
  if (!isWellFormedArtifact(artifact)) {
    return { valid: false, reason: "malformed_artifact", detail: "artifact does not carry the required scope/identity fields" };
  }
  try {
    assertNoSecretMaterial(artifact, "onchain authorization artifact");
  } catch {
    return { valid: false, reason: "secret_material_detected", detail: "artifact carries secret-shaped material" };
  }

  // Stage 1: trust-plane verification, composed verbatim.
  const trustVerification = trustVerifyCompat(artifact, request, at);
  if (trustVerification !== undefined) {
    return trustVerification;
  }

  // Stage 2: onchain bindings — the artifact's scope must bind EXACTLY the
  // request's write (every pre-authorization dimension).
  const write = request.write;
  const scope = artifact.scope;
  const evidence = [
    `artifact:${artifact.requestHash}`,
    `surface:${artifact.surfaceRef}`,
    `write:${write.writeDigest}`,
  ];

  if (scope.chain !== write.chain) {
    return { valid: false, reason: "chain_mismatch", detail: `artifact binds chain ${scope.chain}, write is ${write.chain}` };
  }
  if (write.transfer !== undefined) {
    if (!sameAsset(scope.asset, write.transfer.asset)) {
      return { valid: false, reason: "asset_mismatch", detail: "artifact asset identity differs from the write" };
    }
    if (
      scope.amount.currency !== write.transfer.amount.currency ||
      compareAmounts(scope.amount, write.transfer.amount) !== 0
    ) {
      return { valid: false, reason: "amount_mismatch", detail: "artifact amount differs from the write amount" };
    }
    if (scope.destination !== write.transfer.to) {
      return { valid: false, reason: "destination_mismatch", detail: `artifact binds destination ${scope.destination ?? "-"}, write sends to ${write.transfer.to}` };
    }
  }
  if (!approvalsEqual(scope.approvals, write.approvals)) {
    return { valid: false, reason: "approval_mismatch", detail: "artifact approval set differs from the write approval set" };
  }
  if (scope.routeHash !== write.route.routeHash) {
    return { valid: false, reason: "route_mismatch", detail: "artifact route hash differs from the write route" };
  }
  if (write.protocol !== undefined && (scope.protocol === undefined || !sameProtocol(scope.protocol, write.protocol))) {
    return { valid: false, reason: "protocol_identity_mismatch", detail: "artifact protocol identity differs from the write" };
  }
  if (scope.expectedStateDiffDigest !== request.expectedDiff.diffDigest) {
    return { valid: false, reason: "expected_diff_mismatch", detail: "artifact binds a different expected-state diff than the request presents" };
  }
  if (scope.writeDigest !== write.writeDigest) {
    return { valid: false, reason: "write_digest_mismatch", detail: "artifact binds a different write payload" };
  }
  if (scope.expiry !== write.expiry) {
    return { valid: false, reason: "write_expiry_mismatch", detail: "artifact write expiry differs from the write" };
  }
  if (
    (scope.settlementInstruction?.instructionId ?? undefined) !==
    (write.settlementInstruction?.instructionId ?? undefined)
  ) {
    return { valid: false, reason: "settlement_instruction_mismatch", detail: "artifact settlement instruction binding differs" };
  }

  // Stage 3: epoch, provenance, delegation.
  if (artifact.networkEpochAtIssuance < deps.securityState.networkEpoch) {
    return {
      valid: false,
      reason: "stale_network_epoch",
      detail: `artifact issued at network epoch ${artifact.networkEpochAtIssuance.toString()}, current epoch ${deps.securityState.networkEpoch.toString()} (security-epoch linkage)`,
    };
  }
  if (deps.trustedSurfaces !== undefined) {
    const minting = deps.trustedSurfaces.some(
      (surface) => surface.surfaceId === artifact.surfaceRef && surface.minted(artifact.requestHash),
    );
    if (!minting) {
      return { valid: false, reason: "unregistered_surface", detail: `artifact was not minted by a registered trusted surface (${artifact.surfaceRef})` };
    }
  }
  if (artifact.delegationId !== undefined) {
    if (deps.delegationRegistry === undefined) {
      return { valid: false, reason: "delegation_required", detail: "artifact names a delegation but no registry was supplied (fail closed)" };
    }
    const delegation: SigningDelegation | undefined = deps.delegationRegistry.lookup(artifact.delegationId);
    const status = deps.delegationRegistry.status(artifact.delegationId, at);
    if (status === "UNKNOWN") {
      return { valid: false, reason: "delegation_unknown", detail: `delegation '${artifact.delegationId}' was never issued` };
    }
    if (status === "REVOKED") {
      return { valid: false, reason: "delegation_revoked", detail: `delegation '${artifact.delegationId}' is revoked` };
    }
    if (status === "EXPIRED") {
      return { valid: false, reason: "delegation_expired", detail: `delegation '${artifact.delegationId}' expired` };
    }
    if (delegation === undefined || !delegationCoversWrite(delegation, write)) {
      return { valid: false, reason: "delegation_scope_mismatch", detail: "the delegation's scope does not cover this write (attenuated authority)" };
    }
    evidence.push(`delegation:${artifact.delegationId}`);
  }

  return { valid: true, evidenceRefs: Object.freeze(evidence) };
}

function isWellFormedArtifact(artifact: OnchainAuthorizationArtifact): boolean {
  const scope = artifact.scope as Partial<import("./authorization.ts").OnchainApprovalScope> | undefined;
  return (
    typeof artifact.principal === "string" &&
    artifact.principal.length > 0 &&
    typeof artifact.requestHash === "string" &&
    typeof artifact.signature === "string" &&
    typeof artifact.issuedAt === "number" &&
    typeof artifact.expiry === "number" &&
    typeof artifact.surfaceRef === "string" &&
    typeof artifact.networkEpochAtIssuance === "bigint" &&
    scope !== undefined &&
    Array.isArray(scope.actions) &&
    Array.isArray(scope.resources) &&
    Array.isArray(scope.approvals) &&
    typeof scope.chain === "string" &&
    typeof scope.routeHash === "string" &&
    typeof scope.expectedStateDiffDigest === "string" &&
    typeof scope.writeDigest === "string" &&
    typeof scope.expiry === "number" &&
    scope.asset !== undefined &&
    typeof scope.asset.chain === "string" &&
    scope.amount !== undefined &&
    typeof scope.amount.currency === "string"
  );
}

function trustVerifyCompat(
  artifact: OnchainAuthorizationArtifact,
  request: OnchainAuthorizationRequest,
  at: number,
): OnchainAuthorizationVerification | undefined {
  // Same order as the trust lane's approval-artifact verification, mapped
  // onto onchain reasons.
  if (artifact.signature.length === 0) {
    return { valid: false, reason: "missing_signature", detail: "artifact carries no signature" };
  }
  if (at >= artifact.expiry) {
    return { valid: false, reason: "expired", detail: `artifact expired at ${artifact.expiry} (evaluation at ${at})` };
  }
  if (artifact.requestHash !== request.requestHash) {
    return { valid: false, reason: "request_hash_mismatch", detail: "artifact request hash does not bind this request" };
  }
  if (artifact.agentRef !== undefined && principalRef(request.principal) !== artifact.agentRef) {
    return { valid: false, reason: "principal_mismatch", detail: "artifact agent binding differs from the requesting principal" };
  }
  if (!artifact.scope.actions.includes(request.write.action)) {
    return { valid: false, reason: "action_out_of_scope", detail: `action '${request.write.action}' outside artifact scope` };
  }
  const resourceInScope = artifact.scope.resources.some(
    (scoped) => scoped.type === "onchain_write" && scoped.resourceId === request.write.writeId,
  );
  if (!resourceInScope) {
    return { valid: false, reason: "resource_out_of_scope", detail: "write id outside artifact resource scope" };
  }
  const maxAmount = artifact.scope.maxAmount;
  const requestAmount = request.write.transfer?.amount;
  if (maxAmount !== undefined && requestAmount !== undefined) {
    if (requestAmount.currency !== maxAmount.currency) {
      return { valid: false, reason: "amount_currency_mismatch", detail: "approval currency differs from request amount currency" };
    }
    if (compareAmounts(requestAmount, maxAmount) > 0) {
      return { valid: false, reason: "amount_exceeds_approval", detail: "request amount exceeds the approved maximum" };
    }
  }
  return undefined;
}

/**
 * Canonical signing payload for an onchain authorization artifact: the
 * trust plane's canonical approval payload EXTENDED with every onchain
 * binding. The trusted surface signs exactly this serialization.
 */
export function onchainApprovalSigningPayload(artifact: OnchainAuthorizationArtifact): string {
  const trustPayload = approvalSigningPayload(artifact);
  const scope = artifact.scope;
  const parts = [
    trustPayload,
    `chain:${scope.chain}`,
    `asset:${scope.asset.chain}/${scope.asset.assetId}/${scope.asset.symbol}`,
    `amount:${scope.amount.currency}:${scope.amount.minorUnits}`,
    scope.destination === undefined ? "destination:-" : `destination:${scope.destination}`,
    `approvals:${scope.approvals
      .map((a) => `${a.asset.assetId}|${a.owner}|${a.spender}|${a.amount.currency}:${a.amount.minorUnits}|${a.unlimited ? "U" : "F"}`)
      .join(",")}`,
    `routeHash:${scope.routeHash}`,
    scope.protocol === undefined
      ? "protocol:-"
      : `protocol:${scope.protocol.protocolId}@${scope.protocol.version}:${scope.protocol.contract.contractAddress}:${scope.protocol.contract.sourceHash}`,
    `expectedDiff:${scope.expectedStateDiffDigest}`,
    `writeDigest:${scope.writeDigest}`,
    scope.settlementInstruction === undefined
      ? "settlement:-"
      : `settlement:${scope.settlementInstruction.instructionId}:${scope.settlementInstruction.instructionDigest}`,
    `writeExpiry:${scope.expiry}`,
    `surface:${artifact.surfaceRef}`,
    `networkEpoch:${artifact.networkEpochAtIssuance.toString()}`,
    artifact.delegationId === undefined ? "delegation:-" : `delegation:${artifact.delegationId}`,
  ];
  return parts.join("|");
}
