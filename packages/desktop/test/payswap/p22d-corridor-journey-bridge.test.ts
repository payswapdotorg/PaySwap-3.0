/**
 * PaySwap Desktop (P22-D, ADR-0016 D10/D12 — the E2E law's in-repo
 * tier) — THE CORRIDOR JOURNEY BRIDGE BATTERY: the full GHS →
 * USDC(Stellar) → KES corridor journey driven END-TO-END through the
 * REAL channel-composed host service + the REAL compiler + the REAL
 * per-provider kernels over a SCRIPTED provider transport (hermetic;
 * the REAL-transport tier stays the rail-evidence harness's —
 * operator-gated on the re-supply of secrets/payment-providers.env).
 *
 * THE JOURNEY (each stage asserted on the REAL seams):
 *  1. THE SEED: the 3-provider plane through the REAL member paths
 *     (FLW's GHS wallet, Paystack's KES-observed transactions, the
 *     stellar:testnet keypair seal + the Horizon account read
 *     observing the issuer-scoped USDC — the corridor's middle).
 *  2. THE INTAKE: the deterministic nine-field intake through the
 *     channel members (the funding source grounded in the OBSERVED
 *     FLW GHS wallet; the recipient in the merchant directory's KES
 *     entry).
 *  3. THE HONEST CHANNEL PREVIEW: the REAL gate environment BLOCKS —
 *     NO_ROUTE_FOR_CORRIDOR verbatim (the declared test corridor
 *     covers US→US only; the corridor's compilation lives in the
 *     planning tier). The VALIDATED→ACTIVE transition fires at
 *     PREVIEW time, never at intake.
 *  4. THE RAILS: the REAL capability bridge over the seeded ACTIVE
 *     plane (FLW read-only, Paystack payout-capable, the evidence
 *     ledger's issuer-scoped position).
 *  5. THE COMPILE: the REAL compiler over the pinned corridor
 *     fixtures (every plan-module law asserted — the skeleton, the
 *     custody chain, the presentation, the digest).
 *  6. THE COMPOSITE TWO-ACT APPROVAL: the planDigest + planLegCount
 *     over the compiled plan → the COMPOSITE artifact (GRANTED).
 *  7. PROOF A — THE HONEST LANE TRUTH: the compiled plan's FLW
 *     collect leg is REFUSED NO_AUTHORITY_WIRED (Flutterwave is
 *     read-only by construction); the chain stops honestly; a later
 *     leg is CORRIDOR_LEG_BLOCKED naming leg 0 UNRECORDED; the
 *     refused mission is lawfully CANCELLED.
 *  8. PROOF B — THE SCRIPTED-TIER CORRIDOR EXECUTION: the second
 *     mission under its own composite authorization, the operator's
 *     kernel-served executing connections [Paystack, Stellar,
 *     Stellar, Paystack] (the P21 armed-lane precedent): ALL FOUR
 *     LEGS CONFIRMED over the REAL kernels; the mission COMPLETES
 *     only at the last leg (the composite completion law).
 *  9. THE AUTHORITATIVE READ-BACKS: the Paystack transfer-verify
 *     CONFIRMED "success"; the Stellar transaction + operations reads
 *     with the OBSERVED C… contract id; deploymentEvidenceOf null
 *     without it (never fabricated).
 * 10. THE NO-DOUBLE-EFFECT LAW: a CONFIRMED leg re-dispatched under
 *     the same artifact refuses AUTHORIZATION_CONSUMED (the replay
 *     path re-checks the share).
 */

import { describe, expect, it } from "vitest";

import { dispatchCorridorPlan } from "../../src/host/payswap/payments/corridor-dispatch.js";
import {
  createPaystackHostTransport,
  createStellarHorizonHostTransport,
} from "../../src/host/payswap/connections/host-https-transports.js";
import { createPaystackTransferReadBack } from "../../src/host/payswap/payments/paystack-read-back.js";
import { createStellarReadBack, deploymentEvidenceOf } from "../../src/host/payswap/payments/stellar-read-back.js";
import {
  BRIDGE_READ_ONLY_OPERATION_CLASSES,
  deriveConnectionCapabilityBridge,
} from "../../src/host/payswap/connections/capability-bridge.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";
import { fakeWorld } from "./connections-probe-plane-fixtures.js";
import {
  CORRIDOR_TX_HASH,
  CORRIDOR_TRANSFER_REFERENCE,
  FAKE_C_CONTRACT,
  composeCorridorService,
  captureCorridorIntake,
  corridorPlanningEnvironment,
  scriptCorridorFetch,
  seedCorridorConnections,
  T0,
  T1,
} from "./p22d-corridor-journey-fixtures.js";
import {
  CORRIDOR_DEPLOY_BYTECODE_HASH,
  CORRIDOR_DEPLOY_SOURCE_HASH,
  compileCorridorForJourney,
} from "./p22d-corridor-journey-plan.js";
import { CORRIDOR_USDC_ISSUER_G } from "../../../route-compiler/test/corridor-fixtures.ts";

const GOAL = "Send one thousand cedis to a Kenyan bank account over the corridor";

/** Drive the full ordered corridor journey over one fresh scripted world (asserting as it goes). */
async function driveJourney(): Promise<{ readonly missionStore: string; readonly digest: string }> {
  const world = fakeWorld();
  scriptCorridorFetch(world);
  const connections = await seedCorridorConnections(world);
  const { service, runtime } = await composeCorridorService(
    world,
    connections.authority,
    connections.evidenceStore,
  );

  // ---- (2) THE NINE-FIELD INTAKE through the channel members ----
  const seeded = await service.paymentMissionSeed({ direction: "MOVE", goalStatement: GOAL });
  expect(seeded.action).toBe("CREATED");
  const missionId = seeded.missionId;
  expect(await service.paymentMissionBoard()).toHaveLength(1);
  const asked = await captureCorridorIntake(service, missionId);
  expect(asked).toEqual([...PAYMENT_INTAKE_FIELD_IDS]);

  // ---- (3) THE HONEST CHANNEL PREVIEW (the REAL gate environment) ----
  const preview = await service.paymentMissionPresentPreview(missionId);
  expect(preview?.dispatchable).toBe(false);
  expect(preview?.gates.decision).toBe("BLOCK");
  expect(preview?.gates.reasons.join(" ")).toContain("NO_ROUTE_FOR_CORRIDOR");
  const detail = (await service.paymentMissionDetail(missionId))!;
  // The VALIDATED→ACTIVE transition fires at PREVIEW time (not intake).
  expect(detail.status).toBe("ACTIVE");
  expect(detail.intent).toBeDefined();
  expect(detail.events.some((event) => event.kind === "VALIDATED")).toBe(true);
  expect(detail.events.some((event) => event.kind === "PREVIEW_PRESENTED")).toBe(true);

  // ---- (4) THE RAILS: the 3-provider plane observed (the REAL bridge + the evidence ledger) ----
  const evidence = await connections.evidenceStore.latestProbeEvidence();
  const stellarRecord = evidence.find((entry) => entry.providerId === "stellar:testnet");
  expect(stellarRecord?.assetPositions).toContain(`stellar:testnet/asset:USDC:${CORRIDOR_USDC_ISSUER_G}`);
  const bridge = await deriveConnectionCapabilityBridge({
    statuses: await connections.authority.connectionStatuses(),
    evidence,
  });
  expect(bridge.fundingSources.some((source) => source.displayName === "Flutterwave GHS wallet (test)")).toBe(true);
  expect(bridge.fundingSources.some((source) => source.displayName === "Paystack test account (transaction-observed KES)")).toBe(true);
  const flwInstance = bridge.instances.find((instance) => instance.providerId === "flutterwave");
  expect(flwInstance?.operationClasses).toEqual([...BRIDGE_READ_ONLY_OPERATION_CLASSES]);
  // The Paystack instance is read-only-shaped at the BRIDGE tier (the probe
  // proves reads); the PAYOUT lane is the kernel-tier growth (ADR-0016 D8) —
  // proven by Proof B's dispatch below, never asserted from the probe bridge.
  const paystackInstance = bridge.instances.find((instance) => instance.providerId === "paystack");
  expect(paystackInstance?.operationClasses).toEqual([...BRIDGE_READ_ONLY_OPERATION_CLASSES]);

  // ---- (5) THE COMPILE (the planning tier — every plan-module law asserted inline) ----
  const compiled = compileCorridorForJourney();

  // ---- (5b) THE PLANNING-TIER PREVIEW (the operator's act on the compiled plan) ----
  // The channel's declared corridor BLOCKS (asserted above); the composite act
  // arms over the planning tier's own preview (every observed fact derives from
  // the REAL bridge; the projection is the compiled plan's own route).
  const planningEnv = corridorPlanningEnvironment({
    now: T0,
    bridge,
    planId: compiled.plan.planId,
    executingConnectionId: connections.paystackConnectionId,
    corridor: { sourceCountry: "GH", destinationCountry: "KE", destinationCurrency: "KES" },
  });
  const planningPreview = await runtime.presentPreview(missionId, planningEnv);
  expect(planningPreview.dispatchable).toBe(true);
  expect(planningPreview.gates.decision).toBe("PROCEED");

  // ---- (6) THE COMPOSITE TWO-ACT APPROVAL (the plan facts host-side) ----
  const request = await runtime.requestAuthorization(missionId, T0, {
    planDigest: compiled.digest,
    planLegCount: compiled.planInput.legs.length,
  });
  const resolution = await runtime.resolveAuthorization(
    { requestId: request.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
    T0,
  );
  expect(resolution.outcome.kind).toBe("GRANTED");
  const artifactId = resolution.outcome.kind === "GRANTED" ? resolution.outcome.artifact.artifactId : "";

  // ---- (7) PROOF A — THE HONEST LANE TRUTH (the FLW collect lane refuses) ----
  const outcomeA = await dispatchCorridorPlan({
    slice: runtime.dispatch,
    missionId,
    plan: compiled.planInput,
    connectionRefs: [
      connections.flutterwaveConnectionId,
      connections.stellarConnectionId,
      connections.stellarConnectionId,
      connections.paystackConnectionId,
    ],
    authorizationArtifactId: artifactId,
    executionMode: "SANDBOX",
    now: T0,
  });
  expect(outcomeA.allLegsConfirmed).toBe(false);
  expect(outcomeA.stoppedAfterLeg).toBe(0);
  expect(outcomeA.results).toHaveLength(1);
  expect(outcomeA.results[0]?.outcome).toBe("REFUSED");
  expect(outcomeA.results[0]?.summary).toContain("NO_AUTHORITY_WIRED");
  expect(outcomeA.results[0]?.summary).toContain("PaySwap implements no Flutterwave send operation");
  expect(outcomeA.results[0]?.summary).toContain("the six facts stay separate");
  // A later leg NEVER silently skips (leg 0 UNRECORDED — the typed custody block).
  await expect(
    runtime.dispatch.dispatch(
      missionId,
      "CREATE_EXTERNAL_EFFECT",
      {
        authorizationArtifactId: artifactId,
        connectionRef: connections.stellarConnectionId,
        executionMode: "SANDBOX",
        legIndex: 2,
        leg: compiled.planInput.legs[2] as never,
        planDigest: compiled.digest,
      },
      T0,
    ),
  ).rejects.toThrow(/legs never silently skip/);
  // The refused mission is lawfully CANCELLED (the same-direction
  // convergence law disclosed: a non-terminal mission must be
  // cancelled before a re-seed creates a fresh one).
  const cancelled = await runtime.cancelMission(missionId, T0);
  expect(cancelled.kind).toBe("CANCELLED");

  // ---- (8) PROOF B — THE SCRIPTED-TIER CORRIDOR EXECUTION ----
  const seededB = await service.paymentMissionSeed({ direction: "MOVE", goalStatement: GOAL });
  expect(seededB.action).toBe("CREATED");
  const missionB = seededB.missionId;
  await captureCorridorIntake(service, missionB);
  const previewB = await service.paymentMissionPresentPreview(missionB);
  expect(previewB?.gates.decision).toBe("BLOCK");
  const planningPreviewB = await runtime.presentPreview(
    missionB,
    corridorPlanningEnvironment({
      now: T1,
      bridge,
      planId: compiled.plan.planId,
      executingConnectionId: connections.paystackConnectionId,
      corridor: { sourceCountry: "GH", destinationCountry: "KE", destinationCurrency: "KES" },
    }),
  );
  expect(planningPreviewB.dispatchable).toBe(true);
  expect(planningPreviewB.gates.decision).toBe("PROCEED");
  const requestB = await runtime.requestAuthorization(missionB, T1, {
    planDigest: compiled.digest,
    planLegCount: compiled.planInput.legs.length,
  });
  const resolutionB = await runtime.resolveAuthorization(
    { requestId: requestB.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
    T1,
  );
  expect(resolutionB.outcome.kind).toBe("GRANTED");
  const artifactB = resolutionB.outcome.kind === "GRANTED" ? resolutionB.outcome.artifact.artifactId : "";
  const outcomeB = await dispatchCorridorPlan({
    slice: runtime.dispatch,
    missionId: missionB,
    plan: compiled.planInput,
    connectionRefs: [
      connections.paystackConnectionId,
      connections.stellarConnectionId,
      connections.stellarConnectionId,
      connections.paystackConnectionId,
    ],
    authorizationArtifactId: artifactB,
    executionMode: "SANDBOX",
    now: T1,
  });
  expect(outcomeB.allLegsConfirmed).toBe(true);
  expect(outcomeB.stoppedAfterLeg).toBeNull();
  expect(outcomeB.results.map((row) => row.outcome)).toEqual([
    "CONFIRMED",
    "CONFIRMED",
    "CONFIRMED",
    "CONFIRMED",
  ]);
  const detailB = (await service.paymentMissionDetail(missionB))!;
  // The composite completion law: COMPLETED only at the last leg.
  expect(detailB.status).toBe("COMPLETED");
  expect(detailB.attempts).toHaveLength(4);
  // The per-leg index rides the host-side attempt records (the DTO keeps
  // the attempt states only — the consumed-artifact lineage stays host-side).
  const rawB = (await runtime.listMissions()).find((mission) => mission.id === missionB);
  expect(rawB?.attempts).toHaveLength(4);
  expect(rawB?.attempts.every((attempt) => attempt.legIndex !== undefined)).toBe(true);
  expect(rawB?.attempts.map((attempt) => attempt.legIndex)).toEqual([0, 1, 2, 3]);

  // ---- (9) THE AUTHORITATIVE READ-BACKS (the REAL transports + the REAL seal) ----
  const paystackReadBack = createPaystackTransferReadBack({
    connectionAuthority: connections.authority,
    transport: createPaystackHostTransport(world.fetchImpl),
  });
  const verified = await paystackReadBack.readBack({
    connectionRef: connections.paystackConnectionId,
    transferReference: CORRIDOR_TRANSFER_REFERENCE,
    executionMode: "SANDBOX",
  });
  expect(verified.outcome).toBe("CONFIRMED");
  expect(verified.transferStatus).toBe("success");
  const stellarReadBack = createStellarReadBack({
    connectionAuthority: connections.authority,
    transport: createStellarHorizonHostTransport(world.fetchImpl),
  });
  const stellarRead = await stellarReadBack.readBack({
    connectionRef: connections.stellarConnectionId,
    txHash: CORRIDOR_TX_HASH,
    executionMode: "SANDBOX",
    expectDeployment: true,
  });
  expect(stellarRead.outcome).toBe("CONFIRMED");
  expect(stellarRead.txSuccess).toBe(true);
  expect(stellarRead.contractId).toBe(FAKE_C_CONTRACT);
  const deploymentEvidence = deploymentEvidenceOf({
    txHash: CORRIDOR_TX_HASH,
    contractId: stellarRead.contractId,
    sourceHash: CORRIDOR_DEPLOY_SOURCE_HASH,
    bytecodeHash: CORRIDOR_DEPLOY_BYTECODE_HASH,
  });
  expect(deploymentEvidence).toEqual({
    txHash: CORRIDOR_TX_HASH,
    contractId: FAKE_C_CONTRACT,
    sourceHash: CORRIDOR_DEPLOY_SOURCE_HASH,
    bytecodeHash: CORRIDOR_DEPLOY_BYTECODE_HASH,
  });
  // NEVER FABRICATED: an evidence record without the observed contract id is null.
  expect(
    deploymentEvidenceOf({
      txHash: CORRIDOR_TX_HASH,
      contractId: null,
      sourceHash: CORRIDOR_DEPLOY_SOURCE_HASH,
      bytecodeHash: CORRIDOR_DEPLOY_BYTECODE_HASH,
    }),
  ).toBeNull();

  // ---- (10) THE NO-DOUBLE-EFFECT LAW (the idempotent replay re-checks the share) ----
  // A third mission, leg 0 confirmed ALONE (the mission stays open — the
  // composite completion requires EVERY leg); the re-dispatch of the
  // confirmed leg rides the idempotent REPLAY path, which re-checks the
  // per-leg share: AUTHORIZATION_CONSUMED (the two laws compose).
  const seededC = await service.paymentMissionSeed({ direction: "MOVE", goalStatement: GOAL });
  expect(seededC.action).toBe("CREATED");
  const missionC = seededC.missionId;
  await captureCorridorIntake(service, missionC);
  await service.paymentMissionPresentPreview(missionC);
  await runtime.presentPreview(
    missionC,
    corridorPlanningEnvironment({
      now: T1,
      bridge,
      planId: compiled.plan.planId,
      executingConnectionId: connections.paystackConnectionId,
      corridor: { sourceCountry: "GH", destinationCountry: "KE", destinationCurrency: "KES" },
    }),
  );
  const requestC = await runtime.requestAuthorization(missionC, T1, {
    planDigest: compiled.digest,
    planLegCount: compiled.planInput.legs.length,
  });
  const resolutionC = await runtime.resolveAuthorization(
    { requestId: requestC.requestId, decision: "APPROVE", origin: "PREVIEW_UI_ACT" },
    T1,
  );
  expect(resolutionC.outcome.kind).toBe("GRANTED");
  const artifactC = resolutionC.outcome.kind === "GRANTED" ? resolutionC.outcome.artifact.artifactId : "";
  const legZero = await runtime.dispatch.dispatch(
    missionC,
    "CREATE_EXTERNAL_EFFECT",
    {
      authorizationArtifactId: artifactC,
      connectionRef: connections.paystackConnectionId,
      executionMode: "SANDBOX",
      legIndex: 0,
      leg: compiled.planInput.legs[0] as never,
      planDigest: compiled.digest,
    },
    T1,
  );
  expect(legZero.kind).toBe("DISPATCHED");
  const detailC = (await service.paymentMissionDetail(missionC))!;
  expect(detailC.status).toBe("ACTIVE");
  await expect(
    runtime.dispatch.dispatch(
      missionC,
      "CREATE_EXTERNAL_EFFECT",
      {
        authorizationArtifactId: artifactC,
        connectionRef: connections.paystackConnectionId,
        executionMode: "SANDBOX",
        legIndex: 0,
        leg: compiled.planInput.legs[0] as never,
        planDigest: compiled.digest,
      },
      T1,
    ),
  ).rejects.toThrow(/single-use/);

  const missionStore = JSON.stringify(
    [...world.files.entries()]
      .filter(([path]) => path.startsWith("/mem/p22d-payments"))
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return { missionStore, digest: compiled.digest };
}

describe("the corridor journey bridge battery (P22-D — REAL channel + REAL compiler + REAL kernels, scripted transport)", () => {
  it("drives the full corridor journey: 3-provider seed → nine-field intake → honest NO_ROUTE preview → compile → composite approval → the honest FLW refusal (Proof A) → the kernel-served four-leg completion (Proof B) → the authoritative read-backs → the no-double-effect law", async () => {
    await driveJourney();
  });

  it("DETERMINISTIC REPLAY: the journey over a second fresh world produces byte-identical mission stores + the identical plan digest", async () => {
    const first = await driveJourney();
    const second = await driveJourney();
    expect(second.missionStore).toBe(first.missionStore);
    expect(second.digest).toBe(first.digest);
  });
});
