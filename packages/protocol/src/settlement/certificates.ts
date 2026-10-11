/**
 * @payswap/protocol — settlement certificates (P1-W2, MMI-17 PORT).
 *
 * Adapted from payswap.org@8a735bf packages/settlement/src/certificates.ts
 * (old Work Order W1-004). Old cross-package payment-plane subjects
 * (off-network record cases, recurring mandate renewal cases) are NOT
 * ported as certificate fields — the payment plane (P5-W3) owns those
 * artifacts and the deferral register records the omission; the certificate
 * keeps the evidence chain, the reconciliation references and the
 * remittance references (the pinned structural RemittanceAllocation).
 *
 * A `SettlementCertificate` is the receipt-of-record for one settlement
 * instruction. It is issued ONLY for:
 *
 * - PROTOCOL-AUTHORIZED instructions (INV-01): issuance looks the finality
 *   record up inside the `FinalityAuthority` by id — the finality record
 *   itself was minted only after protocol re-derivation verified the
 *   instruction, so certificates only issue from protocol-authorized
 *   instructions; the certificate additionally binds to the exact
 *   instruction identity and refuses mismatches;
 * - FULLY-RECONCILED instructions (INV-04): every reconciliation reference
 *   carried by the certificate must be a RESOLVED case, and no OPEN case may
 *   remain for the instruction;
 * - PROOF-SATISFIED instructions: the finality record exists only with a
 *   satisfied proof policy, and the certificate echoes the measured levels.
 *
 * Certificates are immutable and replay-safe: re-issuing identical content
 * under the same id is an idempotent replay; ANY content difference under a
 * recorded id is rejected.
 */

import { ValidationError } from '../errors.ts';
import type { PaySwapErrorDetails } from '../errors.ts';
import type { TimestampMs } from '../clock.ts';
import { equals } from '../money.ts';
import type { Money } from '../money.ts';
import type { EvidenceGraph } from './evidence.ts';
import type { FinalityAuthority } from './finality.ts';
import type { SettlementAttemptLedger } from './attempt-ledger.ts';
import type { SettlementInstruction } from './instructions.ts';
import type { RemittanceAllocation } from './instructions.ts';
import type { SettlementReconciliationAuthority } from './reconciliation.ts';

/** Branded-ish certificate id (validated non-empty string). */
export type SettlementCertificateId = string;

/** Certificate issuance refused — the reason is always typed. */
export type CertificateRefusalReason =
  | 'FINALITY_UNKNOWN'
  | 'FINALITY_NOT_FINAL'
  | 'INSTRUCTION_MISMATCH'
  | 'EVIDENCE_NODE_UNKNOWN'
  | 'EVIDENCE_NOT_LINKED'
  | 'RECONCILIATION_CASE_UNKNOWN'
  | 'RECONCILIATION_NOT_RESOLVED'
  | 'RECONCILIATION_STILL_OPEN';

/** Issuance refused (fail-closed with the typed reason). */
export class CertificateIssuanceError extends ValidationError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super(message, details);
    this.name = 'CertificateIssuanceError';
  }
}

/** Certificate id already recorded with different content (immutable). */
export class CertificateConflictError extends ValidationError {
  constructor(message: string, details?: PaySwapErrorDetails) {
    super(message, details);
    this.name = 'CertificateConflictError';
  }
}

/** The immutable settlement certificate. */
export interface SettlementCertificate {
  readonly certificateId: SettlementCertificateId;
  readonly instructionId: string;
  readonly finalityId: string;
  readonly amount: Money;
  /** Remittance references preserved end-to-end (payment → instruction → certificate). */
  readonly remittance: readonly RemittanceAllocation[];
  /** Evidence lineage node ids (authorization + execution + outcome…). */
  readonly evidenceChain: readonly string[];
  /** Reconciliation case ids — all RESOLVED (INV-04). */
  readonly reconciliationRefs: readonly string[];
  readonly issuedAt: TimestampMs;
  /** Deterministic canonical rendering (byte-identical on replay). */
  readonly canonical: string;
}

export interface IssueCertificateInput {
  readonly certificateId: string;
  /** The finality record id INSIDE the authority (never a forged record). */
  readonly finalityId: string;
  readonly instruction: SettlementInstruction;
  readonly evidenceChain: readonly string[];
  readonly reconciliationRefs: readonly string[];
  readonly now: TimestampMs;
}

/**
 * Deterministic canonical rendering of a certificate (field-by-field — never
 * key-order JSON): identical inputs always produce byte-identical output, so
 * replays are equality checks, never ambiguity.
 */
function canonicalCertificate(input: {
  readonly certificateId: string;
  readonly instructionId: string;
  readonly finalityId: string;
  readonly amount: Money;
  readonly remittance: readonly RemittanceAllocation[];
  readonly evidenceChain: readonly string[];
  readonly reconciliationRefs: readonly string[];
  readonly issuedAt: TimestampMs;
}): string {
  const remittance = input.remittance
    .map(
      (allocation) =>
        `${allocation.documentKind}:${allocation.documentId}:${allocation.allocatedAmount.currency}:${allocation.allocatedAmount.value}`,
    )
    .join(',');
  return (
    `settlement-certificate|id:${input.certificateId}` +
    `|instruction:${input.instructionId}` +
    `|finality:${input.finalityId}` +
    `|amount:${input.amount.currency}:${input.amount.value}` +
    `|remittance:[${remittance}]` +
    `|evidence:[${input.evidenceChain.join(',')}]` +
    `|reconciliation:[${input.reconciliationRefs.join(',')}]` +
    `|issuedAt:${input.issuedAt}`
  );
}

function requireResolvedCase(
  reconciliation: SettlementReconciliationAuthority,
  caseId: string,
): void {
  const record = reconciliation.case(caseId);
  if (record === undefined) {
    throw new CertificateIssuanceError(
      `certificate references unknown reconciliation case '${caseId}'`,
      { caseId, reason: 'RECONCILIATION_CASE_UNKNOWN' satisfies CertificateRefusalReason },
    );
  }
  if (record.status !== 'RESOLVED') {
    throw new CertificateIssuanceError(
      `certificate references reconciliation case '${caseId}' which is still OPEN (INV-04)`,
      { caseId, reason: 'RECONCILIATION_NOT_RESOLVED' satisfies CertificateRefusalReason },
    );
  }
}

/**
 * The settlement certificate authority. Consumes the FinalityAuthority (the
 * protocol-owned finality gate), the EvidenceGraph (lineage verification) and
 * the SettlementReconciliationAuthority (case resolution verification).
 */
export class SettlementCertificateAuthority {
  readonly #finality: FinalityAuthority;
  readonly #evidence: EvidenceGraph;
  readonly #reconciliation: SettlementReconciliationAuthority;
  readonly #attempts: SettlementAttemptLedger;
  readonly #certificates = new Map<string, SettlementCertificate>();

  constructor(
    finality: FinalityAuthority,
    evidence: EvidenceGraph,
    reconciliation: SettlementReconciliationAuthority,
    attempts: SettlementAttemptLedger,
  ) {
    this.#finality = finality;
    this.#evidence = evidence;
    this.#reconciliation = reconciliation;
    this.#attempts = attempts;
  }

  /**
   * Issue one settlement certificate. Fail-closed checks:
   *
   * 1. the finality record exists INSIDE the finality authority, is FINAL and
   *    names exactly this instruction (certificates only issue from
   *    protocol-authorized instructions);
   * 2. every evidence node exists and is LINKED to this instruction (its
   *    actionRef is the instruction id or one of the instruction's attempt
   *    ids) — lineage is verified, never trusted;
   * 3. every reconciliation reference is a RESOLVED case, and no OPEN case
   *    remains for the instruction.
   */
  issue(input: IssueCertificateInput): SettlementCertificate {
    if (input === null || typeof input !== 'object') {
      throw new ValidationError('issue input must be an IssueCertificateInput object');
    }
    if (typeof input.certificateId !== 'string' || input.certificateId.length === 0) {
      throw new ValidationError('certificateId must be a non-empty string');
    }
    if (typeof input.finalityId !== 'string' || input.finalityId.length === 0) {
      throw new ValidationError('finalityId must be a non-empty string');
    }
    if (input.instruction === null || typeof input.instruction !== 'object') {
      throw new ValidationError('instruction must be a SettlementInstruction');
    }
    if (typeof input.now !== 'bigint') {
      throw new ValidationError('now must be a bigint TimestampMs');
    }
    for (const field of ['evidenceChain', 'reconciliationRefs'] as const) {
      if (!Array.isArray(input[field])) {
        throw new ValidationError(`${field} must be an array`);
      }
      for (const id of input[field]) {
        if (typeof id !== 'string' || id.length === 0) {
          throw new ValidationError(`${field} entries must be non-empty strings`);
        }
      }
    }

    // 1. The finality record lives inside the authority and names exactly
    // this instruction.
    const finalityRecord = this.#finality.record(input.finalityId);
    if (finalityRecord === undefined) {
      throw new CertificateIssuanceError(
        `no finality record '${input.finalityId}' exists in the finality authority (certificates issue only from protocol-authorized finality)`,
        { finalityId: input.finalityId, reason: 'FINALITY_UNKNOWN' satisfies CertificateRefusalReason },
      );
    }
    if (finalityRecord.state !== 'FINAL') {
      throw new CertificateIssuanceError(
        `finality record '${input.finalityId}' is '${finalityRecord.state}', not FINAL`,
        { finalityId: input.finalityId, reason: 'FINALITY_NOT_FINAL' satisfies CertificateRefusalReason },
      );
    }
    if (
      finalityRecord.instructionId !== input.instruction.id ||
      !equals(finalityRecord.amount, input.instruction.amount)
    ) {
      throw new CertificateIssuanceError(
        'the finality record was declared for a different instruction — a certificate issues only for the exact protocol-authorized instruction it finalizes',
        {
          finalityId: input.finalityId,
          finalityInstructionId: finalityRecord.instructionId,
          certificateInstructionId: input.instruction.id,
          reason: 'INSTRUCTION_MISMATCH' satisfies CertificateRefusalReason,
        },
      );
    }

    // 2. The evidence chain exists and is linked to THIS instruction (the
    // instruction itself or one of its attempts).
    const allowedActionRefs = new Set<string>([input.instruction.id]);
    for (const attempt of this.#attempts.attemptsForInstruction(input.instruction.id)) {
      allowedActionRefs.add(attempt.attemptId);
    }
    for (const nodeId of input.evidenceChain) {
      const node = this.#evidence.node(nodeId);
      if (node === undefined) {
        throw new CertificateIssuanceError(
          `evidence node '${nodeId}' does not exist in the evidence graph`,
          { nodeId, reason: 'EVIDENCE_NODE_UNKNOWN' satisfies CertificateRefusalReason },
        );
      }
      if (!allowedActionRefs.has(node.actionRef)) {
        throw new CertificateIssuanceError(
          `evidence node '${nodeId}' is not linked to instruction '${input.instruction.id}' or its attempts (lineage verification)`,
          {
            nodeId,
            actionRef: node.actionRef,
            reason: 'EVIDENCE_NOT_LINKED' satisfies CertificateRefusalReason,
          },
        );
      }
    }

    // 3. Every referenced case is RESOLVED; nothing stays OPEN.
    for (const caseId of input.reconciliationRefs) {
      requireResolvedCase(this.#reconciliation, caseId);
    }
    const openCases = this.#reconciliation.openCasesForInstruction(input.instruction.id);
    if (openCases.length > 0) {
      throw new CertificateIssuanceError(
        `instruction '${input.instruction.id}' still has OPEN reconciliation cases (INV-04)`,
        {
          openCases: openCases.map((record) => record.caseId),
          reason: 'RECONCILIATION_STILL_OPEN' satisfies CertificateRefusalReason,
        },
      );
    }

    const canonical = canonicalCertificate({
      certificateId: input.certificateId,
      instructionId: input.instruction.id,
      finalityId: input.finalityId,
      amount: input.instruction.amount,
      remittance: input.instruction.remittance,
      evidenceChain: input.evidenceChain,
      reconciliationRefs: input.reconciliationRefs,
      issuedAt: input.now,
    });

    // Immutable + replay-safe issuance.
    const existing = this.#certificates.get(input.certificateId);
    if (existing !== undefined) {
      if (existing.canonical !== canonical) {
        throw new CertificateConflictError(
          `certificate '${input.certificateId}' is already recorded with different content — certificates are immutable`,
          { certificateId: input.certificateId, recorded: existing.canonical, attempted: canonical },
        );
      }
      return existing;
    }

    const certificate: SettlementCertificate = Object.freeze({
      certificateId: input.certificateId,
      instructionId: input.instruction.id,
      finalityId: input.finalityId,
      amount: input.instruction.amount,
      remittance: input.instruction.remittance,
      evidenceChain: Object.freeze([...input.evidenceChain]),
      reconciliationRefs: Object.freeze([...input.reconciliationRefs]),
      issuedAt: input.now,
      canonical,
    });
    this.#certificates.set(certificate.certificateId, certificate);
    return certificate;
  }

  /** One certificate by id (frozen, immutable). */
  certificate(certificateId: string): SettlementCertificate | undefined {
    return this.#certificates.get(certificateId);
  }

  /** All certificates, in issuance order (audit view). */
  allCertificates(): readonly SettlementCertificate[] {
    return [...this.#certificates.values()];
  }
}

/**
 * Deterministic convenience: the document references a certificate settled,
 * derived from its preserved remittance (end-to-end remittance preservation
 * query — "which business documents did this settlement settle?").
 */
export function certificateDocumentRefs(
  certificate: SettlementCertificate,
): readonly { readonly documentKind: string; readonly documentId: string }[] {
  const seen = new Set<string>();
  const refs: { readonly documentKind: string; readonly documentId: string }[] = [];
  for (const allocation of certificate.remittance) {
    const key = `${allocation.documentKind}:${allocation.documentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(
      Object.freeze({
        documentKind: allocation.documentKind,
        documentId: allocation.documentId,
      }),
    );
  }
  return Object.freeze(refs);
}
