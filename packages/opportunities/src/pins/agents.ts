/**
 * @payswap/opportunities — the pinned wire shapes of the agent proposal
 * seam (P6-W2, lane r4-w2; commit 1/4).
 *
 * Authority: @payswap/agents (P3-W1 — the Agent Body/Instance/Package,
 * Organizations and communications authority). The work order's hard law
 * 2 fixes the SEAM: opportunities are INPUTS TO DECISIONS, never
 * financial authority — opportunity -> proposal -> decision, NEVER
 * execution. The proposal wire an opportunity is surfaced through is the
 * authority's AgentProposal (a versioned ADVISORY recommendation record),
 * and the authority's own law carries the package here:
 *
 * - a proposal's payload is OPAQUE ADVISORY DATA that MUST NOT contain
 *   protocol-command fields (the authority's PROTOCOL_COMMAND_MARKER_
 *   FIELDS list — idempotencyKey, commandType, authorization, mandate,
 *   signature, approvals, obligationId, settlementInstructionId, ...);
 * - the schema is VERSIONED (PROPOSAL_SCHEMA_VERSION = 1);
 * - the proposal types include "strategy" and "informational" — the
 *   advisory types an opportunity projection carries.
 *
 * This package pins the marker-field list and the schema version as VALUE
 * pins (byte-identical; cross-lane consistency asserted by
 * test/pins.test.ts) and the AgentProposal shape as a STRUCTURAL pin, so
 * the opportunity -> proposal -> decision seam is TYPED against the
 * authority's wire — never a local invention, never a value import.
 *
 * THE AGENT-CANNOT-EXECUTE LAW (hard law 3) rides this pin: agents may
 * DISCOVER/SURFACE opportunities but cannot EXECUTE them — the marker
 * fields below are exactly the execution/authority vocabulary an
 * opportunity (and its proposal projection) must never carry, and the
 * seam exposes no function that converts an opportunity into anything
 * execution-shaped.
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
 * `assertNotProtocolCommand` (behaviour-identical deep scan): asserts a
 * value carries NO protocol-command / authority marker field at ANY
 * nesting depth. Agent proposals pass; protocol commands and authority
 * artifacts do not. Pinned locally so the seam can fail closed without a
 * runtime dependency; cycles are traversed once (seen-set), arrays are
 * scanned element-wise, and the scan is deterministic (key order of the
 * frozen marker list).
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
