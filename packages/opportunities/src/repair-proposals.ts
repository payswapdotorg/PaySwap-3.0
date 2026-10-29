/**
 * @payswap/opportunities — the bounded, grounded MODEL-PROPOSAL interface
 * (P23-A, lane A; ADR-0015 D6): a model (LLM) may PROPOSE repair
 * candidates; it can never invent repair kinds, eligibility or authority.
 * This module carries the interface law — the frozen shapes, the A.8
 * rejection codes, the INJECTED fail-closed port and the deterministic
 * identity. The STRICT validation contract lives in
 * ./repair-proposal-validation.ts and the budget/dedup fold in
 * ./repair-proposal-fold.ts (the file-law split):
 * (a) GROUNDED — every proposal must cite the exclusion facts it answers
 *     (code + routeId matching the derivation input; ungrounded → the
 *     typed MODEL_PROPOSAL_UNGROUNDED rejection);
 * (b) VOCABULARY — the proposed operator and party change must be
 *     catalogue/vocabulary members (out-of-vocabulary → the typed
 *     MODEL_PROPOSAL_OUT_OF_VOCABULARY rejection; models are structurally
 *     not responsible for route eligibility);
 * (c) MARKER-SCAN — the pinned `pinnedAssertNotProtocolCommand` at every
 *     nesting depth (command/authority shape → the typed
 *     MODEL_PROPOSAL_COMMAND_SHAPE rejection);
 * (d) BUDGET — maxProposals per the difficulty budget; a malformed budget
 *     makes every proposal malformed (the typed
 *     MODEL_PROPOSAL_BUDGET_EXCEEDED rejection), while an honest overflow
 *     truncates WITH a receipt;
 * (e) DEDUP — a proposal matching a deterministic operator folds into it
 *     with corroboration provenance, never a duplicate card.
 * The port is INJECTED and fail-closed unbound: the honest empty
 * deployment (zero configured models) renders the unbound note, never a
 * fabricated proposal. No live-model claim is made this wave.
 */

import { ValidationError } from "./errors.ts";
import { contentDigest } from "./canonical.ts";
import type { RepairOperator } from "./repair-operators.ts";
import type { RepairExclusionFact } from "./repair-facts.ts";
import type { ConditionalPartyChange } from "./conditional.ts";
import { PINNED_PROTOCOL_COMMAND_MARKER_FIELDS, pinnedAssertNotProtocolCommand } from "./pins/agents.ts";

/** The frozen A.8 rejection-code vocabulary (the four laws' typed codes). */
export const MODEL_PROPOSAL_REJECTION_CODES = Object.freeze([
  "MODEL_PROPOSAL_UNGROUNDED",
  "MODEL_PROPOSAL_OUT_OF_VOCABULARY",
  "MODEL_PROPOSAL_COMMAND_SHAPE",
  "MODEL_PROPOSAL_BUDGET_EXCEEDED",
] as const);
export type ModelProposalRejectionCode = (typeof MODEL_PROPOSAL_REJECTION_CODES)[number];

/**
 * Raised when a model proposal or request is malformed. `rejectionCode`,
 * when present, is one of the frozen A.8 codes; purely structural
 * violations (a non-object, a forged id, a malformed provenance, an
 * unknown field) carry no code — they are the generic fail-closed path.
 */
export class ModelProposalError extends ValidationError {
  readonly rejectionCode?: ModelProposalRejectionCode;

  constructor(message: string, options?: { rejectionCode?: ModelProposalRejectionCode; errors?: readonly string[] }) {
    super(message, options !== undefined && options.errors !== undefined ? { errors: options.errors } : undefined);
    this.name = "ModelProposalError";
    if (options !== undefined && options.rejectionCode !== undefined) {
      this.rejectionCode = options.rejectionCode;
    }
  }
}

/** The honest unbound-port error (names the seam, never fabricates). */
export class ModelProposalPortUnboundError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "ModelProposalPortUnboundError";
  }
}

// ---------------------------------------------------------------------------
// The shapes (frozen; NOTHING ELSE — no eligibility, no authority, no command)
// ---------------------------------------------------------------------------

/** One cited fact reference: a code + routeId pair matching an input fact. */
export interface ModelProposalEvidenceRef {
  readonly code: RepairExclusionFact["code"];
  readonly routeId: string;
}

/** The A.8 provenance: WHO proposed and WHEN (the model's own stamp). */
export interface ModelProposalProvenance {
  readonly source: "MODEL_PROPOSAL";
  readonly modelId: string;
  readonly proposedAt: number;
}

/**
 * One bounded model proposal (pure frozen data): the deterministic id, a
 * catalogue operator, the optional party-change member, the rationale, the
 * cited evidence and the provenance. NOTHING ELSE.
 */
export interface ModelProposal {
  /** Deterministic: `model-proposal:<operatorId>:<digest>` (see modelProposalId). */
  readonly proposalId: string;
  readonly operatorId: string;
  readonly partyChange?: ConditionalPartyChange;
  readonly rationale: string;
  readonly evidenceCited: readonly ModelProposalEvidenceRef[];
  readonly provenance: Readonly<ModelProposalProvenance>;
}

/** The bounded request: the grounded facts, the catalogue snapshot, the budget, the instant. */
export interface ModelProposalRequest {
  readonly facts: readonly RepairExclusionFact[];
  readonly catalogue: readonly RepairOperator[];
  readonly maxProposals: number;
  readonly at: number;
}

/** The rationale bound (the bounded human surface). */
export const MAX_MODEL_PROPOSAL_RATIONALE_LENGTH = 2000 as const;

// ---------------------------------------------------------------------------
// The port (injected, fail-closed unbound)
// ---------------------------------------------------------------------------

/** THE model-proposal port: proposes repair candidates within the frozen vocabulary. */
export interface ModelProposalPort {
  propose(input: ModelProposalRequest): readonly ModelProposal[];
}

/**
 * The UNBOUND model-proposal port (fail closed): every call throws the
 * typed error naming the seam — the honest empty deployment (zero
 * configured session models) renders the unbound note, never a fabricated
 * proposal.
 */
export function unboundModelProposalPort(): ModelProposalPort {
  return {
    propose(input: ModelProposalRequest): readonly ModelProposal[] {
      void input;
      throw new ModelProposalPortUnboundError(
        "the model-proposal interface is not bound — no configured session model (the honest empty deployment renders the unbound note, never a fabricated proposal)",
      );
    },
  };
}

/** Require an injected model-proposal port (fail closed on a missing binding). */
export function requireModelProposalPort(candidate: unknown): ModelProposalPort {
  if (candidate === null || typeof candidate !== "object" || typeof (candidate as ModelProposalPort).propose !== "function") {
    throw new ModelProposalPortUnboundError(
      "a ModelProposalPort must be injected (an object implementing propose) — the repair-proposal tier never fabricates proposals",
    );
  }
  return candidate as ModelProposalPort;
}

// ---------------------------------------------------------------------------
// The deterministic identity
// ---------------------------------------------------------------------------

/**
 * Deterministic proposal identity: `model-proposal:<operatorId>:<digest>`
 * over the canonical content digest of the grounded content (operator,
 * optional party change, cited evidence) — the model-INDEPENDENT
 * derivation (provenance is deliberately excluded: two models proposing
 * the same grounded repair derive the same id, which is what the dedup
 * fold keys on).
 */
export function modelProposalId(
  operatorId: string,
  evidenceCited: readonly ModelProposalEvidenceRef[],
  partyChange?: ConditionalPartyChange,
): string {
  return `model-proposal:${operatorId}:${contentDigest({
    operatorId,
    partyChange: partyChange ?? null,
    evidenceCited,
  })}`;
}

// ---------------------------------------------------------------------------
// The never-authorization literals + the advisory gate
// ---------------------------------------------------------------------------

/**
 * The model-proposals-never-execute law, restated as a literal: a model
 * proposal NEVER permits execution. Returns false, always.
 */
export function modelProposalsPermitExecution(): false {
  return false;
}

/**
 * Runtime guard for proposal consumers: asserts a value carries NO
 * protocol-command / authority marker field at any nesting depth (the
 * pinned agents-law scan, exported for this tier's consumers).
 */
export function assertModelProposalIsAdvisory(candidate: unknown): void {
  pinnedAssertNotProtocolCommand(candidate);
}

/** The frozen marker-field list (re-exported audit surface for this tier). */
export const MODEL_PROPOSAL_FORBIDDEN_FIELDS = PINNED_PROTOCOL_COMMAND_MARKER_FIELDS;
