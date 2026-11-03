/**
 * PaySwap Desktop (P27-A) — the U3 CHARGE/TRANSFER/PAYOUT TOPOLOGY battery.
 * Machine-checks:
 * - THE OPERATOR-GATE LAW: without the §B.2 topology decision the
 *   resolution is the typed OPERATOR_GATED verdict — never a default
 *   charge model, never a guessed MoR/liability assignment.
 * - THE PREPARED-ACTION LAW: every leg resolves to a census operation with
 *   its read-back; the module PREPARES references only (zero dispatch,
 *   zero financial authority).
 * - THE MODEL-SPECIFIC LEGS: DIRECT/DESTINATION carry the charge leg;
 *   SEPARATE_CHARGES_AND_TRANSFERS additionally carries the transfer leg.
 * - THE INV-30 PURPOSE GATE: the P27-0 matrix §5 Connect column encoded
 *   exactly — commerce/marketplace/contractor/reimbursement eligible;
 *   regulated remittance/P2P NEVER eligible through Connect (the typed
 *   provider-product + legal approval return); unclear classes ask for
 *   the facts (never model-chosen).
 * - THE LIABILITY RECORD binds MoR + dispute/refund liability to the
 *   operator's decision record.
 */

import { describe, expect, it } from "vitest";
import { stripeCensusRecord } from "../../../provider-runtime/src/adapters/stripe/catalogue/census.ts";
import type { StripeOperationCensusPort } from "../../src/host/payswap/stripe/action-seams.js";
import {
  classifyStripeConnectPurposeEligibility,
  resolveStripeConnectTopology,
} from "../../src/host/payswap/stripe/connect-topology.js";
import type { StripeConnectTopologyDecision } from "../../src/host/payswap/stripe/connect-platform-gates.js";

const TOPOLOGY_DECISION: StripeConnectTopologyDecision = {
  chargeModel: "DESTINATION",
  platformCountry: "US",
  merchantOfRecord: "PLATFORM",
  disputeAndRefundLiability: "PLATFORM",
  decisionRecordRef: "operator-decision:connect-topology:2026-11-03",
};

function censusPort(allowing: boolean): StripeOperationCensusPort {
  return {
    catalogueRelease: "stripe-openapi/v2596@2026-09-30.endive",
    resolve: (operationId) => {
      if (!allowing) return undefined;
      try {
        const record = stripeCensusRecord(operationId);
        if (record === undefined) return undefined;
        return {
          operationId: record.operationId,
          apiNamespace: record.apiNamespace,
          method: record.method === "GET" || record.method === "POST" ? record.method : "GET",
          path: record.path,
          pathParams: [...record.pathParams],
          effectClass: record.effectClass,
          approvalTier: record.approvalTier,
          supportState: record.supportState,
          requiredPermissionRule: record.requiredPermissionRule,
          readBackOperationId: null,
          idempotencyKeyAllowed: true,
          summary: record.summary,
          resourceFamily: record.resourceFamily,
          packId: record.packId,
          listPaginated: record.listPaginated,
        };
      } catch {
        return undefined;
      }
    },
    dispatchAllowed: (operationId) => {
      if (!allowing) return false;
      try {
        const record = stripeCensusRecord(operationId);
        return record !== undefined && record.supportState.startsWith("IMPLEMENTED");
      } catch {
        return false;
      }
    },
    enumerate: () => [],
  };
}

describe("the topology resolution (the §B.2 decision binding)", () => {
  it("without the decision: the typed OPERATOR_GATED verdict (never a default)", () => {
    const result = resolveStripeConnectTopology({ census: censusPort(true), topologyDecision: undefined });
    expect(result.kind).toBe("OPERATOR_GATED");
    if (result.kind !== "OPERATOR_GATED") return;
    expect(result.missingDecision).toContain("run card §B.2");
    expect(result.missingDecision).toContain("charge model");
    expect(result.missingDecision).toContain("liability");
  });

  it("DESTINATION resolves the charge + payout + refund legs with read-backs", () => {
    const result = resolveStripeConnectTopology({
      census: censusPort(true),
      topologyDecision: TOPOLOGY_DECISION,
    });
    expect(result.kind).toBe("OK");
    if (result.kind !== "OK") return;
    const legs = result.topology.preparedActionRefs.map((ref) => ref.leg);
    expect(legs).toContain("CHARGE");
    expect(legs).toContain("PAYOUT_TO_CONNECTED_ACCOUNT");
    expect(legs).toContain("REFUND");
    expect(legs).not.toContain("TRANSFER_TO_CONNECTED_ACCOUNT");
    const charge = result.topology.preparedActionRefs.find((ref) => ref.leg === "CHARGE")!;
    expect(charge.operationId).toBe("PostPaymentIntents");
    expect(charge.readBackOperationId).toBe("GetPaymentIntentsIntent");
    expect(charge.mechanism).toContain("transfer_data[destination]");
    expect(result.topology.liabilityRecord.merchantOfRecord).toBe("PLATFORM");
    expect(result.topology.liabilityRecord.disputeLiability).toBe("PLATFORM");
    expect(result.topology.liabilityRecord.decisionRecordRef).toBe("operator-decision:connect-topology:2026-11-03");
  });

  it("SEPARATE_CHARGES_AND_TRANSFERS additionally carries the transfer leg", () => {
    const result = resolveStripeConnectTopology({
      census: censusPort(true),
      topologyDecision: { ...TOPOLOGY_DECISION, chargeModel: "SEPARATE_CHARGES_AND_TRANSFERS" },
    });
    expect(result.kind).toBe("OK");
    if (result.kind !== "OK") return;
    const legs = result.topology.preparedActionRefs.map((ref) => ref.leg);
    expect(legs).toContain("TRANSFER_TO_CONNECTED_ACCOUNT");
    const transfer = result.topology.preparedActionRefs.find((ref) => ref.leg === "TRANSFER_TO_CONNECTED_ACCOUNT")!;
    expect(transfer.operationId).toBe("PostTransfers");
    expect(transfer.readBackOperationId).toBe("GetTransfersTransfer");
  });

  it("DIRECT names the Stripe-Account mechanism (the 2026-11-03 live-doc law)", () => {
    const result = resolveStripeConnectTopology({
      census: censusPort(true),
      topologyDecision: { ...TOPOLOGY_DECISION, chargeModel: "DIRECT" },
    });
    expect(result.kind).toBe("OK");
    if (result.kind !== "OK") return;
    const charge = result.topology.preparedActionRefs.find((ref) => ref.leg === "CHARGE")!;
    expect(charge.mechanism).toContain("Stripe-Account header");
  });

  it("a census without the operations is the typed UNPINNED_API_SURFACE refusal", () => {
    const result = resolveStripeConnectTopology({
      census: censusPort(false),
      topologyDecision: TOPOLOGY_DECISION,
    });
    expect(result.kind).toBe("UNPINNED_API_SURFACE");
    if (result.kind !== "UNPINNED_API_SURFACE") return;
    expect(result.operationId).toBe("PostPaymentIntents");
  });

  it("every referenced operation genuinely exists in the pinned census (no silent pin expansion)", () => {
    for (const operationId of [
      "PostPaymentIntents",
      "GetPaymentIntentsIntent",
      "PostTransfers",
      "GetTransfersTransfer",
      "PostPayouts",
      "GetPayoutsPayout",
      "PostRefunds",
    ]) {
      expect(stripeCensusRecord(operationId)?.supportState).toMatch(/^IMPLEMENTED/);
    }
  });
});

describe("the INV-30 purpose gate (the P27-0 matrix §5 Connect column, verbatim)", () => {
  it("genuine commerce, marketplace settlement, contractor payment and reimbursement are eligible", () => {
    for (const purposeClass of [
      "GENUINE_COMMERCE",
      "MARKETPLACE_SELLER_SETTLEMENT",
      "CONTRACTOR_SUPPLIER_PAYMENT",
      "REIMBURSEMENT_OR_REFUND",
    ] as const) {
      const verdict = classifyStripeConnectPurposeEligibility({ purposeClass, topologyDecision: TOPOLOGY_DECISION });
      expect(verdict.eligible).toBe(true);
      if (verdict.eligible) {
        expect(verdict.basis).toContain("DESTINATION");
      }
    }
  });

  it("regulated remittance/P2P is NEVER eligible through Connect — the typed provider/legal return", () => {
    const verdict = classifyStripeConnectPurposeEligibility({
      purposeClass: "REGULATED_REMITTANCE_OR_P2P",
      topologyDecision: TOPOLOGY_DECISION,
    });
    expect(verdict.eligible).toBe(false);
    if (!verdict.eligible) {
      expect(verdict.reason).toContain("Connect is not unrestricted P2P");
      expect(verbatimInvariant(verdict.reason)).toBe(true);
      expect(verdict.requiresProviderProductAndLegalApproval).toBe(true);
    }
  });

  it("an unclear class is refused with the ask-for-facts reason (never model-chosen)", () => {
    const verdict = classifyStripeConnectPurposeEligibility({ purposeClass: "OTHER_UNCLEAR" });
    expect(verdict.eligible).toBe(false);
    if (!verdict.eligible) {
      expect(verdict.reason).toContain("unclear");
      expect(verdict.requiresProviderProductAndLegalApproval).toBe(false);
    }
  });

  it("the eligibility basis names the UNDECIDED state honestly when no topology decision exists", () => {
    const verdict = classifyStripeConnectPurposeEligibility({ purposeClass: "GENUINE_COMMERCE" });
    expect(verdict.eligible).toBe(true);
    if (verdict.eligible) {
      expect(verdict.basis).toContain("UNDECIDED");
    }
  });
});

/** The INV-30 sentence must survive verbatim (machine-checkable citation). */
function verbatimInvariant(reason: string): boolean {
  return reason.includes("relabeling or decomposing the transfer changes nothing");
}
