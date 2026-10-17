/**
 * STRUCTURAL PIN — the onchain-security signing surface (Work Order P4-W3,
 * lane R2-W3; local structural mirror of payswap.org@8a735bf
 * packages/onchain-security/src/{signers,simulation,recheck}.ts, reduced to
 * the members the adapter contract consumes).
 *
 * The SigningRequest is AGENT-FACING SAFE: public bindings only — chain,
 * signer address, opaque payload, authorization reference, recheck
 * reference, deadline. Never key material. The SignerAdapter port is PURE
 * and deterministic (`buildSigningPayload`); the trusted surface (which
 * owns the signer) signs — this SDK never signs.
 */

import { ValidationError } from '../../errors.ts';
import type { OnchainWriteRequest, SettlementInstructionBinding, ChainRef } from './write-request.ts';

// ---------------------------------------------------------------------------
// The signing request (the kernel handoff output)
// ---------------------------------------------------------------------------

/**
 * The request handed to a signer adapter at the trusted surface. AGENT-
 * FACING SAFE: public bindings only; secret-scanned at construction.
 */
export interface SigningRequest {
  readonly requestId: string;
  readonly chain: ChainRef;
  /** The address that must sign (from the authorized write). */
  readonly signerAddress: string;
  /** Opaque signing payload built by the family adapter (e.g. EIP-712 typed data). */
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

/** Structural validation of a kernel-minted signing request. */
export function validateSigningRequest(request: SigningRequest): void {
  if (request === null || typeof request !== 'object') {
    throw new ValidationError('signing request must be an object');
  }
  for (const field of ['requestId', 'chain', 'signerAddress', 'payload', 'authorizationRef', 'recheckRef', 'writeDigest'] as const) {
    const value = (request as unknown as Readonly<Record<string, unknown>>)[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new ValidationError(`signing request field '${field}' must be a non-empty string`);
    }
  }
  if (typeof request.deadline !== 'number' || !Number.isInteger(request.deadline)) {
    throw new ValidationError('signing request deadline must be an integer instant (ms)');
  }
}

// ---------------------------------------------------------------------------
// The signer adapter port (family-owned payload builders implement this)
// ---------------------------------------------------------------------------

/** The authorization artifact view the payload builder reads (kernel-owned). */
export interface OnchainAuthorizationArtifact {
  readonly requestHash: string;
  readonly scope: {
    readonly writeDigest: string;
    readonly chain: ChainRef;
    readonly asset: { readonly assetId: string; readonly symbol: string };
    readonly amount: { readonly currency: string; readonly minorUnits: string };
    readonly destination?: string;
    readonly approvals: readonly {
      readonly asset: { readonly assetId: string };
      readonly owner: string;
      readonly spender: string;
      readonly amount: { readonly currency: string; readonly minorUnits: string };
      readonly unlimited: boolean;
    }[];
    readonly routeHash: string;
    readonly protocolId?: string;
    readonly contractAddress?: string;
    readonly expectedStateDiffDigest: string;
    readonly settlementInstruction?: SettlementInstructionBinding;
    readonly expiry: number;
  };
  readonly surfaceRef: string;
  readonly networkEpochAtIssuance: bigint;
  readonly delegationId?: string;
}

/** The authorization request view the payload builder reads (kernel-owned). */
export interface OnchainAuthorizationRequest {
  readonly requestId: string;
  readonly write: OnchainWriteRequest;
  readonly requestHash: string;
  readonly requestedAt: number;
}

/**
 * The signer adapter port: `buildSigningPayload` is PURE and
 * deterministic; the trusted surface wiring invokes the signing itself —
 * never an agent and never this package.
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

/** Does this adapter support signing on `chain`? */
export function adapterSupportsChain(adapter: SignerAdapter, chain: ChainRef): boolean {
  return adapter.supportedChains.some((supported) => {
    if (supported === chain) {
      return true;
    }
    if (supported.endsWith(':*')) {
      return chain.startsWith(supported.slice(0, -1));
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// The simulation observation (an OBSERVATION, never authority)
// ---------------------------------------------------------------------------

export type SimulationStatus = 'SUCCEEDED' | 'REVERTED' | 'FAILED' | 'OUTCOME_UNKNOWN';

/** One balance delta a simulation predicts (an observation, never truth). */
export interface SimulationBalanceDelta {
  readonly holder: string;
  readonly asset: { readonly chain: string; readonly assetId: string; readonly symbol: string };
  readonly amount: { readonly currency: string; readonly minorUnits: string };
  readonly direction: 'debit' | 'credit';
}

/** A family simulation as an OBSERVATION — never authority. */
export interface SimulationObservation {
  readonly simulationId: string;
  readonly writeId: string;
  readonly observedAt: number;
  readonly status: SimulationStatus;
  readonly balanceDeltas: readonly SimulationBalanceDelta[];
  readonly approvals: readonly {
    readonly owner: string;
    readonly spender: string;
    readonly asset: { readonly chain: string; readonly assetId: string; readonly symbol: string };
    readonly allowance: { readonly currency: string; readonly minorUnits: string };
    readonly unlimited: boolean;
  }[];
  readonly simulator: string;
  readonly blockRef?: string;
  readonly gasEstimate?: string;
}

/**
 * Validates and freezes a simulation observation (the kernel's
 * recordSimulation discipline, pinned locally): an UNKNOWN simulation is a
 * first-class status — never converted into FAILED.
 */
export function recordSimulation(
  observation: SimulationObservation,
): SimulationObservation {
  if (observation === null || typeof observation !== 'object') {
    throw new ValidationError('simulation observation must be an object');
  }
  const record = observation as unknown as Readonly<Record<string, unknown>>;
  for (const field of ['simulationId', 'writeId', 'simulator'] as const) {
    if (typeof record[field] !== 'string' || (record[field] as string).length === 0) {
      throw new ValidationError(`simulation field '${field}' must be a non-empty string`);
    }
  }
  if (typeof record.observedAt !== 'number' || !Number.isInteger(record.observedAt)) {
    throw new ValidationError('simulation observedAt must be an integer instant (ms)');
  }
  switch (record.status) {
    case 'SUCCEEDED':
    case 'REVERTED':
    case 'FAILED':
    case 'OUTCOME_UNKNOWN':
      break;
    default:
      throw new ValidationError(
        "simulation status must be SUCCEEDED, REVERTED, FAILED or OUTCOME_UNKNOWN (an ambiguous simulation is UNKNOWN, never FAILED)",
      );
  }
  if (
    record.gasEstimate !== undefined &&
    (typeof record.gasEstimate !== 'string' || !/^(0|[1-9][0-9]*)$/.test(record.gasEstimate))
  ) {
    throw new ValidationError(
      'simulation gasEstimate, when present, must be an exact integer decimal string (no floating-point gas)',
    );
  }
  return Object.freeze({
    ...observation,
    balanceDeltas: Object.freeze([...observation.balanceDeltas]),
    approvals: Object.freeze([...observation.approvals]),
  });
}

// ---------------------------------------------------------------------------
// The recheck observation (pre-broadcast stale-state invalidation)
// ---------------------------------------------------------------------------

/** The security-state view the recheck compares against (kernel-owned). */
export interface OnchainSecurityState {
  readonly observedAt: number;
  readonly networkEpoch: bigint;
  readonly quarantinedComponents: readonly string[];
  readonly restrictedComponents: readonly string[];
  readonly activeAdvisoryRefs: readonly string[];
}

/** The pre-broadcast recheck observation the adapter builds from the write. */
export interface RecheckObservation {
  readonly writeId: string;
  readonly observedAt: number;
  readonly chain: ChainRef;
  readonly writeDigest: string;
  readonly transfer?: OnchainWriteRequest['transfer'];
  readonly approvals: readonly OnchainWriteRequest['approvals'][number][];
  readonly routeHash: string;
  readonly nonce?: string;
  readonly protocol?: { readonly protocolId: string };
  readonly settlementInstruction?: SettlementInstructionBinding;
  readonly securityState: OnchainSecurityState;
}
