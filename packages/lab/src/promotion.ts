/**
 * Lab shadow/canary promotion ledger (P6-W1; the P6 rebuild of the old
 * payswap.org@8a735bf packages/lab promotion.ts, W2-004 — LAB.md
 * "Promotion"; the machinery the accepted execution-graph lane (P3-W2)
 * explicitly left to P6 in its recorded re-authorization).
 *
 * Lifecycle: DRAFT -> BENCHMARKED -> VALIDATED -> SHADOW -> CANARY ->
 * PRODUCTION -> RETIRED (LAB.md). The Lab-side stages (DRAFT...VALIDATED)
 * are owned by the candidate registry (candidates.ts); this ledger owns
 * SHADOW/CANARY/PRODUCTION/RETIRED orders.
 *
 * INV-L02 — ordering a promotion to SHADOW or beyond requires a complete
 * evidence bundle: REPLAY + COUNTERFACTUAL + ROBUSTNESS evidence (and,
 * per stage, the shadow/canary reports). A missing piece raises
 * PromotionEvidenceError; there is no override path.
 *
 * INV-L03 — promotion is VERSIONED (every order references an immutable
 * published candidate version) and REVERSIBLE (orderRollback appends a
 * rollback order and moves the active stage back; the append-only history
 * is never rewritten).
 *
 * A promotion ORDER is a proposal artifact: applying an order to
 * production traffic is a protocol-authority operation that lives OUTSIDE
 * the Lab; nothing here mutates financial state (canonical INV-9/INV-11).
 */

import { canonicalize, fnv1a64 } from "./canonical.ts";
import {
  PromotionError,
  PromotionEvidenceError,
  PromotionSkipError,
} from "./errors.ts";

// ---------------------------------------------------------------------------
// Stages and evidence
// ---------------------------------------------------------------------------

export const PROMOTION_STAGES = [
  "DRAFT",
  "BENCHMARKED",
  "VALIDATED",
  "SHADOW",
  "CANARY",
  "PRODUCTION",
  "RETIRED",
] as const;
export type PromotionStage = (typeof PROMOTION_STAGES)[number];

/** Total predicate over the promotion-stage vocabulary. */
export function isPromotionStage(value: unknown): value is PromotionStage {
  return (
    typeof value === "string" &&
    (PROMOTION_STAGES as readonly unknown[]).includes(value)
  );
}

export const PROMOTION_EVIDENCE_KINDS = [
  "BASELINE_SUITE_EVALUATION",
  "REPLAY",
  "COUNTERFACTUAL",
  "ROBUSTNESS",
  "SHADOW_REPORT",
  "CANARY_REPORT",
] as const;
export type PromotionEvidenceKind = (typeof PROMOTION_EVIDENCE_KINDS)[number];

/** Total predicate over the promotion-evidence vocabulary. */
export function isPromotionEvidenceKind(
  value: unknown,
): value is PromotionEvidenceKind {
  return (
    typeof value === "string" &&
    (PROMOTION_EVIDENCE_KINDS as readonly unknown[]).includes(value)
  );
}

export interface PromotionEvidenceRef {
  readonly evidenceId: string;
  readonly kind: PromotionEvidenceKind;
  readonly artifactRef: string;
  readonly contentDigest: string;
}

/** The evidence kinds REQUIRED for a target stage (INV-L02). */
export function requiredEvidenceForTarget(
  targetStage: PromotionStage,
): readonly PromotionEvidenceKind[] {
  switch (targetStage) {
    case "BENCHMARKED":
      return ["BASELINE_SUITE_EVALUATION"];
    case "VALIDATED":
      return ["REPLAY", "COUNTERFACTUAL", "ROBUSTNESS"];
    case "SHADOW":
      return ["REPLAY", "COUNTERFACTUAL", "ROBUSTNESS"];
    case "CANARY":
      return ["REPLAY", "COUNTERFACTUAL", "ROBUSTNESS", "SHADOW_REPORT"];
    case "PRODUCTION":
      return [
        "REPLAY",
        "COUNTERFACTUAL",
        "ROBUSTNESS",
        "SHADOW_REPORT",
        "CANARY_REPORT",
      ];
    case "DRAFT":
    case "RETIRED":
      return [];
  }
}

// ---------------------------------------------------------------------------
// Orders (versioned, reversible, append-only)
// ---------------------------------------------------------------------------

export type PromotionOrderKind = "ADVANCE" | "ROLLBACK" | "RETIRE";

export interface PromotionOrder {
  readonly orderId: string;
  readonly orderKind: PromotionOrderKind;
  readonly candidateId: string;
  readonly candidateVersion: number;
  readonly fromStage: PromotionStage;
  readonly toStage: PromotionStage;
  readonly evidence: readonly PromotionEvidenceRef[];
  readonly orderedAt: string;
  readonly orderDigest: string;
}

/**
 * The Lab promotion ledger: append-only order history per candidate.
 * Deterministic: order ids derive from a per-candidate sequence and the
 * order content; decisions depend only on the ledger state + inputs.
 */
export class PromotionLedger {
  /** candidateId -> active stage (defaults to DRAFT on first observation). */
  private readonly stages = new Map<string, PromotionStage>();
  /** candidateId -> append-only order history. */
  private readonly history = new Map<string, PromotionOrder[]>();
  private readonly sequences = new Map<string, number>();

  currentStage(candidateId: string): PromotionStage {
    return this.stages.get(candidateId) ?? "DRAFT";
  }

  historyFor(candidateId: string): readonly PromotionOrder[] {
    return [...(this.history.get(candidateId) ?? [])];
  }

  private record(
    order: Omit<PromotionOrder, "orderId" | "orderDigest">,
  ): PromotionOrder {
    const sequence = (this.sequences.get(order.candidateId) ?? 0) + 1;
    this.sequences.set(order.candidateId, sequence);
    const orderDigest = fnv1a64(canonicalize({ sequence, order }));
    const full: PromotionOrder = Object.freeze({
      ...order,
      orderId: `promotion:${order.candidateId}:${sequence}`,
      orderDigest,
    });
    const existing = this.history.get(order.candidateId) ?? [];
    this.history.set(order.candidateId, [...existing, full]);
    this.stages.set(order.candidateId, order.toStage);
    return full;
  }

  /**
   * Orders an advancement to the NEXT stage. Enforces:
   * - adjacency (no skipping; INV-L03);
   * - the INV-L02 evidence bundle for the target stage;
   * - a positive candidateVersion referencing an immutable published
   *   snapshot (the order is versioned).
   */
  orderPromotion(input: {
    candidateId: string;
    candidateVersion: number;
    targetStage: PromotionStage;
    evidence: readonly PromotionEvidenceRef[];
    orderedAt: string;
  }): PromotionOrder {
    if (input.candidateVersion < 1) {
      throw new PromotionError(
        "candidateVersion must reference a published version (>= 1)",
      );
    }
    if (!isPromotionStage(input.targetStage)) {
      throw new PromotionError(`unknown target stage '${String(input.targetStage)}'`);
    }
    const fromStage = this.currentStage(input.candidateId);
    const fromIndex = PROMOTION_STAGES.indexOf(fromStage);
    const toIndex = PROMOTION_STAGES.indexOf(input.targetStage);
    if (toIndex !== fromIndex + 1) {
      throw new PromotionSkipError(fromStage, input.targetStage);
    }

    const required = requiredEvidenceForTarget(input.targetStage);
    const present = new Set(input.evidence.map((ref) => ref.kind));
    const missing = required.filter((kind) => !present.has(kind));
    if (missing.length > 0) {
      throw new PromotionEvidenceError(input.targetStage, missing);
    }

    return this.record({
      orderKind: "ADVANCE",
      candidateId: input.candidateId,
      candidateVersion: input.candidateVersion,
      fromStage,
      toStage: input.targetStage,
      evidence: [...input.evidence],
      orderedAt: input.orderedAt,
    });
  }

  /**
   * Orders a rollback to an EARLIER stage (INV-L03: reversible). The
   * rollback is APPENDED to the history; prior orders remain untouched.
   */
  orderRollback(input: {
    candidateId: string;
    candidateVersion: number;
    toStage: PromotionStage;
    reason: string;
    orderedAt: string;
  }): PromotionOrder {
    const fromStage = this.currentStage(input.candidateId);
    const fromIndex = PROMOTION_STAGES.indexOf(fromStage);
    const toIndex = PROMOTION_STAGES.indexOf(input.toStage);
    if (fromStage === "RETIRED") {
      throw new PromotionError("a retired candidate cannot roll back");
    }
    if (toIndex >= fromIndex || toIndex < 0) {
      throw new PromotionError(
        `rollback target ${input.toStage} must be an earlier stage than ${fromStage}`,
      );
    }
    return this.record({
      orderKind: "ROLLBACK",
      candidateId: input.candidateId,
      candidateVersion: input.candidateVersion,
      fromStage,
      toStage: input.toStage,
      evidence: [],
      orderedAt: input.orderedAt,
    });
  }

  /** Retires a candidate from any active stage (terminal; history preserved). */
  retire(input: {
    candidateId: string;
    candidateVersion: number;
    reason: string;
    orderedAt: string;
  }): PromotionOrder {
    const fromStage = this.currentStage(input.candidateId);
    if (fromStage === "RETIRED") {
      throw new PromotionError("candidate is already retired");
    }
    return this.record({
      orderKind: "RETIRE",
      candidateId: input.candidateId,
      candidateVersion: input.candidateVersion,
      fromStage,
      toStage: "RETIRED",
      evidence: [],
      orderedAt: input.orderedAt,
    });
  }
}
