/**
 * @payswap/adversarial — the BLOCK escalation records (P6-W3, lane
 * r4-w3; NET-NEW — the INV-21 escalate-only law's security-block
 * surface, composing with the trust lane's SecurityBlockRegistry
 * through the PINNED record shapes, never importing it).
 *
 * THE LAW (canonical INV-21 + the trust plane's block law,
 * packages/trust/src/security-block.ts):
 *
 *   A BLOCK verdict is STICKY ACROSS EPOCH ADVANCEMENT. The ONLY path
 *   that retires a block is an EXPLICIT higher-authority revocation —
 *   a separate, append-only, evidence-carrying record naming the
 *   revoking authority and its reason.
 *
 * What ADVERSARIAL INTELLIGENCE may do with blocks (the whole of it):
 * - PROPOSE block registrations (harden-only: `proposeBlockEscalation`
 *   accepts ONLY BLOCK-grade intelligence — a critical detection or a
 *   BLOCK verdict — and produces a registration input shaped exactly
 *   like the trust lane's SecurityBlockRecord pin, for the WIRING
 *   LAYER to submit to the real registry);
 * - RECORD its proposals in an append-only ledger (audit lineage);
 * - CORROBORATE: a composed decision that is already BLOCK stays BLOCK.
 *
 * What it may NEVER do (structurally absent):
 * - downgrade, weaken or expire a block;
 * - revoke a block (revocation is the trust plane's explicit
 *   higher-authority path — this package offers NO API for it);
 * - bypass a block (attemptBlockBypass ALWAYS throws —
 *   ./block-authority.ts);
 * - re-date, rewrite or remove an escalation record (append-only).
 *
 * Deterministic only: pure functions + append-only state; callers pass
 * every instant and epoch.
 */

import { contentDigest, type SecurityBlockRecordPin, type ThreatVerdict } from "../pins/index.ts";
import { VERDICT_RANK } from "../pins/index.ts";
import { BlockDowngradeForbiddenError, GATE_DECISION_RANK } from "../block-authority.ts";

/** A proposed security-block registration (harden-only intelligence). */
export interface BlockEscalationProposal {
  /** Deterministic content digest of the proposal (identity). */
  readonly escalationId: string;
  /** Opaque reference to what is blocked (principal, resource, action class...). */
  readonly subjectRef: string;
  readonly reason: string;
  /** Network security epoch at which the block would be issued. */
  readonly issuedAtEpoch: bigint;
  /** Opaque evidence references backing the block. */
  readonly evidenceRefs: readonly string[];
  /** Signal/assessment ids that drove the escalation (audit lineage). */
  readonly sourceRefs: readonly string[];
  readonly proposedBy: string;
  readonly proposedAt: number;
}

/** One append-only escalation-ledger event. */
export type BlockEscalationEvent =
  | { readonly eventType: "proposed"; readonly proposal: BlockEscalationProposal }
  | {
      readonly eventType: "registered";
      readonly escalationId: string;
      readonly registeredAtEpoch: bigint;
    };

/** Raised on invalid escalation operations (fail closed). */
export class BlockEscalationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockEscalationError";
  }
}

/**
 * Propose a security-block registration. HARDEN-ONLY: the driving
 * intelligence must be BLOCK-grade (a BLOCK verdict or a critical
 * detection) — anything weaker is not an escalation and fails closed.
 * The proposal is shaped exactly like the trust lane's pinned
 * SecurityBlockRecord publication input; the WIRING LAYER submits it
 * to the real registry (this package cannot — and offers no API to —
 * revoke, downgrade or expire anything once registered).
 */
export function proposeBlockEscalation(input: {
  readonly subjectRef: string;
  readonly reason: string;
  readonly issuedAtEpoch: bigint;
  readonly evidenceRefs: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly proposedBy: string;
  readonly proposedAt: number;
  readonly grade:
    | { readonly kind: "verdict"; readonly verdict: ThreatVerdict }
    | { readonly kind: "severity"; readonly severity: "critical" };
}): BlockEscalationProposal {
  if (input.subjectRef.length === 0) {
    throw new BlockEscalationError("escalation requires a subjectRef");
  }
  if (input.reason.length === 0) {
    throw new BlockEscalationError("escalation requires a reason");
  }
  if (input.issuedAtEpoch < 0n) {
    throw new BlockEscalationError("issuedAtEpoch must be >= 0 (genesis epoch)");
  }
  if (input.evidenceRefs.length === 0) {
    throw new BlockEscalationError(
      "an escalation without evidence refs is unconstructible (evidence-mandatory law)",
    );
  }
  const blockGrade =
    input.grade.kind === "verdict"
      ? VERDICT_RANK[input.grade.verdict] === VERDICT_RANK.BLOCK
      : input.grade.severity === "critical";
  if (!blockGrade) {
    throw new BlockEscalationError(
      "escalation is HARDEN-ONLY: the driving intelligence must be BLOCK-grade " +
        "(a BLOCK verdict or a critical detection) — propose no lesser block",
    );
  }
  const proposal: BlockEscalationProposal = Object.freeze({
    escalationId: contentDigest({
      subjectRef: input.subjectRef,
      reason: input.reason,
      issuedAtEpoch: input.issuedAtEpoch,
      evidenceRefs: input.evidenceRefs,
      sourceRefs: input.sourceRefs,
      proposedBy: input.proposedBy,
      proposedAt: input.proposedAt,
    }),
    subjectRef: input.subjectRef,
    reason: input.reason,
    issuedAtEpoch: input.issuedAtEpoch,
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    sourceRefs: Object.freeze([...input.sourceRefs]),
    proposedBy: input.proposedBy,
    proposedAt: input.proposedAt,
  });
  return proposal;
}

/**
 * The trust-plane registration input for a proposal — shaped exactly
 * like the pinned SecurityBlockRecord (id, subjectRef, reason,
 * issuedAtEpoch, evidenceRefs). The wiring layer submits this to the
 * REAL SecurityBlockRegistry; once registered, the block survives
 * epoch advancement and leaves only through the trust plane's explicit
 * higher-authority revocation (no API here).
 */
export function blockRegistrationInputFor(
  proposal: BlockEscalationProposal,
): Omit<SecurityBlockRecordPin, "id"> & { readonly id: string } {
  return Object.freeze({
    id: `block:${proposal.escalationId}`,
    subjectRef: proposal.subjectRef,
    reason: proposal.reason,
    issuedAtEpoch: proposal.issuedAtEpoch,
    evidenceRefs: [...proposal.evidenceRefs],
  });
}

/**
 * The append-only escalation ledger: records proposals and the
 * trust-plane registration confirmations. There is deliberately NO
 * operation that downgrades, revokes, re-dates or removes anything
 * (INV-21; the only block exit is the trust plane's higher-authority
 * revocation, outside this package).
 */
export class BlockEscalationLedger {
  readonly #proposals = new Map<string, BlockEscalationProposal>();
  readonly #events: BlockEscalationEvent[] = [];

  /** Records a proposal (append-only; escalation ids are unique). */
  record(proposal: BlockEscalationProposal): BlockEscalationProposal {
    if (this.#proposals.has(proposal.escalationId)) {
      throw new BlockEscalationError(
        `escalation '${proposal.escalationId}' is already recorded (append-only ledger)`,
      );
    }
    this.#proposals.set(proposal.escalationId, proposal);
    this.#events.push({ eventType: "proposed", proposal });
    return proposal;
  }

  /**
   * Records the trust-plane registration confirmation of a proposal
   * (append-only; the real registry now owns the block — nothing in
   * this package can touch it).
   */
  recordRegistration(input: {
    readonly escalationId: string;
    readonly registeredAtEpoch: bigint;
  }): void {
    if (!this.#proposals.has(input.escalationId)) {
      throw new BlockEscalationError(
        `escalation '${input.escalationId}' is unknown (record the proposal first)`,
      );
    }
    this.#events.push({
      eventType: "registered",
      escalationId: input.escalationId,
      registeredAtEpoch: input.registeredAtEpoch,
    });
  }

  byId(escalationId: string): BlockEscalationProposal | undefined {
    return this.#proposals.get(escalationId);
  }

  /** All proposals in record order. */
  list(): readonly BlockEscalationProposal[] {
    return [...this.#proposals.values()];
  }

  /** Append-only history. Never rewritten. */
  history(): readonly BlockEscalationEvent[] {
    return [...this.#events];
  }
}

/**
 * RUNTIME GUARD: assert a composed decision never downgrades (the
 * escalate-only law at the escalation boundary). Throws
 * BlockDowngradeForbiddenError when the target is less restrictive
 * than the source; a no-op otherwise. Fail-closed re-evaluation flows
 * call this after every composition.
 */
export function assertEscalationOnly(
  from: keyof typeof GATE_DECISION_RANK,
  to: keyof typeof GATE_DECISION_RANK,
): void {
  if (GATE_DECISION_RANK[to] < GATE_DECISION_RANK[from]) {
    throw new BlockDowngradeForbiddenError(to, "escalation-guard");
  }
}
