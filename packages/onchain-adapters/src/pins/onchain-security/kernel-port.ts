/**
 * STRUCTURAL PIN — the onchain-security KERNEL PORT (Work Order P4-W3, lane
 * R2-W3; NET-NEW seam in the accepted v1 pattern of the agents lane's
 * authority-port.ts).
 *
 * LAYER LAW: this package is layer `rails` and — for THIS wave — carries
 * ZERO sibling imports. The old repo's adapters imported the REAL
 * onchain-security kernel (OnchainWritePipeline) as a hard runtime
 * dependency; the accepted 3.0 pattern keeps the SEMANTICS and moves the
 * WIRING to the composition root: the adapter drives every authorize-stage
 * step through this INJECTED port, and the production composition root
 * wires it to @payswap/onchain-security's own pipeline (structurally
 * identical signatures — asserted at TL integration, the same law the
 * agents lane uses for the trust authority port).
 *
 * THE ADAPTER NEVER AUTHORIZES; THE KERNEL OWNS AUTHORITY. The port
 * mirrors the kernel pipeline's public step surface in dispatch order:
 * prepare (validate + freeze + content-address) → gates (deterministic
 * ALLOW/BLOCK/UNKNOWN) → expected diff (an observation, never authority) →
 * authorization request → trusted-surface artifact → pre-broadcast recheck
 * (stale-state invalidation) → signing-request handoff. The adapter fails
 * closed at every step: no ALLOW, no handoff; a VOIDED recheck, no
 * broadcast; a BLOCK can never be overridden.
 */

import type {
  OnchainAuthorizationArtifact,
  OnchainAuthorizationRequest,
  OnchainSecurityState,
  RecheckObservation,
  SignerAdapter,
  SigningRequest,
} from './signing.ts';

import type { OnchainWriteRequest } from './write-request.ts';
import type { Principal } from './principal.ts';

// ---------------------------------------------------------------------------
// Policy + state (kernel-owned shapes the adapter carries opaquely)
// ---------------------------------------------------------------------------

/**
 * The security policy the kernel's gates evaluate (structural view: the
 * gate dimensions the deterministic fixtures exercise; the real kernel may
 * carry more — the adapter passes the value through opaquely).
 */
export interface OnchainSecurityPolicy {
  readonly policyId: string;
  readonly version: number;
  readonly forbidUnlimitedApprovals: boolean;
  readonly unknownContractPolicy: 'block' | 'allow' | 'unknown';
  readonly unknownRoutePolicy: 'block' | 'allow' | 'unknown';
  readonly allowedChains?: readonly string[];
  readonly allowedAssets?: readonly {
    readonly chain: string;
    readonly assetId: string;
    readonly symbol: string;
  }[];
  readonly allowedDestinations?: readonly string[];
  readonly knownRoutes?: readonly string[];
}

/** The trusted approval surface (the artifact-signing boundary). */
export interface TrustedApprovalSurface {
  readonly surfaceId: string;
  /** Deterministic payload signer at the trusted surface (never key material here). */
  signApprovalPayload(payload: string): string;
}

// ---------------------------------------------------------------------------
// Gate decisions (deterministic; BLOCK is terminal)
// ---------------------------------------------------------------------------

export type GateDecisionKind = 'ALLOW' | 'BLOCK' | 'UNKNOWN';

export interface GateRejectionDimension {
  readonly dimension: string;
  readonly code: string;
}

/** The kernel's deterministic gate decision on one write. */
export interface GateDecision {
  readonly decision: GateDecisionKind;
  /** Present on BLOCK: why the write is blocked (terminal — never overridden). */
  readonly reasons?: readonly GateRejectionDimension[];
  /** Present on UNKNOWN: which dimensions require fresh evidence. */
  readonly dimensions?: readonly GateRejectionDimension[];
}

// ---------------------------------------------------------------------------
// Prepared write + expected diff (kernel-side content addressing)
// ---------------------------------------------------------------------------

/** The kernel's content-addressed prepared write (the digest authority). */
export interface KernelPreparedWrite {
  readonly writeId: string;
  /** Content digest binding every write field; later stages pin this. */
  readonly writeDigest: string;
  readonly preparedAt: number;
}

/** The expected state diff (an OBSERVATION for the user, never authority). */
export interface ExpectedStateDiff {
  readonly diffDigest: string;
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// The recheck outcome (pre-broadcast stale-state invalidation)
// ---------------------------------------------------------------------------

export type RecheckOutcomeKind = 'RECHECK_OK' | 'RECHECK_VOIDED';

export interface KernelRecheckOutcome {
  readonly outcome: RecheckOutcomeKind;
  /** Present when VOIDED: why the authorization was invalidated. */
  readonly detail?: string;
  readonly evidenceRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// THE KERNEL PORT (the injected seam)
// ---------------------------------------------------------------------------

/**
 * The onchain-security kernel seam: structurally mirrors the kernel
 * pipeline's public step surface so the adapter can drive the authorize
 * stage stage-for-stage. The composition root wires the REAL kernel; the
 * deterministic battery wires a local fake that can never authorize real
 * money (INV-24 discipline — no fake success).
 */
export interface OnchainSecurityKernelPort {
  /**
   * Validates, freezes and content-addresses one write request (the
   * kernel's prepareWrite): the SAME digest the authorize-stage steps will
   * compute — fail early, fail closed.
   */
  prepareWrite(request: OnchainWriteRequest, at: number): KernelPreparedWrite;

  /** Deterministic gates on (write, policy, state) — BLOCK is terminal. */
  runGates(input: {
    readonly request: OnchainWriteRequest;
    readonly policy: OnchainSecurityPolicy;
    readonly securityState: OnchainSecurityState;
    readonly trustedSurfaces: readonly TrustedApprovalSurface[];
    readonly at: number;
  }): GateDecision;

  /** Builds the expected state diff (an observation, never authority). */
  buildExpectedDiff(request: OnchainWriteRequest, at: number): ExpectedStateDiff;

  /** Builds the authorization request from an ALLOWED, diffed write. */
  buildAuthorizationRequest(input: {
    readonly request: OnchainWriteRequest;
    readonly expectedDiff: ExpectedStateDiff;
    readonly gateDecision: GateDecision;
    readonly requestId: string;
    readonly principal: Principal;
    readonly requestedAt: number;
  }): OnchainAuthorizationRequest;

  /** Mints the trusted-surface-signed authorization artifact. */
  authorize(input: {
    readonly request: OnchainAuthorizationRequest;
    readonly surface: TrustedApprovalSurface;
    readonly approverRef: string;
    readonly securityState: OnchainSecurityState;
    readonly expiresAt: number;
    readonly at: number;
    readonly agentRef?: string;
  }): OnchainAuthorizationArtifact;

  /** The pre-broadcast recheck: stale state VOIDS the authorization. */
  recheck(input: {
    readonly request: OnchainWriteRequest;
    readonly writeDigest: string;
    readonly observation: RecheckObservation;
    readonly at: number;
  }): KernelRecheckOutcome;

  /**
   * The signing-request handoff (only from a passing recheck): builds the
   * agent-facing-safe SigningRequest with the family signer adapter's
   * payload.
   */
  handoffForBroadcast(input: {
    readonly requestId: string;
    readonly artifact: OnchainAuthorizationArtifact;
    readonly request: OnchainAuthorizationRequest;
    readonly recheckEvidenceRefs: readonly string[];
    readonly signer: SignerAdapter;
    readonly at: number;
  }): SigningRequest;
}
