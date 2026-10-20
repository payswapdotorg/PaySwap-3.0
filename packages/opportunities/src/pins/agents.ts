/**
 * @payswap/opportunities — the pinned wire shapes of the agent proposal
 * seam (P6-W2, lane r4-w2; commit 1/4).
 *
 * Authority: @payswap/agents (P3-W1). Hard law 2 fixes the SEAM:
 * opportunity -> proposal -> decision, NEVER execution — typed against
 * the authority's AgentProposal (a versioned ADVISORY recommendation
 * record whose payload MUST NOT contain protocol-command marker fields).
 * The marker list and schema version are VALUE pins (byte-identical,
 * asserted by test/pins.test.ts); the shape is a STRUCTURAL pin. THE
 * AGENT-CANNOT-EXECUTE LAW (hard law 3) rides this pin: the marker fields
 * are exactly the execution/authority vocabulary an opportunity (and its
 * projection) must never carry.
 */

/**
 * VALUE PIN — authority: @payswap/agents src/proposal.ts
 * `PROTOCOL_COMMAND_MARKER_FIELDS` (byte-identical, all 18 entries, same
 * order): the protocol-command / authority field names an advisory
 * payload must NEVER carry, at any nesting depth.
 */
export const PINNED_PROTOCOL_COMMAND_MARKER_FIELDS = Object.freeze([
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
] as const);

/**
 * VALUE PIN — authority: @payswap/agents src/proposal.ts
 * `PROPOSAL_SCHEMA_VERSION` = 1 (byte-identical): the versioned
 * recommendation-record wire version.
 */
export const PINNED_PROPOSAL_SCHEMA_VERSION = 1 as const;

/**
 * VALUE PIN — authority: @payswap/agents src/proposal.ts
 * `ProposalType` (byte-identical closed vocabulary): the advisory
 * recommendation kinds. An opportunity projection is a "strategy" or
 * "informational" proposal — NEVER a money_movement command.
 */
export const PINNED_PROPOSAL_TYPES = Object.freeze([
  "money_movement",
  "strategy",
  "work_action",
  "informational",
] as const);

/** STRUCTURAL PIN — authority: @payswap/agents `ProposalType`. */
export type PinnedProposalType = (typeof PINNED_PROPOSAL_TYPES)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/agents src/proposal.ts
 * `AgentProposal` (SUBSET: the versioned advisory recommendation wire —
 * schemaVersion, identity, proposing instance, type, opaque payload,
 * rationale, evidence refs and expiry; the authority's full constructor
 * discipline is its own law). `payload` is advisory data and MUST NOT
 * contain any marker field above.
 */
export interface PinnedAgentProposal {
  readonly schemaVersion: typeof PINNED_PROPOSAL_SCHEMA_VERSION;
  readonly proposalId: string;
  readonly proposingInstance: string;
  readonly proposalType: PinnedProposalType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly rationale?: string;
  readonly evidenceRefs: readonly string[];
  readonly expiresAt: number;
}

/**
 * VALUE PIN — authority: @payswap/agents src/proposal.ts
 * `assertNotProtocolCommand` (behaviour-identical deep scan): NO marker
 * field at ANY nesting depth. Cycles traversed once (seen-set);
 * deterministic (the frozen marker-list order).
 */
export function pinnedAssertNotProtocolCommand(candidate: unknown): void {
  const scan = (value: unknown, path: string, seen: Set<unknown>): void => {
    if (value === null || typeof value !== "object") {
      return;
    }
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (
        (PINNED_PROTOCOL_COMMAND_MARKER_FIELDS as readonly string[]).includes(
          key,
        )
      ) {
        throw new Error(
          `Value at '${path}' carries protocol command field '${key}': agent proposals are advisory and must not carry command or authority shape`,
        );
      }
      scan(record[key], `${path}.${key}`, seen);
    }
  };
  scan(candidate, "$", new Set());
}
