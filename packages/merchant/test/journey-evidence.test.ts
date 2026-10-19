import { describe, expect, it } from "vitest";
import {
  MERCHANT_EVIDENCE_LAW,
  MERCHANT_JOURNEY_STAGES,
  buildJourneyEvidence,
  journeyRecordDigest,
  journeyStagesFromState,
  buildJourneyEvidenceFile,
  verifyJourneyEvidenceFile,
  attemptStatusView,
  recordAmbiguityEvidence,
} from "../src/index.ts";
import type { MerchantJourneyRecord } from "../src/index.ts";
import {
  activeMerchantFixture,
  activeActivationFixture,
  openFlowFixture,
  T60,
  USDC,
} from "./fixtures.ts";
import { authorizationBundleFixture, performSubmittedHandoffFixture } from "./port-fixtures.ts";
import {
  CONNECTED_INSTANCE,
  intentFixture,
  attemptSubmittedWebhookFixture,
  resolveSucceededFixture,
} from "./journey-fixtures.ts";
import { nativeRouteFixture, externalRouteFixture } from "./journey-fixtures.ts";

/**
 * The journey-evidence suite (PORTED+ADAPTED from the old evidence-files
 * + journey sites): the deterministic, regenerable journey evidence —
 * one digest-stable record per stage, the law marker, byte-identical
 * regeneration, and the full merchant journey walk (evidence-mandatory
 * definitive outcomes all the way).
 */

function journeyInputsFixture() {
  const { request, receipt } = performSubmittedHandoffFixture();
  const bundle = authorizationBundleFixture();
  const flow = openFlowFixture();
  const attemptRecord = buildAttemptRecord();
  return {
    journeyId: "journey:fixture-1",
    profile: activeMerchantFixture(),
    activation: activeActivationFixture(),
    flow,
    authorization: {
      authorizationRequestHash: bundle.requestHash,
      writeDigest: bundle.writeDigest,
      paymentSummaryDigest: bundle.summaryDigest,
      handoffId: receipt.handoffId,
      chainRef: request.chainRef,
      externalSubmissionRef: receipt.externalSubmissionRef,
      evidenceRefs: receipt.evidenceRefs,
    },
    portHandoff: [
      {
        kind: "HANDOFF" as const,
        handoffId: receipt.handoffId,
        externalSubmissionRef: receipt.externalSubmissionRef,
        evidenceRefs: [...receipt.evidenceRefs],
      },
    ],
    attempt: attemptRecord,
    inbox: { appliedEventIds: [attemptSubmittedWebhookFixture().eventId], rejections: [], duplicates: [] },
    refund: buildRefundRecord(),
    settlement: buildSettlementRecord(),
  };
}

function buildAttemptRecord() {
  // A CONFIRMED attempt through the real lifecycle walk (fixture-level
  // composition; the deep lifecycle laws live in lifecycle.test.ts).
  const { request, receipt } = performSubmittedHandoffFixture();
  const bundle = authorizationBundleFixture();
  return {
    attempt: {
      id: "attempt:fixture-1" as never,
      intentId: "intent:fixture-1" as never,
      assetId: USDC.id as never,
      chainId: "chain.eth-mainnet" as never,
      quoteId: "quote.usdc.1" as never,
      quotedCryptoAmount: { assetId: USDC.id, value: 100000000n, decimals: 6 },
      state: "CONFIRMED" as const,
      externalTxRef: receipt.externalSubmissionRef,
      settlementAttemptIds: ["settlement-attempt:1"],
      evidenceIds: [`handoff-evidence:${request.handoffId}`, "observation:confirmed-1"],
      createdAt: T60,
      updatedAt: T60,
    },
    authorization: {
      authorizationRequestHash: bundle.requestHash,
      writeDigest: bundle.writeDigest,
      paymentSummaryDigest: bundle.summaryDigest,
      handoffId: receipt.handoffId,
      chainRef: request.chainRef,
      externalSubmissionRef: receipt.externalSubmissionRef,
      evidenceRefs: receipt.evidenceRefs,
    },
  };
}

function buildRefundRecord() {
  return {
    id: "refund:fixture-1" as never,
    originalAttemptId: "attempt:fixture-1",
    intentId: "intent:fixture-1",
    amount: { value: 3000n, currency: "USD" },
    routeFamily: "NATIVE_STRIPE_CRYPTO" as const,
    refundMedium: "STABLECOIN_TO_ORIGINAL_WALLET" as const,
    destinationRef: "wallet:customer-original",
    recourse: "MERCHANT_DISPUTE_WINDOW" as never,
    railObservationId: "observation:refund-support-1",
    state: "PENDING" as const,
    evidenceIds: ["rail-observation:observation:refund-support-1"],
    createdAt: T60,
    updatedAt: T60,
  };
}

function buildSettlementRecord() {
  const confirmation = {
    confirmationId: "confirmation:fixture-1",
    routeFamily: "NATIVE_STRIPE_CRYPTO" as const,
    connectedInstanceId: CONNECTED_INSTANCE.instanceId,
    stripeBalanceTxRef: "txn:stripe-1",
    amount: { value: 10_000n, currency: "USD" },
    providerStateEnvelopeRef: "envelope:stripe-1",
    evidenceIds: ["provider-evidence:stripe-1"],
    confirmedByProvider: true as const,
  };
  return {
    settlementId: "settlement:fixture-1",
    attemptId: "attempt:fixture-1",
    routeFamily: "NATIVE_STRIPE_CRYPTO" as const,
    settlementMode: "NATIVE_STRIPE_CRYPTO" as const,
    confirmation,
    recordedAt: T60,
    evidenceIds: ["provider-evidence:stripe-1"],
  };
}

describe("the journey stages (the evidence law)", () => {
  it("the law marker and the journey-stage vocabulary are pinned", () => {
    expect(MERCHANT_EVIDENCE_LAW).toBe("FIXTURE_PROVEN_TRUSTED_SURFACE_SIGNING_ONLY");
    expect([...MERCHANT_JOURNEY_STAGES]).toEqual([
      "MERCHANT_ONBOARDING",
      "ACCEPTANCE_ACTIVATION",
      "CHECKOUT_SESSION",
      "WALLET_AUTHORIZATION",
      "PAYMENT_LIFECYCLE",
      "WEBHOOK_UPDATES",
      "REFUND",
      "SETTLEMENT",
    ]);
  });

  it("buildJourneyEvidence produces one digest-stable record per stage, in flow order", () => {
    const inputs = journeyInputsFixture();
    const stages = journeyStagesFromState(inputs);
    const records = buildJourneyEvidence(inputs.journeyId, stages);
    expect(records.length).toBe(8);
    expect(records.map((r) => r.stage)).toEqual([...MERCHANT_JOURNEY_STAGES]);
    for (const record of records) {
      expect(record.digest).toBe(journeyRecordDigest(record));
      expect(Object.isFrozen(record)).toBe(true);
    }
  });

  it("stages must not repeat (immutable journey shape)", () => {
    const stages = journeyStagesFromState(journeyInputsFixture());
    expect(() =>
      buildJourneyEvidence("journey:dupe", [stages[0]!, stages[0]!]),
    ).toThrow(/must not repeat/);
  });

  it("every stage requires non-empty refs AND evidence refs (the lineage law)", () => {
    expect(() =>
      buildJourneyEvidence("journey:empty", [
        { stage: "REFUND", refs: [], evidenceRefs: ["e:1"] },
      ]),
    ).toThrow(/non-empty refs/);
    expect(() =>
      buildJourneyEvidence("journey:empty2", [
        { stage: "REFUND", refs: ["r:1"], evidenceRefs: [] },
      ]),
    ).toThrow(/non-empty evidence refs/);
    expect(() => buildJourneyEvidence("", [{ stage: "REFUND", refs: ["r"], evidenceRefs: ["e"] }])).toThrow(
      /journeyId/,
    );
  });

  it("the WALLET_AUTHORIZATION stage carries the port handoff evidence verbatim (delegated money movement)", () => {
    const inputs = journeyInputsFixture();
    const stages = journeyStagesFromState(inputs);
    const walletStage = stages.find((s) => s.stage === "WALLET_AUTHORIZATION");
    expect(walletStage?.portHandoff?.length).toBe(1);
    expect(walletStage?.portHandoff?.[0]?.kind).toBe("HANDOFF");
    expect(walletStage?.portHandoff?.[0]?.handoffId).toBe("handoff.fixture.1");
    expect(walletStage?.refs.join(",")).toContain("handoff:");
  });

  it("the full evidence file builds with the law marker and verifies true", () => {
    const file = buildJourneyEvidenceFile(journeyInputsFixture());
    expect(file.lawMarker).toBe(MERCHANT_EVIDENCE_LAW);
    expect(file.packageName).toBe("@payswap/merchant");
    expect(file.journeyId).toBe("journey:fixture-1");
    expect(verifyJourneyEvidenceFile(file)).toBe(true);
    expect(Object.isFrozen(file)).toBe(true);
  });

  it("a tampered digest or a wrong marker fails verification (evidence integrity)", () => {
    const file = buildJourneyEvidenceFile(journeyInputsFixture());
    const tampered: typeof file = {
      ...file,
      stages: file.stages.map((record: MerchantJourneyRecord, index) =>
        index === 0 ? { ...record, refs: [...record.refs, "tampered:ref"] } : record,
      ),
    };
    expect(verifyJourneyEvidenceFile(tampered)).toBe(false);
    expect(verifyJourneyEvidenceFile({ ...file, lawMarker: "WRONG" as never })).toBe(false);
    expect(verifyJourneyEvidenceFile({ ...file, packageName: "@payswap/other" })).toBe(false);
  });

  it("regeneration is byte-identical: the same inputs produce the same digests (deterministic)", () => {
    const first = buildJourneyEvidenceFile(journeyInputsFixture());
    const second = buildJourneyEvidenceFile(journeyInputsFixture());
    expect(first.stages.map((r) => r.digest)).toEqual(second.stages.map((r) => r.digest));
    expect(JSON.stringify(first.stages.map((r) => [r.stage, r.digest]))).toBe(
      JSON.stringify(second.stages.map((r) => [r.stage, r.digest])),
    );
  });

  it("the journey composes the real fixture walk end-to-end (attempt confirmed, settlement provider-verified)", () => {
    const inputs = journeyInputsFixture();
    const view = attemptStatusView(inputs.attempt);
    expect(view.state).toBe("CONFIRMED");
    expect(view.outcome).toBe("SUCCEEDED");
    expect(view.evidenceIds.length).toBeGreaterThan(0);
    const native = nativeRouteFixture();
    expect(native.providerVerified).toBe(true);
    expect(nativeRouteFixture().capabilityId).toContain("native-crypto-settlement");
    expect(externalRouteFixture().routeFamily).toBe("EXTERNAL_PAYSWAP_CONVERSION");
    expect(intentFixture().state).toBe("REQUIRES_PAYMENT_METHOD");
    expect(attemptSubmittedWebhookFixture().payload.eventType).toBe("payment_attempt.submitted");
    expect(resolveSucceededFixture().resolvedOutcome).toBe("CONFIRMED_SUCCEEDED");
  });

  it("ambiguity evidence appends linkage without a state change (the re-observe law, evidence-level)", () => {
    const record = {
      attempt: {
        ...journeyInputsFixture().attempt.attempt,
        state: "OUTCOME_UNKNOWN" as const,
        evidenceIds: ["e:1"],
      },
      authorization: journeyInputsFixture().attempt.authorization,
    };
    const appended = recordAmbiguityEvidence(record, ["e:2"], T60);
    expect(appended.attempt.state).toBe("OUTCOME_UNKNOWN");
    expect([...appended.attempt.evidenceIds]).toEqual(["e:1", "e:2"]);
    expect(() => recordAmbiguityEvidence(record, [], T60)).toThrow();
  });
});
