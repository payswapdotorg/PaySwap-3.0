/**
 * @payswap/protocol — protocol-owned finality (P1-W2, MMI-12 PORT).
 *
 * Adapted from payswap.org@8a735bf packages/settlement/src/finality.ts
 * (old Work Order W1-004; old INV-F06 → canonical INV-01; old INV-X04 →
 * canonical INV-03/04). INV-01 + INV-24 (no fake success): finality is
 * PROTOCOL-OWNED — no component outside the protocol authority can declare
 * financial finality. Concretely:
 *
 * - a `FinalityRecord` is constructible ONLY through `FinalityAuthority`;
 * - `declareFinality` requires a PROTOCOL-AUTHORIZED instruction: the
 *   candidate must be exactly one of the settlement instructions the
 *   protocol itself derives from the netting set + obligations
 *   (`verifyProtocolAuthorization` re-derives with the protocol's own
 *   functions and compares canonical content) — a hand-minted or tampered
 *   instruction cannot reach finality, so certificates (which require a
 *   FINAL record) only issue from protocol-authorized instructions;
 * - the instruction must be FULLY RECONCILED (INV-04): no OUTCOME_UNKNOWN
 *   attempt, no OPEN case, at least one SUCCEEDED attempt (value moved);
 * - the policy-required proof level must be satisfied by the presented
 *   evidence chain.
 *
 * SUBMITTED IS NOT FINALITY: an IN_FLIGHT or even SUCCEEDED attempt is an
 * observation of an external rail operation — finality is declared here,
 * once, after reconciliation completeness and proof satisfaction. FINAL is
 * terminal; the only exit is the `REVERSE` recovery rule, legal ONLY with a
 * compensating-obligation reference — disputes never edit the original
 * transaction, they create separate adjustment obligations, and the FINAL
 * declaration stays in the append-only history.
 */

import { ValidationError } from '../errors.ts';
import type { PaySwapErrorDetails } from '../errors.ts';
import type { TimestampMs } from '../clock.ts';
import type { Money } from '../money.ts';
import { equals } from '../money.ts';
import {
  canonicalNetPosition,
  netPositions,
  settlementInstructions,
} from '../netting.ts';
import type { NettingSet, ProtocolSettlementInstruction, SettlementInstructionId } from '../netting.ts';
import type { Obligation } from '../obligation.ts';
import { defineStateMachine } from '../state-machine.ts';
import type { StateMachine, TransitionRecord } from '../state-machine.ts';
import { proofSatisfaction } from './proof.ts';
import type { ProofContext, ProofPolicy } from './proof.ts';
import type { EvidenceNode } from './evidence.ts';
import type { SettlementInstruction } from './instructions.ts';
import type { SettlementReconciliationAuthority } from './reconciliation.ts';
import type { SettlementAttemptLedger } from './attempt-ledger.ts';

export type FinalityState = 'PROVISIONAL' | 'FINAL' | 'REVERSED';

export type FinalityEvent = 'FINALIZE' | 'REVERSE';

/** Canonical finality lifecycle: FINAL/REVERSED terminal; the only exit from FINAL is REVERSE (compensating obligation required). */
export const finalityStateMachine: StateMachine<FinalityState, FinalityEvent, unknown> =
  defineStateMachine<FinalityState, FinalityEvent, unknown>({
    name: 'settlement-finality',
    initial: 'PROVISIONAL',
    states: ['PROVISIONAL', 'FINAL', 'REVERSED'],
    events: ['FINALIZE', 'REVERSE'],
    transitions: [
      {
        from: 'PROVISIONAL',
        on: 'FINALIZE',
        to: 'FINAL',
        description: 'finality is declarable only by the protocol-owning authority',
      },
    ],
    terminalStates: ['FINAL', 'REVERSED'],
    recovery: [
      {
        from: 'FINAL',
        on: 'REVERSE',
        to: 'REVERSED',
        description:
          'explicit recovery only: reversal references a compensating obligation; history is never rewritten',
      },
    ],
  });

/** One recorded finality transition (history is append-only). */
export interface FinalityTransitionRecord extends TransitionRecord<FinalityState, FinalityEvent> {
  readonly recordedAt: TimestampMs;
}

/** Protocol-authorization proof: the netting set + PENDING obligations the protocol derived the instruction from. */
export interface ProtocolAuthorizationProof {
  readonly nettingSet: NettingSet;
  readonly obligations: readonly Obligation[];
}

/** The deterministic result of a protocol-authorization verification. */
export interface ProtocolAuthorizationVerification {
  readonly authorized: boolean;
  /** The protocol-derived instruction the candidate matched, when authorized. */
  readonly matchedInstruction?: ProtocolSettlementInstruction;
  readonly reasons: readonly string[];
}

/**
 * INV-01 verification: re-derive the protocol settlement instructions from
 * the netting set + obligations and check the candidate is exactly one of
 * them — same set, parties, exact amount and byte-identical canonical net
 * position. Anything else (hand-minted or tampered) is NOT protocol-
 * authorized and can never reach finality. Invalid proof inputs propagate
 * the protocol's typed errors: verification fails closed.
 */
export function verifyProtocolAuthorization(
  candidate: ProtocolSettlementInstruction,
  proof: ProtocolAuthorizationProof,
): ProtocolAuthorizationVerification {
  if (candidate === null || typeof candidate !== 'object') {
    throw new ValidationError('candidate must be a protocol SettlementInstruction');
  }
  if (proof === null || typeof proof !== 'object') {
    throw new ValidationError('proof must be a ProtocolAuthorizationProof');
  }
  const positions = netPositions(proof.nettingSet, proof.obligations);
  const derived = settlementInstructions(positions);
  for (const instruction of derived) {
    const sameParties =
      instruction.setId === candidate.setId &&
      instruction.debtor === candidate.debtor &&
      instruction.creditor === candidate.creditor;
    const sameAmount = equals(instruction.amount, candidate.amount);
    const sameDerivation =
      canonicalNetPosition(instruction.fromNetPosition) ===
      canonicalNetPosition(candidate.fromNetPosition);
    if (sameParties && sameAmount && sameDerivation) {
      return Object.freeze({
        authorized: true,
        matchedInstruction: instruction,
        reasons: Object.freeze(['PROTOCOL_DERIVATION_MATCHED']),
      });
    }
  }
  return Object.freeze({
    authorized: false,
    reasons: Object.freeze([
      'NO_PROTOCOL_DERIVATION_MATCHED',
      `derived:${derived.length}`,
    ]),
  });
}

/** The instruction is not protocol-authorized (INV-01 violation). */
export class FinalityNotProtocolAuthorizedError extends ValidationError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super(message, details);
    this.name = 'FinalityNotProtocolAuthorizedError';
  }
}

/** Finality preconditions (reconciliation completeness) unmet. */
export class FinalityPreconditionsUnmetError extends ValidationError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super(message, details);
    this.name = 'FinalityPreconditionsUnmetError';
  }
}

/** The policy-required proof level was not presented. */
export class FinalityInsufficientProofError extends ValidationError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super(message, details);
    this.name = 'FinalityInsufficientProofError';
  }
}

/** Finality record id conflicts are never reused. */
export class FinalityRecordConflictError extends ValidationError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super(message, details);
    this.name = 'FinalityRecordConflictError';
  }
}

/** Immutable finality record — constructible ONLY through `FinalityAuthority`. */
export interface FinalityRecord {
  readonly finalityId: string;
  readonly instructionId: SettlementInstructionId;
  readonly amount: Money;
  readonly state: FinalityState;
  /** The proof levels measured at declaration. */
  readonly proof: { readonly required: string; readonly achieved: string };
  /** Reconciliation cases resolved for this instruction (INV-04 evidence). */
  readonly reconciliationRefs: readonly string[];
  readonly declaredAt?: TimestampMs;
  readonly reversedAt?: TimestampMs;
  /** REQUIRED when REVERSED — the compensating obligation (recovery rule). */
  readonly compensatingObligationRef?: string;
  readonly history: readonly FinalityTransitionRecord[];
}

export interface DeclareFinalityInput {
  readonly finalityId: string;
  readonly instruction: SettlementInstruction;
  readonly authorization: ProtocolAuthorizationProof;
  readonly policy: ProofPolicy;
  readonly proofContext: ProofContext;
  readonly evidence: readonly EvidenceNode[];
  readonly now: TimestampMs;
}

/**
 * The settlement-plane finality authority (INV-01): every declaration
 * re-verifies protocol authorization, reconciliation completeness (INV-04)
 * and proof satisfaction. Nothing outside this authority mints a
 * `FinalityRecord`.
 */
export class FinalityAuthority {
  readonly #ledger: SettlementAttemptLedger;
  readonly #reconciliation: SettlementReconciliationAuthority;
  readonly #records = new Map<string, FinalityRecord>();
  readonly #finalityByInstruction = new Map<SettlementInstructionId, string>();

  constructor(ledger: SettlementAttemptLedger, reconciliation: SettlementReconciliationAuthority) {
    this.#ledger = ledger;
    this.#reconciliation = reconciliation;
  }

  /**
   * Declare financial finality for one settlement instruction. Checks, in
   * order (all typed, all fail-closed): (1) INV-01 protocol authorization
   * (re-derived); (2) INV-04 full reconciliation (no OUTCOME_UNKNOWN
   * attempt, no OPEN case, at least one SUCCEEDED); (3) the presented
   * evidence chain meets the policy-required proof level. Refund/dispute
   * symmetry: the proof context carries the direction; the required level is
   * symmetric by construction.
   */
  declareFinality(input: DeclareFinalityInput): FinalityRecord {
    if (input === null || typeof input !== 'object') throw new ValidationError('declare-finality input must be an object');
    if (typeof input.finalityId !== 'string' || input.finalityId.length === 0) throw new ValidationError('finalityId must be a non-empty string');
    if (this.#records.has(input.finalityId)) {
      throw new FinalityRecordConflictError(
        `finality record '${input.finalityId}' already exists — ids are never reused`,
        { finalityId: input.finalityId },
      );
    }
    const existingForInstruction = this.#finalityByInstruction.get(input.instruction.id);
    if (existingForInstruction !== undefined) {
      throw new FinalityRecordConflictError(
        `instruction '${input.instruction.id}' already has finality record '${existingForInstruction}' — finality is declared once per instruction; adjustments are new obligations`,
        { finalityId: input.finalityId, instructionId: input.instruction.id },
      );
    }
    if (input.instruction === null || typeof input.instruction !== 'object') throw new ValidationError('instruction must be a SettlementInstruction');
    if (typeof input.now !== 'bigint') throw new ValidationError('now must be a bigint TimestampMs');

    // 1. INV-01: protocol-owned finality.
    const verification = verifyProtocolAuthorization(input.instruction, input.authorization);
    if (!verification.authorized) {
      throw new FinalityNotProtocolAuthorizedError(
        'financial finality is protocol-owned — the instruction does not match any protocol-derived settlement instruction for the presented authorization proof',
        { finalityId: input.finalityId, instructionId: input.instruction.id, reasons: [...verification.reasons] },
      );
    }

    // 2. INV-04: reconciliation completeness for this instruction.
    const attempts = this.#ledger.attemptsForInstruction(input.instruction.id);
    const unresolved = attempts.filter((attempt) => attempt.state === 'OUTCOME_UNKNOWN');
    const openCases = this.#reconciliation.openCasesForInstruction(input.instruction.id);
    const succeeded = attempts.filter((attempt) => attempt.state === 'SUCCEEDED');
    const preconditionFailures: string[] = [];
    if (unresolved.length > 0) {
      preconditionFailures.push(
        `OUTCOME_UNKNOWN_ATTEMPTS:${unresolved.map((attempt) => attempt.attemptId).join(',')}`,
      );
    }
    if (openCases.length > 0) {
      preconditionFailures.push(
        `OPEN_RECONCILIATION_CASES:${openCases.map((record) => record.caseId).join(',')}`,
      );
    }
    if (succeeded.length === 0) {
      preconditionFailures.push('NO_SUCCEEDED_ATTEMPT');
    }
    if (preconditionFailures.length > 0) {
      throw new FinalityPreconditionsUnmetError(
        'finality requires a fully reconciled instruction — ambiguity must be resolved through reconciliation before finality',
        { finalityId: input.finalityId, failures: preconditionFailures },
      );
    }

    // 3. Policy-required proof.
    const satisfaction = proofSatisfaction(input.policy, input.proofContext, input.evidence);
    if (!satisfaction.satisfied) {
      throw new FinalityInsufficientProofError(
        'finality requires the policy-required proof — the presented evidence chain is insufficient',
        {
          finalityId: input.finalityId,
          policyId: input.policy.policyId,
          required: satisfaction.required,
          achieved: satisfaction.achieved,
          gaps: [...satisfaction.gaps],
        },
      );
    }

    // Kernel machine: PROVISIONAL --FINALIZE--> FINAL (terminality discipline).
    const transition = finalityStateMachine.transition('PROVISIONAL', 'FINALIZE');
    const record: FinalityRecord = Object.freeze({
      finalityId: input.finalityId,
      instructionId: input.instruction.id,
      amount: input.instruction.amount,
      state: transition.to,
      proof: Object.freeze({
        required: satisfaction.required,
        achieved: satisfaction.achieved,
      }),
      reconciliationRefs: Object.freeze(
        this.#reconciliation
          .casesForInstruction(input.instruction.id)
          .map((recordCase) => recordCase.caseId),
      ),
      declaredAt: input.now,
      history: Object.freeze([
        Object.freeze({
          from: transition.from,
          on: transition.on,
          to: transition.to,
          viaRecovery: transition.viaRecovery,
          recordedAt: input.now,
        }),
      ]),
    });
    this.#records.set(record.finalityId, record);
    this.#finalityByInstruction.set(record.instructionId, record.finalityId);
    return record;
  }

  /**
   * The explicit FINAL → REVERSED recovery — legal ONLY with a
   * compensating-obligation reference (disputes create separate adjustment
   * obligations; the FINAL declaration stays in the append-only history).
   */
  reverse(
    finalityId: string,
    input: {
      readonly compensatingObligationRef: string;
      readonly now: TimestampMs;
    },
  ): FinalityRecord {
    const existing = this.#records.get(finalityId);
    if (existing === undefined) throw new ValidationError(`unknown finality record: ${finalityId}`);
    if (input === null || typeof input !== 'object') throw new ValidationError('reverse input must be an object');
    if (typeof input.compensatingObligationRef !== 'string' || input.compensatingObligationRef.length === 0) {
      throw new ValidationError(
        'a finality reversal requires a compensating obligation reference — disputes create separate adjustment obligations, never rewrites',
      );
    }
    if (typeof input.now !== 'bigint') throw new ValidationError('now must be a bigint TimestampMs');
    const transition = finalityStateMachine.transition(existing.state, 'REVERSE');
    const record: FinalityRecord = Object.freeze({
      ...existing,
      state: transition.to,
      reversedAt: input.now,
      compensatingObligationRef: input.compensatingObligationRef,
      history: Object.freeze([
        ...existing.history,
        Object.freeze({
          from: transition.from,
          on: transition.on,
          to: transition.to,
          viaRecovery: transition.viaRecovery,
          recordedAt: input.now,
        }),
      ]),
    });
    this.#records.set(finalityId, record);
    return record;
  }

  /** One finality record by id (frozen, immutable). */
  record(finalityId: string): FinalityRecord | undefined {
    return this.#records.get(finalityId);
  }

  /** All records, in declaration order (audit view). */
  allRecords(): readonly FinalityRecord[] {
    return [...this.#records.values()];
  }
}
