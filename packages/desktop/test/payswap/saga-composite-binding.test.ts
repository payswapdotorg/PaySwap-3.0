/**
 * PaySwap Desktop (P27-E, ADR-0020 D7 — the P27-D lane report §6.5
 * composite-act seam battery) — the SAGA COMPOSITE BINDING: the
 * node-network multi-leg saga plan consumed by the existing composite
 * act (corridor-dispatch.ts's additive dispatchSagaCompositePlan +
 * mission-execution.ts's compensation projection), through the REAL
 * dispatch runtime (the payments-mission-runtime harness — an in-memory
 * store + a scripted authority, the payment-corridor-dispatch
 * precedent) and the REAL node-network saga functions (relative source
 * import — the test tier where cross-package imports are lawful).
 *
 * Machine-checked laws:
 * - THE IMMUTABLE DIGEST: a tampered leg (amount changed after the
 *   digest) is the typed refusal — never a repair.
 * - THE IDENTITY BINDING: a saga plan for a different mission or a
 *   different intent digest is never dispatched (typed refusal).
 * - THE CONSUMED OUTPUTS: every per-leg row carries its share REQUEST,
 *   its saga idempotency key (the (mission, operation, legIndex,
 *   intentDigest) form), its reconciliation checkpoint and its
 *   documented compensation record — an honest null stays null.
 * - THE CHAIN STOPS HONESTLY: a FAILED leg stops the chain; the
 *   confirmed legs before it project their compensation records.
 * - INTELLIGENCE NEVER AUTHORIZES: the binding's literal false + the
 *   share requests are REQUESTS (the artifact's per-leg share
 *   consumption stays the enforcement).
 */

import { describe, expect, it } from "vitest";

import {
  createPaymentMissionRuntime,
  type PaymentMissionRuntime,
} from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import { type PaymentGateEnvironment } from "../../src/host/payswap/payments/validation-gates.js";
import { PaymentMissionError } from "../../src/host/payswap/payments/contracts.js";
import { compiledIntentDigest, sagaCompensationRecordsOf } from "../../src/host/payswap/payments/mission-execution.js";
import {
  bindSagaPlanToCompositeAct,
  validateSagaLegPresentations,
} from "../../src/host/payswap/payments/saga-composite-binding.js";
import { dispatchSagaCompositePlan } from "../../src/host/payswap/payments/corridor-dispatch.js";
import type { ExecutionAuthorityPort } from "../../src/host/payswap/payments/execution-authority.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";
import { sagaPlanDigest } from "../../../node-network/src/saga.ts";

const T0 = "2026-11-03T12:00:00Z";

function memoryFs() {
  const files = new Map<string, string>();
  return {
    files,
    fs: {
      readFile: async (path: string) => {
        const data = files.get(path);
        if (data === undefined) throw new Error("ENOENT");
        return data;
      },
      writeFile: async (path: string, data: string) => {
        files.set(path, data);
      },
      mkdir: async () => {},
    },
  };
}

/** A scripted execution authority (FAKE — clearly labeled, deterministic). */
function scriptedAuthority(
  script: ("CONFIRMED" | "UNKNOWN" | "FAILED" | "REFUSED")[],
): ExecutionAuthorityPort & { calls: { legIndex?: number }[] } {
  const calls: { legIndex?: number }[] = [];
  let index = 0;
  return {
    get calls() {
      return calls;
    },
    async dispatch(command) {
      calls.push({
        legIndex: command.leg !== undefined ? command.leg.legIndex : undefined,
      });
      const answer = script[Math.min(index, script.length - 1)] ?? "REFUSED";
      index += 1;
      if (answer === "REFUSED") {
        return {
          kind: "REFUSED" as const,
          refusal: { kind: "NO_AUTHORITY_WIRED" as const, reason: "scripted refusal" },
        };
      }
      return {
        kind: "ENVELOPE" as const,
        envelope: {
          outcome: answer,
          providerReferences: answer === "CONFIRMED" ? [`ref:leg${String(index - 1)}`] : [],
          dispatchedAt: 1_000,
          completedAt: 2_000,
          executionMode: "SANDBOX" as const,
          transportClass: "FAKE_DETERMINISTIC" as const,
          transportId: "fake-authority",
          ...(answer === "UNKNOWN"
            ? { ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH" as const, providerFailure: { retryable: true, ambiguity: "OUTCOME_UNKNOWN" as const } }
            : {}),
          ...(answer === "FAILED"
            ? { providerFailure: { providerErrorCode: "SCRIPTED_FAIL", providerErrorMessage: "scripted failure", retryable: false, ambiguity: "NONE" as const } }
            : {}),
        },
      };
    },
  };
}

async function harness(script: ("CONFIRMED" | "UNKNOWN" | "FAILED" | "REFUSED")[] = ["CONFIRMED"]) {
  const world = memoryFs();
  const authority = scriptedAuthority(script);
  const store = await openPaymentMissionStore({
    fileSystem: world.fs,
    directory: "/tmp/payments-saga-binding-test",
  });
  const runtime = await createPaymentMissionRuntime({
    store,
    executionAuthority: authority,
    principalRef: "principal:test",
    mintRandom: (() => {
      let seq = 0;
      return () => {
        seq += 1;
        return String(seq).padStart(32, "0");
      };
    })(),
  });
  return { runtime, authority };
}

function passingEnvironment(now: string): PaymentGateEnvironment {
  return {
    observedFundingSources: [
      { locationRef: "acct:test-funding", currency: "GHS", observationRef: "obs:1", displayName: "Test funding" },
    ],
    observedDestinations: [
      { locationRef: "acct:test-recipient", currency: "KES", observationRef: "obs:2", displayName: "Test recipient" },
    ],
    corridorProjection: {
      projectCorridor: (query) => ({
        evaluatedAsOf: query.asOf,
        routeIds: ["route:fake-1"],
        eligibleRouteIds: ["route:fake-1"],
        exclusions: [],
      }),
    },
    freshQuote: {
      quoteId: "quote:fake-1",
      quoteVersion: "v1",
      sourceAmount: { minorUnits: "100000", currency: "GHS" },
      targetAmount: { minorUnits: "1612500", currency: "KES" },
      feeLines: [],
      rate: { value: "12.5", provenance: "fake test quote", asOf: now },
      expiry: { at: "2026-11-04T12:00:00Z", onExpiry: "REVALIDATE_REQUIRED" },
      delivery: { kind: "ESTIMATE", estimateLabel: "same day (fake)" },
      conditions: { rateLocked: true, refreshAvailable: false, materialChangePolicy: "revalidate" },
    },
    declaredLimits: { minimum: { minorUnits: "1", currency: "GHS" }, maximum: { minorUnits: "100000000", currency: "GHS" } },
    connectedScopes: [
      { connectedInstanceId: "conn:fake", providerName: "fake-psp", operationClasses: ["CREATE_EXTERNAL_EFFECT"] },
    ],
    policyDecisions: [{ decision: "ALLOW", reason: "fake test policy" }],
    now,
  };
}

async function completeIntake(runtime: PaymentMissionRuntime, now = T0): Promise<string> {
  const seeded = await runtime.seedMission(
    { direction: "MOVE", goalStatement: "move GHS to KES over a node-relayed route", origin: "COMPOSER_TEXT" },
    now,
  );
  for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length; round += 1) {
    const ask = await runtime.askNextMissingField(seeded.missionId, now);
    if (ask === null) break;
    await runtime.captureField(seeded.missionId, ask.fieldId as never, intakeValueFor(ask.fieldId), now);
  }
  return seeded.missionId;
}

function intakeValueFor(fieldId: string): unknown {
  switch (fieldId) {
    case "amountAndCurrency":
      return { minorUnits: "100000", currency: "GHS" };
    case "fundingSource":
      return "Test funding";
    case "recipient":
      return "Test recipient";
    case "countryCorridor":
      return { sourceCountry: "GH", destinationCountry: "KE", destinationCurrency: "KES" };
    case "speedDeadline":
      return { deadlineAt: "2026-11-04T12:00:00Z" };
    case "feeCap":
      return { kind: "CAPPED", amount: { minorUnits: "100", currency: "GHS" } };
    case "purpose":
      return "corridor payout";
    case "privacyCompliance":
      return { kind: "CONSTRAINED", notes: "no special constraints" };
    case "partialPaymentPreference":
      return { kind: "REQUIRE_FULL" };
    default:
      throw new Error(`unexpected field ${fieldId}`);
  }
}

/** A three-leg saga wire (collect -> relay -> payout; the middle leg node-operated). */
function sagaLegsWire(): unknown[] {
  return [
    {
      legIndex: 0,
      operation: "flutterwave.collect",
      lane: { kind: "PROVIDER", id: "flutterwave" },
      operatingNodeId: null,
      plannedAmount: { currency: "GHS", minorUnits: "100000" },
      destinationRef: "flw:wallet:GHS",
      custodyTransition: { fromKind: "SENDER", toKind: "PROVIDER", evidenceRefs: ["obs:1"] },
      effectClass: "CREATE_EXTERNAL_EFFECT",
      approvalTier: "CONFIRM",
      evidenceRequirements: ["PROVIDER_REFERENCE"],
      readBackRoute: "flutterwave.balances.read",
      compensation: { documentedMechanism: null, mechanismEvidenceRefs: [] },
    },
    {
      legIndex: 1,
      operation: "node.relay.settle",
      lane: { kind: "ONCHAIN_CHAIN", id: "stellar:testnet" },
      operatingNodeId: "node:us-router-1",
      plannedAmount: { currency: "USD", minorUnits: "1250000000" },
      destinationRef: "GBCDEFGHIJKLMNOPQRSTUVWXYZA234567BCDEFGHIJKLMNOPQRSTUVWXYZA234567",
      custodyTransition: { fromKind: "PROVIDER", toKind: "NODE", evidenceRefs: [] },
      effectClass: "CREATE_EXTERNAL_EFFECT",
      approvalTier: "STRONG_CONFIRM",
      evidenceRequirements: ["PROVIDER_REFERENCE", "ONCHAIN_RECEIPT"],
      readBackRoute: "stellar.transaction.read",
      compensation: { documentedMechanism: "documented-reversal:transfer-reversal", mechanismEvidenceRefs: ["doc:reversal-1"] },
    },
    {
      legIndex: 2,
      operation: "paystack.payout",
      lane: { kind: "PROVIDER", id: "paystack" },
      operatingNodeId: null,
      plannedAmount: { currency: "KES", minorUnits: "1612500" },
      destinationRef: "RCP_p27_kes_bank",
      custodyTransition: { fromKind: "NODE", toKind: "BENEFICIARY", evidenceRefs: [] },
      effectClass: "CREATE_EXTERNAL_EFFECT",
      approvalTier: "STRONG_CONFIRM",
      evidenceRequirements: ["PROVIDER_REFERENCE"],
      readBackRoute: "paystack.transfer.verify",
      compensation: { documentedMechanism: null, mechanismEvidenceRefs: [] },
    },
  ];
}

/** The saga plan wire (the digest derived through the REAL node-network function). */
function sagaPlanWire(missionRef: string, intentDigest: string): Record<string, unknown> {
  return {
    sagaVersion: "1.0.0",
    missionRef,
    intentDigest,
    legs: sagaLegsWire(),
    planDigest: sagaPlanDigest({ missionRef, intentDigest, legs: sagaLegsWire() as never }),
    sagaPermitsExecution: false,
  };
}

const LEG_PRESENTATIONS = [
  { legIndex: 0, legKind: "FIAT_PSP_COLLECT" as const, connectionRef: "conn:flw" },
  { legIndex: 1, legKind: "ONCHAIN_TRANSFER" as const, connectionRef: "conn:stellar" },
  { legIndex: 2, legKind: "OFF_RAMP_PAYOUT" as const, connectionRef: "conn:paystack" },
];

/** Drive the mission to the presented preview (the intent compiles HERE — mission-authorization.ts). */
async function presentedPreview(runtime: PaymentMissionRuntime, missionId: string): Promise<void> {
  await runtime.presentPreview(missionId, passingEnvironment(T0));
}

/** Arm the granted COMPOSITE artifact bound to the SAGA plan digest. */
async function armedSagaArtifact(
  runtime: PaymentMissionRuntime,
  missionId: string,
  planDigest: string,
  legCount: number,
): Promise<string> {
  await runtime.presentPreview(missionId, passingEnvironment(T0));
  const request = await runtime.requestAuthorization(missionId, T0, {
    planDigest,
    planLegCount: legCount,
  });
  const resolution = await runtime.resolveAuthorization(
    { requestId: request.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
    T0,
  );
  expect(resolution.outcome.kind).toBe("GRANTED");
  return resolution.outcome.kind === "GRANTED" ? resolution.outcome.artifact.artifactId : "";
}

describe("the saga composite binding (the wire validation + the identity binding)", () => {
  it("binds a well-formed plan: every consumed output present, index-aligned, frozen", () => {
    const binding = bindSagaPlanToCompositeAct({
      missionId: "task:PAYMENT_MISSION:01",
      intentDigest: "digest:fixture",
      plan: sagaPlanWire("task:PAYMENT_MISSION:01", "digest:fixture"),
    });
    expect(binding.plan.legs).toHaveLength(3);
    expect(binding.shareRequests).toHaveLength(3);
    expect(binding.idempotencyKeys).toHaveLength(3);
    expect(binding.reconciliationCheckpoints).toHaveLength(3);
    expect(binding.compensationRecords).toHaveLength(3);
    expect(binding.sagaBindingPermitsExecution).toBe(false);
    expect(binding.shareRequests[0]!.operation).toBe("flutterwave.collect");
    expect(binding.idempotencyKeys[0]!).toMatch(/^saga-idem:/);
    expect(binding.reconciliationCheckpoints[1]!.readBackRoute).toBe("stellar.transaction.read");
    expect(binding.compensationRecords[1]!.documentedMechanism).toBe("documented-reversal:transfer-reversal");
    expect(binding.compensationRecords[0]!.documentedMechanism).toBeNull();
  });

  it("a tampered leg (the amount changed after the digest) is the typed refusal — never a repair", () => {
    const wire = sagaPlanWire("task:PAYMENT_MISSION:01", "digest:fixture");
    (wire.legs as { plannedAmount: { minorUnits: string } }[])[0]!.plannedAmount.minorUnits = "999999999";
    expect(() =>
      bindSagaPlanToCompositeAct({ missionId: "task:PAYMENT_MISSION:01", intentDigest: "digest:fixture", plan: wire }),
    ).toThrow(PaymentMissionError);
  });

  it("the identity binding: a saga plan for a different mission or a different intent is never dispatched", () => {
    expect(() =>
      bindSagaPlanToCompositeAct({ missionId: "task:PAYMENT_MISSION:OTHER", intentDigest: "digest:fixture", plan: sagaPlanWire("task:PAYMENT_MISSION:01", "digest:fixture") }),
    ).toThrow(/different mission/);
    expect(() =>
      bindSagaPlanToCompositeAct({ missionId: "task:PAYMENT_MISSION:01", intentDigest: "digest:other", plan: sagaPlanWire("task:PAYMENT_MISSION:01", "digest:fixture") }),
    ).toThrow(/different intent/);
  });

  it("the leg presentations law: index-aligned, pinned legKind vocabulary, non-empty connections", () => {
    const binding = bindSagaPlanToCompositeAct({
      missionId: "task:PAYMENT_MISSION:01",
      intentDigest: "digest:fixture",
      plan: sagaPlanWire("task:PAYMENT_MISSION:01", "digest:fixture"),
    });
    expect(() => validateSagaLegPresentations(binding, LEG_PRESENTATIONS.slice(0, 2))).toThrow(PaymentMissionError);
    expect(() =>
      validateSagaLegPresentations(binding, [
        ...LEG_PRESENTATIONS.slice(0, 1),
        { legIndex: 1, legKind: "NOT_A_KIND" as never, connectionRef: "conn:stellar" },
        ...LEG_PRESENTATIONS.slice(2),
      ]),
    ).toThrow(PaymentMissionError);
    expect(validateSagaLegPresentations(binding, LEG_PRESENTATIONS)).toHaveLength(3);
  });
});

describe("the saga composite dispatch (the composite act consuming the saga outputs)", () => {
  it("all legs CONFIRMED: every row carries its share REQUEST + saga key + checkpoint + compensation; the per-leg commands ride the SAGA digest", async () => {
    const { runtime, authority } = await harness(["CONFIRMED"]);
    const missionId = await completeIntake(runtime);
    await presentedPreview(runtime, missionId);
    const mission = await runtime.getMission(missionId);
    expect(mission?.intent).toBeDefined();
    const intentDigest = compiledIntentDigest(mission!.intent!);
    const binding = bindSagaPlanToCompositeAct({ missionId, intentDigest, plan: sagaPlanWire(missionId, intentDigest) });
    const artifactId = await armedSagaArtifact(runtime, missionId, binding.plan.planDigest, binding.plan.legs.length);
    const outcome = await dispatchSagaCompositePlan({
      slice: runtime.dispatch,
      missionId,
      binding,
      legPresentations: LEG_PRESENTATIONS,
      authorizationArtifactId: artifactId,
      executionMode: "SANDBOX",
      now: T0,
    });
    expect(outcome.planDigest).toBe(binding.plan.planDigest);
    expect(outcome.allLegsConfirmed).toBe(true);
    expect(outcome.stoppedAfterLeg).toBeNull();
    expect(outcome.results.map((row) => row.outcome)).toEqual(["CONFIRMED", "CONFIRMED", "CONFIRMED"]);
    // Every row carries its consumed saga outputs.
    for (const row of outcome.results) {
      expect(row.saga).toBeDefined();
      expect(row.saga!.idempotencyKey).toMatch(/^saga-idem:/);
      expect(row.saga!.readBackRoute).toMatch(/^(flutterwave|stellar|paystack)\./);
    }
    expect(outcome.results[1]!.saga!.shareRequest.approvalTier).toBe("STRONG_CONFIRM");
    expect(outcome.results[1]!.saga!.compensation.documentedMechanism).toBe("documented-reversal:transfer-reversal");
    expect(outcome.results[2]!.saga!.compensation.documentedMechanism).toBeNull();
    // Each leg's command carried its OWN legIndex; the runtime's own
    // artifact-binding check (artifact.planDigest === the command's saga
    // plan digest) is what admitted every leg — a digest mismatch is the
    // typed AUTHORIZATION_MISMATCH refusal, so three CONFIRMED legs prove
    // the saga digest was bound into the composite artifact.
    expect(authority.calls.map((call) => call.legIndex)).toEqual([0, 1, 2]);
  });

  it("a FAILED leg stops the chain honestly; the confirmed legs before it project their documented compensation records", async () => {
    const { runtime } = await harness(["CONFIRMED", "FAILED"]);
    const missionId = await completeIntake(runtime);
    await presentedPreview(runtime, missionId);
    const mission = await runtime.getMission(missionId);
    const intentDigest = compiledIntentDigest(mission!.intent!);
    const binding = bindSagaPlanToCompositeAct({ missionId, intentDigest, plan: sagaPlanWire(missionId, intentDigest) });
    const artifactId = await armedSagaArtifact(runtime, missionId, binding.plan.planDigest, binding.plan.legs.length);
    const outcome = await dispatchSagaCompositePlan({
      slice: runtime.dispatch,
      missionId,
      binding,
      legPresentations: LEG_PRESENTATIONS,
      authorizationArtifactId: artifactId,
      executionMode: "SANDBOX",
      now: T0,
    });
    expect(outcome.allLegsConfirmed).toBe(false);
    expect(outcome.stoppedAfterLeg).toBe(1);
    expect(outcome.results.map((row) => row.outcome)).toEqual(["CONFIRMED", "FAILED"]);
    expect(outcome.results[1]!.summary).toContain("SCRIPTED_FAIL");
    // The compensation projection: ONLY the confirmed leg 0 (its honest null stays null).
    const after = await runtime.getMission(missionId);
    const compensations = sagaCompensationRecordsOf(after!, binding);
    expect(compensations).toHaveLength(1);
    expect(compensations[0]!.legIndex).toBe(0);
    expect(compensations[0]!.operation).toBe("flutterwave.collect");
    expect(compensations[0]!.documentedMechanism).toBeNull();
    expect(compensations[0]!.legOutcome).toBe("CONFIRMED");
  });

  it("an UNKNOWN leg stops the chain with the leg pending reconciliation through its checkpoint (INV-04 — never a blind retry)", async () => {
    const { runtime } = await harness(["CONFIRMED", "UNKNOWN"]);
    const missionId = await completeIntake(runtime);
    await presentedPreview(runtime, missionId);
    const mission = await runtime.getMission(missionId);
    const intentDigest = compiledIntentDigest(mission!.intent!);
    const binding = bindSagaPlanToCompositeAct({ missionId, intentDigest, plan: sagaPlanWire(missionId, intentDigest) });
    const artifactId = await armedSagaArtifact(runtime, missionId, binding.plan.planDigest, binding.plan.legs.length);
    const outcome = await dispatchSagaCompositePlan({
      slice: runtime.dispatch,
      missionId,
      binding,
      legPresentations: LEG_PRESENTATIONS,
      authorizationArtifactId: artifactId,
      executionMode: "SANDBOX",
      now: T0,
    });
    expect(outcome.stoppedAfterLeg).toBe(1);
    expect(outcome.results[1]!.outcome).toBe("UNKNOWN");
    expect(outcome.results[1]!.summary).toContain("stellar.transaction.read");
  });
});
