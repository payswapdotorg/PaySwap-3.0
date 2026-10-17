/**
 * @payswap/onchain-adapters — the per-stage input/output contracts (Work
 * Order P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/contract.ts stage IO).
 *
 * Every lifecycle stage has an EXPLICIT input/output type; the outputs are
 * frozen, evidence-linked, and never carry secret material. The authorize
 * stage's ONLY success output is a kernel handoff — the adapter cannot
 * improve on the kernel's terminal state.
 */

import type { AdapterLifecycleStage, AdapterStageSupport } from './stages.ts';
import type { AdapterProvenance, ChainHeadObservation } from './observations.ts';
import type { RailEnvironment, RailEnvironmentClass } from '../environment.ts';
import type { FamilySemanticsProfile } from '../semantics.ts';
import type { ChainFamily } from '../pins/onchain-domain/family.ts';
import type {
  ConnectedChainInstance,
} from '../pins/onchain-domain/instance.ts';
import type {
  OnchainExecutionDirective,
} from '../pins/onchain-domain/directive.ts';
import type {
  OnchainExecutionObservation,
} from '../pins/onchain-domain/observation.ts';
import type {
  OnchainFinalityCandidate,
} from '../pins/onchain-domain/observation.ts';
import type {
  OnchainAuthorizationArtifact,
  OnchainSecurityState,
  RecheckObservation,
  SigningRequest,
  SimulationObservation,
} from '../pins/onchain-security/signing.ts';
import type {
  OnchainSecurityPolicy,
  TrustedApprovalSurface,
} from '../pins/onchain-security/kernel-port.ts';
import type { Principal } from '../pins/onchain-security/principal.ts';
import type { OnchainWriteRequest } from '../pins/onchain-security/write-request.ts';

// ---------------------------------------------------------------------------
// prepare stage
// ---------------------------------------------------------------------------

/** Input to the prepare stage. */
export interface PrepareStageInput {
  readonly directive: OnchainExecutionDirective;
  /** Execution scope: a genuinely connected chain instance. */
  readonly instance: ConnectedChainInstance;
  /** The signing account's external on-chain address (opaque string). */
  readonly signerAccountRef: string;
  /** Fresh chain-head observation (stale heads invalidate preparation). */
  readonly head: ChainHeadObservation;
  /** Deterministic preparation instant (ms epoch). */
  readonly at: number;
  /** Requesting agent ref (labeling only — never authority). */
  readonly requestedBy: string;
  /** Optional settlement-instruction binding (evidence lineage). */
  readonly settlementInstruction?: {
    readonly instructionId: string;
    readonly instructionDigest: string;
  };
}

/**
 * The prepared adapter operation: the kernel-ready neutral write request
 * plus the family-scoped execution plan (typed per family in the family
 * modules; opaque to the core contract — the family owns it).
 */
export interface PreparedAdapterOperation<FamilyPlan = unknown> {
  readonly operationKind: 'PreparedAdapterOperation';
  readonly directive: OnchainExecutionDirective;
  readonly writeRequest: OnchainWriteRequest;
  /** The kernel's deterministic content digest of the write request. */
  readonly writeDigest: string;
  /** Family-scoped execution plan (adapter-owned, never core-interpreted). */
  readonly familyPlan: FamilyPlan;
  readonly preparedAt: number;
  readonly evidenceRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// simulate stage
// ---------------------------------------------------------------------------

/** Input to the simulate stage. */
export interface SimulateStageInput {
  readonly prepared: PreparedAdapterOperation;
  readonly at: number;
}

// ---------------------------------------------------------------------------
// authorize stage (feeds the onchain-security kernel)
// ---------------------------------------------------------------------------

/** Input to the authorize stage. */
export interface AuthorizeStageInput {
  readonly prepared: PreparedAdapterOperation;
  readonly policy: OnchainSecurityPolicy;
  readonly securityState: OnchainSecurityState;
  readonly surface: TrustedApprovalSurface;
  readonly principal: Principal;
  readonly approverRef: string;
  readonly requestId: string;
  readonly signingRequestId: string;
  readonly at: number;
  /** Authorization artifact expiry (ms epoch). */
  readonly expiresAt: number;
  /** Fresh security state for the pre-broadcast recheck (default: same state). */
  readonly recheckSecurityState?: OnchainSecurityState;
  /** Deterministic recheck instant (ms epoch; default at + 2). */
  readonly recheckAt?: number;
}

/** The ONLY output of a successful authorize stage: a kernel handoff. */
export interface AuthorizedExecutionFeed {
  readonly stageOutcome: 'KERNEL_BROADCAST_HANDOFF';
  /** The kernel's terminal success state — the adapter cannot improve on it. */
  readonly pipelineState: 'BROADCAST_HANDOFF';
  readonly signingRequest: SigningRequest;
  readonly authorizationRef: string;
  readonly recheckRef: string;
  readonly artifact: OnchainAuthorizationArtifact;
  readonly evidenceRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// broadcast + result-observation stages
// ---------------------------------------------------------------------------

/** Input to the broadcast stage. */
export interface BroadcastStageInput {
  /** The kernel handoff produced by the authorize stage. */
  readonly handoff: SigningRequest;
  /** The payload AFTER the trusted surface signed it (opaque to the adapter). */
  readonly signedPayload: string;
  readonly at: number;
  /** The execution reference observations are keyed by (idempotency scope). */
  readonly executionRef: string;
}

export type BroadcastStageOutcome = OnchainExecutionObservation;

/** Input to the result-observation stage. */
export interface ObserveResultInput {
  readonly executionRef: string;
  readonly externalOperationRef: string;
  readonly at: number;
  /** Prior observation of the same operation (reorg/fork detection). */
  readonly prior?: OnchainExecutionObservation;
}

// ---------------------------------------------------------------------------
// finality + reconcile stages
// ---------------------------------------------------------------------------

/** The adapter's finality evaluation — a CANDIDATE plus declared guidance. */
export interface FinalityEvaluation {
  readonly operationKind: 'FinalityEvaluation';
  readonly candidate: OnchainFinalityCandidate;
  /** Declared confirmation target from the family semantics profile. */
  readonly declaredTarget: number;
  /** Observed neutral confirmation depth (blocks/slots). */
  readonly observedDepth: number;
  /** Whether the observed depth meets the DECLARED guidance (never finality). */
  readonly depthSufficient: boolean;
  readonly reorgDetected: boolean;
  readonly semanticsRef: string;
}

/**
 * The deterministic reconciliation plan for an OUTCOME_UNKNOWN observation.
 * `blindRetryForbidden` is a LITERAL type: an unknown external write can
 * never be blindly retried and only settlement reconciliation resolves it.
 * The plan is INSTRUCTIONS, never resolution.
 */
export interface ReconciliationPlan {
  readonly operationKind: 'ReconciliationPlan';
  readonly executionRef: string;
  readonly observationId: string;
  readonly reasons: readonly string[];
  readonly externalChecks: readonly {
    readonly check: string;
    readonly providerNames: readonly string[];
  }[];
  readonly blindRetryForbidden: true;
  readonly resolver: 'SETTLEMENT_RECONCILIATION_AUTHORITY';
}

// ---------------------------------------------------------------------------
// evidence stage
// ---------------------------------------------------------------------------

/** One append-only evidence log entry. */
export interface AdapterEvidenceEntry {
  readonly at: number;
  readonly stage: AdapterLifecycleStage;
  readonly adapterId: string;
  readonly environmentClass: RailEnvironmentClass;
  readonly refs: readonly string[];
}
