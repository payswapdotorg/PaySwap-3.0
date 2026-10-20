/**
 * @payswap/financial-certification — the escalate-only promotion ledger
 * (P8-W1; FIN-LAW-07's promotion face).
 *
 * A promotion artifact is a CONTRACT, not a deployment: ordering a
 * promotion appends a versioned, content-digested record referencing a
 * PASSED, digest-chained certification record. Applying it to
 * production traffic is a protocol-authority operation outside this
 * ledger; nothing here mutates financial state.
 *
 * Hard preconditions, in order:
 *
 * 1. CERTIFICATION FIRST: a certification record whose wall FAILED (or
 *    whose suite evaluation failed) halts the promotion IRREVERSIBLY
 *    for that subject version (CertificationHaltError) — the halt is
 *    recorded, and the subject cannot be promoted again until a NEW
 *    certification evaluation (a new, passing, digest-chained record)
 *    clears it;
 * 2. unremediated halts demand remediation evidence on the NEW
 *    promotion attempt;
 * 3. the cited certification record must carry the subject and a
 *    well-formed digest;
 * 4. the subject version cannot be promoted twice (append-only).
 *
 * Waivers are impossible (gate-wall.ts requestGateWaiver always
 * throws). History is append-only: promotions and halts are never
 * deleted or edited.
 */

import { contentDigest } from "./digest.ts";
import {
  CertificationHaltError,
  CertificationRecordError,
  WaiverImpossibleError,
} from "./errors.ts";
import type {
  CertificationWallSummary,
  ChainedCertificationRecord,
} from "./records.ts";
import type { FinancialCertificationSubjectRef } from "./suites.ts";

/** An irreversible certification halt over one subject version. */
export interface CertificationHaltRecord {
  readonly haltId: string;
  readonly subjectId: string;
  readonly subjectVersion: string;
  readonly failedGates: readonly string[];
  readonly haltedAt: string;
}

/** A versioned promotion artifact (immutable). */
export interface PromotionRecord {
  readonly promotionId: string;
  readonly subject: FinancialCertificationSubjectRef;
  readonly certificationRecordDigest: string;
  readonly promotedAt: string;
  readonly promotionDigest: string;
}

/** Remediation evidence presented with a promotion after a halt. */
export interface RemediationEvidence {
  /** The certification record that passed after the halt. */
  readonly clearingRecordId: string;
  readonly evidenceRefs: readonly string[];
}

/**
 * The append-only promotion ledger with the halt wall.
 */
export class FinancialPromotionLedger {
  private readonly promotions: PromotionRecord[] = [];
  private readonly promotionsById = new Map<string, PromotionRecord>();
  private readonly halts: CertificationHaltRecord[] = [];
  private readonly remediatedHaltIds = new Set<string>();

  /** Every promotion ever appended, in order. Never rewritten. */
  allPromotions(): readonly PromotionRecord[] {
    return Object.freeze([...this.promotions]);
  }

  /** The promotion history of a subject, oldest first. */
  historyFor(subjectId: string): readonly PromotionRecord[] {
    return Object.freeze(
      this.promotions.filter((record) => record.subject.subjectId === subjectId),
    );
  }

  /** Every halt ever recorded, in order. Never rewritten. */
  haltedOrders(): readonly CertificationHaltRecord[] {
    return Object.freeze([...this.halts]);
  }

  /** Halts for a subject that no later promotion has remediated. */
  unremediatedHaltsFor(subjectId: string): readonly CertificationHaltRecord[] {
    return this.halts.filter(
      (halt) =>
        halt.subjectId === subjectId && !this.remediatedHaltIds.has(halt.haltId),
    );
  }

  /**
   * THE waiver request — always denied (re-exported surface of the
   * structural law; see gate-wall.ts requestGateWaiver).
   */
  requestGateWaiver(input: {
    readonly subjectId: string;
    readonly gateId: string;
    readonly justification: string;
  }): never {
    throw new WaiverImpossibleError(
      `promotion ledger joins the denial: gate '${input.gateId}' on subject '${input.subjectId}' cannot be waived or downgraded — only a NEW passing certification clears a halt`,
    );
  }

  /**
   * Orders a versioned promotion. SECURITY/CERTIFICATION FIRST: a
   * failed wall or failed suite evaluation halts the promotion
   * IRREVERSIBLY for the subject version; unremediated halts demand
   * remediation evidence; the subject version cannot be promoted twice.
   */
  orderPromotion(input: {
    readonly promotionId: string;
    readonly subject: FinancialCertificationSubjectRef;
    readonly certificationRecord: ChainedCertificationRecord;
    readonly promotedAt: string;
    readonly remediation?: RemediationEvidence;
  }): PromotionRecord {
    if (input.promotionId.length === 0) {
      throw new CertificationRecordError("promotionId must not be empty");
    }
    if (this.promotionsById.has(input.promotionId)) {
      throw new CertificationRecordError(
        `promotion '${input.promotionId}' already exists (append-only ledger: ids are never reused)`,
      );
    }
    if (input.subject.subjectId.length === 0 || input.subject.version.length === 0) {
      throw new CertificationRecordError("subject references must be complete");
    }
    if (input.promotedAt.length === 0) {
      throw new CertificationRecordError("promotedAt must not be empty");
    }
    const record = input.certificationRecord;
    if (
      record.subject.subjectId !== input.subject.subjectId ||
      record.subject.version !== input.subject.version
    ) {
      throw new CertificationRecordError(
        "the certification record must be for the promoted subject version",
      );
    }
    const { recordDigest, ...recordContent } = record;
    if (contentDigest(recordContent) !== recordDigest) {
      throw new CertificationRecordError(
        `certification record '${record.recordId}' digest does not recompute — only verifiable records can promote`,
      );
    }

    // 1. CERTIFICATION FIRST — collect every failed gate/scenario.
    const failedGates = [
      ...record.wall.failedGates,
      ...record.evaluation.failedGates,
    ];
    const failedScenarios = [
      ...record.evaluation.failedScenarios,
      ...record.evaluation.missingScenarios,
    ];
    if (failedGates.length > 0 || failedScenarios.length > 0 || !record.wall.passed || !record.evaluation.passed) {
      const gates = failedGates.length > 0 ? failedGates : ["(suite evaluation failed)"];
      const halt: CertificationHaltRecord = Object.freeze({
        haltId: `halt:${input.promotionId}`,
        subjectId: input.subject.subjectId,
        subjectVersion: input.subject.version,
        failedGates: Object.freeze(gates),
        haltedAt: input.promotedAt,
      });
      this.halts.push(halt);
      throw new CertificationHaltError(input.subject.subjectId, gates);
    }

    // 2. Unremediated halts demand remediation evidence on THIS attempt.
    const unremediated = this.unremediatedHaltsFor(input.subject.subjectId);
    if (unremediated.length > 0) {
      if (input.remediation === undefined) {
        throw new CertificationHaltError(
          input.subject.subjectId,
          unremediated.map((halt) => `unremediated halt ${halt.haltId}`),
        );
      }
      if (input.remediation.evidenceRefs.length === 0) {
        throw new CertificationRecordError(
          "remediation evidence must be non-empty (a halt is cleared by evidence, never by assertion)",
        );
      }
      if (input.remediation.clearingRecordId !== record.recordId) {
        throw new CertificationRecordError(
          "the remediation must cite THIS promotion's certification record as the clearing record",
        );
      }
      for (const halt of unremediated) {
        this.remediatedHaltIds.add(halt.haltId);
      }
    }

    // 3. The subject version cannot be promoted twice.
    const already = this.promotions.some(
      (existing) =>
        existing.subject.subjectId === input.subject.subjectId &&
        existing.subject.version === input.subject.version,
    );
    if (already) {
      throw new CertificationRecordError(
        `subject '${input.subject.subjectId}' version '${input.subject.version}' is already promoted — promote a NEW version (certification is per version)`,
      );
    }

    const promotion: PromotionRecord = Object.freeze({
      promotionId: input.promotionId,
      subject: input.subject,
      certificationRecordDigest: recordDigest,
      promotedAt: input.promotedAt,
      promotionDigest: contentDigest({
        promotionId: input.promotionId,
        subject: input.subject,
        certificationRecordDigest: recordDigest,
        promotedAt: input.promotedAt,
      }),
    });
    this.promotions.push(promotion);
    this.promotionsById.set(promotion.promotionId, promotion);
    return promotion;
  }
}
