/**
 * @payswap/onchain-adapters — the GENERIC authorize stage (Work Order
 * P4-W3, lane R2-W3; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-adapters/src/lifecycle.ts authorize half).
 *
 * THE ADAPTER NEVER AUTHORIZES; THE KERNEL OWNS AUTHORITY. The stage drives
 * the INJECTED onchain-security kernel port (the 3.0 seam — the old repo
 * hard-imported OnchainWritePipeline; the accepted pattern keeps the
 * sequence semantics and moves the wiring to the composition root) through
 * the full pipeline in dispatch order:
 *
 *   gates → expected diff → authorization request → trusted-surface
 *   artifact → pre-broadcast recheck → signing-request handoff
 *
 * Fail-closed at every step: no deterministic ALLOW, no handoff (a BLOCK
 * can never be overridden); a VOIDED recheck means the authorization is
 * re-requested, never auto-repaired; the handoff is agent-facing-safe
 * (secret-scanned).
 */

import { ValidationError, StaleObservationError } from '../errors.ts';
import { assertNoSecretMaterial } from '../secrets.ts';
import type { AuthorizedExecutionFeed, AuthorizeStageInput } from '../contract/stage-io.ts';
import type { OnchainSecurityKernelPort } from '../pins/onchain-security/kernel-port.ts';
import type { SignerAdapter, RecheckObservation } from '../pins/onchain-security/signing.ts';
import type { OnchainWriteRequest } from '../pins/onchain-security/write-request.ts';

/** Builds the recheck observation from the prepared write (deterministic). */
export function buildRecheckObservation(
  writeRequest: OnchainWriteRequest,
  writeDigest: string,
  securityState: AuthorizeStageInput['securityState'],
  observedAt: number,
): RecheckObservation {
  const observation: RecheckObservation = {
    writeId: writeRequest.writeId,
    observedAt,
    chain: writeRequest.chain,
    writeDigest,
    ...(writeRequest.transfer !== undefined
      ? { transfer: writeRequest.transfer }
      : {}),
    approvals: writeRequest.approvals,
    routeHash: writeRequest.route.routeHash,
    ...(writeRequest.nonce !== undefined ? { nonce: writeRequest.nonce } : {}),
    ...(writeRequest.settlementInstruction !== undefined
      ? { settlementInstruction: writeRequest.settlementInstruction }
      : {}),
    securityState,
  };
  return observation;
}

/**
 * The generic authorize stage: drives the kernel port through the full
 * pipeline and returns the ONLY success output — the kernel broadcast
 * handoff. Deterministic instants: artifact at `at + 1`, recheck at
 * `recheckAt ?? at + 2`, handoff at `recheckAt + 1` (the old pipeline's
 * step ordering, preserved).
 */
export function runAuthorizeStage(
  kernel: OnchainSecurityKernelPort,
  signer: SignerAdapter,
  input: AuthorizeStageInput,
): AuthorizedExecutionFeed {
  const request = input.prepared.writeRequest;
  const decision = kernel.runGates({
    request,
    policy: input.policy,
    securityState: input.securityState,
    trustedSurfaces: [input.surface],
    at: input.at,
  });
  if (decision.decision !== 'ALLOW') {
    // Fail closed: no handoff without a deterministic ALLOW. BLOCK is
    // terminal in the kernel; UNKNOWN requires fresh evidence.
    const why =
      decision.decision === 'BLOCK'
        ? (decision.reasons ?? [])
            .map((reason) => `${reason.dimension}:${reason.code}`)
            .join('; ')
        : (decision.dimensions ?? [])
            .map((dimension) => `${dimension.dimension}:${dimension.code}`)
            .join('; ');
    throw new ValidationError(
      `authorize stage failed closed: deterministic gates returned '${decision.decision}'${why.length > 0 ? ` (${why})` : ''} — no signing handoff is possible (a BLOCK can never be overridden)`,
      { decision: decision.decision },
    );
  }
  const expectedDiff = kernel.buildExpectedDiff(request, input.at);
  const authorizationRequest = kernel.buildAuthorizationRequest({
    request,
    expectedDiff,
    gateDecision: decision,
    requestId: input.requestId,
    principal: input.principal,
    requestedAt: input.at,
  });
  const artifact = kernel.authorize({
    request: authorizationRequest,
    surface: input.surface,
    approverRef: input.approverRef,
    securityState: input.securityState,
    expiresAt: input.expiresAt,
    at: input.at + 1,
    ...(request.requestedBy !== undefined && request.requestedBy.length > 0
      ? { agentRef: request.requestedBy }
      : {}),
  });
  const recheckAt = input.recheckAt ?? input.at + 2;
  const recheckObservation = buildRecheckObservation(
    request,
    input.prepared.writeDigest,
    input.recheckSecurityState ?? input.securityState,
    recheckAt,
  );
  const recheck = kernel.recheck({
    request,
    writeDigest: input.prepared.writeDigest,
    observation: recheckObservation,
    at: recheckAt,
  });
  if (recheck.outcome !== 'RECHECK_OK') {
    throw new StaleObservationError(
      `authorize stage failed closed: the pre-broadcast recheck VOIDED the authorization (${recheck.detail ?? 'stale security state'}) — the authorization must be re-requested, never auto-repaired`,
    );
  }
  const signingRequest = kernel.handoffForBroadcast({
    requestId: input.signingRequestId,
    artifact,
    request: authorizationRequest,
    recheckEvidenceRefs: recheck.evidenceRefs,
    signer,
    at: recheckAt + 1,
  });
  const feed: AuthorizedExecutionFeed = Object.freeze({
    stageOutcome: 'KERNEL_BROADCAST_HANDOFF',
    pipelineState: 'BROADCAST_HANDOFF',
    signingRequest,
    authorizationRef: signingRequest.authorizationRef,
    recheckRef: signingRequest.recheckRef,
    artifact,
    evidenceRefs: Object.freeze([
      ...input.prepared.evidenceRefs,
      ...recheck.evidenceRefs,
      signingRequest.requestId,
    ]),
  });
  assertNoSecretMaterial(feed, 'authorized execution feed');
  return feed;
}
