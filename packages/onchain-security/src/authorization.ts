/**
 * @payswap/onchain-security — onchain authorization: the CONSTRUCTION
 * contracts (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-security/src/authorization.ts, split for the
 * ≤400-line law).
 *
 * EXTENDS the trust-lane signed-approval artifact model (pinned
 * structurally in pins/authorization-wire.ts) — it does not replace it:
 * `OnchainApprovalScope` narrows the trust `ApprovalScope` with the full
 * onchain binding set (chain, asset, amount, destination, spender/
 * approval changes, route, protocol identity, expected-state diff,
 * settlement instruction), and `OnchainAuthorizationArtifact` narrows the
 * trust `SignedApprovalArtifact`. A signed approval artifact — not a chat
 * message, not an agent's claim — is the ONLY approval authority (INV-5).
 *
 * The ONLY construction path is `TrustedApprovalSurface.approve()`:
 *
 * - it re-verifies the request's content hash;
 * - it RE-RUNS the deterministic gates with the current policy and
 *   security state and refuses to mint anything unless they currently say
 *   ALLOW (a BLOCK or UNKNOWN can never be approved into authority, and a
 *   passing simulation alone can never mint an artifact — INV-11 enforced
 *   here by construction);
 * - the approving principal must differ from the requesting principal (an
 *   agent can never approve its own request);
 * - the signature comes from a `TrustedSurfaceSigner` port implemented at
 *   the trusted surface (UI/wallet) — never in agent context.
 */

import type {
  ApprovalScope,
  AuthorizationRequest,
  Principal,
  ResourceRef,
} from "./pins/index.ts";
import { compareAmounts, principalRef } from "./pins/index.ts";
import type { GateDecision, OnchainSecurityPolicy, OnchainSecurityState } from "./gates-policy.ts";
import { evaluateOnchainWriteGates } from "./gates.ts";
import type { ExpectedStateDiff } from "./diff.ts";
import type { PreparedWrite } from "./write-intent.ts";
import { assertNoSecretMaterial } from "./secrets.ts";
import { contentDigest } from "./digest.ts";
import { onchainApprovalSigningPayload } from "./authorization-verify.ts";
import type {
  ApprovalChangeRequest,
  AssetIdentity,
  ChainRef,
  ProtocolIdentity,
  SettlementInstructionBinding,
} from "./types.ts";
import { sameAsset, sameProtocol } from "./types.ts";

/**
 * The onchain narrowing of the trust ApprovalScope: everything a user
 * approves is bound here. The pre-authorization evaluation dimensions
 * (chain, asset, amount, destination, spender/approval changes, expiry,
 * route, protocol/contract identity) are ALL pinned on the scope.
 */
export interface OnchainApprovalScope extends ApprovalScope {
  readonly chain: ChainRef;
  readonly asset: AssetIdentity;
  readonly amount: { readonly currency: string; readonly minorUnits: string };
  readonly destination?: string;
  readonly approvals: readonly ApprovalChangeRequest[];
  readonly routeHash: string;
  readonly protocol?: ProtocolIdentity;
  readonly expectedStateDiffDigest: string;
  readonly writeDigest: string;
  readonly settlementInstruction?: SettlementInstructionBinding;
  readonly expiry: number;
}

/**
 * A signed onchain authorization artifact (INV-5): identifies principal,
 * agent, scope (onchain-narrowed), expiry and request hash, plus the
 * trusted surface that minted it and the network epoch at issuance (an
 * epoch advance voids it at verification — the security-epoch linkage).
 */
export interface OnchainAuthorizationArtifact {
  /** Canonical principal ref of the approver (the USER). */
  readonly principal: string;
  /** The supervised agent the approval was delegated through, when applicable. */
  readonly agentRef?: string;
  readonly scope: OnchainApprovalScope;
  /** Absolute expiry (ms). */
  readonly expiry: number;
  /** Request hash binding the artifact to one concrete authorization request. */
  readonly requestHash: string;
  /** Opaque signature over the canonical signing payload. */
  readonly signature: string;
  readonly issuedAt: number;
  /** The trusted approval surface that minted this artifact. */
  readonly surfaceRef: string;
  /** Network security epoch at issuance. */
  readonly networkEpochAtIssuance: bigint;
  /** The signing delegation (session key / smart account) executing this, if any. */
  readonly delegationId?: string;
}

/**
 * The agent-facing authorization request: exactly what the trusted surface
 * shows the user — the prepared write, the readable expected-state diff and
 * the deterministic gate outcome. Content-addressed by `requestHash`.
 */
export interface OnchainAuthorizationRequest {
  readonly requestId: string;
  /** The principal requesting execution (usually the agent). */
  readonly principal: Principal;
  readonly write: PreparedWrite;
  readonly expectedDiff: ExpectedStateDiff;
  readonly gateDecision: GateDecision;
  readonly requestHash: string;
  readonly requestedAt: number;
}

/**
 * Signer port implemented at the trusted surface (UI/wallet integration).
 * It signs the canonical approval payload for one request and returns an
 * opaque signature. It NEVER runs in agent context, and its inputs/outputs
 * are secret-scanned by the surface (INV-19).
 */
export interface TrustedSurfaceSigner {
  readonly surfaceId: string;
  signApprovalPayload(payload: string, request: OnchainAuthorizationRequest): string;
}

/** The input of the trusted-surface approve() minting path. */
export interface TrustedApprovalInput {
  readonly request: OnchainAuthorizationRequest;
  readonly policy: OnchainSecurityPolicy;
  readonly securityState: OnchainSecurityState;
  readonly approverRef: string;
  readonly expiresAt: number;
  readonly at: number;
  readonly agentRef?: string;
  readonly delegationId?: string;
}

/**
 * The trusted approval surface: the ONLY constructor of
 * OnchainAuthorizationArtifact. approve() fails closed unless the request
 * hash verifies, the deterministic gates CURRENTLY return ALLOW under the
 * supplied policy and security state (BLOCK/UNKNOWN cannot be approved
 * into authority; simulation alone can never mint), the approver is not
 * the requesting principal, the approval expires strictly after issuance
 * and within the write's expiry, and the signer produces a non-empty
 * opaque signature.
 */
export class TrustedApprovalSurface {
  readonly #signer: TrustedSurfaceSigner;
  readonly #minted: string[] = [];

  constructor(signer: TrustedSurfaceSigner) {
    if (signer.surfaceId.length === 0) {
      throw new InvalidAuthorizationError("trusted surface signer requires a surfaceId");
    }
    this.#signer = signer;
  }

  get surfaceId(): string {
    return this.#signer.surfaceId;
  }

  /** Append-only list of minted artifact request-hashes (provenance). */
  mintedArtifacts(): readonly string[] {
    return [...this.#minted];
  }

  /** Did this surface mint the artifact bound to this request hash? */
  minted(requestHash: string): boolean {
    return this.#minted.includes(requestHash);
  }

  approve(input: TrustedApprovalInput): OnchainAuthorizationArtifact {
    const { request, policy, securityState, at } = input;
    assertNoSecretMaterial(input, "trusted-surface approval input");

    // Request integrity: the hash must bind the exact content presented.
    const recomputed = onchainRequestHash({
      requestId: request.requestId,
      requestedAt: request.requestedAt,
      writeDigest: request.write.writeDigest,
      diffDigest: request.expectedDiff.diffDigest,
      gateDecision: request.gateDecision,
      requestingPrincipalRef: principalRef(request.principal),
    });
    if (recomputed !== request.requestHash) {
      throw new InvalidAuthorizationError(
        `request hash mismatch: '${request.requestHash}' does not bind the presented content (tamper defense)`,
      );
    }

    // The user must see the gate outcome the pipeline actually produced.
    const current = evaluateOnchainWriteGates({
      write: request.write,
      policy,
      securityState,
      at,
    });
    if (current.decision !== request.gateDecision.decision) {
      throw new InvalidAuthorizationError(
        `gate decision drift: the request carries '${request.gateDecision.decision}' but the deterministic gates currently say '${current.decision}'`,
      );
    }
    if (current.decision !== "ALLOW") {
      // A BLOCK can never be approved into authority; an UNKNOWN requires
      // new evidence, never approval. This is the simulation-never-authority
      // (INV-11) and block-never-bypassed (INV-21) enforcement point.
      throw new InvalidAuthorizationError(
        `the trusted surface refuses to mint an authorization for a '${current.decision}' gate decision`,
      );
    }

    // The approver is the USER — an agent never approves itself.
    if (input.approverRef === principalRef(request.principal)) {
      throw new InvalidAuthorizationError(
        `approver '${input.approverRef}' is the requesting principal: an agent can never approve its own request`,
      );
    }
    if (input.approverRef.length === 0) {
      throw new InvalidAuthorizationError("approverRef must be a non-empty principal ref");
    }
    if (input.expiresAt <= at) {
      throw new InvalidAuthorizationError("approval must expire strictly after issuance");
    }
    if (input.expiresAt > request.write.expiry) {
      throw new InvalidAuthorizationError(
        "approval expiry must not outlive the write expiry (attenuation of validity)",
      );
    }
    if (request.write.expiry <= at) {
      throw new InvalidAuthorizationError("the underlying write is already expired");
    }

    const write = request.write;
    const scope: OnchainApprovalScope = Object.freeze({
      actions: [write.action],
      resources: Object.freeze([{ type: "onchain_write", resourceId: write.writeId }]),
      ...(write.transfer !== undefined
        ? { maxAmount: { currency: write.transfer.amount.currency, minorUnits: write.transfer.amount.minorUnits } }
        : {}),
      chain: write.chain,
      asset: write.transfer?.asset ?? write.approvals[0]?.asset ?? { chain: write.chain, assetId: "none", symbol: "NUL" },
      amount:
        write.transfer?.amount ??
        write.approvals[0]?.amount ??
        write.contractCall?.value ??
        { currency: "NUL", minorUnits: "0" },
      ...(write.transfer !== undefined ? { destination: write.transfer.to } : {}),
      approvals: write.approvals,
      routeHash: write.route.routeHash,
      ...(write.protocol !== undefined ? { protocol: write.protocol } : {}),
      expectedStateDiffDigest: request.expectedDiff.diffDigest,
      writeDigest: write.writeDigest,
      ...(write.settlementInstruction !== undefined
        ? { settlementInstruction: write.settlementInstruction }
        : {}),
      expiry: write.expiry,
    });

    const artifact: OnchainAuthorizationArtifact = Object.freeze({
      principal: input.approverRef,
      ...(input.agentRef !== undefined ? { agentRef: input.agentRef } : {}),
      scope,
      expiry: input.expiresAt,
      requestHash: request.requestHash,
      signature: "",
      issuedAt: at,
      surfaceRef: this.#signer.surfaceId,
      networkEpochAtIssuance: securityState.networkEpoch,
      ...(input.delegationId !== undefined ? { delegationId: input.delegationId } : {}),
    });

    const payload = onchainApprovalSigningPayload(artifact);
    const signature = this.#signer.signApprovalPayload(payload, request);
    if (signature.length === 0) {
      throw new InvalidAuthorizationError("the trusted surface signer returned an empty signature");
    }
    const signed: OnchainAuthorizationArtifact = Object.freeze({
      ...artifact,
      signature,
    });
    assertNoSecretMaterial(signed, "onchain authorization artifact");
    this.#minted.push(request.requestHash);
    return signed;
  }
}

// ---------------------------------------------------------------------------
// Implementation (request construction + trust-plane projection)
// ---------------------------------------------------------------------------

/** Raised on invalid authorization construction/verification input (fail closed). */
export class InvalidAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuthorizationError";
  }
}

/** Canonical request hash binding write + diff + decision + principal. */
export function onchainRequestHash(input: {
  readonly requestId: string;
  readonly requestedAt: number;
  readonly writeDigest: string;
  readonly diffDigest: string;
  readonly gateDecision: GateDecision;
  readonly requestingPrincipalRef: string;
}): string {
  return contentDigest({
    requestId: input.requestId,
    requestedAt: input.requestedAt,
    writeDigest: input.writeDigest,
    diffDigest: input.diffDigest,
    gateDecision: input.gateDecision,
    requestingPrincipalRef: input.requestingPrincipalRef,
  });
}

/** Build (validate + secret-scan + hash) an agent-facing authorization request. */
export function buildAuthorizationRequest(input: {
  readonly requestId: string;
  readonly principal: Principal;
  readonly write: PreparedWrite;
  readonly expectedDiff: ExpectedStateDiff;
  readonly gateDecision: GateDecision;
  readonly requestedAt: number;
}): OnchainAuthorizationRequest {
  if (input.requestId.length === 0) {
    throw new InvalidAuthorizationError("requestId must be a non-empty string");
  }
  if (!Number.isInteger(input.requestedAt) || input.requestedAt < 0) {
    throw new InvalidAuthorizationError("requestedAt must be a non-negative integer (ms)");
  }
  if (input.expectedDiff.diffDigest === undefined || input.expectedDiff.diffDigest.length === 0) {
    throw new InvalidAuthorizationError("expectedDiff must be content-addressed");
  }
  const request: OnchainAuthorizationRequest = Object.freeze({
    requestId: input.requestId,
    principal: input.principal,
    write: input.write,
    expectedDiff: input.expectedDiff,
    gateDecision: input.gateDecision,
    requestHash: onchainRequestHash({
      requestId: input.requestId,
      requestedAt: input.requestedAt,
      writeDigest: input.write.writeDigest,
      diffDigest: input.expectedDiff.diffDigest,
      gateDecision: input.gateDecision,
      requestingPrincipalRef: principalRef(input.principal),
    }),
    requestedAt: input.requestedAt,
  });
  assertNoSecretMaterial(request, "onchain authorization request");
  return request;
}

/** Adapt an onchain request to the trust-plane AuthorizationRequest shape. */
export function asTrustAuthorizationRequest(request: OnchainAuthorizationRequest): AuthorizationRequest {
  const write = request.write;
  const resource: ResourceRef = { type: "onchain_write", resourceId: write.writeId };
  return {
    principal: request.principal,
    action: write.action,
    resource,
    context: {
      ...(write.transfer !== undefined ? { amount: write.transfer.amount } : {}),
      rail: write.chain,
      ...(write.transfer !== undefined ? { beneficiary: write.transfer.to } : {}),
    },
    requestHash: request.requestHash,
    requestedAt: request.requestedAt,
  };
}
