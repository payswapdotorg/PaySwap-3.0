/**
 * @payswap/opportunities — the opportunity -> proposal -> decision seam
 * (P6-W2, lane r4-w2; NET-NEW — hard law 2: opportunities are inputs to
 * decisions, never financial authority; typed against the pinned agents
 * proposal wire, never invented locally).
 *
 * THE LAW: a FinancialOpportunity is DISCOVERY EVIDENCE; its only route
 * onward is the ADVISORY proposal wire (the pinned AgentProposal), an
 * input to a DECISION owned by the authorization lanes. No function here
 * turns an opportunity into anything execution-shaped; the marker-field
 * scan rejects smuggled command/authority shape. `agentCanExecute-
 * Opportunities()` returns literal false (agents may discover/surface,
 * never execute).
 */

import { ProposalSeamError } from "./errors.ts";
import {
  PINNED_PROTOCOL_COMMAND_MARKER_FIELDS,
  PINNED_PROPOSAL_SCHEMA_VERSION,
  pinnedAssertNotProtocolCommand,
} from "./pins/agents.ts";
import type { PinnedAgentProposal } from "./pins/agents.ts";
import { resolveOpportunity } from "./observation.ts";
import type { FinancialOpportunity } from "./model.ts";

/** The seam's name (frozen): opportunity -> proposal -> decision. */
export const OPPORTUNITY_PROPOSAL_SEAM =
  "opportunity->proposal->decision" as const;

/**
 * The decision authority is DOWNSTREAM of the seam and never here: the
 * lanes that own authorization decide; this package only supplies
 * evidence-backed inputs.
 */
export const DECISION_AUTHORITY = "downstream-authorization-lanes" as const;

/**
 * The agent-cannot-execute law, restated at the seam: agents may
 * DISCOVER/SURFACE opportunities (through proposals) but can NEVER
 * execute them. Returns false, always.
 */
export function agentCanExecuteOpportunities(): false {
  return false;
}

/** Input to the proposal projection (the caller supplies the wire ids). */
export interface OpportunityProposalDraftInput {
  readonly proposalId: string;
  readonly proposingInstance: string;
  readonly expiresAt: number;
}

function lineageEvidenceRefs(
  opportunity: FinancialOpportunity,
): readonly string[] {
  const refs: string[] = [];
  for (const observation of opportunity.supportingObservations) {
    refs.push(...observation.evidenceRefs);
  }
  for (const leg of opportunity.arbitrageLegs ?? []) {
    refs.push(`arbitrage-leg:${leg.legId}`);
  }
  if (opportunity.policyApprovalRef !== undefined) {
    refs.push(opportunity.policyApprovalRef);
  }
  return Object.freeze([...new Set(refs)]);
}

function estimateSummary(opportunity: FinancialOpportunity): string {
  const estimate = opportunity.expectedReturn;
  if (estimate.point === null || estimate.bounds === null) {
    return "expected return UNKNOWN: no verified component (honest disclosure)";
  }
  return `expected return estimate ${estimate.point.numerator}/${estimate.point.denominator} per year (bounds ${estimate.bounds.low.numerator}/${estimate.bounds.low.denominator} .. ${estimate.bounds.high.numerator}/${estimate.bounds.high.denominator}) — an estimate with uncertainty bounds, not a claim`;
}

/**
 * Projects one opportunity into a pinned-shape ADVISORY proposal draft —
 * the ONLY route onward from discovery (the seam). The projection:
 * - is typed "strategy" (an opportunity surfaced FOR a decision) — the
 *   proposal wire's advisory strategy kind, never a money_movement
 *   command;
 * - carries the deterministic opportunity identity, the rail, the
 *   estimate summary and the full evidence-lineage refs;
 * - is validated against the pinned protocol-command marker fields at
 *   EVERY nesting depth BEFORE it is returned (fail closed);
 * - is resolved at the caller-supplied instant: a STALE opportunity
 *   fails closed — a stale observation is never proposed as if current
 *   (ProposalSeamError; the caller re-discovers instead).
 *
 * The DRAFT is advisory data only: deciding (and anything execution-
 * shaped) belongs to the authorization lanes, never here.
 */
export function opportunityProposalDraft(
  opportunity: FinancialOpportunity,
  input: OpportunityProposalDraftInput,
  at: number,
): PinnedAgentProposal {
  if (
    typeof input.proposalId !== "string" ||
    input.proposalId.length === 0
  ) {
    throw new ProposalSeamError(
      "a proposal draft requires a non-empty proposalId",
    );
  }
  if (
    typeof input.proposingInstance !== "string" ||
    input.proposingInstance.length === 0
  ) {
    throw new ProposalSeamError(
      "a proposal draft requires a non-empty proposingInstance",
    );
  }
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= at) {
    throw new ProposalSeamError(
      "a proposal draft must expire strictly after the projection instant (an expired-on-arrival proposal is malformed)",
    );
  }
  const resolution = resolveOpportunity(opportunity, at);
  if (resolution.status === "STALE") {
    throw new ProposalSeamError(
      `opportunity '${opportunity.opportunityId}' is STALE at the projection instant — a stale observation is never proposed as if current (re-discover instead)`,
    );
  }
  const payload: Readonly<Record<string, unknown>> = Object.freeze({
    seam: OPPORTUNITY_PROPOSAL_SEAM,
    opportunityId: opportunity.opportunityId,
    family: opportunity.family,
    rail: opportunity.rail,
    title: opportunity.title,
    estimate: estimateSummary(opportunity),
    evidenceFreshness: opportunity.evidenceFreshness,
    policyEligibility: opportunity.policyEligibility,
    decisionAuthority: DECISION_AUTHORITY,
  });
  const draft: PinnedAgentProposal = Object.freeze({
    schemaVersion: PINNED_PROPOSAL_SCHEMA_VERSION,
    proposalId: input.proposalId,
    proposingInstance: input.proposingInstance,
    proposalType: "strategy",
    payload,
    rationale: `evidence-backed opportunity projection at instant ${String(at)}: ${estimateSummary(opportunity)}`,
    evidenceRefs: lineageEvidenceRefs(opportunity),
    expiresAt: input.expiresAt,
  });
  // The marker-field gate (deep scan, fail closed BEFORE return).
  pinnedAssertNotProtocolCommand(draft);
  return draft;
}

/**
 * Runtime guard for seam consumers: asserts a value carries NO
 * protocol-command / authority marker field at any nesting depth (the
 * pinned agents-law scan, re-exported for the seam's consumers).
 */
export function assertOpportunityProjectionIsAdvisory(
  candidate: unknown,
): void {
  pinnedAssertNotProtocolCommand(candidate);
}

/** The frozen marker-field list (re-exported seam surface for tests/audit). */
export const SEAM_FORBIDDEN_FIELDS = PINNED_PROTOCOL_COMMAND_MARKER_FIELDS;
