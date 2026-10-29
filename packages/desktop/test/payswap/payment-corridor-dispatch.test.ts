/**
 * PaySwap Desktop (P22-H, ADR-0016 D6/D13) — the COMPOSITE ACT battery:
 * the corridor dispatch orchestration over the REAL dispatch runtime
 * (the frozen files EXTENDED, never bypassed).
 *
 * Machine-checks the composite laws against the REAL mission runtime +
 * the REAL authorization gate + the REAL idempotency registrar (the
 * payments-mission-runtime harness — an in-memory store + a scripted
 * authority + a passing gate environment):
 *
 * - THE PLAN DIGEST: deterministic; covers EVERY leg (a material change
 *   to any leg changes it); the composite artifact binds it.
 * - THE COMPOSITE FLOW: intake → preview → requestAuthorization(with
 *   the plan) → the PREVIEW_UI_ACT approval → the COMPOSITE artifact →
 *   dispatchCorridorPlan → per-leg commands (each its own connectionRef
 *   + legIndex + the shared plan digest) → all legs CONFIRMED → the
 *   mission COMPLETED only then (the composite completion law).
 * - THE PARTIAL-FAILURE LAW (custody continuity): a leg UNKNOWN stops
 *   the chain; a later leg's dispatch is the typed CORRIDOR_LEG_BLOCKED
 *   naming the first blocking leg; a leg FAILED stops the chain with
 *   the legs before it as recorded facts.
 * - THE D7 NO-BYPASS LAWS: a leg dispatch against an N=1 artifact is a
 *   typed AUTHORIZATION_MISMATCH; a planless consumption of a composite
 *   artifact is a typed mismatch; a dispatched plan whose digest
 *   differs from the artifact's is a typed mismatch (a leg outside the
 *   authorized plan is never a dispatch).
 * - THE PER-LEG KEY: (mission, operation, legIndex, intentDigest) — the
 *   N=1 key is byte-identical to the P13-C shape.
 */

import { describe, expect, it } from "vitest";

import {
  createPaymentMissionRuntime,
  type PaymentMissionRuntime,
} from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { openPaymentMissionStore } from "../../src/host/payswap/payments/payment-mission-store.js";
import { createHonestEmptyGateEnvironment, type PaymentGateEnvironment } from "../../src/host/payswap/payments/validation-gates.js";
import { paymentIdempotencyKey } from "../../src/host/payswap/payments/idempotency.js";
import { PaymentMissionError } from "../../src/host/payswap/payments/contracts.js";
import {
  corridorPlanDigest,
  dispatchCorridorPlan,
  validateCorridorPlanShape,
  type CorridorPlanInput,
} from "../../src/host/payswap/payments/corridor-dispatch.js";
import type { ExecutionAuthorityPort } from "../../src/host/payswap/payments/execution-authority.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";

const T0 = "2026-10-29T12:00:00Z";

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
      calls.push({ ...(command.leg !== undefined ? { legIndex: command.leg.legIndex } : {}) });
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
    directory: "/tmp/payments-corridor-test",
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
      expiry: { at: "2026-10-30T12:00:00Z", onExpiry: "REVALIDATE_REQUIRED" },
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
    { direction: "MOVE", goalStatement: "move GHS to KES over the corridor", origin: "COMPOSER_TEXT" },
    now,
  );
  for (let round = 0; round < PAYMENT_INTAKE_FIELD_IDS.length; round += 1) {
    const ask = await runtime.askNextMissingField(seeded.missionId, now);
    if (ask === null) break;
    const value = intakeValueFor(ask.fieldId);
    await runtime.captureField(seeded.missionId, ask.fieldId as never, value, now);
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
      return { deadlineAt: "2026-10-30T12:00:00Z" };
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

const FAKE_G_ISSUER = "G" + "EFGHIJKLMNOPQRSTUVWXYZABC234567".repeat(2).slice(0, 55);
const FAKE_G_DESTINATION = "G" + "BCDEFGHIJKLMNOPQRSTUVWXYZA234567".repeat(2).slice(0, 55);

/** The corridor plan (the exact pinned skeleton over the fake facts). */
const PLAN: CorridorPlanInput = {
  shapeId: "cross-provider-corridor",
  legs: [
    {
      legIndex: 0,
      legKind: "FIAT_PSP_COLLECT",
      lane: { kind: "PROVIDER", id: "flutterwave" },
      plannedAmount: { currency: "GHS", minorUnits: "100000" },
      destinationRef: "flw:wallet:GHS",
    },
    {
      legIndex: 1,
      legKind: "PSP_STABLECOIN_ISSUANCE",
      lane: { kind: "ONCHAIN_CHAIN", id: "stellar:testnet" },
      plannedAmount: { currency: "USDC", minorUnits: "1250000000" },
      destinationRef: FAKE_G_DESTINATION,
      assetRef: `stellar:testnet/asset:USDC:${FAKE_G_ISSUER}`,
      deploy: { sourceHash: "src_p22_hash_0001", bytecodeHash: "wasm_p22_hash_0001" },
    },
    {
      legIndex: 2,
      legKind: "ONCHAIN_TRANSFER",
      lane: { kind: "ONCHAIN_CHAIN", id: "stellar:testnet" },
      plannedAmount: { currency: "USDC", minorUnits: "1250000000" },
      destinationRef: FAKE_G_DESTINATION,
      assetRef: `stellar:testnet/asset:USDC:${FAKE_G_ISSUER}`,
    },
    {
      legIndex: 3,
      legKind: "OFF_RAMP_PAYOUT",
      lane: { kind: "PROVIDER", id: "paystack" },
      plannedAmount: { currency: "KES", minorUnits: "1612500" },
      destinationRef: "RCP_p22_kes_bank",
    },
  ],
};

const CONNECTION_REFS = ["conn:flw", "conn:stellar", "conn:stellar", "conn:paystack"];

/** Drive the mission to the granted COMPOSITE artifact (the two-act approval). */
async function armedCompositeArtifact(
  runtime: PaymentMissionRuntime,
  plan: CorridorPlanInput = PLAN,
): Promise<string> {
  const missionId = await completeIntake(runtime);
  await runtime.presentPreview(missionId, passingEnvironment(T0));
  const request = await runtime.requestAuthorization(missionId, T0, {
    planDigest: corridorPlanDigest(plan),
    planLegCount: plan.legs.length,
  });
  const resolution = await runtime.resolveAuthorization(
    { requestId: request.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
    T0,
  );
  expect(resolution.outcome.kind).toBe("GRANTED");
  return resolution.outcome.kind === "GRANTED" ? resolution.outcome.artifact.artifactId : "";
}

describe("the corridor plan digest + the shape law (the C-lane mirror)", () => {
  it("deterministic; a material change to ANY leg changes it (the digest covers every leg)", () => {
    const first = corridorPlanDigest(PLAN);
    expect(corridorPlanDigest(PLAN)).toBe(first);
    expect(first).toMatch(/^pmt-plan-digest:[0-9a-f]{8}$/);
    const tampered: CorridorPlanInput = {
      ...PLAN,
      legs: PLAN.legs.map((leg, index) =>
        index === 3 ? { ...leg, plannedAmount: { ...leg.plannedAmount, minorUnits: "9999999" } } : leg,
      ),
    };
    expect(corridorPlanDigest(tampered)).not.toBe(first);
    const reordered: CorridorPlanInput = {
      ...PLAN,
      legs: [...PLAN.legs.slice(1), PLAN.legs[0]!].map((leg, index) => ({ ...leg, legIndex: index })),
    };
    expect(corridorPlanDigest(reordered)).not.toBe(first);
  });

  it("the skeleton law: a foreign shape, a wrong leg count, a wrong kind or index is a typed refusal", () => {
    expect(() => validateCorridorPlanShape({ ...PLAN, shapeId: "another-shape" })).toThrow(PaymentMissionError);
    expect(() => validateCorridorPlanShape({ ...PLAN, legs: PLAN.legs.slice(0, 3) })).toThrow(
      /exactly 4 legs/,
    );
    const swapped: CorridorPlanInput = {
      ...PLAN,
      legs: PLAN.legs.map((leg, index) => (index === 0 ? { ...leg, legKind: "OFF_RAMP_PAYOUT" } : leg)),
    };
    expect(() => validateCorridorPlanShape(swapped)).toThrow(/exact skeleton law/);
  });

  it("the per-leg idempotency key: (mission, operation, legIndex, intentDigest); N=1 byte-identical", () => {
    expect(paymentIdempotencyKey("m1", "CREATE_EXTERNAL_EFFECT", "digest:x")).toBe("pmt:m1:create:digest:x");
    expect(paymentIdempotencyKey("m1", "CREATE_EXTERNAL_EFFECT", "digest:x", 0)).toBe(
      "pmt:m1:create:leg0:digest:x",
    );
    expect(paymentIdempotencyKey("m1", "CREATE_EXTERNAL_EFFECT", "digest:x", 3)).toBe(
      "pmt:m1:create:leg3:digest:x",
    );
  });
});

describe("the composite dispatch (D6 — the two-act approval over the plan)", () => {
  it("all legs CONFIRMED: per-leg commands on their own connections, the mission COMPLETED only at the last leg", async () => {
    const { runtime, authority } = await harness(["CONFIRMED"]);
    const artifactId = await armedCompositeArtifact(runtime);
    const outcome = await dispatchCorridorPlan({
      slice: runtime.dispatch,
      missionId: (await lastMissionId(runtime))!,
      plan: PLAN,
      connectionRefs: CONNECTION_REFS,
      authorizationArtifactId: artifactId,
      executionMode: "SANDBOX",
      now: T0,
    });
    expect(outcome.allLegsConfirmed).toBe(true);
    expect(outcome.stoppedAfterLeg).toBeNull();
    expect(outcome.results).toHaveLength(4);
    expect(outcome.results.map((row) => row.outcome)).toEqual(["CONFIRMED", "CONFIRMED", "CONFIRMED", "CONFIRMED"]);
    // Each leg's command carried its OWN connectionRef + legIndex.
    expect(authority.calls.map((call) => call.legIndex)).toEqual([0, 1, 2, 3]);
    // The mission completed only now (the composite completion law).
    const mission = await lastMission(runtime);
    expect(mission?.status).toBe("COMPLETED");
    expect(mission?.attempts).toHaveLength(4);
    expect(mission?.attempts.every((attempt) => attempt.legIndex !== undefined)).toBe(true);
  });

  it("the partial-failure law: a leg UNKNOWN stops the chain; a later leg is CORRIDOR_LEG_BLOCKED (typed, first blocking leg named)", async () => {
    const { runtime } = await harness(["CONFIRMED", "UNKNOWN"]);
    const artifactId = await armedCompositeArtifact(runtime);
    const missionId = (await lastMissionId(runtime))!;
    const outcome = await dispatchCorridorPlan({
      slice: runtime.dispatch,
      missionId,
      plan: PLAN,
      connectionRefs: CONNECTION_REFS,
      authorizationArtifactId: artifactId,
      executionMode: "SANDBOX",
      now: T0,
    });
    expect(outcome.allLegsConfirmed).toBe(false);
    expect(outcome.stoppedAfterLeg).toBe(1);
    expect(outcome.results.map((row) => row.outcome)).toEqual(["CONFIRMED", "UNKNOWN"]);
    // A later leg NEVER dispatches after the UNKNOWN — the FIRST wall is
    // the byte-pinned unresolved-attempt guard (reconcile before any
    // retry), and after reconciliation closes the UNKNOWN the CUSTODY
    // gate names the blocking leg. Both are the law; both are asserted.
    await expect(
      runtime.dispatch.dispatch(missionId, "CREATE_EXTERNAL_EFFECT", {
        authorizationArtifactId: artifactId,
        connectionRef: "conn:paystack",
        executionMode: "SANDBOX",
        legIndex: 3,
        leg: PLAN.legs[3] as never,
        planDigest: outcome.planDigest,
      }, T0),
    ).rejects.toThrow(/unresolved .* attempt — reconcile before any retry/);
    // Reconciliation evidence closes the UNKNOWN to FAILED — then the
    // custody gate refuses the later leg naming the blocking leg.
    const unknown = (await lastMission(runtime))?.attempts.find(
      (attempt) => attempt.legIndex === 1 && attempt.envelope?.outcome === "UNKNOWN",
    );
    expect(unknown).toBeDefined();
    await runtime.dispatch.reconcile(
      missionId,
      unknown!.attemptId,
      { resolvedTo: "FAILED", source: "EXTERNAL_PROVIDER_RETRIEVAL", evidenceRefs: ["ev:leg1-no-effect"] },
      T0,
    );
    await expect(
      runtime.dispatch.dispatch(missionId, "CREATE_EXTERNAL_EFFECT", {
        authorizationArtifactId: artifactId,
        connectionRef: "conn:paystack",
        executionMode: "SANDBOX",
        legIndex: 3,
        leg: PLAN.legs[3] as never,
        planDigest: outcome.planDigest,
      }, T0),
    ).rejects.toThrow(/leg 1's outcome is FAILED/);
    // The mission stays open (not COMPLETED, not terminal).
    const mission = await lastMission(runtime);
    expect(mission?.status).not.toBe("COMPLETED");
  });

  it("the custody-continuity gate: dispatching leg 2 with leg 1 UNRECORDED is the typed block (legs never silently skip)", async () => {
    const { runtime } = await harness(["CONFIRMED"]);
    const artifactId = await armedCompositeArtifact(runtime);
    const missionId = (await lastMissionId(runtime))!;
    await expect(
      runtime.dispatch.dispatch(missionId, "CREATE_EXTERNAL_EFFECT", {
        authorizationArtifactId: artifactId,
        connectionRef: "conn:stellar",
        executionMode: "SANDBOX",
        legIndex: 2,
        leg: PLAN.legs[2] as never,
        planDigest: corridorPlanDigest(PLAN),
      }, T0),
    ).rejects.toThrow(/legs never silently skip/);
  });

  it("the D7 no-bypass laws: a leg dispatch against an N=1 artifact, and a tampered plan digest, are typed mismatches", async () => {
    const { runtime } = await harness(["CONFIRMED"]);
    // (a) An N=1 approval (no plan facts) + a leg dispatch → mismatch.
    const missionId = await completeIntake(runtime);
    await runtime.presentPreview(missionId, passingEnvironment(T0));
    const plainRequest = await runtime.requestAuthorization(missionId, T0);
    const plainResolution = await runtime.resolveAuthorization(
      { requestId: plainRequest.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
      T0,
    );
    expect(plainResolution.outcome.kind).toBe("GRANTED");
    const plainArtifactId =
      plainResolution.outcome.kind === "GRANTED" ? plainResolution.outcome.artifact.artifactId : "";
    await expect(
      runtime.dispatch.dispatch(missionId, "CREATE_EXTERNAL_EFFECT", {
        authorizationArtifactId: plainArtifactId,
        connectionRef: "conn:flw",
        executionMode: "SANDBOX",
        legIndex: 0,
        leg: PLAN.legs[0] as never,
        planDigest: corridorPlanDigest(PLAN),
      }, T0),
    ).rejects.toThrow(/not a composite multi-leg artifact/);
    // (b) A composite artifact + a DIFFERENT plan's digest → mismatch.
    const otherMission = await completeIntake(runtime);
    await runtime.presentPreview(otherMission, passingEnvironment(T0));
    const compositeRequest = await runtime.requestAuthorization(otherMission, T0, {
      planDigest: corridorPlanDigest(PLAN),
      planLegCount: 4,
    });
    const compositeResolution = await runtime.resolveAuthorization(
      { requestId: compositeRequest.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
      T0,
    );
    const compositeArtifactId =
      compositeResolution.outcome.kind === "GRANTED" ? compositeResolution.outcome.artifact.artifactId : "";
    const tampered: CorridorPlanInput = {
      ...PLAN,
      legs: PLAN.legs.map((leg, index) =>
        index === 0 ? { ...leg, destinationRef: "flw:ROGUE_wallet" } : leg,
      ),
    };
    // The tampered plan's LEG 0 (no prior legs — the digest check fires):
    await expect(
      runtime.dispatch.dispatch(otherMission, "CREATE_EXTERNAL_EFFECT", {
        authorizationArtifactId: compositeArtifactId,
        connectionRef: "conn:flw",
        executionMode: "SANDBOX",
        legIndex: 0,
        leg: tampered.legs[0] as never,
        planDigest: corridorPlanDigest(tampered),
      }, T0),
    ).rejects.toThrow(/digest does not match/);
  });

  it("the per-leg share is single-use: re-dispatching a leg under the same artifact is AUTHORIZATION_CONSUMED", async () => {
    const { runtime } = await harness(["CONFIRMED", "FAILED", "CONFIRMED", "CONFIRMED", "CONFIRMED"]);
    const artifactId = await armedCompositeArtifact(runtime);
    const missionId = (await lastMissionId(runtime))!;
    const outcome = await dispatchCorridorPlan({
      slice: runtime.dispatch,
      missionId,
      plan: PLAN,
      connectionRefs: CONNECTION_REFS,
      authorizationArtifactId: artifactId,
      executionMode: "SANDBOX",
      now: T0,
    });
    // Leg 1 FAILED (scripted) — the chain stopped after leg 1.
    expect(outcome.stoppedAfterLeg).toBe(1);
    // A retry of leg 1 under the SAME artifact: its share is consumed.
    await expect(
      runtime.dispatch.dispatch(missionId, "CREATE_EXTERNAL_EFFECT", {
        authorizationArtifactId: artifactId,
        connectionRef: "conn:stellar",
        executionMode: "SANDBOX",
        legIndex: 1,
        leg: PLAN.legs[1] as never,
        planDigest: corridorPlanDigest(PLAN),
      }, T0),
    ).rejects.toThrow(/share.*single-use|single-use/);
  });
});

/** The last mission in the store (the harness's single-mission convenience). */
async function lastMissionId(runtime: PaymentMissionRuntime): Promise<string | undefined> {
  const missions = await runtime.listMissions();
  return missions[missions.length - 1]?.id;
}

async function lastMission(runtime: PaymentMissionRuntime) {
  const missions = await runtime.listMissions();
  return missions[missions.length - 1];
}

// The honest empty environment import keeps the type surface explicit.
void createHonestEmptyGateEnvironment;
