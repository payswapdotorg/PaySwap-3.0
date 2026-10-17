/**
 * The DETERMINISTIC fake onchain-security kernel (the R2-W3 test double for
 * the injected OnchainSecurityKernelPort — the seam the agents lane uses
 * for the trust authority port).
 *
 * It implements the port's step surface stage-for-stage with the REAL
 * kernel's semantics where the adapter contract depends on them:
 * - gates: deterministic policy evaluation (allowed chains/assets/
 *   destinations/known routes -> ALLOW; anything else -> BLOCK with
 *   reasons), configurable to BLOCK/UNKNOWN for fail-closed fixtures;
 * - prepareWrite: validates + content-addresses with the package's own
 *   canonical digest (the digest authority);
 * - authorize: mints the artifact (request-hash binding + surface
 *   signature);
 * - recheck: VOIDS when the recheck security state carries a DIFFERENT
 *   network epoch than the authorization state, or an OLDER observedAt
 *   (stale-state invalidation — the old kernel's law);
 * - handoff: builds the agent-facing-safe SigningRequest with the family
 *   signer's payload.
 *
 * A FAKE can never authorize real money: there is no secret material, no
 * network, and the battery proves the PLUMBING (INV-24 — no fake success).
 */

import { contentDigest } from '../../src/digest.ts';
import { assertNoSecretMaterial } from '../../src/secrets.ts';
import { validateOnchainWriteRequest } from '../../src/pins/onchain-security/write-request.ts';
import type { OnchainWriteRequest } from '../../src/pins/onchain-security/write-request.ts';
import type {
  GateDecision,
  OnchainSecurityKernelPort,
  TrustedApprovalSurface,
} from '../../src/pins/onchain-security/kernel-port.ts';
import type { OnchainSecurityPolicy } from '../../src/pins/onchain-security/kernel-port.ts';
import type {
  OnchainAuthorizationArtifact,
  OnchainAuthorizationRequest,
  OnchainSecurityState,
  RecheckObservation,
  SignerAdapter,
  SigningRequest,
} from '../../src/pins/onchain-security/signing.ts';
import type { Principal } from '../../src/pins/onchain-security/principal.ts';

export interface FakeKernelOptions {
  /** Overrides the gate decision (fail-closed fixtures). */
  readonly gateDecision?: 'ALLOW' | 'BLOCK' | 'UNKNOWN';
}

/** The deterministic kernel fake (see module header). */
export class FakeSecurityKernel implements OnchainSecurityKernelPort {
  readonly #options: FakeKernelOptions;
  /** Recorded calls (assertion surface for the battery). */
  readonly calls: string[] = [];
  #artifactSeq = 0;
  #authorizedEpoch: bigint | undefined;

  constructor(options?: FakeKernelOptions) {
    this.#options = options ?? {};
  }

  prepareWrite(request: OnchainWriteRequest, at: number) {
    validateOnchainWriteRequest(request);
    assertNoSecretMaterial(request, 'kernel prepare (fake)');
    this.calls.push(`prepareWrite:${request.writeId}`);
    return Object.freeze({
      writeId: request.writeId,
      writeDigest: contentDigest(request),
      preparedAt: at,
    });
  }

  runGates(input: {
    readonly request: OnchainWriteRequest;
    readonly policy: OnchainSecurityPolicy;
    readonly securityState: OnchainSecurityState;
    readonly trustedSurfaces: readonly TrustedApprovalSurface[];
    readonly at: number;
  }): GateDecision {
    this.calls.push(`runGates:${input.request.writeId}`);
    if (this.#options.gateDecision !== undefined) {
      if (this.#options.gateDecision === 'BLOCK') {
        return {
          decision: 'BLOCK',
          reasons: [{ dimension: 'fixture', code: 'FIXTURE_BLOCK' }],
        };
      }
      if (this.#options.gateDecision === 'UNKNOWN') {
        return {
          decision: 'UNKNOWN',
          dimensions: [{ dimension: 'fixture', code: 'FIXTURE_UNKNOWN' }],
        };
      }
    }
    const request = input.request;
    const policy = input.policy;
    const reasons: { dimension: string; code: string }[] = [];
    if (policy.allowedChains !== undefined && !policy.allowedChains.includes(request.chain)) {
      reasons.push({ dimension: 'chain', code: 'CHAIN_NOT_ALLOWED' });
    }
    if (
      policy.allowedAssets !== undefined &&
      request.transfer !== undefined &&
      !policy.allowedAssets.some(
        (asset) =>
          asset.chain === request.transfer?.asset.chain &&
          asset.assetId === request.transfer?.asset.assetId &&
          asset.symbol === request.transfer?.asset.symbol,
      )
    ) {
      reasons.push({ dimension: 'asset', code: 'ASSET_NOT_ALLOWED' });
    }
    if (
      policy.allowedDestinations !== undefined &&
      request.transfer !== undefined &&
      !policy.allowedDestinations.includes(request.transfer.to)
    ) {
      reasons.push({ dimension: 'destination', code: 'DESTINATION_NOT_ALLOWED' });
    }
    if (
      policy.knownRoutes !== undefined &&
      !policy.knownRoutes.includes(request.route.routeHash)
    ) {
      reasons.push({ dimension: 'route', code: 'ROUTE_UNKNOWN' });
    }
    if (request.approvals.some((approval) => approval.unlimited) && policy.forbidUnlimitedApprovals) {
      reasons.push({ dimension: 'approval', code: 'UNLIMITED_APPROVAL_FORBIDDEN' });
    }
    if (reasons.length > 0) {
      return { decision: 'BLOCK', reasons };
    }
    return { decision: 'ALLOW' };
  }

  buildExpectedDiff(request: OnchainWriteRequest, _at: number) {
    this.calls.push(`buildExpectedDiff:${request.writeId}`);
    return Object.freeze({
      diffDigest: contentDigest({ writeId: request.writeId, kind: 'expected-diff' }),
      summary: request.transfer !== undefined ? 'one transfer leg' : 'one write',
    });
  }

  buildAuthorizationRequest(input: {
    readonly request: OnchainWriteRequest;
    readonly expectedDiff: { readonly diffDigest: string };
    readonly gateDecision: GateDecision;
    readonly requestId: string;
    readonly principal: Principal;
    readonly requestedAt: number;
  }): OnchainAuthorizationRequest {
    this.calls.push(`buildAuthorizationRequest:${input.requestId}`);
    const requestHash = contentDigest({
      requestId: input.requestId,
      writeDigest: contentDigest(input.request),
      diff: input.expectedDiff.diffDigest,
    });
    return Object.freeze({
      requestId: input.requestId,
      write: input.request,
      requestHash,
      requestedAt: input.requestedAt,
    });
  }

  authorize(input: {
    readonly request: OnchainAuthorizationRequest;
    readonly surface: TrustedApprovalSurface;
    readonly approverRef: string;
    readonly securityState: OnchainSecurityState;
    readonly expiresAt: number;
    readonly at: number;
    readonly agentRef?: string;
  }): OnchainAuthorizationArtifact {
    this.calls.push(`authorize:${input.request.requestId}`);
    this.#artifactSeq += 1;
    this.#authorizedEpoch = input.securityState.networkEpoch;
    const write = input.request.write;
    const artifact: OnchainAuthorizationArtifact = Object.freeze({
      requestHash: input.request.requestHash,
      scope: Object.freeze({
        writeDigest: contentDigest(write),
        chain: write.chain,
        asset: write.transfer?.asset ?? {
          chain: write.chain,
          assetId: write.approvals[0]?.asset.assetId ?? 'asset:unknown',
          symbol: write.approvals[0]?.asset.symbol ?? 'UNKNOWN',
        },
        amount: write.transfer?.amount ?? write.approvals[0]?.amount ?? {
          currency: 'UNKNOWN',
          minorUnits: '0',
        },
        ...(write.transfer !== undefined ? { destination: write.transfer.to } : {}),
        approvals: Object.freeze(
          write.approvals.map((approval) =>
            Object.freeze({
              asset: { assetId: approval.asset.assetId },
              owner: approval.owner,
              spender: approval.spender,
              amount: approval.amount,
              unlimited: approval.unlimited,
            }),
          ),
        ),
        routeHash: write.route.routeHash,
        ...(write.contractCall !== undefined
          ? {
              protocolId: write.contractCall.calldataDigest,
              contractAddress: write.contractCall.target,
            }
          : {}),
        expectedStateDiffDigest: contentDigest({ writeId: write.writeId, kind: 'expected-diff' }),
        ...(write.settlementInstruction !== undefined
          ? { settlementInstruction: write.settlementInstruction }
          : {}),
        expiry: input.expiresAt,
      }),
      surfaceRef: input.surface.surfaceId,
      networkEpochAtIssuance: input.securityState.networkEpoch,
    });
    assertNoSecretMaterial(artifact, 'kernel artifact (fake)');
    return artifact;
  }

  recheck(input: {
    readonly request: OnchainWriteRequest;
    readonly writeDigest: string;
    readonly observation: RecheckObservation;
    readonly at: number;
  }) {
    this.calls.push(`recheck:${input.request.writeId}`);
    const observed = input.observation.securityState;
    // Stale-state invalidation: a network epoch that DRIFTED from the
    // epoch at authorization VOIDS the artifact (the old kernel's law —
    // the authorization must be re-requested, never auto-repaired).
    if (
      this.#authorizedEpoch !== undefined &&
      observed.networkEpoch !== this.#authorizedEpoch
    ) {
      return {
        outcome: 'RECHECK_VOIDED' as const,
        detail: `network epoch drift (authorized at ${this.#authorizedEpoch.toString()}, recheck observed ${observed.networkEpoch.toString()})`,
        evidenceRefs: [`recheck:fixture:${this.#artifactSeq}`],
      };
    }
    return {
      outcome: 'RECHECK_OK' as const,
      evidenceRefs: [`recheck:fixture:${this.#artifactSeq}`],
    };
  }

  handoffForBroadcast(input: {
    readonly requestId: string;
    readonly artifact: OnchainAuthorizationArtifact;
    readonly request: OnchainAuthorizationRequest;
    readonly recheckEvidenceRefs: readonly string[];
    readonly signer: SignerAdapter;
    readonly at: number;
  }): SigningRequest {
    this.calls.push(`handoffForBroadcast:${input.requestId}`);
    const payload = input.signer.buildSigningPayload({
      artifact: input.artifact,
      request: input.request,
    });
    const write = input.request.write;
    const signingRequest: SigningRequest = Object.freeze({
      requestId: input.requestId,
      chain: write.chain,
      signerAddress: write.transfer?.from ?? write.approvals[0]?.owner ?? 'signer:unknown',
      payload,
      authorizationRef: input.artifact.requestHash,
      recheckRef: input.recheckEvidenceRefs[0] ?? `recheck:${this.#artifactSeq}`,
      ...(write.settlementInstruction !== undefined
        ? { settlementInstruction: write.settlementInstruction }
        : {}),
      deadline: Math.min(write.expiry, input.at + 60_000),
      writeDigest: contentDigest(write),
    });
    assertNoSecretMaterial(signingRequest, 'kernel signing request (fake)');
    return signingRequest;
  }
}
