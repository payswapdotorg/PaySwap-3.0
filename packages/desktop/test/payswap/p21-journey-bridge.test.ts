/**
 * PaySwap Desktop (P21-D, ADR-0014 D10 — the E2E law's in-repo tier) —
 * THE FULL-JOURNEY BRIDGE BATTERY: the operator's ordered journey
 * ("New Task → model/difficulty → 'Pay merchant X' → typed intent →
 * pinned routine → stage-by-stage progress → provider-evidenced rails →
 * routes/counterfactuals/opportunities → authorization → real execution
 * or honest no-route") driven END-TO-END through the REAL channel + the
 * REAL engines + the REAL host runtime over a SCRIPTED provider
 * transport (hermetic; the REAL-transport tier stays the rail-evidence
 * harness's — scripts/p21/rail-evidence-real-flow-e2e.ts, whose receipt
 * carried the operator's real test-mode keys and a genuinely dispatched
 * + read-back Stripe PaymentIntent).
 *
 * THE JOURNEY STAGES (each asserted on the REAL seams — the fixtures
 * file documents the world composition):
 *  1. New Task + the model/difficulty controls (D4): the catalog binds,
 *     the selection PERSISTS on the task record and RESTORES through a
 *     fresh controller over the same storage.
 *  2. The intent: "Pay merchant X" through the composer seeds ONE REAL
 *     mission (the channel's own convergence).
 *  3. The ask loop: the deterministic nine-field intake asks through the
 *     composer conversation; the merchant facts answer; the intent
 *     COMPILES (the 11-key typed intent) while the preview honestly
 *     BLOCKS over the REAL bridge environment (the corridor).
 *  4. The routine: ROUTINE_PINNED lands with the REAL manifest facts
 *     (idempotent re-pin).
 *  5. The rails: the REAL capability bridge over the seeded ACTIVE
 *     connections (FLW read-only, Stripe executable, the merchant
 *     destination, the observed wallets) + the rail snapshots through
 *     the REAL corridor projection.
 *  6. The honest NO_ROUTE (D7): the REAL compiler returns ranked-eligible
 *     EMPTY with every exclusion explained (typed reasons); the stage-7
 *     derivation composes the three P21 conditionals (advisory only).
 *  7. The wait (D9): chooseWait; the re-check through the REAL evaluator
 *     (no match stays WAITING; a scripted match NEVER dispatches — no
 *     ATTEMPT event anywhere); cancel leaves WAITING.
 *  8. The revise path (D8): the funding request revised to the DECLARED
 *     test funding instrument (TEST_DATA — the published test PM); fresh
 *     eligibility PROCEEDs; the two-act approval through the channel
 *     members; the dispatch through the REAL lane-aware Stripe kernel
 *     over the scripted transport; the AUTHORITATIVE read-back through
 *     the PRODUCT verify member (the P21-D reviewer-gate, Gap C — the
 *     typed persisted verification fact); the mission COMPLETES; NO
 *     FLW-funded claim anywhere.
 *  9. The truthful terminals: the task's terminal state matches the
 *     mission's (COMPLETED); the twelve-stage checklist reflects the
 *     authority events (9a COMPLETE; 10 COMPLETE through the
 *     ATTEMPT_VERIFIED closer the product member appended — the
 *     final-stage completion contract for a confirmed attempt).
 */

import { describe, expect, it } from "vitest";

import {
  createAgentComposerController,
  opportunityMatchOfRecheck,
  projectRoutineStageProgress,
  recordRoutinePin,
  resetSharedAgentComposerController,
  resetSharedMissionIntakePlane,
  resetSharedModelCatalog,
  resetSharedRoutePlanningEngine,
  resetSharedRoutePlanningSession,
  resetSharedWaitRecheckPlane,
  sharedRoutePlanningEngine,
} from "@payswap/app";
import {
  PINNED_ROUTE_PLANNING_ROUTINE_ID,
  PINNED_ROUTE_PLANNING_ROUTINE_VERSION,
  PINNED_ROUTE_PLANNING_SKILL_DIGEST,
} from "../../../payswap-app/src/agent/routePlanningPins.js";
import {
  deriveConditionalOpportunities,
  evaluateHardGates,
  loadRoutineManifest,
  movementViewOfIntent,
  PAYMENT_ROUTE_PLANNING_MANIFEST_V1,
  PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE,
  PINNED_CORRIDOR_NOT_EXECUTABLE_CODE,
} from "@payswap/route-planning";
// The REAL opportunities machinery (test-tier relative imports — the
// wait-recheck composition battery's own pattern; the journey's scripted
// observation + consent world lives in ./p21-journey-bridge-conversation.ts).
import type { FinancialOpportunity } from "../../../opportunities/src/model.ts";

import { composeMissionIntakeBinding } from "../../src/renderer/src/missionIntakeComposition.js";
import { composeModelCatalogBinding } from "../../src/renderer/src/modelCatalogComposition.js";
import { composeRoutePlanningBinding } from "../../src/renderer/src/routePlanningComposition.js";
import { composeWaitRecheckBinding } from "../../src/renderer/src/waitRecheckComposition.js";
import type { DesktopConsoleChannelServices } from "../../src/renderer/src/consoleWorkspaceMount.js";
import { createRealRoutePlanningEngine } from "../../src/renderer/src/routePlanningEngineAdapter.js";
import { mapMissionIntentToPin } from "../../src/renderer/src/routePlanningMissionLinkage.js";
import { DECLARED_STRIPE_TEST_CORRIDOR } from "../../src/host/payswap/connections/gate-environment.js";
import { BRIDGE_READ_ONLY_OPERATION_CLASSES } from "../../src/host/payswap/connections/capability-bridge.js";
import { PAYMENT_INTAKE_FIELD_IDS } from "../../src/host/payswap/payments/contracts.js";
import {
  BRIDGE_PROVIDER_OBSERVATION_TIER,
  JOURNEY_MODEL,
  JOURNEY_MODEL_SELECTION,
  composeJourneyService,
  journeyBridge,
  scriptJourneyFetch,
  seedJourneyConnections,
  T0,
  T1,
  T2,
  T3,
  T4,
} from "./p21-journey-bridge-fixtures.js";
import {
  CORRIDOR_RAIL_KEY,
  planJourneyRoute,
  realConditionalOpportunityPort,
} from "./p21-journey-bridge-planning.js";
import { fakeWorld } from "./connections-probe-plane-fixtures.js";
import {
  INTENT_KEYS,
  JOURNEY_AT,
  REPLIES,
  journeyConsent,
  journeyOpportunity,
  journeyStorage,
  type JourneyOutcome,
} from "./p21-journey-bridge-conversation.js";

/** Drive the full ordered journey over one fresh scripted world (asserting as it goes). */
async function driveJourney(): Promise<JourneyOutcome> {
  const world = fakeWorld();
  scriptJourneyFetch(world);
  const connections = await seedJourneyConnections(world);
  const { service } = await composeJourneyService(world, connections.authority, connections.evidenceStore);
  const services = { payswapDesktopService: service } as unknown as DesktopConsoleChannelServices;

  // The renderer business root: every plane binds BEFORE the controller.
  resetSharedMissionIntakePlane();
  resetSharedModelCatalog();
  resetSharedAgentComposerController();
  resetSharedRoutePlanningEngine();
  resetSharedRoutePlanningSession();
  resetSharedWaitRecheckPlane();
  const intakeBinding = composeMissionIntakeBinding({ services });
  const modelBinding = composeModelCatalogBinding({ source: async () => [JOURNEY_MODEL] });
  const { storage, dump } = journeyStorage();
  // The controller consumes the composed catalog through its DI option
  // (the shared seam is consumed by sharedAgentComposerController — the
  // direct-construction path takes the explicit binding, same law).
  const controller = createAgentComposerController({ storage, clock: () => T1, modelCatalog: modelBinding.catalog });
  const routeComposition = composeRoutePlanningBinding({ services, controller });
  let waitObservations: readonly FinancialOpportunity[] = [];
  const waitBinding = composeWaitRecheckBinding({
    observations: async () => [...waitObservations],
    consent: async () => journeyConsent(),
    clock: () => JOURNEY_AT + 1_000,
  });
  try {
    // ---- (1) NEW TASK + the model/difficulty controls (D4) ----
    await controller.loadModelCatalog();
    expect(controller.getState().modelControls.phase).toBe("READY");
    controller.setDraft("Pay merchant X");
    await controller.send();
    const afterSend = controller.getState();
    expect(afterSend.missionIntake.phase).toBe("ASKING");
    expect(afterSend.missionIntake.pendingAsk?.fieldId).toBe(PAYMENT_INTAKE_FIELD_IDS[0]);
    const taskId = afterSend.tasks[afterSend.tasks.length - 1]!.id;
    const missionId = afterSend.missionIntake.missionId!;
    // ONE mission seeds (the D6 convergence over the REAL channel).
    expect(await service.paymentMissionBoard()).toHaveLength(1);
    const reseed = await service.paymentMissionSeed({ direction: "PAY", goalStatement: "Pay merchant X" });
    expect(reseed.missionId).toBe(missionId);
    expect(reseed.action).toBe("RESUMED");
    expect(await service.paymentMissionBoard()).toHaveLength(1);

    // The selection PERSISTS on the task record.
    await controller.selectModel(JOURNEY_MODEL_SELECTION);
    const session = controller.sessionPort();
    const task = await session.taskDetail(taskId);
    expect(task?.modelSelection).toEqual(JOURNEY_MODEL_SELECTION);
    // The RESTORE law: a fresh controller over the SAME storage recovers the
    // selection AND re-derives the mission link + the pending ask.
    const freshController = createAgentComposerController({ storage, clock: () => T1 });
    await freshController.refresh();
    expect(freshController.getState().modelControls.selection).toEqual(JOURNEY_MODEL_SELECTION);
    expect(freshController.getState().missionIntake.phase).toBe("ASKING");
    expect(freshController.getState().missionIntake.pendingAsk?.fieldId).toBe(PAYMENT_INTAKE_FIELD_IDS[0]);

    // ---- (3) the ask loop: the deterministic nine-field intake over the channel ----
    const asked: string[] = [];
    for (let round = 0; round < 12; round += 1) {
      const intake = controller.getState().missionIntake;
      if (intake.phase === "COMPLETE") break;
      expect(intake.phase).toBe("ASKING");
      asked.push(intake.pendingAsk!.fieldId);
      controller.setDraft(REPLIES[intake.pendingAsk!.fieldId]!);
      await controller.send();
    }
    expect(asked).toEqual([...PAYMENT_INTAKE_FIELD_IDS]);
    expect(controller.getState().missionIntake.phase).toBe("COMPLETE");

    // The intent COMPILES (the 11-key typed intent); the preview honestly BLOCKS
    // over the REAL bridge environment (the corridor + the limits).
    const initialPreview = await service.paymentMissionPresentPreview(missionId);
    expect(initialPreview?.dispatchable).toBe(false);
    expect(initialPreview?.gates.decision).toBe("BLOCK");
    expect(initialPreview?.gates.reasons.join(" ")).toContain("NO_ROUTE_FOR_CORRIDOR");
    const detail = (await service.paymentMissionDetail(missionId))!;
    expect(detail.status).toBe("ACTIVE");
    expect(Object.keys(detail.intent ?? {}).sort()).toEqual(INTENT_KEYS);
    expect(detail.events.some((event) => event.kind === "VALIDATED")).toBe(true);
    expect(detail.events.some((event) => event.kind === "PREVIEW_PRESENTED")).toBe(true);

    // ---- (4) THE ROUTINE: ROUTINE_PINNED with the REAL manifest facts ----
    const manifest = loadRoutineManifest(PAYMENT_ROUTE_PLANNING_MANIFEST_V1);
    expect(PINNED_ROUTE_PLANNING_ROUTINE_ID).toBe(manifest.routineId);
    expect(PINNED_ROUTE_PLANNING_ROUTINE_VERSION).toBe(manifest.routineVersion);
    expect(PINNED_ROUTE_PLANNING_SKILL_DIGEST).toBe(manifest.skill.contentDigest);
    const routinePin = { routineId: PINNED_ROUTE_PLANNING_ROUTINE_ID, routineVersion: PINNED_ROUTE_PLANNING_ROUTINE_VERSION, skillContentDigest: PINNED_ROUTE_PLANNING_SKILL_DIGEST };
    expect(await recordRoutinePin(session, taskId, routinePin, T2)).toBe("PINNED");
    expect(await recordRoutinePin(session, taskId, routinePin, T2)).toBe("ALREADY_PINNED");

    // ---- (5) THE RAILS: the REAL bridge + the rail snapshots ----
    const bridge = await journeyBridge(connections.authority, connections.evidenceStore);
    const flwInstance = bridge.instances.find((instance) => instance.providerId === "flutterwave");
    const stripeInstance = bridge.instances.find((instance) => instance.providerId === "stripe");
    expect(flwInstance?.operationClasses).toEqual([...BRIDGE_READ_ONLY_OPERATION_CLASSES]);
    expect(flwInstance?.eligibility.reasons.join(" ")).toContain("read-only");
    expect(flwInstance?.evidenceTier).toBe(BRIDGE_PROVIDER_OBSERVATION_TIER);
    expect(stripeInstance?.operationClasses).toContain("CREATE_EXTERNAL_EFFECT");
    expect(stripeInstance?.keyClass).toBe("FULL_TEST");
    expect(bridge.destinations.map((destination) => destination.observationRef))
      .toContain("merchant-directory:merchant:stripe-only-test");
    expect(bridge.fundingSources.some((source) => source.displayName === "Flutterwave NGN wallet (test)")).toBe(true);

    // ---- (6) THE HONEST NO_ROUTE over the REAL compiler + the stage-7 conditionals ----
    const intent = mapMissionIntentToPin(detail.intent!);
    const plan = planJourneyRoute({
      taskRef: taskId,
      intentDto: detail.intent!,
      corridor: { sourceCountry: "NG", destinationCountry: "US", destinationCurrency: "USD" },
      amount: { currency: "NGN", minorUnits: "50000000" },
      modelSelection: task?.modelSelection,
    });
    expect(plan.rankedCount).toBe(0);
    expect(plan.view.availableNow.ranked).toEqual([]);
    expect(plan.view.availableNow.senderEligibleRouteIds).toEqual([]);
    expect(plan.view.availableNow.recipientEligibleRouteIds).toEqual([]);
    expect(plan.view.modelSelection).toEqual(JOURNEY_MODEL_SELECTION);
    const flwRail = plan.senderSnapshot.rails.find((rail) => rail.lineage.providerName === "flutterwave");
    expect(flwRail?.eligible).toBe(false);
    expect(flwRail?.exclusions.some((exclusion) => exclusion.code === PINNED_CORRIDOR_NOT_EXECUTABLE_CODE)).toBe(true);
    const stripeRail = plan.recipientSnapshot.rails.find((rail) => rail.lineage.providerName === "stripe");
    expect(stripeRail?.exclusions.some((exclusion) => exclusion.code === PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE)).toBe(true);
    expect(plan.view.exclusions.some((exclusion) => exclusion.code === PINNED_CORRIDOR_NOT_EXECUTABLE_CODE)).toBe(true);
    expect(plan.view.exclusions.some((exclusion) => exclusion.code === PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE)).toBe(true);

    const hardGates = evaluateHardGates({ intent: movementViewOfIntent(intent), at: intent.declaredAt, candidates: [] });
    const derivation = deriveConditionalOpportunities({
      senderSnapshot: plan.senderSnapshot, recipientSnapshot: plan.recipientSnapshot, hardGates,
      port: realConditionalOpportunityPort(), corridorRail: { railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY },
      optIn: { participantRef: "principal:operator", optedInAt: intent.declaredAt - 1_000 },
      at: intent.declaredAt, expiresAt: intent.declaredAt + 3_600_000,
      disclosurePurpose: "the operator's no-route panel renders the conditional opportunities with their preconditions",
    });
    expect(derivation.advisoryOnly).toBe(true);
    expect(derivation.conditionalsPermitExecution).toBe(false);
    expect(derivation.conditionalOpportunities.map((conditional) => conditional.requiredPartyChanges[0]?.change))
      .toEqual(["ENABLES_FLUTTERWAVE_RECEIVING_METHOD", "ADDS_STRIPE_COMPATIBLE_INSTRUMENT", "INTERMEDIARY_INTRODUCED"]);

    // ---- (7) THE WAIT: present → chooseWait → re-check → match STAYS WAITING → cancel ----
    await routeComposition.session.presentChoices(taskId, plan.view, T2);
    await routeComposition.session.chooseWait(taskId, plan.view.waiting.proposal, T2);
    const noMatch = await waitBinding.plane.recheckWait({ taskRef: taskId, criteria: plan.view.waiting.proposal });
    expect(noMatch.matchedOpportunityIds).toEqual([]);
    expect((await session.taskDetail(taskId))?.status).toBe("WAITING_FOR_OPPORTUNITIES");
    waitObservations = [journeyOpportunity()];
    const matched = await waitBinding.plane.recheckWait({ taskRef: taskId, criteria: plan.view.waiting.proposal });
    expect(matched.matchedOpportunityIds).toHaveLength(1);
    expect(matched.neverAutoDispatches).toBe(true);
    expect(matched.waitingNeverDispatches).toBe(false);
    await routeComposition.session.recordOpportunityMatch(taskId, opportunityMatchOfRecheck(matched), T3);
    const afterMatch = await session.taskDetail(taskId);
    expect(afterMatch?.status).toBe("WAITING_FOR_OPPORTUNITIES");
    expect(afterMatch?.events.some((event) => event.kind === "ATTEMPT_STARTED")).toBe(false);
    expect((await service.paymentMissionDetail(missionId))?.events.some((event) => event.kind === "ATTEMPT_STARTED")).toBe(false);
    await routeComposition.session.cancelWait(taskId, T4);
    expect((await session.taskDetail(taskId))?.status).toBe("ACTIVE");

    // ---- (8) THE REVISE PATH (D8): the funding request → the declared test funding instrument ----
    await service.paymentMissionCapture(missionId, "fundingSource", DECLARED_STRIPE_TEST_CORRIDOR.fundingInstrument.displayName);
    await service.paymentMissionCapture(missionId, "countryCorridor", { sourceCountry: "US", destinationCountry: "US", destinationCurrency: "USD" });
    await service.paymentMissionCapture(missionId, "amountAndCurrency", { minorUnits: "1500", currency: "USD" });
    expect((await service.paymentMissionDetail(missionId))?.intent).toBeUndefined();
    const revisedPreview = await service.paymentMissionPresentPreview(missionId);
    expect(revisedPreview?.dispatchable).toBe(true);
    expect(revisedPreview?.gates.decision).toBe("PROCEED");
    const revisedDetail = (await service.paymentMissionDetail(missionId))!;
    expect(revisedDetail.status).toBe("ACTIVE");
    expect(Object.keys(revisedDetail.intent ?? {}).sort()).toEqual(INTENT_KEYS);
    // NO FLW-funded claim anywhere: the origin is the DECLARED test funding instrument (TEST_DATA tier).
    expect(revisedDetail.intent?.origin.locationRef).toBe("pm_card_visa");
    expect(revisedDetail.intent?.origin.observationRef).toBe("declared:test-funding-instrument:pm_card_visa");
    expect(JSON.stringify(revisedDetail.intent)).not.toMatch(/flutterwave/i);

    // ---- the two-act approval through the channel members ----
    const request = await service.paymentMissionRequestApproval(missionId);
    expect(request.missionId).toBe(missionId);
    const resolution = await service.paymentMissionResolveApproval(request.requestId, "APPROVE");
    expect(resolution.outcome.kind).toBe("GRANTED");

    // ---- the dispatch through the REAL lane-aware kernel over the scripted transport ----
    const armed = await service.paymentMissionArmedEffect(missionId);
    expect(armed.armed).toBe(true);
    expect(armed.lanes.some((lane) => lane.connectionRef === connections.stripeConnectionId && lane.ineligible === undefined)).toBe(true);
    // The FLW connection is LISTED as a lane candidate (the registry's own
    // read model; the lane resolver treats an ACTIVE SANDBOX connection as
    // listable) — its send-refusal is the AUTHORITY-tier law (F3/C9: no FLW
    // send operation exists — proven in execution-lane-composition.test.ts);
    // the operator chooses the Stripe lane for the revise-path dispatch.
    expect(armed.lanes.some((lane) => lane.connectionRef === connections.flutterwaveConnectionId)).toBe(true);
    const dispatched = await service.paymentMissionDispatch(missionId, connections.stripeConnectionId);
    expect(dispatched.kind).toBe("DISPATCHED");
    expect(dispatched.summary).toContain("confirmed");

    // ---- the AUTHORITATIVE read-back through the PRODUCT member (the
     // P21-D reviewer-gate, Gap C): the single-act verify over the REAL
     // lane-aware read-back inside the credential seal — the typed
     // persisted verification fact replaces the test-side read-back ----
    const verified = await service.paymentMissionVerifyAttempt(missionId, dispatched.attemptId);
    expect(verified.verified).toBe(true);
    expect(verified.readBackStatus).toBe("succeeded");
    expect(verified.summary).toContain("read-back");

    // ---- (9) THE TRUTHFUL TERMINALS ----
    const finalDetail = (await service.paymentMissionDetail(missionId))!;
    expect(finalDetail.status).toBe("COMPLETED");
    expect(finalDetail.attempts).toHaveLength(1);
    expect(finalDetail.attempts[0]?.outcome).toBe("CONFIRMED");
    // The typed verification fact rides the attempt state (facts only).
    expect(finalDetail.attempts[0]?.verification).toEqual({
      readBackStatus: "succeeded",
      verifiedAt: T0,
    });
    await session.updateTaskStatus(
      taskId, "COMPLETED", "ATTEMPT_CONFIRMED", T4,
      "The mission's dispatch attempt confirmed through the execution authority — the task completes with the mission.",
    );
    const finalTask = (await session.taskDetail(taskId))!;
    expect(finalTask.status).toBe("COMPLETED");

    // ---- the stage checklist reflects the authority events (D3) ----
    await routeComposition.refresh();
    // The composition's engine carries the D3 mission-facts read over its
    // mission cache (the shared seam types the port; the adapter's engine is
    // the port + the facts source — the mission-intake battery's own cast).
    const engine = sharedRoutePlanningEngine() as unknown as ReturnType<typeof createRealRoutePlanningEngine>;
    const missionFacts = engine.missionFacts(missionId);
    expect(missionFacts?.missionStatus).toBe("COMPLETED");
    expect(missionFacts?.events.some((event) => event.kind === "ATTEMPT_STARTED")).toBe(true);
    expect(missionFacts?.events.some((event) => event.kind === "ATTEMPT_CONFIRMED")).toBe(true);
    expect(missionFacts?.events.some((event) => event.kind === "ATTEMPT_VERIFIED")).toBe(true);
    const rows = projectRoutineStageProgress({
      taskEvents: finalTask.events.map((event) => ({ kind: event.kind, summary: event.summary, at: event.at })),
      mission: missionFacts,
      engineView: plan.view,
      taskStatus: finalTask.status,
    });
    expect(rows.map((row) => row.stageId)).toHaveLength(12);
    const byStage = new Map(rows.map((row) => [row.stageId as string, row.status]));
    expect(byStage.get("0")).toBe("COMPLETED");
    expect(byStage.get("1")).toBe("COMPLETED");
    expect(byStage.get("8")).toBe("COMPLETED");
    expect(byStage.get("9a")).toBe("COMPLETED");
    expect(byStage.get("9b")).toBe("COMPLETED");
    expect(byStage.get("10")).toBe("COMPLETED");

    const missionStore = JSON.stringify(
      [...world.files.entries()].filter(([path]) => path.startsWith("/mem/p21d-payments")).sort(([a], [b]) => (a < b ? -1 : 1)),
    );
    return { taskStore: dump(), missionStore, viewDigest: plan.view.viewDigest };
  } finally {
    intakeBinding.reset();
    modelBinding.reset();
    resetSharedRoutePlanningEngine();
    resetSharedRoutePlanningSession();
    waitBinding.reset();
    resetSharedAgentComposerController();
    resetSharedMissionIntakePlane();
    resetSharedModelCatalog();
  }
}

describe("the operator's ordered journey (P21-D bridge battery — REAL channel + REAL engines + REAL host runtime, scripted transport)", () => {
  it("drives the full journey: task → model → intent → ask loop → routine → rails → honest NO_ROUTE → wait → revise → approval → REAL dispatch → read-back → truthful terminals", async () => {
    await driveJourney();
  });

  it("DETERMINISTIC REPLAY: the journey over a second fresh world produces byte-identical store records + view digest", async () => {
    const first = await driveJourney();
    const second = await driveJourney();
    expect(second.taskStore).toBe(first.taskStore);
    expect(second.missionStore).toBe(first.missionStore);
    expect(second.viewDigest).toBe(first.viewDigest);
  });
});
