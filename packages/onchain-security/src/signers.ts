/**
 * @payswap/onchain-security — signer adapters, signing requests and the
 * broadcast handoff: the contracts (R2-W2; PORT+ADAPT of
 * payswap.org@8a735bf packages/onchain-security/src/signers.ts).
 *
 * The kernel NEVER broadcasts. "No agent may directly broadcast" is
 * structural: the pipeline's terminal success state produces a
 * SigningRequest (only from RECHECKED, only bound to a valid artifact and
 * recheck evidence), and the request is handed to a SignerAdapter — the
 * trusted-surface/wallet integration implemented by the onchain adapter
 * SDK (Work Order P4-W3). Chain-family signing semantics (EIP-712 typed
 * data, ERC-1271 contract signatures) live in adapter modules
 * (./adapters/*), never in core contracts (INV-17 provider-neutrality).
 *
 * Deterministic only: payload building is pure; the kernel consults no
 * clock (callers pass `at`) and performs no I/O.
 */

import type { OnchainAuthorizationArtifact, OnchainAuthorizationRequest } from "./authorization.ts";
import type { RecheckOutcome } from "./recheck.ts";
import type { ChainRef, SettlementInstructionBinding } from "./types.ts";
import { validateAddress } from "./types.ts";
import { assertNoSecretMaterial } from "./secrets.ts";

/**
 * The request handed to a signer adapter at the trusted surface. It is
 * AGENT-FACING SAFE: it carries only public bindings — chain, signer
 * address, opaque payload, authorization reference, recheck reference and
 * deadline. Never key material (secret-scanned at construction, INV-19).
 */
export interface SigningRequest {
  readonly requestId: string;
  readonly chain: ChainRef;
  /** The address that must sign (from the authorized write). */
  readonly signerAddress: string;
  /** Opaque signing payload built by the adapter (e.g. EIP-712 typed data). */
  readonly payload: string;
  /** Request hash of the authorization artifact this executes. */
  readonly authorizationRef: string;
  /** Reference to the passing recheck evidence. */
  readonly recheckRef: string;
  readonly settlementInstruction?: SettlementInstructionBinding;
  /** Must be submitted to the chain before this instant. */
  readonly deadline: number;
  readonly writeDigest: string;
}

/**
 * What a signer adapter returns after submitting at the trusted surface:
 * opaque external references plus evidence linkage. The submitted
 * transaction is NOT financial finality (INV-11/INV-5) — finality comes
 * from observation/evidence/reconciliation, never from this receipt.
 */
export interface BroadcastHandoffReceipt {
  readonly requestRef: string;
  readonly submittedAt: number;
  /** Opaque external transaction/submission reference. */
  readonly externalRef: string;
  readonly evidenceRefs: readonly string[];
}

/**
 * The signer adapter port (implemented by the onchain adapter SDK and the
 * trusted-surface wallet integration). `buildSigningPayload` is PURE and
 * deterministic; submission is invoked ONLY by the trusted-surface wiring
 * — never by an agent and never by this kernel's pipeline.
 */
export interface SignerAdapter {
  readonly adapterId: string;
  /** Chains this adapter can sign for (exact refs or `family:*`). */
  readonly supportedChains: readonly ChainRef[];
  /** Pure payload builder for one authorized, rechecked write. */
  buildSigningPayload(request: {
    readonly artifact: OnchainAuthorizationArtifact;
    readonly request: OnchainAuthorizationRequest;
  }): string;
}

/** Everything the signing-request builder consumes. */
export interface BuildSigningRequestInput {
  readonly requestId: string;
  readonly artifact: OnchainAuthorizationArtifact;
  readonly request: OnchainAuthorizationRequest;
  readonly recheck: RecheckOutcome;
  readonly adapter: SignerAdapter;
  readonly at: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Raised on invalid signing-request construction (fail closed). */
export class InvalidSigningRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSigningRequestError";
  }
}

/** Does this adapter support signing on `chain`? */
export function adapterSupportsChain(adapter: SignerAdapter, chain: ChainRef): boolean {
  return adapter.supportedChains.some((supported) => {
    if (supported === chain) {
      return true;
    }
    if (supported.endsWith(":*")) {
      return chain.startsWith(supported.slice(0, -1));
    }
    return false;
  });
}

/**
 * Build the signing request for an authorized, rechecked write. Only the
 * pipeline (from RECHECKED state) calls this — direct construction from
 * arbitrary inputs is impossible because the recheck outcome and artifact
 * must be supplied by the pipeline's own state.
 */
export function buildSigningRequest(input: BuildSigningRequestInput): SigningRequest {
  if (input.requestId.length === 0) {
    throw new InvalidSigningRequestError("requestId must be a non-empty string");
  }
  if (input.recheck.outcome !== "RECHECK_OK") {
    throw new InvalidSigningRequestError(
      "a signing request can only be built from a PASSING pre-broadcast recheck (stale-state invalidation)",
    );
  }
  const write = input.request.write;
  if (!adapterSupportsChain(input.adapter, write.chain)) {
    throw new InvalidSigningRequestError(
      `adapter '${input.adapter.adapterId}' does not support chain '${write.chain}'`,
    );
  }
  const signerAddress = write.transfer?.from ?? write.approvals[0]?.owner;
  if (signerAddress === undefined) {
    throw new InvalidSigningRequestError("the authorized write carries no signer address");
  }
  validateAddress(signerAddress, "signerAddress");
  if (write.expiry <= input.at) {
    throw new InvalidSigningRequestError("the authorized write expired before handoff");
  }
  if (input.artifact.expiry <= input.at) {
    throw new InvalidSigningRequestError("the authorization artifact expired before handoff");
  }

  const payload = input.adapter.buildSigningPayload({
    artifact: input.artifact,
    request: input.request,
  });
  if (payload.length === 0) {
    throw new InvalidSigningRequestError("the adapter produced an empty signing payload");
  }

  const signingRequest: SigningRequest = Object.freeze({
    requestId: input.requestId,
    chain: write.chain,
    signerAddress,
    payload,
    authorizationRef: input.artifact.requestHash,
    recheckRef: contentRefOfRecheck(input.recheck),
    ...(write.settlementInstruction !== undefined
      ? { settlementInstruction: write.settlementInstruction }
      : {}),
    deadline: write.expiry,
    writeDigest: write.writeDigest,
  });
  assertNoSecretMaterial(signingRequest, "signing request");
  return signingRequest;
}

function contentRefOfRecheck(recheck: RecheckOutcome): string {
  return recheck.evidenceRefs[0] ?? "recheck:ok";
}
