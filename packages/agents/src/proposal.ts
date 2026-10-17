/**
 * Agent Proposal contracts (FROZEN-ARCHITECTURE §4 authority boundary, old
 * INV-G03; canonical 3.0 law: INV-9 "Agents, LLMs, Lab, optimizers and
 * simulations cannot declare financial truth" + INV-10 "discovery output
 * cannot directly authorize execution").
 *
 * An AgentProposal is an ADVISORY input to a decision — a TYPED, VERSIONED
 * recommendation record. It is structurally distinct from a protocol
 * command: it carries no idempotency key, no authorization/authority field,
 * no signature and no ledger/rail effect, and there is no code path from a
 * proposal to obligation, clearing, settlement, reservation, netting or
 * finality. An agent proposal, plan or explanation is never the authority
 * itself; authority lives exclusively in the trust lane (INV-5 lineage).
 *
 * `schemaVersion` pins the recommendation-record wire shape (versioned per
 * the P3-W1 work order: "an agent proposal output must be a typed, versioned
 * recommendation record").
 */

/**
 * Fields that mark a value as a protocol command or an authority artifact.
 * A proposal carrying any of these — at any nesting depth — is rejected.
 *
 * P3-W1 extension over the old repository's list: the financial-protocol
 * command vocabulary (obligation/clearing/settlement/reservation/netting
 * record ids) is pinned as marker fields too, so a proposal cannot smuggle
 * a protocol artifact by any other name.
 */
export const PROTOCOL_COMMAND_MARKER_FIELDS = [
  "idempotencyKey",
  "commandType",
  "commandId",
  "authorization",
  "authority",
  "authorityEnvelope",
  "mandate",
  "mandateRef",
  "permissionGrant",
  "permissionGrantRef",
  "signature",
  "approvals",
  "obligationId",
  "clearingRecordId",
  "settlementInstructionId",
  "reservationId",
  "nettingPositionId",
  "finalityRecordId",
] as const;

/** The versioned recommendation-record wire shape (P3-W1). */
export const PROPOSAL_SCHEMA_VERSION = 1 as const;

export type ProposalSchemaVersion = typeof PROPOSAL_SCHEMA_VERSION;

export type ProposalType =
  | "money_movement"
  | "strategy"
  | "work_action"
  | "informational";

/**
 * A proposal from one agent instance: a versioned, advisory recommendation.
 * `payload` is opaque, advisory data. It MUST NOT contain protocol-command
 * fields (see assertNotProtocolCommand) — there is no obligation, clearing
 * or settlement call anywhere in this contract.
 */
export interface AgentProposal {
  readonly schemaVersion: ProposalSchemaVersion;
  readonly proposalId: string;
  readonly proposingInstance: string;
  readonly proposalType: ProposalType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly rationale?: string;
  readonly evidenceRefs: readonly string[];
  readonly expiresAt: number;
}

/** Raised when a value carries protocol-command / authority shape. */
export class ProtocolCommandShapeError extends Error {
  constructor(path: string, field: string) {
    super(
      `Value at '${path}' carries protocol command field '${field}': agent proposals are advisory and must not carry command or authority shape`,
    );
    this.name = "ProtocolCommandShapeError";
  }
}

/**
 * Runtime guard: assert that a value does not carry protocol-command or authority
 * shape, at any nesting depth. Agent proposals pass; protocol commands and
 * authority artifacts do not.
 */
export function assertNotProtocolCommand(candidate: unknown): void {
  scanForCommandFields(candidate, "$", new Set());
}

/**
 * Construct a validated AgentProposal: a typed, VERSIONED recommendation
 * record. The schema version is checked, and the payload and the proposal
 * itself are checked against protocol-command shape; a proposal is advisory
 * only — there is no obligation, clearing, settlement, reservation, netting
 * or finality call anywhere in this constructor.
 */
export function makeProposal(proposal: AgentProposal): AgentProposal {
  if (proposal.schemaVersion !== PROPOSAL_SCHEMA_VERSION) {
    throw new ProtocolCommandShapeError(
      "$",
      `schemaVersion must be ${PROPOSAL_SCHEMA_VERSION} (versioned recommendation record)`,
    );
  }
  if (proposal.proposalId.length === 0) {
    throw new ProtocolCommandShapeError("$", "proposalId must not be empty");
  }
  if (proposal.proposingInstance.length === 0) {
    throw new ProtocolCommandShapeError("$", "proposingInstance must not be empty");
  }
  assertNotProtocolCommand(proposal.payload);
  assertNotProtocolCommand(proposal);
  return proposal;
}

function scanForCommandFields(value: unknown, path: string, seen: Set<object>): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  const record = value as Readonly<Record<string, unknown>>;
  for (const field of PROTOCOL_COMMAND_MARKER_FIELDS) {
    if (field in record) {
      throw new ProtocolCommandShapeError(path, field);
    }
  }
  for (const key of Object.keys(record)) {
    scanForCommandFields(record[key], path === "" ? key : `${path}.${key}`, seen);
  }
}
