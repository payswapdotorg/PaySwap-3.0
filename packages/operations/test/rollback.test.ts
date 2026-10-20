import { describe, expect, it } from "vitest";
import {
  RollbackContractError,
  appendPromotion,
  appendRollback,
  checkRollbackCoverage,
  definePromotionRecord,
  defineRollbackRecord,
  emptyRollbackLedger,
} from "../src/rollback.js";
import {
  ROLLBACK_REHEARSAL_STEPS,
  applyCompensations,
  compensationNetEffect,
  recordRollbackRehearsal,
  verifyCompensationOrderIndependence,
  verifyRollbackIdempotence,
  type CompensationEntry,
} from "../src/compensation.js";
import { PINNED_LAB_REPLAY_NAMESPACE } from "../src/pins/lab.js";

const IDENTITY_DIGEST = "fnv1a64:1111111111111111";

function promotion(promotionId = "promo-1") {
  return definePromotionRecord({
    promotionId,
    version: 1,
    releaseIdentityDigest: IDENTITY_DIGEST,
    promotedAt: "2026-10-20T10:00:00Z",
    promotedBy: "release-manager",
  });
}

function compensations(): CompensationEntry[] {
  return [
    {
      compensationId: "comp-undo",
      obligationRef: "obligation/alpha",
      kind: "UNDO_EFFECT",
      amount: 0,
      requiresReconciliation: false,
    },
    {
      compensationId: "comp-adjust",
      obligationRef: "obligation/beta",
      kind: "NET_ADJUSTMENT",
      amount: 2500,
      requiresReconciliation: true,
    },
    {
      compensationId: "comp-marker",
      obligationRef: "obligation/gamma",
      kind: "EVIDENCE_MARKER",
      amount: 0,
      requiresReconciliation: false,
    },
  ];
}

function rollbackRecord(rollbackId = "rb-1", targetsPromotionId = "promo-1") {
  return defineRollbackRecord({
    rollbackId,
    version: 1,
    targetsPromotionId,
    mode: "COMPENSATING_ACTION",
    compensation: compensations(),
    operatorAuthorizationRef: "operator-auth/2026-10-20/001",
    executedAt: "2026-10-20T12:00:00Z",
    executedBy: "senior-operator",
  });
}

describe("promotion + rollback records (hard law 4)", () => {
  it("records are versioned + digest-chained, assembly fail-closed", () => {
    const p = promotion();
    expect(p.digest).toMatch(/^fnv1a64:/);
    expect(() =>
      definePromotionRecord({
        promotionId: "promo-x",
        version: 0,
        releaseIdentityDigest: IDENTITY_DIGEST,
        promotedAt: "2026-10-20T10:00:00Z",
        promotedBy: "ab",
      }),
    ).toThrow(RollbackContractError);
    expect(() =>
      definePromotionRecord({
        promotionId: "promo-x",
        version: 1,
        releaseIdentityDigest: IDENTITY_DIGEST,
        promotedAt: "not-a-timestamp",
        promotedBy: "ab",
      }),
    ).toThrow(/ISO-8601/);

    const r = rollbackRecord();
    expect(r.digest).toMatch(/^fnv1a64:/);
    expect(() =>
      defineRollbackRecord({
        rollbackId: "rb-x",
        version: 1,
        targetsPromotionId: "promo-1",
        mode: "COMPENSATING_ACTION",
        compensation: [],
        operatorAuthorizationRef: "auth/1",
        executedAt: "2026-10-20T12:00:00Z",
        executedBy: "ab",
      }),
    ).toThrow(/compensation evidence/);
    expect(() =>
      defineRollbackRecord({
        rollbackId: "rb-x",
        version: 1,
        targetsPromotionId: "promo-1",
        mode: "COMPENSATING_ACTION",
        compensation: compensations(),
        operatorAuthorizationRef: "",
        executedAt: "2026-10-20T12:00:00Z",
        executedBy: "ab",
      }),
    ).toThrow(/operator authorization/);
  });

  it("compensation entries are typed (amount discipline)", () => {
    expect(() =>
      defineRollbackRecord({
        rollbackId: "rb-x",
        version: 1,
        targetsPromotionId: "promo-1",
        mode: "REVERSIBLE",
        compensation: [
          {
            compensationId: "c1",
            obligationRef: "obligation/x",
            kind: "NET_ADJUSTMENT",
            amount: 0,
            requiresReconciliation: false,
          },
        ],
        operatorAuthorizationRef: "auth/1",
        executedAt: "2026-10-20T12:00:00Z",
        executedBy: "ab",
      }),
    ).toThrow(/amount 0/);
    expect(() =>
      defineRollbackRecord({
        rollbackId: "rb-x",
        version: 1,
        targetsPromotionId: "promo-1",
        mode: "REVERSIBLE",
        compensation: [
          {
            compensationId: "c1",
            obligationRef: "obligation/x",
            kind: "UNDO_EFFECT",
            amount: 5,
            requiresReconciliation: false,
          },
        ],
        operatorAuthorizationRef: "auth/1",
        executedAt: "2026-10-20T12:00:00Z",
        executedBy: "ab",
      }),
    ).toThrow(/not a NET_ADJUSTMENT/);
  });

  it("the ledger is functional + append-only with linear rollback targeting", () => {
    const ledger = appendRollback(
      appendPromotion(emptyRollbackLedger(), promotion()),
      rollbackRecord(),
    );
    expect(ledger.promotions).toHaveLength(1);
    expect(ledger.rollbacks).toHaveLength(1);

    expect(() => appendPromotion(ledger, promotion())).toThrow(/duplicate/);
    expect(() =>
      appendRollback(ledger, rollbackRecord("rb-2")),
    ).toThrow(/already rolled back/);
    expect(() =>
      appendRollback(
        emptyRollbackLedger(),
        rollbackRecord("rb-3", "no-such-promotion"),
      ),
    ).toThrow(/unknown promotion/);
  });

  it("coverage law: every promotion has a rollback record", () => {
    const withBoth = appendRollback(
      appendPromotion(emptyRollbackLedger(), promotion()),
      rollbackRecord(),
    );
    expect(checkRollbackCoverage(withBoth).passed).toBe(true);

    const promotionOnly = appendPromotion(
      appendPromotion(emptyRollbackLedger(), promotion("promo-1")),
      promotion("promo-2"),
    );
    const report = checkRollbackCoverage(promotionOnly);
    expect(report.passed).toBe(false);
    expect(report.unrollbackablePromotions).toEqual(["promo-1", "promo-2"]);
  });
});

describe("compensation proofs (order-independence + idempotence)", () => {
  it("the net effect is a commutative, exact-integer fold", () => {
    const net = compensationNetEffect(compensations());
    expect(net.adjustmentSum).toBe(2500);
    const reordered = [...compensations()].reverse();
    expect(compensationNetEffect(reordered).digest).toBe(net.digest);
  });

  it("every permutation yields the identical net-effect digest", () => {
    expect(verifyCompensationOrderIndependence(compensations())).toBe(true);
    expect(verifyCompensationOrderIndependence(compensations().slice(0, 4))).toBe(
      true,
    );
  });

  it("applying a rollback twice leaves the compensated state unchanged", () => {
    const rollback = rollbackRecord();
    expect(verifyRollbackIdempotence(rollback)).toBe(true);
    const once = applyCompensations(new Set<string>(), rollback.compensation);
    const twice = applyCompensations(once, rollback.compensation);
    expect(once).toEqual(twice);
    expect(once.size).toBe(3);
  });

  it("net effects distinguish obligation sets", () => {
    const net = compensationNetEffect(compensations());
    const different = compensationNetEffect([
      ...compensations(),
      {
        compensationId: "comp-extra",
        obligationRef: "obligation/delta",
        kind: "UNDO_EFFECT",
        amount: 0,
        requiresReconciliation: false,
      },
    ]);
    expect(different.digest).not.toBe(net.digest);
    expect(different.adjustmentSum).toBe(net.adjustmentSum);
  });
});

describe("the rehearsal drill (advisory, Lab-namespaced)", () => {
  it("the five canonical steps are ordered data", () => {
    expect([...ROLLBACK_REHEARSAL_STEPS]).toEqual([
      "OPERATOR_DISABLE_OVERRIDE",
      "ROLLBACK_RECORD_APPEND",
      "COMPENSATION_EXECUTION",
      "EVIDENCE_VERIFICATION",
      "RE_ENABLEMENT_VERIFICATION",
    ]);
  });

  it("a rehearsal report is digest-chained + Lab-branded (never production evidence)", () => {
    const ledger = appendRollback(
      appendPromotion(emptyRollbackLedger(), promotion()),
      rollbackRecord(),
    );
    const report = recordRollbackRehearsal(ledger, "rb-1");
    expect(report.namespace).toBe(PINNED_LAB_REPLAY_NAMESPACE);
    expect(report.allSatisfied).toBe(true);
    expect(report.digest).toMatch(/^fnv1a64:/);
    expect(() => recordRollbackRehearsal(ledger, "nope")).toThrow(
      RollbackContractError,
    );
  });
});
